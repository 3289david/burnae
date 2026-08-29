import { applicationRequest } from "./shared";

/**
 * Pterodactyl Application API (관리자 전용) wrapper.
 * 실제 패널 API를 직접 호출한다 — 시뮬레이션/가짜 데이터 없음.
 * https://dashflo.net/docs/api/pterodactyl/v1/ 기준 표준 엔드포인트.
 */

export interface PteroUser {
  id: number;
  uuid: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface PteroAllocation {
  id: number;
  ip: string;
  ip_alias: string | null;
  port: number;
  notes: string | null;
  assigned: boolean;
}

export interface PteroServer {
  id: number;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  user: number;
  /** null=정상, "installing"=설치중, "install_failed"=설치실패, "suspended" 등 */
  status: string | null;
  node: number;
  allocation: number;
  limits: {
    memory: number;
    swap: number;
    disk: number;
    io: number;
    cpu: number;
  };
  feature_limits: {
    databases: number;
    allocations: number;
    backups: number;
  };
}

interface PteroListResponse<T> {
  object: string;
  data: { object: string; attributes: T }[];
  meta?: { pagination?: { total: number; count: number; current_page: number } };
}

interface PteroItemResponse<T> {
  object: string;
  attributes: T;
}

/** 이메일로 유저 조회, 없으면 새로 생성 (고객 최초 서버 구매 시 사용) */
export async function findOrCreateUser(params: {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
}): Promise<PteroUser> {
  const search = await applicationRequest<PteroListResponse<PteroUser>>(
    `/api/application/users?filter[email]=${encodeURIComponent(params.email)}`,
  );
  const existing = search.data[0]?.attributes;
  if (existing) return existing;

  const created = await applicationRequest<PteroItemResponse<PteroUser>>(
    "/api/application/users",
    {
      method: "POST",
      body: JSON.stringify({
        email: params.email,
        username: params.username,
        first_name: params.firstName,
        last_name: params.lastName,
        password: crypto.randomUUID(), // 고객은 Burnae 자체 로그인만 사용, 패널 직접 로그인 불필요
      }),
    },
  );
  return created.attributes;
}

/** SFTP 비밀번호 재설정 등 유저 상세 정보가 필요할 때 조회 */
export async function getUser(pterodactylUserId: number): Promise<PteroUser> {
  const res = await applicationRequest<PteroItemResponse<PteroUser>>(
    `/api/application/users/${pterodactylUserId}`,
  );
  return res.attributes;
}

/**
 * SFTP 접속용 패널 계정 비밀번호를 새로 발급한다. 패널 유저 갱신 API는 전체 필드를
 * 요구하므로 기존 정보를 먼저 조회해 email/username/이름은 그대로 두고 비밀번호만 바꾼다.
 */
export async function resetUserPassword(pterodactylUserId: number, newPassword: string): Promise<void> {
  const user = await getUser(pterodactylUserId);
  await applicationRequest(`/api/application/users/${pterodactylUserId}`, {
    method: "PATCH",
    body: JSON.stringify({
      email: user.email,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      password: newPassword,
    }),
  });
}

/** 노드의 미할당 allocation 중 하나를 가져온다 (없으면 새로 생성) */
export async function getFreeAllocation(
  pterodactylNodeId: number,
): Promise<PteroAllocation> {
  const res = await applicationRequest<PteroListResponse<PteroAllocation>>(
    `/api/application/nodes/${pterodactylNodeId}/allocations?per_page=200`,
  );
  const free = res.data.find((a) => !a.attributes.assigned);
  if (free) return free.attributes;
  throw new Error(
    `노드 #${pterodactylNodeId}에 사용 가능한 포트 할당(allocation)이 없습니다. Pterodactyl 패널에서 allocation을 추가하세요.`,
  );
}

export interface PteroAllocationWithUsage extends PteroAllocation {
  /** 이 포트를 쓰고 있는 서버의 Pterodactyl ID/이름 — 비어있으면(assigned=false) null */
  assignedServerId: number | null;
  assignedServerName: string | null;
}

/** 관리자 화면에서 "이 포트가 쓰는 중인지 안 쓰는 중인지" 보여주기 위해 노드의 모든 allocation을 서버 정보 포함해 가져온다 */
export async function listNodeAllocations(pterodactylNodeId: number): Promise<PteroAllocationWithUsage[]> {
  const res = await applicationRequest<{
    data: {
      attributes: PteroAllocation & {
        relationships?: { server?: { attributes?: { id: number; name: string } | null } };
      };
    }[];
  }>(`/api/application/nodes/${pterodactylNodeId}/allocations?per_page=200&include=server`);
  return res.data.map((d) => ({
    ...d.attributes,
    assignedServerId: d.attributes.relationships?.server?.attributes?.id ?? null,
    assignedServerName: d.attributes.relationships?.server?.attributes?.name ?? null,
  }));
}

/** 특정 노드에 새 포트 allocation을 만든다 (기존 미사용 포트가 없을 때) */
export async function createNodeAllocation(pterodactylNodeId: number, ip: string, port: number): Promise<void> {
  await applicationRequest(`/api/application/nodes/${pterodactylNodeId}/allocations`, {
    method: "POST",
    body: JSON.stringify({ ip, ports: [String(port)] }),
  });
}

export async function getServer(pterodactylServerId: number): Promise<PteroServer> {
  const res = await applicationRequest<PteroItemResponse<PteroServer>>(
    `/api/application/servers/${pterodactylServerId}`,
  );
  return res.attributes;
}

/**
 * 서버 빌드(build) 갱신 API는 부분 수정이 아니라 리소스 전체를 요구하므로, 먼저 현재 값을
 * 조회해 그대로 채우고 allocations 개수와 add/remove 목록만 바꿔서 보낸다.
 */
async function updateServerAllocations(
  pterodactylServerId: number,
  options: { addAllocationId?: number; removeAllocationId?: number },
): Promise<void> {
  const server = await getServer(pterodactylServerId);
  const delta = options.addAllocationId ? 1 : options.removeAllocationId ? -1 : 0;
  await applicationRequest(`/api/application/servers/${pterodactylServerId}/build`, {
    method: "PATCH",
    body: JSON.stringify({
      allocation: server.allocation,
      memory: server.limits.memory,
      swap: server.limits.swap,
      disk: server.limits.disk,
      io: server.limits.io,
      cpu: server.limits.cpu,
      feature_limits: {
        databases: server.feature_limits.databases,
        allocations: Math.max(1, server.feature_limits.allocations + delta),
        backups: server.feature_limits.backups,
      },
      ...(options.addAllocationId ? { add_allocations: [options.addAllocationId] } : {}),
      ...(options.removeAllocationId ? { remove_allocations: [options.removeAllocationId] } : {}),
    }),
  });
}

export async function addServerAllocation(pterodactylServerId: number, allocationId: number): Promise<void> {
  await updateServerAllocations(pterodactylServerId, { addAllocationId: allocationId });
}

/**
 * 서버 이름을 바꾼다. details 갱신 API도 build API처럼 전체 필드를 요구해서(name만 보내면
 * user/description이 비워짐) 현재 값을 먼저 조회해 그대로 채우고 name만 바꿔서 보낸다.
 */
export async function renameServer(pterodactylServerId: number, name: string): Promise<void> {
  const server = await getServer(pterodactylServerId);
  await applicationRequest(`/api/application/servers/${pterodactylServerId}/details`, {
    method: "PATCH",
    body: JSON.stringify({
      name,
      user: server.user,
      description: server.description,
      external_id: null,
    }),
  });
}

export async function removeServerAllocation(pterodactylServerId: number, allocationId: number): Promise<void> {
  const server = await getServer(pterodactylServerId);
  if (server.allocation === allocationId) {
    throw new Error("기본 접속 포트는 제거할 수 없습니다. 다른 추가 포트만 제거할 수 있어요.");
  }
  await updateServerAllocations(pterodactylServerId, { removeAllocationId: allocationId });
}

export async function createServer(params: {
  name: string;
  userId: number;
  nodeId: number;
  allocationId: number;
  eggId: number;
  nestId: number;
  dockerImage: string;
  startupCommand: string;
  environment: Record<string, string | number | boolean>;
  memoryMb: number;
  diskMb: number;
  cpuPercent: number;
  backupSlots: number;
  databases?: number;
  /** 기본 true. 이전(migrate)처럼 파일을 다 옮기기 전까지 자동 시작을 막아야 할 때 false로 넘긴다 */
  startOnCompletion?: boolean;
}): Promise<PteroServer> {
  const created = await applicationRequest<PteroItemResponse<PteroServer>>(
    "/api/application/servers",
    {
      method: "POST",
      body: JSON.stringify({
        name: params.name,
        user: params.userId,
        egg: params.eggId,
        nest: params.nestId,
        docker_image: params.dockerImage,
        startup: params.startupCommand,
        environment: params.environment,
        limits: {
          memory: params.memoryMb,
          swap: 0,
          disk: params.diskMb,
          io: 500,
          cpu: params.cpuPercent,
        },
        feature_limits: {
          databases: params.databases ?? 1,
          allocations: 1,
          backups: params.backupSlots,
        },
        allocation: { default: params.allocationId },
        start_on_completion: params.startOnCompletion ?? true,
      }),
    },
  );
  return created.attributes;
}

export async function deleteServer(pterodactylServerId: number): Promise<void> {
  await applicationRequest(`/api/application/servers/${pterodactylServerId}`, {
    method: "DELETE",
  });
}

export async function suspendServer(pterodactylServerId: number): Promise<void> {
  await applicationRequest(
    `/api/application/servers/${pterodactylServerId}/suspend`,
    { method: "POST" },
  );
}

export async function unsuspendServer(pterodactylServerId: number): Promise<void> {
  await applicationRequest(
    `/api/application/servers/${pterodactylServerId}/unsuspend`,
    { method: "POST" },
  );
}

export async function getServerDetails(
  pterodactylServerId: number,
): Promise<PteroServer> {
  const res = await applicationRequest<PteroItemResponse<PteroServer>>(
    `/api/application/servers/${pterodactylServerId}`,
  );
  return res.attributes;
}

/** 서버의 RAM/CPU/디스크 리소스 한도를 변경 (업그레이드/다운그레이드) */
export async function updateServerBuild(
  pterodactylServerId: number,
  params: { memoryMb: number; diskMb: number; cpuPercent: number; backupSlots: number },
): Promise<PteroServer> {
  const res = await applicationRequest<PteroItemResponse<PteroServer>>(
    `/api/application/servers/${pterodactylServerId}/build`,
    {
      method: "PATCH",
      body: JSON.stringify({
        limits: {
          memory: params.memoryMb,
          swap: 0,
          disk: params.diskMb,
          io: 500,
          cpu: params.cpuPercent,
        },
        feature_limits: {
          databases: 1,
          allocations: 1,
          backups: params.backupSlots,
        },
      }),
    },
  );
  return res.attributes;
}

export interface PteroNode {
  id: number;
  name: string;
  fqdn: string;
  memory: number;
  memory_overallocate: number;
  disk: number;
  disk_overallocate: number;
}

export async function listNodes(): Promise<PteroNode[]> {
  const res = await applicationRequest<PteroListResponse<PteroNode>>(
    "/api/application/nodes?per_page=100",
  );
  return res.data.map((d) => d.attributes);
}

export interface PteroNest {
  id: number;
  name: string;
  description: string | null;
}

export interface PteroEggSummary {
  id: number;
  nest: number;
  name: string;
  description: string | null;
}

export interface PteroEggVariable {
  name: string;
  description: string;
  env_variable: string;
  default_value: string;
  user_editable: boolean;
}

export interface PteroEggDetail {
  id: number;
  nest: number;
  name: string;
  description: string | null;
  /** { "Java 21": "ghcr.io/pterodactyl/yolks:java_21", ... } — 라벨을 곧 "자바 버전 선택지"로 쓴다 */
  docker_images: Record<string, string>;
  startup: string;
  relationships?: { variables?: PteroListResponse<PteroEggVariable> };
}

/** Admin → Nests 화면과 동일한 목록. 관리자가 Nest ID를 몰라도 이름으로 고를 수 있게 해준다 */
export async function listNests(): Promise<PteroNest[]> {
  const res = await applicationRequest<PteroListResponse<PteroNest>>(
    "/api/application/nests?per_page=100",
  );
  return res.data.map((d) => d.attributes);
}

export async function listEggs(nestId: number): Promise<PteroEggSummary[]> {
  const res = await applicationRequest<PteroListResponse<PteroEggSummary>>(
    `/api/application/nests/${nestId}/eggs?per_page=100`,
  );
  return res.data.map((d) => d.attributes);
}

/** docker_images(=자바 버전 선택지), startup 명령어, 변수 기본값까지 한 번에 가져와서 관리자가 손으로 안 채워도 되게 한다 */
export async function getEgg(nestId: number, eggId: number): Promise<PteroEggDetail> {
  const res = await applicationRequest<PteroItemResponse<PteroEggDetail>>(
    `/api/application/nests/${nestId}/eggs/${eggId}?include=variables`,
  );
  return res.attributes;
}
