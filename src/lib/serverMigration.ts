import fs from "node:fs";
import { openAsBlob } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { PteroApp, PteroClient } from "@/lib/pterodactyl";
import { updateServerDnsRecords } from "@/lib/cloudflare";
import { getBotSettings } from "@/lib/botSettings";
import { sendDiscordChannelMessage } from "@/lib/discordNotify";
import type { Server, ServerStatus } from "@/generated/prisma/client";

export class ServerMigrationError extends Error {}

const ARCHIVE_NAME_PREFIX = "burnae-migration-";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** identifier 서버가 완전히 멈출 때까지 기다린다. 켜진 채로 파일을 옮기면 월드가 깨질 수 있다 */
async function waitUntilOffline(identifier: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await PteroClient.getServerResources(identifier);
    if (res.current_state === "offline") return;
    await sleep(2000);
  }
  throw new ServerMigrationError("서버가 제시간 안에 정지하지 않았습니다.");
}

/** 새로 만든 서버의 Egg 설치 스크립트가 끝날 때까지 기다린다 — 끝나기 전에 파일을 쓰면 설치 과정과 충돌한다 */
async function waitUntilInstalled(pterodactylServerId: number, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const details = await PteroApp.getServerDetails(pterodactylServerId);
    if (details.status !== "installing") return;
    await sleep(3000);
  }
  throw new ServerMigrationError("새 서버 설치가 제시간 안에 끝나지 않았습니다.");
}

/** Wings가 발급한 서명 URL은 자체 인증 토큰을 쿼리에 담고 있어 별도 Authorization 헤더 없이 그대로 fetch한다 */
async function downloadToTempFile(signedUrl: string): Promise<string> {
  const res = await fetch(signedUrl);
  if (!res.ok || !res.body) {
    throw new ServerMigrationError(`아카이브 다운로드에 실패했습니다 (${res.status}).`);
  }
  const tempPath = path.join(os.tmpdir(), `${ARCHIVE_NAME_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`);
  await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), fs.createWriteStream(tempPath));
  return tempPath;
}

async function uploadTempFile(signedUrl: string, tempPath: string, archiveName: string): Promise<void> {
  const blob = await openAsBlob(tempPath);
  const form = new FormData();
  form.append("files", blob, archiveName);
  const res = await fetch(signedUrl, { method: "POST", body: form });
  if (!res.ok) {
    throw new ServerMigrationError(`아카이브 업로드에 실패했습니다 (${res.status}).`);
  }
}

/**
 * 서버의 실제 데이터(월드/설정/플러그인 등)를 통째로 다른 노드로 옮긴다.
 * Pterodactyl에는 Panel 내부 관리자 화면 전용 "Transfer" 기능이 있지만, 세션 쿠키 기반의
 * 비공개 웹 라우트라 Application/Client API 키만으로는 쓸 수 없다. 대신 이미 쓰고 있는
 * 표준 Client API(압축/다운로드·업로드 URL/압축해제)만으로 같은 결과를 만든다:
 *   원본 정지 → 전체 압축 → 앱 서버를 경유해 다운로드/업로드 → 새 노드에 압축해제 → DB/DNS 갱신
 * 새 Pterodactyl 서버를 새로 만드는 방식이라 서버 ID/식별자가 바뀐다 — 원본 Pterodactyl 서버는
 * 확인 전 실수로 잃는 일이 없도록 삭제하지 않고 정지 상태로 남겨둔다(관리자가 확인 후 수동 삭제).
 */
