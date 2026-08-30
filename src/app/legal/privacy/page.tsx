import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata = { title: "개인정보처리방침 — Burnae" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold font-display">
            <BrandMark size={22} /> Burnae
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold font-display">개인정보처리방침</h1>
        <p className="text-sm text-text-dim mt-2">시행일: 2026년 8월 30일</p>

        <Section title="1. 수집하는 개인정보 항목">
          <ul className="list-disc pl-5 space-y-1">
            <li>소셜 로그인(Google/GitHub/Discord)을 통해 제공받는 이메일, 이름, 프로필 식별자</li>
            <li>결제 시 입금자명 (계좌 비밀번호 등 금융 인증정보는 일체 수집하지 않습니다)</li>
            <li>서버 관리를 위한 내부 식별자 및 접속정보: Pterodactyl 연동 계정 식별자, SFTP 접속용
              비밀번호(암호화 저장), 서버별 접속 보안키. 이 정보는 이용자 본인의 서버 접근·관리 목적으로만
              사용되며 회사 직원이라도 통상적인 서비스 운영 외 목적으로 열람하지 않습니다.</li>
            <li>서비스 이용 기록: 서버 생성/삭제/이전 이력, 콘솔 명령 실행 로그, 파일 작업 로그, AI 챗봇 및
              &ldquo;메이커&rdquo; 대화 내역(메이커가 자동 실행한 파일 생성·수정·명령 실행 기록 포함), 접속 로그</li>
            <li>포인트·상점 이용 내역: 홍보 활동으로 적립된 포인트 잔액 및 적립·차감 내역, 포인트 상점에서
              교환한 항목(자원 업그레이드, 무료 슬롯 연장 등)</li>
            <li>디스코드 연동 시 디스코드 사용자 ID, 규칙 인증·공지 알림 구독 등 역할 부여 여부</li>
            <li>디스코드 <code>/설문</code> 명령어로 제출한 의견/제안 내용과 제출자의 디스코드 사용자
              ID·태그(회원 연동 여부에 따라 회원 계정과 연결될 수 있음)</li>
            <li>무료(홍보 포인트 교환) 플랜 대시보드 접속 시, 광고 노출을 위해 카카오 애드핏이 수집하는
              쿠키·광고식별자 등 (4번 항목 참고 — 회사가 직접 수집하지 않음)</li>
          </ul>
        </Section>

        <Section title="2. 개인정보의 수집 및 이용 목적">
          회원 식별 및 로그인 유지, 서버 생성·과금·환불 처리, 결제 자동 확인(입금자명 매칭), 고객 문의 대응,
          부정 이용 방지, AI 챗봇/메이커 대화 맥락 유지 및 서비스 품질 개선, 포인트 적립·교환 처리, SFTP 등을
          통한 서버 접근 권한 관리.
        </Section>

        <Section title="3. 개인정보의 보유 및 이용 기간">
          회원 탈퇴 시 지체 없이 파기하되, 전자상거래법 등 관계 법령에 따라 보존이 필요한 거래 기록은
          해당 법령에서 정한 기간 동안 보관합니다. 서버 삭제 시 생성된 백업은 보관정책(기본 7일)에 따라
          자동 삭제되며, SFTP 비밀번호·접속 보안키 등 서버 연계 정보도 해당 서버 삭제 시 함께 파기됩니다.
        </Section>

        <Section title="4. 개인정보의 제3자 제공 및 처리위탁">
          회사는 서비스 제공을 위해 아래 외부 서비스에 최소한의 정보를 전달합니다. 각 서비스는 자체
          개인정보처리방침을 따릅니다.
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li><strong>Pterodactyl(자체 인프라)</strong> — 서버 생성/운영을 위한 이메일, 이름</li>
            <li><strong>하나은행 Open API</strong> — 결제 확인을 위한 결제 계좌의 입금 거래내역(입금자명, 금액) 조회 (계좌 비밀번호 등은 전달하지 않음)</li>
            <li><strong>OpenRouter</strong> — AI 챗봇 대화 내용(서버 관련 요청 텍스트)</li>
            <li><strong>Cloudflare</strong> — 서브도메인 연결을 위한 서버 접속 정보(IP, 포트)</li>
            <li><strong>Google / GitHub / Discord</strong> — 소셜 로그인 인증 (OAuth)</li>
            <li><strong>카카오(Kakao AdFit)</strong> — 무료 플랜 서버 관리 화면에서만 광고 노출을 위해
              쿠키/광고식별자 등을 수집·처리할 수 있습니다. 회사는 이용자의 Burnae 계정 정보를 카카오에
              전달하지 않으며, 광고 관련 데이터 처리는 카카오의 개인정보처리방침을 따릅니다. 유료 결제
              서버의 관리 화면에는 광고가 노출되지 않아 이 항목이 적용되지 않습니다.</li>
          </ul>
        </Section>

        <Section title="4의2. 광고(카카오 애드핏) 안내">
          무료(홍보 포인트 교환) 플랜의 서버 관리 화면에는 카카오 애드핏 광고가 노출됩니다. 애드핏은
          맞춤형 광고 제공을 위해 쿠키 등을 사용할 수 있으며, 이용자는 브라우저 설정에서 쿠키 저장을
          거부하여 맞춤형 광고 수신을 제한할 수 있습니다(이 경우 광고 자체가 사라지지는 않을 수 있습니다).
          광고 영역을 통해 연결되는 제3자 사이트의 개인정보 처리에 대해서는 회사가 책임지지 않습니다.
        </Section>

        <Section title="5. 이용자의 권리">
          이용자는 언제든 자신의 개인정보 열람, 정정, 삭제, 처리정지를 요청할 수 있으며, 계정 삭제(탈퇴)를
          통해 수집된 정보의 파기를 요청할 수 있습니다.
        </Section>

        <Section title="6. 개인정보 보호책임자">
          개인정보 관련 문의는 디스코드 공식 서버의 /문의 명령어 또는 별도 안내되는 이메일로 접수할 수
          있습니다.
        </Section>

        <Section title="7. 방침의 변경">
          이 방침이 변경되는 경우 서비스 내 공지사항을 통해 사전 고지합니다.
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold font-display">{title}</h2>
      <div className="mt-2 text-sm text-text-dim leading-relaxed">{children}</div>
    </section>
  );
}
