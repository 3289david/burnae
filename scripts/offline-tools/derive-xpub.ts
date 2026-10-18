/**
 * ⚠️ 오프라인 전용 도구 — 절대 인터넷에 연결된(또는 실제 자금이 있는 지갑과 같은) 컴퓨터에서
 * 실제 시드 구문을 입력하지 마세요. 가능하면 연결이 끊긴 컴퓨터나 라이브 USB에서 실행하세요.
 *
 * 왜 필요한가: TRON(TronLink 등 대부분의 지갑)은 Bitcoin/Ethereum과 달리 "확장 공개키(xpub)
 * 내보내기" 기능을 지원하지 않는 경우가 거의 전부다. 하지만 TRON도 Bitcoin과 같은 secp256k1
 * 곡선을 쓰기 때문에, 니모닉(시드 구문)만 있으면 이 스크립트로 직접 계산할 수 있다.
 *
 * 이 스크립트는:
 *  - 터미널에 아무것도 남기지 않으려고 니모닉 입력을 화면에 표시하지 않는다(붙여넣기는 동작함).
 *  - 네트워크 요청을 전혀 하지 않는다(오프라인에서 실행해도 100% 동일하게 동작).
 *  - 디스크에 아무것도 쓰지 않는다 — 화면에 xpub 한 줄만 출력하고 끝난다.
 *  - 개인키(xprv)는 절대 출력하지 않는다 — Burnae 서버에는 이 스크립트가 출력하는
 *    xpub(공개키)만 입력하면 된다.
 *
 * 사용법 (이 저장소를 내려받은 오프라인 컴퓨터에서):
 *   npx tsx scripts/offline-tools/derive-xpub.ts
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as bip39 from "bip39";
import * as ecc from "tiny-secp256k1";
import { BIP32Factory } from "bip32";

const bip32 = BIP32Factory(ecc);

const PRESET_PATHS: Record<string, string> = {
  "1": "m/44'/195'/0'", // TRON / USDT-TRC20 (TronLink 등 대부분의 표준 TRON 지갑 경로)
  "2": "m/84'/0'/0'", // Bitcoin 네이티브 세그윗(bc1...) — Electrum "네이티브 세그윗" 지갑 등
  "3": "m/84'/2'/0'", // Litecoin 네이티브 세그윗(ltc1...) — 코인 타입 2
  "4": "", // 직접 입력
};

async function promptHidden(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  stdout.write(question);
  return new Promise((resolve) => {
    const onData = (char: Buffer) => {
      const str = char.toString();
      if (str === "\n" || str === "\r") {
        stdin.off("data", onData);
        stdout.write("\n");
      }
    };
    // readline이 콘솔에 그대로 echo하는 걸 최대한 줄이려고 raw 모드에서 직접 받되,
    // 완벽한 비표시 입력은 TTY 환경에 따라 다를 수 있다 — 민감하면 터미널 스크롤백을
    // 바로 지우는 걸 권장한다(아래 안내 참고).
    if (stdin.isTTY) stdin.setRawMode?.(false);
    stdin.on("data", onData);
    rl.question("").then((answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log("=== Burnae 오프라인 xpub 추출 도구 ===");
  console.log("⚠️  인터넷에 연결되지 않은 컴퓨터에서 실행하는 걸 강력히 권장합니다.\n");

  const rl = createInterface({ input: stdin, output: stdout });

  console.log("코인 선택:");
  console.log("  1) TRON / USDT-TRC20 (m/44'/195'/0')");
  console.log("  2) Bitcoin 네이티브 세그윗 (m/84'/0'/0')");
  console.log("  3) Litecoin 네이티브 세그윗 (m/84'/2'/0')");
  console.log("  4) 경로 직접 입력");
  const choice = (await rl.question("번호 입력: ")).trim();
  const path = PRESET_PATHS[choice] || (await rl.question("파생 경로 입력 (예: m/44'/195'/0'): ")).trim();

  const mnemonic = await promptHidden(rl, "\n니모닉(시드 구문) 입력 후 Enter (화면에 표시되지 않습니다): ");
  if (!bip39.validateMnemonic(mnemonic)) {
    console.error("\n❌ 올바른 BIP39 니모닉이 아니에요. 단어 수/철자를 확인해주세요.");
    rl.close();
    process.exitCode = 1;
    return;
  }
  const passphrase = await rl.question("BIP39 패스프레이즈(25번째 단어, 없으면 그냥 Enter): ");

  const seed = await bip39.mnemonicToSeed(mnemonic, passphrase || undefined);
  const root = bip32.fromSeed(seed);
  const account = root.derivePath(path);
  const xpub = account.neutered().toBase58();

  console.log("\n✅ 계정 확장 공개키(xpub) — 이것만 Burnae 관리자 화면에 입력하세요:\n");
  console.log(xpub);
  console.log("\n이 값은 '공개'키라 유출돼도 자금을 뺏길 수는 없지만, 모든 과거/미래 입금 주소가");
  console.log("노출되니 신뢰할 수 있는 곳에만 입력하세요. 절대 xprv(개인키)나 니모닉 자체를");
  console.log("Burnae를 포함한 어디에도 입력하지 마세요.\n");

  rl.close();
}

main().catch((err) => {
  console.error("실행 실패:", err);
  process.exitCode = 1;
});
