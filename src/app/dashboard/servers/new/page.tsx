"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  key: string;
  displayName: string;
  minecraftVersions: string[];
}
interface Product {
  id: string;
  name: string;
  description: string | null;
  ramMb: number;
  diskMb: number;
  priceMonthlyKrw: number;
  allowedTemplates: Template[];
}
interface BankAccount {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

export default function NewServerPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "pay">("form");
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [version, setVersion] = useState("");
  const [serverName, setServerName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [order, setOrder] = useState<{ id: string; amountKrw: number; depositorName: string } | null>(null);
  const [bank, setBank] = useState<BankAccount | null>(null);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    fetch("/api/catalog/products")
      .then((r) => r.json())
      .then((data: Product[]) => {
        setProducts(data);
        if (data[0]) {
          setProductId(data[0].id);
          const t = data[0].allowedTemplates[0];
          if (t) {
            setTemplateId(t.id);
            setVersion(t.minecraftVersions[0] ?? "");
          }
        }
      });
  }, []);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const selectedTemplate = useMemo(
    () => selectedProduct?.allowedTemplates.find((t) => t.id === templateId),
    [selectedProduct, templateId],
  );

  useEffect(() => {
    if (selectedProduct && !selectedProduct.allowedTemplates.some((t) => t.id === templateId)) {
      const t = selectedProduct.allowedTemplates[0];
      setTemplateId(t?.id ?? "");
      setVersion(t?.minecraftVersions[0] ?? "");
    }
  }, [selectedProduct, templateId]);

  async function submitOrder(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          templateId,
          minecraftVersion: version,
          serverName,
          couponCode: couponCode || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "주문 생성에 실패했습니다.");
      setOrder(data);

      const bankRes = await fetch("/api/payment/bank-account");
      if (bankRes.ok) setBank(await bankRes.json());

      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!order || paid) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/orders/${order.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === "PAID") {
        setPaid(true);
        clearInterval(interval);
        setTimeout(() => {
          if (data.serverId) router.push(`/dashboard/servers/${data.serverId}`);
          else router.push("/dashboard");
        }, 1500);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [order, paid, router]);

  if (step === "pay" && order) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold">입금 안내</h1>
        {paid ? (
          <div className="card mt-6 p-6 text-center">
            <div className="text-3xl">✅</div>
            <p className="mt-2 font-semibold">입금이 확인됐어요!</p>
            <p className="text-sm text-text-dim mt-1">서버를 만들고 있어요. 잠시만 기다려주세요...</p>
          </div>
        ) : (
          <div className="card mt-6 p-6 space-y-3">
            {bank && (
              <>
                <Row label="은행" value={bank.bankName} />
                <Row label="계좌번호" value={bank.accountNumber} />
                <Row label="예금주" value={bank.accountHolder} />
              </>
            )}
            <Row label="입금자명" value={order.depositorName} highlight />
            <Row label="입금 금액" value={`${order.amountKrw.toLocaleString()}원`} highlight />
            <p className="text-xs text-text-dim pt-2">
              입금자명과 금액이 정확히 일치해야 자동으로 확인돼요. 보통 몇 분 안에 자동으로 서버가
              생성됩니다.
            </p>
            <div className="flex items-center gap-2 text-sm text-text-dim pt-2">
              <span className="animate-pulse">●</span> 입금 확인 대기 중...
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold">서버 만들기</h1>

      <form onSubmit={submitOrder} className="mt-6 space-y-5">
        <div>
          <label className="text-sm text-text-dim">서버 이름</label>
          <input
            required
            maxLength={24}
            className="input w-full mt-1"
            placeholder="예: 친구들 SMP"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm text-text-dim">플랜</label>
          <div className="mt-2 grid gap-2">
            {products.map((p) => (
              <label
                key={p.id}
                className={`card p-4 flex items-center justify-between cursor-pointer ${
                  productId === p.id ? "border-accent" : ""
                }`}
              >
                <div>
                  <input
                    type="radio"
                    name="product"
                    className="mr-2"
                    checked={productId === p.id}
                    onChange={() => setProductId(p.id)}
                  />
                  <span className="font-medium">{p.name}</span>
                  <span className="text-text-dim text-sm ml-2">
                    RAM {(p.ramMb / 1024).toFixed(0)}GB · 디스크 {(p.diskMb / 1024).toFixed(0)}GB
                  </span>
                </div>
                <span className="font-semibold">{p.priceMonthlyKrw.toLocaleString()}원/월</span>
              </label>
            ))}
          </div>
        </div>

        {selectedProduct && (
          <div>
            <label className="text-sm text-text-dim">서버 종류</label>
            <select
              className="input w-full mt-1"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const t = selectedProduct.allowedTemplates.find((x) => x.id === e.target.value);
                setVersion(t?.minecraftVersions[0] ?? "");
              }}
            >
              {selectedProduct.allowedTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
            </select>
          </div>
        )}

        {selectedTemplate && (
          <div>
            <label className="text-sm text-text-dim">마인크래프트 버전</label>
            <select className="input w-full mt-1" value={version} onChange={(e) => setVersion(e.target.value)}>
              {selectedTemplate.minecraftVersions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-sm text-text-dim">쿠폰 코드 (선택)</label>
          <input
            className="input w-full mt-1"
            placeholder="있다면 입력하세요"
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          />
        </div>

        {error && <p className="text-sm text-red">{error}</p>}

        <button type="submit" disabled={loading || !productId} className="btn-primary w-full py-3">
          {loading ? "처리 중..." : "결제하고 서버 만들기"}
        </button>
      </form>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-dim">{label}</span>
      <span className={highlight ? "font-bold text-accent" : "font-medium"}>{value}</span>
    </div>
  );
}
