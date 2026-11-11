import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Next 16부터 images.qualities 기본값이 [75]로 제한돼서, 코드에서 quality={95}를 줘도
  // 이 목록에 없으면 75로 강제로 깎인다 — 일러스트/아이콘이 흐릿해 보이던 원인 중 하나.
  images: {
    qualities: [75, 95, 100],
  },
};

export default withNextIntl(nextConfig);
