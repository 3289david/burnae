"use client";

import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";

interface Post {
  id: string;
  slug: string;
  titleKr: string;
  excerptKr: string | null;
  bodyKr: string;
  titleEn: string | null;
  excerptEn: string | null;
  bodyEn: string | null;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
}

const empty = { slug: "", titleKr: "", excerptKr: "", bodyKr: "", titleEn: "", excerptEn: "", bodyEn: "" };

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/blog");
    setPosts(await res.json());
  }
  useEffect(() => { load(); }, []);

  function startEdit(p: Post) {
    setEditingId(p.id);
    setForm({
      slug: p.slug,
      titleKr: p.titleKr,
      excerptKr: p.excerptKr ?? "",
      bodyKr: p.bodyKr,
      titleEn: p.titleEn ?? "",
      excerptEn: p.excerptEn ?? "",
      bodyEn: p.bodyEn ?? "",
    });
  }

  function startNew() {
    setEditingId("new");
    setForm(empty);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        slug: form.slug.trim(),
        titleKr: form.titleKr,
        excerptKr: form.excerptKr || null,
        bodyKr: form.bodyKr,
        titleEn: form.titleEn || null,
        excerptEn: form.excerptEn || null,
        bodyEn: form.bodyEn || null,
      };
      const res =
        editingId === "new"
          ? await fetch("/api/admin/blog", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, published: false }),
            })
          : await fetch(`/api/admin/blog/${editingId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublished(id: string, published: boolean) {
    await fetch(`/api/admin/blog/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("이 글을 삭제할까요?")) return;
    await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
    await load();
  }

  if (editingId) {
    return (
      <div>
        <h1 className="text-2xl font-bold">{editingId === "new" ? "새 글 작성" : "글 수정"}</h1>
        <form onSubmit={save} className="card-glow p-5 mt-4 space-y-3 max-w-2xl">
          <div>
            <label className="text-sm text-text-dim">슬러그 (URL, 예: korea-hosting-price-compare)</label>
            <input
              className="input w-full mt-1 font-mono text-sm"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              required
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-text-dim">제목 (한국어)</label>
              <input className="input w-full mt-1" value={form.titleKr} onChange={(e) => setForm({ ...form, titleKr: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm text-text-dim">제목 (영어, 선택)</label>
              <input className="input w-full mt-1" value={form.titleEn} onChange={(e) => setForm({ ...form, titleEn: e.target.value })} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-text-dim">요약 (한국어, 선택)</label>
              <input className="input w-full mt-1" value={form.excerptKr} onChange={(e) => setForm({ ...form, excerptKr: e.target.value })} />
            </div>
            <div>
              <label className="text-sm text-text-dim">요약 (영어, 선택)</label>
              <input className="input w-full mt-1" value={form.excerptEn} onChange={(e) => setForm({ ...form, excerptEn: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-sm text-text-dim">본문 (한국어, 마크다운)</label>
            <textarea
              className="input w-full mt-1 font-mono text-xs"
              rows={16}
              value={form.bodyKr}
              onChange={(e) => setForm({ ...form, bodyKr: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-sm text-text-dim">본문 (영어, 마크다운, 선택 — 비워두면 영어 페이지에 번역본이 없다는 안내만 보여요)</label>
            <textarea
              className="input w-full mt-1 font-mono text-xs"
              rows={10}
              value={form.bodyEn}
              onChange={(e) => setForm({ ...form, bodyEn: e.target.value })}
            />
          </div>
          {error && <p className="text-sm text-red">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary px-5 py-2.5">저장</button>
            <button type="button" onClick={() => setEditingId(null)} className="btn-secondary px-5 py-2.5">취소</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">블로그</h1>
        <button onClick={startNew} className="btn-primary px-4 py-2 text-sm">새 글 작성</button>
      </div>

      <div className="mt-6 space-y-2">
        {posts.map((p) => (
          <div key={p.id} className="card-glow p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="min-w-0">
              <p className="font-medium text-sm">
                {p.titleKr} {!p.titleEn && <span className="text-xs text-yellow ml-1">(영어 없음)</span>}
              </p>
              <p className="text-xs text-text-dim font-mono mt-0.5">/blog/{p.slug}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Toggle checked={p.published} onChange={(next) => togglePublished(p.id, next)} size="sm" />
              <button onClick={() => startEdit(p)} className="text-accent text-sm">수정</button>
              <button onClick={() => remove(p.id)} className="text-red text-sm">삭제</button>
            </div>
          </div>
        ))}
        {posts.length === 0 && <p className="text-sm text-text-dim">작성된 글이 없어요.</p>}
      </div>
    </div>
  );
}
