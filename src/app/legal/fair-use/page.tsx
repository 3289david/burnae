import Link from "next/link";
import BrandMark from "@/components/BrandMark";

export const metadata = { title: "공정 이용 정책 — Burnae" };

export default function FairUsePage() {
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
        <h1 className="text-3xl font-bold font-display">공정 이용 정책</h1>
        <p className="text-sm text-text-dim mt-2">시행일: 2026년 10월 18일</p>
        <p className="text-sm text-text-dim mt-4">
          이 공정 이용 정책은{" "}
          <Link href="/legal/terms" className="text-accent">
            이용약관
          </Link>{" "}
          제6조(이용자의 의무 및 금지행위)의 &ldquo;비정상적 리소스 사용&rdquo; 관련 내용을 트래픽
          기준으로 구체적으로 안내하기 위한 문서로, 모든 요금제에 포함된 &ldquo;트래픽 무제한&rdquo;
          혜택이 실제로 어떻게 적용되는지 설명해요.
        </p>

        <Section title="1. 트래픽 무제한이란">
          <p>
            일반적인 서버 사용(게임 플레이, 디스코드 봇 운영, 웹사이트 운영, 파일 업/다운로드 등)에
            대해 네트워크 전송량(트래픽) 기준 초과 요금이나 자동 정지가 없다는 뜻이에요. 대부분의
            고객은 이 정책을 전혀 신경 쓸 필요 없이 평소처럼 서버를 쓰면 돼요.
          </p>
        </Section>

        <Section title="2. 무제한이 적용되지 않는 경우">
          <p>트래픽 자체에는 상한이 없지만, 아래처럼 서버 용도를 벗어난 사용은 공정 이용 범위를 벗어나요.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>서버를 CDN, 프록시, VPN, 파일 공유/스트리밍 허브 등 트래픽 재판매·중계 목적으로 쓰는 경우</li>
            <li>다른 서버·사이트에 대한 공격(DDoS 등)이나 대량 스캔·크롤링의 발신지로 쓰는 경우</li>
            <li>같은 노드에 있는 다른 고객의 서버 성능에 지속적으로 심각한 영향을 주는 비정상적인 트래픽 패턴</li>
            <li>정상적인 서비스 운영이라고 보기 어려운, 광고된 사양 대비 과도하게 큰 트래픽을 지속적으로 발생시키는 경우</li>
          </ul>
        </Section>

        <Section title="3. 적용 절차">
          <p>공정 이용 범위를 벗어난 사용이 확인되면 다음 순서로 안내해요. 사전 경고 없이 바로 제재하지 않아요.</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>1차: 디스코드/이메일로 사용 패턴 안내 및 자율 조정 요청</li>
            <li>2차: 기간을 정해 해당 서버의 네트워크 속도를 일시적으로 제한</li>
            <li>
              3차: 안내에도 불구하고 반복되거나 다른 고객 서비스에 실제 장애를 일으키는 경우,{" "}
              <Link href="/legal/terms" className="text-accent">
                이용약관
              </Link>
              에 따라 서버 일시정지 또는 이용계약 해지
            </li>
          </ul>
          <p className="mt-2">
            디스크·CPU·RAM 등 다른 자원은 트래픽과 별개로 요금제에 명시된 사양이 그대로 상한이며,
            이 정책의 대상이 아니에요.
          </p>
        </Section>

        <Section title="4. 전용서버 상품">
          <p>
            &ldquo;전용서버&rdquo; 상품은 물리적으로 분리된 전용 장비를 쓰기 때문에 다른 고객과 자원을
            공유하지 않아요. 이 정책이 적용되긴 하지만, 실제로 문제가 되는 경우는 거의 없어요.
          </p>
        </Section>

        <p className="text-xs text-text-dim mt-10">
          공정 이용 정책 적용 여부로 문의가 있으면 고객지원을 통해 연락해주세요. 억울한 제재가 없도록
          항상 구체적인 근거(트래픽 로그, 발생 시각 등)를 먼저 안내해요.
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
