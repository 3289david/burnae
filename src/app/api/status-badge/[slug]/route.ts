import { NextResponse } from "next/server";
import { getStatusPageData } from "@/lib/statusPage";

/** shields.io 스타일 임베드 가능한 SVG 상태 배지 — 고객이 자기 Discord/README/웹사이트에
 * 그대로 박아넣을 수 있다. 공개 상태 페이지가 꺼져 있으면 404(상태 페이지 자체와 동일한 노출 기준) */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getStatusPageData(slug);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  const label = "status";
  const message = data.isUp ? "operational" : "down";
  const color = data.isUp ? "#3fb950" : "#f85149";
  const labelWidth = 48;
  const messageWidth = message.length * 7 + 20;
  const totalWidth = labelWidth + messageWidth;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${message}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + messageWidth / 2}" y="14">${message}</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-cache, max-age=0",
    },
  });
}
