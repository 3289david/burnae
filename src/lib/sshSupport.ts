/** SSH 사이드카(burnae-ssh-sidecar.sh)가 startupCommand에 심어진 템플릿들 — accessSecret이
 * 있어도 이 목록에 없으면 SSH가 아니라 다른 용도(Postgres/Redis 등 자체 DB 접속 비밀번호)다 */
const SSH_SUPPORTED_TEMPLATE_KEYS = new Set([
  "blank-server",
  "nodejs-bot",
  "python-bot",
  "bun-generic",
  "deno-generic",
  "rust-generic",
  "csharp-generic",
  "golang-generic",
  "java-generic",
]);

export function supportsSsh(templateKey: string): boolean {
  return SSH_SUPPORTED_TEMPLATE_KEYS.has(templateKey);
}
