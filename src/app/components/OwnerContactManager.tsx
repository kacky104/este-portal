'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();

// /admin「オーナー連絡」: 運営⇔オーナー連絡の管理UI（本体タブ内のアコーディオン）。
//  - 上段: オーナー向けお知らせ配信（全店舗一斉 or 個別店舗）＋配信済み一覧（既読数・削除）
//  - 下段: オーナーからのお問い合わせ一覧（未対応⇔対応済みトグル）
// 読み書きはすべて管理者ログインの RLS（owner_notices_admin 等・ADMIN_UUID）経由＝クライアント直接で完結。
// オーナー側の受信・送信は /mypage「運営から」タブ（SupportTab.tsx）。

type SalonOption = { id: number; name: string };

type OwnerNotice = {
  id: string;
  salon_id: number | null;
  title: string;
  body: string;
  created_at: string;
};

type OwnerInquiry = {
  id: string;
  salon_id: number;
  subject: string;
  body: string;
  status: 'open' | 'done';
  created_at: string;
};

function formatDateTimeJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

export default function OwnerContactManager({
  allSalons,
  onToast,
}: {
  allSalons: SalonOption[];
  onToast: (msg: string) => void;
}) {
  const [notices, setNotices] = useState<OwnerNotice[]>([]);
  // notice_id → 既読店舗数（一斉配信の到達確認用）。
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [inquiries, setInquiries] = useState<OwnerInquiry[]>([]);
  const [loading, setLoading] = useState(true);

  // 配信フォーム。target は 'all' か salon_id 文字列。
  const [target, setTarget] = useState<string>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyInquiryId, setBusyInquiryId] = useState<string | null>(null);

  const salonName = (id: number | null) =>
    id == null ? null : (allSalons.find(s => s.id === id)?.name ?? `店舗ID:${id}`);

  const reload = async () => {
    const [{ data: noticeData }, { data: readData }, { data: inquiryData }] = await Promise.all([
      supabase.from('owner_notices').select('id, salon_id, title, body, created_at').order('created_at', { ascending: false }),
      supabase.from('owner_notice_reads').select('notice_id'),
      supabase.from('owner_inquiries').select('id, salon_id, subject, body, status, created_at').order('created_at', { ascending: false }),
    ]);
    setNotices((noticeData ?? []) as OwnerNotice[]);
    const counts: Record<string, number> = {};
    (readData ?? []).forEach(r => {
      const key = String(r.notice_id);
      counts[key] = (counts[key] ?? 0) + 1;
    });
    setReadCounts(counts);
    setInquiries((inquiryData ?? []) as OwnerInquiry[]);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return;
    setSending(true);
    try {
      const { error } = await supabase.from('owner_notices').insert({
        salon_id: target === 'all' ? null : Number(target),
        title: t,
        body: b,
      });
      if (error) {
        onToast(`配信に失敗しました: ${error.message}`);
        return;
      }
      onToast(target === 'all' ? '全店舗へお知らせを配信しました' : 'お知らせを配信しました');
      setTitle('');
      setBody('');
      setTarget('all');
      await reload();
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このお知らせを削除しますか？（各オーナーのマイページからも消えます）')) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('owner_notices').delete().eq('id', id);
      if (error) {
        onToast(`削除に失敗しました: ${error.message}`);
        return;
      }
      onToast('お知らせを削除しました');
      setNotices(prev => prev.filter(n => n.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const toggleInquiryStatus = async (q: OwnerInquiry) => {
    const next = q.status === 'open' ? 'done' : 'open';
    setBusyInquiryId(q.id);
    try {
      const { error } = await supabase.from('owner_inquiries').update({ status: next }).eq('id', q.id);
      if (error) {
        onToast(`更新に失敗しました: ${error.message}`);
        return;
      }
      setInquiries(prev => prev.map(x => (x.id === q.id ? { ...x, status: next } : x)));
    } finally {
      setBusyInquiryId(null);
    }
  };

  const openCount = inquiries.filter(q => q.status === 'open').length;
  // 未対応を先頭に（同状態内は新着順のまま＝取得順を保持する安定ソート）。
  const sortedInquiries = [...inquiries].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));

  const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';
  const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';

  if (loading) return <p className="text-xs text-slate-400">読み込み中…</p>;

  return (
    <div className="space-y-6">
      {/* ── お知らせ配信 ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-700">オーナー向けお知らせ配信</h3>
        <p className="text-[11px] text-slate-400">
          各オーナーのマイページ「運営から」タブに表示されます（未読ぶんはタブに赤バッジ）。
        </p>
        <form onSubmit={handleSend} className="space-y-3">
          <div>
            <label className={labelClass}>宛先</label>
            <select value={target} onChange={e => setTarget(e.target.value)} className={inputClass}>
              <option value="all">全店舗（一斉）</option>
              {allSalons.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={100} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>本文 <span className="text-rose-400">*</span></label>
            <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={4000} required rows={4} className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={sending || title.trim() === '' || body.trim() === ''}
            className="px-6 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
          >
            {sending ? '配信中…' : '配信する'}
          </button>
        </form>

        {/* 配信済み一覧 */}
        {notices.length > 0 && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <h4 className="text-xs font-bold text-slate-500">配信済み（{notices.length}件）</h4>
            {notices.map(n => (
              <div key={n.id} className="rounded-xl border border-slate-100 p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[11px] text-slate-400">{formatDateTimeJST(n.created_at)}</span>
                    {n.salon_id == null ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">全店舗</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">{salonName(n.salon_id)}</span>
                    )}
                    <span className="text-[10px] text-slate-400">既読 {readCounts[n.id] ?? 0}店舗</span>
                  </div>
                  <p className="text-xs font-bold text-slate-700">{n.title}</p>
                  <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-0.5 line-clamp-2">{n.body}</p>
                </div>
                <button
                  onClick={() => handleDelete(n.id)}
                  disabled={deletingId === n.id}
                  className="flex-shrink-0 text-[11px] font-bold text-rose-400 hover:text-rose-500 disabled:opacity-40"
                >
                  {deletingId === n.id ? '削除中…' : '削除'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── オーナーからのお問い合わせ ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-700 flex items-center gap-2">
          オーナーからのお問い合わせ
          {openCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-black leading-none">
              {openCount}
            </span>
          )}
        </h3>
        {inquiries.length === 0 ? (
          <p className="text-xs text-slate-400">お問い合わせはまだありません。</p>
        ) : (
          <div className="space-y-2">
            {sortedInquiries.map(q => (
              <div key={q.id} className={`rounded-xl border p-3 ${q.status === 'open' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[11px] text-slate-400">{formatDateTimeJST(q.created_at)}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                    {salonName(q.salon_id)}
                  </span>
                  {q.status === 'open' ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">未対応</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                  )}
                  <button
                    onClick={() => toggleInquiryStatus(q)}
                    disabled={busyInquiryId === q.id}
                    className="ml-auto flex-shrink-0 text-[11px] font-bold text-slate-400 hover:text-pink-600 disabled:opacity-40 transition-colors"
                  >
                    {busyInquiryId === q.id ? '更新中…' : q.status === 'open' ? '対応済みにする' : '未対応に戻す'}
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-700">{q.subject}</p>
                <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-0.5">{q.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
