'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listOpsNoticesAdmin, saveOpsNotice, deleteOpsNotice, type OpsNoticeAdminRow } from '@/app/actions/opsNotices';
import { OPS_NOTICE_BAND_DAYS, shortDate } from '@/lib/opsNotices';

// 管理画面「運営からのお知らせ」（第862便・2026-09-26）。
// ★ 書いて「公開」にすると、店舗マイページの上の帯（新しい1件・公開から14日）と一覧 /mypage/notices に出る。
// ★ 「下書き」のあいだは店舗に見えない。★ 公開の時刻は初めて公開したときだけ入る（直しても帯に出し直さない）。

type Form = { id?: number; notice_date: string; title: string; body: string; is_published: boolean };

function todayJst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
const EMPTY = (): Form => ({ notice_date: todayJst(), title: '', body: '', is_published: false });

const input = 'w-full border border-slate-300 px-3 py-2 text-[15px] bg-white';

export function OpsNoticesAdmin() {
  const [rows, setRows] = useState<OpsNoticeAdminRow[]>([]);
  const [form, setForm] = useState<Form>(EMPTY());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [askDelete, setAskDelete] = useState<number | null>(null);

  const load = useCallback(async () => {
    const r = await listOpsNoticesAdmin();
    if (r.ok) setRows(r.rows); else setMsg(r.error);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async (publish: boolean) => {
    setBusy(true); setMsg('');
    const r = await saveOpsNotice({ ...form, is_published: publish });
    setBusy(false);
    if (!r.ok) { setMsg(r.error); return; }
    setMsg(publish ? '公開しました。店舗マイページに出ます' : '下書きで保存しました（店舗には見えません）');
    setForm(EMPTY());
    void load();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">運営からのお知らせ</h1>
          <Link href="/admin" className="text-sm text-pink-600 underline">管理者ダッシュボードへ</Link>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed">
          公開すると、店舗マイページの上の帯（いちばん新しく公開した1件・公開から{OPS_NOTICE_BAND_DAYS}日）と、お知らせの一覧に出ます。
          店舗のオーナーだけに見えます（お客様には見えません）。
        </p>

        {/* 書く */}
        <section className="bg-white border border-slate-200 p-4 space-y-3">
          <h2 className="font-bold text-slate-800">{form.id ? 'お知らせを直す' : '新しいお知らせ'}</h2>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1">日付（帯・一覧に出る日付）</span>
            <input type="date" className={input} value={form.notice_date} onChange={(e) => setForm({ ...form, notice_date: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1">タイトル（60文字まで・帯に1行で出ます）</span>
            <input className={input} maxLength={60} placeholder="例: ネット予約のSMS通知を開始します" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <span className="block text-xs text-slate-400 mt-1 text-right">{form.title.length}/60</span>
          </label>
          <label className="block">
            <span className="block text-sm font-bold text-slate-600 mb-1">くわしい説明（押すと開きます・改行そのまま・URL は押せるリンクになります）</span>
            <textarea className={`${input} min-h-[160px]`} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => save(true)} className="px-4 py-2 bg-pink-600 text-white font-bold disabled:opacity-50">公開する</button>
            <button type="button" disabled={busy} onClick={() => save(false)} className="px-4 py-2 border border-slate-300 bg-white font-bold text-slate-700 disabled:opacity-50">下書きで保存</button>
            {form.id && (
              <button type="button" disabled={busy} onClick={() => setForm(EMPTY())} className="px-4 py-2 text-slate-500 underline">やめる（新しく書く）</button>
            )}
          </div>
          {msg && <p className="text-sm text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2">{msg}</p>}
        </section>

        {/* 一覧 */}
        <section className="bg-white border border-slate-200">
          <h2 className="font-bold text-slate-800 px-4 pt-4 pb-2">これまでのお知らせ（{rows.length}）</h2>
          {rows.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-slate-500">まだありません。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-sm font-bold text-slate-500 tabular-nums w-12">{shortDate(r.notice_date)}</span>
                  <span className="flex-1 min-w-0 text-[15px] text-slate-800 truncate">{r.title}</span>
                  <span className={`text-xs border px-2 py-0.5 ${r.is_published ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {r.is_published ? '公開中' : '下書き'}
                  </span>
                  <button type="button" className="text-sm text-pink-600 underline" onClick={() => { setForm({ id: r.id, notice_date: r.notice_date, title: r.title, body: r.body, is_published: r.is_published }); setMsg(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    直す
                  </button>
                  {r.is_published && (
                    <button type="button" disabled={busy} className="text-sm text-slate-500 underline" onClick={async () => {
                      setBusy(true);
                      const x = await saveOpsNotice({ id: r.id, notice_date: r.notice_date, title: r.title, body: r.body, is_published: false });
                      setBusy(false);
                      setMsg(x.ok ? '下書きに戻しました（店舗には見えなくなりました）' : x.error);
                      void load();
                    }}>
                      下書きに戻す
                    </button>
                  )}
                  {askDelete === r.id ? (
                    <span className="flex items-center gap-2">
                      <button type="button" disabled={busy} className="text-sm font-bold text-rose-600 underline" onClick={async () => {
                        setBusy(true);
                        const x = await deleteOpsNotice(r.id);
                        setBusy(false); setAskDelete(null);
                        setMsg(x.ok ? '消しました' : x.error);
                        void load();
                      }}>本当に消す</button>
                      <button type="button" className="text-sm text-slate-500 underline" onClick={() => setAskDelete(null)}>やめる</button>
                    </span>
                  ) : (
                    <button type="button" className="text-sm text-slate-400 underline" onClick={() => setAskDelete(r.id)}>消す</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
