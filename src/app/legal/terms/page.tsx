import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata = { title: "이용약관 — Burnae" };

export default function TermsPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-bold font-display">
            <BrandMark size={22} /> Burnae
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose-sm">
        <h1 className="text-3xl font-bold font-display">이용약관</h1>
        <p className="text-sm text-text-dim mt-2">시행일: 2026년 8월 26일</p>

        <Section title="제1조 (목적)">
          이 약관은 Burnae(이하 &ldquo;회사&rdquo;)가 제공하는 마인크래프트 서버 호스팅 및 관련 부가 서비스(AI 서버
          관리, 디스코드 봇 등, 이하 &ldquo;서비스&rdquo;)의 이용과 관련하여 회사와 이용자의 권리, 의무 및
          책임사항을 정함을 목적으로 합니다.
        </Section>

        <Section title="제2조 (서비스의 내용)">
          회사는 Pterodactyl 기반 인프라를 통해 이용자가 마인크래프트 서버를 생성·관리·삭제할 수 있도록
          하며, 콘솔 접속, 파일 관리, 백업, 플레이어 관리, 플러그인/모드 설치, AI 챗봇을 통한 서버 관리 보조
          기능 등을 제공합니다. 회사는 서비스의 일부 또는 전부를 운영상·기술상 필요에 따라 변경하거나
          중단할 수 있으며, 이 경우 사전에 공지합니다.
        </Section>

        <Section title="제3조 (이용계약의 성립)">
          이용계약은 이용자가 회사가 정한 절차(Google/GitHub/Discord 소셜 로그인)에 따라 회원가입을 완료함으로써
          성립합니다. 만 14세 미만은 이용자 본인의 명의로 가입할 수 없습니다.
        </Section>

        <Section title="제4조 (결제 및 요금)">
          <ul className="list-disc pl-5 space-y-1">
            <li>서비스 이용료는 관리자가 정한 요금제(RAM/CPU/디스크 기준)에 따라 매월 후불이 아닌 선불로 결제합니다.</li>
            <li>결제는 무통장 계좌이체 방식으로 진행되며, 입금자명과 금액이 일치해야 자동으로 처리됩니다.</li>
            <li>결제가 확인되면 서버가 자동으로 생성·갱신·업그레이드됩니다.</li>
            <li>결제 기한이 지나면 사전 고지된 유예기간 후 서버가 일시정지되며, 정지 후 일정 보관기간이 지나면
              데이터가 삭제됩니다. 보관기간 및 정지 정책은 서비스 내 공지를 따릅니다.</li>
            <li>홍보 포인트 교환 등으로 발급된 무료 서버는 유료 서버와 달리 7일마다 직접 갱신해야 하며,
              디스코드 <code>/갱신</code> 명령어 또는 대시보드에서 결제 없이 즉시 연장할 수 있습니다. 기한 내
              갱신하지 않으면 제7조·제8조에 준하는 절차로 정지 후 삭제될 수 있습니다.</li>
            <li>이용자의 단순 변심에 의한 환불은 원칙적으로 제한되며, 관련 법령이 정하는 바에 따라 처리합니다.</li>
          </ul>
        </Section>

        <Section title="제4조의2 (커스텀 도메인 및 광고)">
          <ul className="list-disc pl-5 space-y-1">
            <li>이용자는 직접 소유한 도메인을 서버에 연결할 수 있으며, 도메인 자체의 구매·등록·관리는
              회사가 아닌 제3자 도메인 등록기관(예: krl.kr/domains)을 통해 이루어집니다. 회사는 해당
              제3자 사이트에서 발생하는 거래에 관여하지 않으며 그에 대한 책임을 지지 않습니다.</li>
            <li>홍보 포인트로 교환한 무료 서버의 관리 화면에는 카카오 애드핏(Kakao AdFit) 광고가 노출될 수
              있습니다. 유료 결제 서버의 관리 화면에는 광고가 노출되지 않습니다.</li>
          </ul>
        </Section>

        <Section title="제5조 (AI 기능 이용에 관한 특칙)">
          <ul className="list-disc pl-5 space-y-1">
            <li>AI 챗봇은 이용자의 요청을 바탕으로 서버 파일 수정, 명령어 실행, 플러그인 설치, 재시작 등
              실제 서버에 영향을 주는 작업을 수행할 수 있습니다.</li>
            <li>서버에 실질적 영향을 주는 작업은 이용자의 명시적 승인 후에만 실행되며, 위험도가 높은 작업은
              실행 전 자동 백업을 생성합니다.</li>
            <li>회사는 AI의 응답 내용이 항상 정확함을 보장하지 않으며, AI의 작업 실행으로 발생한 서버 데이터
              변경에 대해 이용자가 사전에 검토할 책임이 있습니다.</li>
            <li>AI 이용량은 요금제에 포함된 크레딧 범위 내로 제한될 수 있습니다.</li>
          </ul>
        </Section>

        <Section title="제6조 (이용자의 의무 및 금지행위)">
          이용자는 관련 법령, 마인크래프트 EULA, 이 약관을 준수해야 하며 다음 행위를 해서는 안 됩니다:
          타인 명의 도용, 서비스를 이용한 불법 콘텐츠 유통, 디도스·해킹 등 타 서버 공격, 서비스 취약점을
          악용한 비정상적 리소스 사용, 리소스 한도를 우회하기 위한 다중 계정 악용.
        </Section>

        <Section title="제6조의2 (공식 디스코드 서버 이용)">
          이용자가 회사의 공식 디스코드 서버에 참여하는 경우 해당 서버에 게시된 규칙을 준수해야 하며,
          규칙 확인 및 인증 절차(버튼 클릭 등)를 거쳐야 일부 채널·역할이 부여될 수 있습니다. 결제(또는
          홍보 포인트 교환)로 서버를 생성하면 구매자 역할이 자동으로 부여될 수 있습니다. 디스코드 규칙을
          위반하는 경우 회사는 해당 디스코드 서버 내 권한을 제한할 수 있으며, 이는 본 약관에 따른 서비스
          이용 제한과 별개로 이루어질 수 있습니다.
        </Section>

        <Section title="제7조 (서비스 제한 및 계약 해지)">
          회사는 이용자가 제6조를 위반하거나 결제가 장기간 지연되는 경우 사전 통지 후 서비스 이용을 제한하거나
          계약을 해지할 수 있습니다. 긴급한 보안 문제가 있는 경우 사전 통지 없이 제한할 수 있습니다.
        </Section>

        <Section title="제8조 (면책조항)">
          회사는 천재지변, 정전, 네트워크 장애, 제3자(Pterodactyl 인프라 제공자, 결제대행사, AI 모델 제공사 등)의
          귀책사유로 인한 서비스 중단에 대해 책임을 지지 않습니다. 이용자가 직접 생성·업로드한 데이터의 손실에
          대비해 정기적인 백업을 권장합니다.
        </Section>

        <Section title="제9조 (약관의 변경)">
          회사는 이 약관을 변경할 수 있으며, 변경 시 서비스 내 공지사항을 통해 사전 고지합니다. 변경된 약관은
          공지된 시행일부터 효력이 발생합니다.
        </Section>

        <Section title="제10조 (문의)">
          서비스 이용 관련 문의는 디스코드 공식 서버의 /문의 명령어 또는 아래 연락처로 접수할 수 있습니다.
        </Section>

        <p className="text-xs text-text-dim mt-10">
          사업자 정보(상호, 대표자, 사업자등록번호, 통신판매업 신고번호, 주소, 연락처)는 서비스 하단 및
          별도 사업자 정보 페이지에 게시됩니다.
        </p>
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
