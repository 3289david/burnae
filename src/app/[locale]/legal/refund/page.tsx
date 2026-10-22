import { Link } from "@/i18n/navigation";
import BrandMark from "@/components/BrandMark";
import LegalEnglishNotice from "@/components/LegalEnglishNotice";

export const metadata = { title: "환불정책 — Burnae" };

export default async function RefundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
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
        <LegalEnglishNotice locale={locale} />
        <h1 className="text-3xl font-bold font-display">환불정책</h1>
        <p className="text-sm text-text-dim mt-2">시행일: 2026년 10월 13일</p>
        <p className="text-sm text-text-dim mt-4">
          이 환불정책은 이용약관 제4조(결제 및 요금)를 구체적으로 안내하기 위한 문서이며, 전자상거래
          등에서의 소비자보호에 관한 법률 등 관계 법령을 따릅니다.
        </p>

        <Section title="1. 결제 확인 전 취소">
          입금하기 전이거나, 입금했지만 아직 결제 확인(서버 생성)이 되지 않은 주문은 언제든지
          취소할 수 있습니다. 이 경우 입금한 금액은 전액 돌려드립니다.
        </Section>

        <Section title="2. 서버 생성 직후 환불">
          결제가 확인되어 서버가 만들어졌더라도, 서버를 실제로 써보기 전(접속 전) 바로 환불을
          요청하시면 특별한 사정이 없는 한 전액 환불해드립니다. 다만 아래와 같이 이미 상당 기간
          이용한 경우에는 3번 기준을 따릅니다.
        </Section>

        <Section title="3. 서버를 실제로 이용한 뒤의 환불">
          서버가 만들어지고 일정 기간 실제로 이용된 뒤에는, 전자상거래법상 서비스 제공이 이미
          시작된 것으로 보아 단순 변심에 의한 환불은 원칙적으로 어렵습니다. 다만 아래의 경우에는
          환불해드립니다.
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>회사 쪽 문제(장비 고장, 운영 실수 등)로 24시간 이상 서버를 정상적으로 쓸 수 없었던 경우 —
              그 기간만큼 요금을 돌려드립니다.</li>
            <li>같은 주문이 중복으로 결제되었거나, 다른 상품 금액으로 잘못 결제된 경우 — 차액 또는
              전액을 돌려드립니다.</li>
            <li>안내한 사양(용량 등)과 실제로 제공된 내용이 다른 경우.</li>
            <li>관계 법령에서 환불을 의무로 정한 경우.</li>
          </ul>
          그 외의 단순 변심(더 이상 필요 없음, 다른 곳을 이용하기로 함 등)으로는 이미 지난 이용
          기간에 대한 요금은 환불되지 않으며, 아직 쓰지 않은 남은 기간에 대해서만 남은 기간 비율만큼
          돌려드릴 수 있습니다.
        </Section>

        <Section title="4. AI 크레딧 / 포인트 환불">
          <ul className="list-disc pl-5 space-y-1">
            <li>구매한 AI 크레딧이나 포인트를 전혀 쓰지 않았다면, 결제일로부터 7일 이내에 환불을 요청할
              수 있습니다.</li>
            <li>일부라도 사용한 뒤에는 환불이 제한됩니다. 사용 여부와 상관없이, 포인트 상점에서 다른
              항목(서버 자원 증설, 슬롯 연장 등)으로 이미 교환한 포인트는 환불 대상이 아닙니다.</li>
            <li>무료 서버(포인트 교환) 관련 혜택은 현금 결제가 아니므로 환불 대상이 아닙니다.</li>
          </ul>
        </Section>

        <Section title="5. 환불 방법 및 처리 기간">
          환불은 결제 시 사용한 계좌로 돌려드리며, 대시보드의 &ldquo;고객지원&rdquo;을 통해 신청할 수
          있습니다. 신청이 접수되면 확인 후 영업일 기준 3~5일 이내에 처리합니다.
        </Section>

        <Section title="6. 환불 거부 또는 제한">
          이용자가 이용약관 제6조(금지행위)를 위반해 서비스 이용이 제한·해지된 경우, 그로 인한 미이용
          기간에 대해서는 환불해드리지 않습니다.
        </Section>

        <Section title="7. 문의">
          환불과 관련해 궁금한 점은 대시보드의 &ldquo;고객지원&rdquo;으로 언제든 문의해주세요.
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
