import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getPaperApiJarPath } from "@/lib/minecraftPaperApi";

const execFileAsync = promisify(execFile);
const COMPILE_TIMEOUT_MS = 25_000;

export class PluginCompileError extends Error {}

/**
 * AI가 생성한 Bukkit/Paper 플러그인 자바 소스를 실제로 컴파일해서 .jar로 만든다.
 *
 * 안전장치:
 *   - Gradle/Maven 같은 빌드 도구를 쓰지 않고 javac를 직접 호출한다 — 빌드 스크립트는 그 자체로
 *     임의 코드를 실행할 수 있는 언어(Groovy/Kotlin DSL)라서, 그 경로를 아예 없앤다.
 *   - `-proc:none`으로 애노테이션 프로세서를 꺼서, 컴파일 도중 임의 코드가 실행될 수 있는
 *     알려진 경로(악성 애노테이션 프로세서)를 차단한다.
 *   - 컴파일은 매번 새로 만드는 임시 디렉터리에서 진행하고 끝나면 지운다.
 *   - 컴파일에는 시간 제한을 둔다.
 * 컴파일된 결과물은 어차피 고객의 이미 격리된 Pterodactyl/Docker 컨테이너 안에서만 실행되며,
 * 이건 Modrinth에서 받은 서드파티 플러그인이 실행되는 것과 동일한 신뢰 경계다.
 */
export async function compileJavaPlugin(params: {
  packageName: string;
  className: string;
  javaSource: string;
  pluginYml: string;
  minecraftVersion: string;
}): Promise<{ jarBuffer: Buffer }> {
  const apiJar = await getPaperApiJarPath(params.minecraftVersion);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "burnae-plugin-"));
  try {
    const packagePath = params.packageName.replace(/\./g, path.sep);
    const srcDir = path.join(workDir, "src", packagePath);
    const outDir = path.join(workDir, "out");
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    const sourceFile = path.join(srcDir, `${params.className}.java`);
    await fs.writeFile(sourceFile, params.javaSource, "utf-8");

    try {
      await execFileAsync(
        "javac",
        ["-proc:none", "-encoding", "UTF-8", "-cp", apiJar, "-d", outDir, sourceFile],
        { timeout: COMPILE_TIMEOUT_MS },
      );
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      throw new PluginCompileError(`컴파일 오류:\n${stderr}`);
    }

    await fs.writeFile(path.join(outDir, "plugin.yml"), params.pluginYml, "utf-8");

    const jarPath = path.join(workDir, "plugin.jar");
    await execFileAsync("jar", ["cf", jarPath, "-C", outDir, "."], { timeout: COMPILE_TIMEOUT_MS });

    const jarBuffer = await fs.readFile(jarPath);
    return { jarBuffer };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
