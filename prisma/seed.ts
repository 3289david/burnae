import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * 최초 배포 시 1회 실행하는 초기화 스크립트.
 * 가짜 상품/서버/유저 데이터는 만들지 않는다 — HostingSettings 기본값과 홍보 포인트 카탈로그만 생성.
 * (홍보 포인트 항목은 HostingSettings처럼 플랫폼이 기본 제공하는 설정 데이터라 여기서 생성해도 된다.
 *  상품/서버 종류(Egg)/노드는 반드시 관리자 패널에서 실제 Pterodactyl 정보로 등록해야 한다.)
 */

const PROMOTION_TASKS = [
  {
    key: "referral_signup",
    title: "친구 추천 가입",
    description: "내 추천 링크로 친구가 가입하면 자동으로 지급돼요.",
    pointsAwarded: 300,
    verifyMethod: "REFERRAL_SIGNUP",
    repeatable: true,
    sortOrder: 1,
  },
  {
    key: "referral_first_payment",
    title: "추천 친구의 첫 결제",
    description: "추천으로 가입한 친구가 첫 유료 서버를 만들면 추가로 지급돼요.",
    pointsAwarded: 500,
    verifyMethod: "REFERRAL_FIRST_PAYMENT",
    repeatable: true,
    sortOrder: 2,
  },
  {
    key: "discord_join",
    title: "공식 디스코드 서버 가입",
    description: "Burnae 공식 디스코드 서버에 가입하면 자동으로 확인돼요.",
    pointsAwarded: 100,
    verifyMethod: "DISCORD_MEMBER",
    repeatable: false,
    sortOrder: 3,
  },
  {
    key: "server_motd_branded",
    title: "서버 접속 안내문에 Burnae 표시",
    description: "내 서버의 접속 안내문(MOTD)에 \"Burnae\"를 넣으면 자동으로 확인돼요.",
    pointsAwarded: 150,
    verifyMethod: "SERVER_MOTD_BRANDED",
    repeatable: false,
    sortOrder: 4,
  },
  {
    key: "blog_review",
    title: "블로그 후기 작성",
    description: "네이버 블로그/티스토리 등에 후기를 쓰고 burnae.kr 링크를 넣은 뒤 글 주소를 제출하세요.",
    pointsAwarded: 200,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 5,
  },
  {
    key: "youtube_description",
    title: "유튜브 영상 설명란에 링크",
    description: "서버 소개/플레이 영상 설명란에 burnae.kr 링크를 넣은 뒤 영상 주소를 제출하세요.",
    pointsAwarded: 250,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 6,
  },
  {
    key: "youtube_video_mention",
    title: "영상 안에서 서버 소개",
    description: "영상 내용 중에 Burnae/서버 주소를 소개했다면 타임스탬프와 영상 주소를 제출해 심사받으세요.",
    pointsAwarded: 300,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 7,
  },
  {
    key: "community_post",
    title: "커뮤니티 게시글",
    description: "디시인사이드/인벤/루리웹 등 커뮤니티에 글을 쓰고 주소를 제출하세요.",
    pointsAwarded: 150,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 8,
  },
  {
    key: "cafe_post",
    title: "네이버 카페/밴드 게시글",
    description: "네이버 카페나 밴드에 글을 쓰고 주소를 제출하세요.",
    pointsAwarded: 150,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 9,
  },
  {
    key: "github_readme",
    title: "깃허브 프로젝트에 링크",
    description: "본인 깃허브 저장소 README 등에 burnae.kr 링크를 넣고 주소를 제출하세요.",
    pointsAwarded: 150,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 10,
  },
  {
    key: "personal_site_banner",
    title: "개인 홈페이지/포트폴리오에 배너",
    description: "운영 중인 개인 사이트에 Burnae 링크나 배너를 걸고 주소를 제출하세요.",
    pointsAwarded: 150,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 11,
  },
  {
    key: "server_list_listing",
    title: "마인크래프트 서버 목록 사이트 등록",
    description: "서버 목록/디렉토리 사이트에 burnae.kr 서버 주소를 등록하고 페이지 주소를 제출하세요.",
    pointsAwarded: 200,
    verifyMethod: "URL_CONTAINS_LINK",
    repeatable: false,
    sortOrder: 12,
  },
  {
    key: "wiki_mention",
    title: "위키 문서 등재",
    description: "나무위키 등 위키 문서에 서버를 소개했다면 문서 주소를 제출해 심사받으세요.",
    pointsAwarded: 200,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 13,
  },
  {
    key: "twitter_x_post",
    title: "X(트위터) 홍보 게시물",
    description: "X에 홍보 게시물을 올리고 게시물 주소를 제출해 심사받으세요.",
    pointsAwarded: 150,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 14,
  },
  {
    key: "instagram_post",
    title: "인스타그램 홍보",
    description: "인스타그램 피드/스토리에 홍보하고 캡처를 제출해 심사받으세요.",
    pointsAwarded: 150,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 15,
  },
  {
    key: "tiktok_video",
    title: "틱톡 영상 홍보",
    description: "틱톡 영상으로 서버를 소개하고 영상 주소를 제출해 심사받으세요.",
    pointsAwarded: 200,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 16,
  },
  {
    key: "stream_intro",
    title: "방송 소개란에 링크",
    description: "치지직/트위치 등 방송 소개란에 burnae.kr을 넣고 채널 주소를 제출해 심사받으세요.",
    pointsAwarded: 250,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 17,
  },
  {
    key: "server_icon_branded",
    title: "서버 아이콘에 Burnae 로고",
    description: "서버 아이콘에 Burnae 로고를 사용했다면 캡처를 제출해 심사받으세요.",
    pointsAwarded: 100,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 18,
  },
  {
    key: "discord_status_link",
    title: "디스코드 상태 메시지에 표시",
    description: "디스코드 프로필 상태 메시지에 burnae.kr을 넣었다면 캡처를 제출해 심사받으세요.",
    pointsAwarded: 100,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 19,
  },
  {
    key: "news_mention",
    title: "뉴스/매체 소개",
    description: "뉴스나 매체에 Burnae가 소개됐다면 기사 주소를 제출해 심사받으세요.",
    pointsAwarded: 400,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 20,
  },
  {
    key: "school_club_announcement",
    title: "학교/동아리 공지에 홍보",
    description: "학교나 동아리 공지·게시판에 서버를 홍보했다면 캡처를 제출해 심사받으세요.",
    pointsAwarded: 150,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 21,
  },
  {
    key: "friend_group_share",
    title: "단체 채팅방/커뮤니티에 공유",
    description: "친구 단체 채팅방이나 커뮤니티에 서버를 공유했다면 캡처를 제출해 심사받으세요.",
    pointsAwarded: 100,
    verifyMethod: "MANUAL_REVIEW",
    repeatable: false,
    sortOrder: 22,
  },
  {
    key: "custom_preset_published",
    title: "커뮤니티 프리셋 공개",
    description: "내가 설정한 시작 변수 조합을 다른 유저도 쓸 수 있는 프리셋으로 공개하면 자동으로 지급돼요 (하루 최대 5건).",
    pointsAwarded: 150,
    verifyMethod: "CUSTOM_PRESET_PUBLISHED",
    repeatable: true,
    sortOrder: 23,
  },
] as const;

async function main() {
  await prisma.hostingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  console.log("✅ HostingSettings 기본값 생성 완료");

  for (const task of PROMOTION_TASKS) {
    await prisma.promotionTask.upsert({
      where: { key: task.key },
      update: {},
      create: task,
    });
  }
  console.log(`✅ 홍보 포인트 항목 ${PROMOTION_TASKS.length}개 생성 완료`);
  console.log(
    "다음 단계: /admin/products에서 상품을 만들 때 \"홍보 포인트로 교환 가능\"을 체크하면 " +
      "포인트로 교환 가능한 무료 서버(예: RAM 1GB / CPU 50% / 디스크 500MB)를 만들 수 있어요.",
  );
  console.log("그다음: npm run make-admin -- you@example.com 로 관리자 계정을 지정하세요.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
