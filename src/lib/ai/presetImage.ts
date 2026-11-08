import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * 커뮤니티 프리셋 썸네일 생성 — Gemini의 generateContent REST 엔드포인트를 쓴다
 * (https://ai.google.dev/api/generate-content, responseModalities에 IMAGE를 넣으면
 * candidates[0].content.parts[]에 inlineData로 이미지가 온다). 실패해도 절대 던지지 않는다 —
 * 프리셋 생성 자체는 이미지 없이도 완전히 동작해야 하고, 실패하면 그냥 기존 아이콘으로 보인다.
 */
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
const PRESETS_DIR = path.join(process.cwd(), "public", "presets");

interface GenerateContentResponse {
  candidates?: {
    content?: {
      parts?: { inlineData?: { data?: string; mimeType?: string } }[];
    };
  }[];
}

async function callGemini(prompt: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      },
    );
    if (!res.ok) {
      console.error("[presetImage] Gemini API 오류:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json: GenerateContentResponse = await res.json();
    const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) return null;
    return { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "image/png" };
  } catch (err) {
    console.error("[presetImage] Gemini 호출 실패:", err);
    return null;
  }
}

/** 프리셋 이름/설명/기반 종류로 간단한 썸네일 프롬프트를 만들고, 생성된 이미지를
 * public/presets/{id}.webp에 저장한 뒤 UserPreset.imageUrl을 채운다. */
export async function generatePresetThumbnail(preset: {
  id: string;
  displayName: string;
  blurb: string | null;
  baseTemplateName: string;
}): Promise<void> {
  const prompt =
    `Create a small flat-style app icon illustration representing "${preset.displayName}"` +
    `${preset.blurb ? ` (${preset.blurb})` : ""}, based on ${preset.baseTemplateName}. ` +
    `Simple, clean, modern, vector-art style, centered subject, solid or subtly gradient background, no text.`;

  const result = await callGemini(prompt);
  if (!result) return;

  try {
    await mkdir(PRESETS_DIR, { recursive: true });
    const ext = result.mimeType.includes("png") ? "png" : result.mimeType.includes("webp") ? "webp" : "jpg";
    const filename = `${preset.id}.${ext}`;
    await writeFile(path.join(PRESETS_DIR, filename), result.data);
    await prisma.userPreset.update({ where: { id: preset.id }, data: { imageUrl: `/presets/${filename}` } });
  } catch (err) {
    console.error("[presetImage] 썸네일 저장/업데이트 실패:", err);
  }
}