export async function migrateServerToNode(
  serverId: string,
  targetHostNodeId: string,
  actorUserId: string,
): Promise<{ server: Server; oldPterodactylServerId: number | null }> {
  const server = await prisma.server.findUniqueOrThrow({
    where: { id: serverId },
    include: { template: true, subdomains: true, owner: true, node: true },
  });
  if (!server.pterodactylIdentifier || !server.pterodactylServerId) {
    throw new ServerMigrationError("아직 준비되지 않은 서버는 이전할 수 없습니다.");
  }
  if (server.status === "MIGRATING") {
    throw new ServerMigrationError("이미 이전이 진행 중인 서버입니다.");
  }
  if (server.nodeId === targetHostNodeId) {
    throw new ServerMigrationError("현재와 같은 노드로는 이전할 수 없습니다.");
  }

  const targetNode = await prisma.hostNode.findUniqueOrThrow({ where: { id: targetHostNodeId } });
  if (targetNode.status !== "ONLINE") {
    throw new ServerMigrationError("대상 노드가 온라인 상태가 아닙니다.");
  }

  const previousStatus: ServerStatus = server.status;
  await prisma.server.update({ where: { id: serverId }, data: { status: "MIGRATING" } });

  const oldPterodactylServerId = server.pterodactylServerId;
  const oldIdentifier = server.pterodactylIdentifier;
  let tempPath: string | null = null;
  let newPteroServerId: number | null = null;

  try {
    // 1) 원본 정지 — 켜진 채로 월드 파일을 압축하면 손상될 수 있다
    await PteroClient.sendPowerAction(oldIdentifier, "stop").catch(() => {});
    await waitUntilOffline(oldIdentifier);

    // 2) 원본 전체를 압축
    const rootFiles = await PteroClient.listFiles(oldIdentifier, "/");
    const names = rootFiles.map((f) => f.name).filter((n) => !n.startsWith(ARCHIVE_NAME_PREFIX));
    if (names.length === 0) {
      throw new ServerMigrationError("옮길 파일이 없습니다.");
    }
    const archive = await PteroClient.compressFiles(oldIdentifier, "/", names);

    // 3) 앱 서버를 경유해 다운로드
    const downloadUrl = await PteroClient.getDownloadUrl(oldIdentifier, `/${archive.name}`);
    tempPath = await downloadToTempFile(downloadUrl);
    await PteroClient.deleteFiles(oldIdentifier, "/", [archive.name]).catch(() => {});

    // 4) 대상 노드에 같은 사양으로 새 서버 생성 (자동 시작은 막아둔다 — 파일부터 채운 뒤 켜야 함)
    const allocation = await PteroApp.getFreeAllocation(targetNode.pterodactylNodeId);
    const [firstName, ...rest] = server.owner.name.split(" ");
    const pteroUser = await PteroApp.findOrCreateUser({
      email: server.owner.email,
      username: `burnae_${server.owner.id.slice(-8)}`,
      firstName: firstName || server.owner.name,
      lastName: rest.join(" ") || "Burnae",
    });
    const newPteroServer = await PteroApp.createServer({
      name: server.name,
      userId: pteroUser.id,
      nodeId: targetNode.pterodactylNodeId,
      allocationId: allocation.id,
      eggId: server.template.pterodactylEggId,
      nestId: server.template.pterodactylNestId,
      dockerImage: server.template.dockerImage,
      startupCommand: server.template.startupCommand,
      environment: {
        ...(server.template.defaultEnvironment as Record<string, string | number | boolean>),
        MINECRAFT_VERSION: server.minecraftVersion,
        SERVER_MEMORY: server.ramMb,
      },
      memoryMb: server.ramMb,
      diskMb: server.diskMb,
      cpuPercent: server.cpuPercent,
      backupSlots: server.backupSlots,
      startOnCompletion: false,
    });
    newPteroServerId = newPteroServer.id;
    await waitUntilInstalled(newPteroServer.id);

    // 5) 새 서버에 업로드 후 압축 해제
    const uploadUrl = await PteroClient.getUploadUrl(newPteroServer.identifier, "/");
    await uploadTempFile(uploadUrl, tempPath, archive.name);
    await PteroClient.decompressFile(newPteroServer.identifier, "/", archive.name);
    await PteroClient.deleteFiles(newPteroServer.identifier, "/", [archive.name]).catch(() => {});

    // 6) DNS(A/SRV)를 새 노드로 갱신 — 커스텀 도메인은 고객이 소유한 외부 DNS라 여기서 못 건드림
    for (const sub of server.subdomains) {
      if (!sub.dnsARecordId || !sub.dnsSrvRecordId || !server.allocationPort) continue;
      await updateServerDnsRecords({
        aRecordId: sub.dnsARecordId,
        srvRecordId: sub.dnsSrvRecordId,
        subdomain: sub.subdomain,
        nodePublicIp: targetNode.publicIp,
        nodeFqdn: targetNode.fqdn,
        port: allocation.port,
      }).catch((err) => console.error("[serverMigration] DNS 갱신 실패(수동 확인 필요):", err));
    }

    // 7) DB 반영 — 정지 상태로 남겨서 관리자/고객이 확인 후 직접 시작하게 한다
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.server.update({
        where: { id: serverId },
        data: {
          nodeId: targetHostNodeId,
          pterodactylServerId: newPteroServer.id,
          pterodactylUuid: newPteroServer.uuid,
          pterodactylIdentifier: newPteroServer.identifier,
          allocationIp: targetNode.publicIp,
          allocationPort: allocation.port,
          status: "STOPPED",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "SERVER_MIGRATED",
          targetType: "Server",
          targetId: serverId,
          metadata: {
            fromNodeId: server.nodeId,
            toNodeId: targetHostNodeId,
            oldPterodactylServerId,
            newPterodactylServerId: newPteroServer.id,
          },
        },
      });
      return result;
    });

    // 8) 원본 Pterodactyl 서버는 삭제하지 않고 정지 상태로 남겨 관리자가 확인 후 수동 삭제하게 한다
    await PteroApp.suspendServer(oldPterodactylServerId).catch((err) =>
      console.error("[serverMigration] 원본 서버 정지(suspend) 실패 — 관리자가 직접 정리해야 함:", err),
    );

    getBotSettings()
      .then((settings) => {
        if (!settings?.logChannelId) return;
        return sendDiscordChannelMessage(settings.logChannelId, {
          embeds: [
            {
              title: "🚚 서버 이전",
              description: `**${server.name}** — ${server.node.name} → ${targetNode.name}`,
              color: 0x3b82f6,
            },
          ],
        });
      })
      .catch((err) => console.error("[serverMigration] 이전 로그 알림 실패:", err));

    return { server: updated, oldPterodactylServerId };
  } catch (err) {
    // 새 서버까지는 만들었는데 이후 단계가 실패하면, DB는 아직 원본을 가리키고 있으니
    // 고아가 된 새 Pterodactyl 서버를 지워서 중복 과금/자원 낭비를 막는다
    if (newPteroServerId) {
      await PteroApp.deleteServer(newPteroServerId).catch(() => {});
    }
    await prisma.server.update({ where: { id: serverId }, data: { status: previousStatus } });
    throw err;
  } finally {
    if (tempPath) await fs.promises.unlink(tempPath).catch(() => {});
  }
}
