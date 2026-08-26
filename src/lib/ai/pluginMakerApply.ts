import { PteroClient } from "@/lib/pterodactyl";
import { resolveDatapackVersion, datapackFolderName, buildPackMcmeta } from "@/lib/minecraftDatapack";
import { compileJavaPlugin, PluginCompileError } from "@/lib/ai/pluginCompiler";
import { reviewJavaSourceSafety } from "@/lib/ai/javaSafety";
import type { PluginMakerResult } from "@/lib/ai/pluginMaker";

export class PluginUnsafeError extends Error {
  constructor(public reasons: string[]) {
    super(`안전하지 않은 코드로 판단돼 적용을 막았어요: ${reasons.join(", ")}`);
  }
}

/** 생성된 결과를 실제 서버에 즉시 적용한다 */
export async function applyPluginMakerResult(
  pterodactylIdentifier: string,
  minecraftVersion: string,
  result: PluginMakerResult,
): Promise<{ appliedPath: string }> {
  if (result.kind === "java_plugin") {
    const plugin = result.javaPlugin!;
    // generate 단계의 검토 결과를 그대로 믿지 않는다 — 클라이언트가 왕복시키는 값이라 변조될 수 있으므로
    // 실제로 적용하기 직전에 서버에서 다시 한번 검사한다.
    const review = await reviewJavaSourceSafety(plugin.javaSource);
    if (!review.safe) throw new PluginUnsafeError(review.reasons);

    const { jarBuffer } = await compileJavaPlugin({
      packageName: plugin.packageName,
      className: plugin.className,
      javaSource: plugin.javaSource,
      pluginYml: plugin.pluginYml,
      minecraftVersion,
    }).catch((err) => {
      if (err instanceof PluginCompileError) throw err;
      throw new PluginCompileError(err instanceof Error ? err.message : "컴파일 실패");
    });

    const path = `/plugins/${plugin.className}.jar`;
    const arrayBuffer = jarBuffer.buffer.slice(jarBuffer.byteOffset, jarBuffer.byteOffset + jarBuffer.byteLength);
    await PteroClient.writeBinaryFile(pterodactylIdentifier, path, arrayBuffer as ArrayBuffer);
    // 컴파일된 플러그인은 Skript 스크립트와 달리 서버가 시작할 때만 로드되므로 재시작이 필요하다
    await PteroClient.sendPowerAction(pterodactylIdentifier, "restart");
    return { appliedPath: path };
  }

  if (result.kind === "skript") {
    const filename = result.skript!.filename.endsWith(".sk") ? result.skript!.filename : `${result.skript!.filename}.sk`;
    const path = `/plugins/Skript/scripts/${filename}`;
    await PteroClient.writeFile(pterodactylIdentifier, path, result.skript!.content);
    // Skript가 설치돼 있으면 재시작 없이 즉시 반영된다. 설치 안 돼 있으면 이 명령은 조용히 무시될 뿐
    // 서버에 해를 끼치지 않는다 — 알 수 없는 명령어로 콘솔에 로그만 남는다.
    await PteroClient.sendConsoleCommand(pterodactylIdentifier, `sk reload ${filename}`);
    return { appliedPath: path };
  }

  const datapack = result.datapack!;
  const versionInfo = resolveDatapackVersion(minecraftVersion);
  const folderName = `${datapack.namespace}-${Math.random().toString(36).slice(2, 8)}`;
  const base = `/world/datapacks/${folderName}`;
  const functionFolder = datapackFolderName("function", versionInfo.pluralFolders);

  await PteroClient.writeFile(pterodactylIdentifier, `${base}/pack.mcmeta`, buildPackMcmeta(result.summary, versionInfo));

  for (const fn of datapack.functions) {
    const commands = fn.commands.map((c) => c.replace(/^\//, "")).join("\n");
    await PteroClient.writeFile(
      pterodactylIdentifier,
      `${base}/data/${datapack.namespace}/${functionFolder}/${fn.name}.mcfunction`,
      commands,
    );
  }

  if (datapack.runOnLoad?.length) {
    const values = datapack.runOnLoad.map((n) => `${datapack.namespace}:${n}`);
    await PteroClient.writeFile(
      pterodactylIdentifier,
      `${base}/data/minecraft/tags/${functionFolder}/load.json`,
      JSON.stringify({ values }, null, 2),
    );
  }
  if (datapack.runEveryTick?.length) {
    const values = datapack.runEveryTick.map((n) => `${datapack.namespace}:${n}`);
    await PteroClient.writeFile(
      pterodactylIdentifier,
      `${base}/data/minecraft/tags/${functionFolder}/tick.json`,
      JSON.stringify({ values }, null, 2),
    );
  }

  // 순서 중요: 새 팩 폴더를 서버가 인식하게 리로드한 다음, 그 팩을 활성화해야 함
  await PteroClient.sendConsoleCommand(pterodactylIdentifier, "reload");
  await PteroClient.sendConsoleCommand(pterodactylIdentifier, `datapack enable "file/${folderName}"`);

  return { appliedPath: base };
}
