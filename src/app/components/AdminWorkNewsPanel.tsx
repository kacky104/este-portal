'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminListWorkNews,
  adminSaveWorkNews,
  adminDeleteWorkNews,
  type AdminWorkNewsRow,
} from '@/app/actions/jobs';
import { WORK_NEWS_MAX } from '@/app/lib/jobs';

// 運営が店舗の「新着情報（フクエスワーク）」を代理で書く小さなパネル（第209便・2026-09-07・カッキーさん）。
// ★ /admin・/moderation の「求人を編集」モーダルの中に置く。
// ★ 書く先は mypage の JobNewsManager と同じ work_news なので、店舗様の mypage の一覧にもそのまま出る。
// ★ 画像と fukuX 同時投稿はこの口では扱わない（店舗様の X アカウントで運営が投稿する形は作らない）。
// ★ 求人の「保存する」とは独立して、この中の「投稿する／保存」で即時に書く（求人本体の保存を待たない）。

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export default function AdminWorkNewsPanel({ salonId, onToast }: { salonId: number; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<AdminWorkNewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    const r = await adminListWorkNews(salonId);
    if (!r.ok) { setError(r.error); setRows([]); }
    else { setError(''); setRows(r.rows); }
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const resetForm = () => { setTitle(''); setContent(''); setIsPublished(true); setEditId(null); };

  const startEdit = (r: AdminWorkNewsRow) => {
    setEditId(r.id); setTitle(r.title); setContent(r.content ?? ''); setIsPublished(r.is_published);
  };

  const save = async () => {
    if (!title.trim()) { onToast('タイトルは必須です'); return; }
    setBusy(true);
    const r = await adminSaveWorkNews({ salonId, id: editId, title, content, is_published: isPublished });
    setBusy(false);
    if (!r.ok) { onToast(`新着情報を保存できませんでした: ${r.error}`); return; }
    onToast(editId ? '新着情報を保存しました' : (r.pruned > 0 ? `新着情報を投稿しました（古い${r.pruned}件を自動削除）` : '新着情報を投稿しました'));
    resetForm();
    await load();
  };

  const remove = async (r: AdminWorkNewsRow) => {
    if (!window.confirm(`「${r.title}」を削除しますか？（店舗様の画面からも消えます）`)) return;
    setBusy(true);
    const res = await adminDeleteWorkNews({ salonId, id: r.id });
    setBusy(false);
    if (!res.ok) { onToast(`削除できませんでした: ${res.error}`); return; }
    if (editId === r.id) resetForm();
    onToast('削除しました');
    await load();
  };

  const shown = showAll ? rows : rows.slice(0, 5);

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 space-y-3">
      <div>
        <p className="text-xs font-black" style={{ color: '#059669' }}>新着情報（フクエスワーク）を代理で書く</p>
        <p className="text-[10.5px] text-slate-500 mt-0.5 leading-relaxed">
          ここで投稿したものは、店舗様のマイページ「求人」タブの新着情報にそのまま出ます（最新{WORK_NEWS_MAX}件まで・古いものから自動削除）。
          画像は付けられません（店舗様のマイページから）。
        </p>
      </div>

      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="タイトル（必須）例: 体験入店キャンペーン実施中"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="本文（任意）"
          rows={3}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
            公開する
          </label>
          <div className="flex gap-2">
            {editId && (
              <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded-xl border border-slate-200 text-slate-500 text-[11px] font-bold hover:bg-white">
                編集をやめる
              </button>
            )}
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="px-4 py-1.5 rounded-xl text-white text-[11px] font-bold shadow-sm disabled:opacity-50 hover:opacity-90"
              style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
            >
              {busy ? '送信中…' : editId ? 'この内容で保存' : '投稿する'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400">読み込み中…</p>
      ) : error ? (
        <p className="text-[11px] text-rose-600">新着情報を読み込めませんでした（{error}）</p>
      ) : rows.length === 0 ? (
        <p className="text-[11px] text-slate-400">まだ新着情報はありません。</p>
      ) : (
        <ul className="divide-y divide-emerald-100 border-t border-emerald-100">
          {shown.map((r) => (
            <li key={r.id} className={`py-2 flex items-start gap-2 ${editId === r.id ? 'bg-white/70' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-slate-700 truncate">{r.title}</p>
                <p className="text-[10.5px] text-slate-400">
                  {fmt(r.published_at)}
                  {!r.is_published && <span className="ml-1.5 px-1 border border-slate-300 text-slate-500">非公開</span>}
                  {r.image_url && <span className="ml-1.5 text-slate-400">画像あり</span>}
                </p>
              </div>
              <button type="button" onClick={() => startEdit(r)} disabled={busy} className="text-[11px] font-bold text-emerald-700 hover:underline disabled:opacity-50">編集</button>
              <button type="button" onClick={() => remove(r)} disabled={busy} className="text-[11px] font-bold text-rose-500 hover:underline disabled:opacity-50">削除</button>
            </li>
          ))}
        </ul>
      )}
      {rows.length > shown.length && (
        <button type="button" onClick={() => setShowAll(true)} className="text-[11px] font-bold text-slate-500 underline">
          残り{rows.length - shown.length}件を見る
        </button>
      )}
    </div>
  );
}
