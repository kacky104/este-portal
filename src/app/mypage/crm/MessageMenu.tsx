'use client';

// フクエスCRM 予約の「連絡文▼」（第1947便・2026-11-12）。
// ★ 押すと、設定の「連絡文のひな形」（使う分）が出る → 選ぶと予約の中身を入れた文章をコピー（風俗CTIv2 の「メッセージ▼」）。
// ★ コピーはクリックの中で同期的にしたい（Safari はクリックから時間が空くとコピーを断る）→ ひな形と店名・前回は【開いたときに先に読む】。
// ★ ひな形が1つも無いお店には、ボタンごと出さない（お店の判断で使う機能）。
// ★ 組み立てた文章はどこにも保存しない。

import { useEffect, useRef, useState } from 'react';
import { getCrmMessageExtras, listCrmMessageTemplates, type CrmMessageTemplate } from '@/app/actions/crmMessage';
import type { CrmScheduleBooking, CrmScheduleData } from '@/app/lib/crm/types';
import { renderCrmMessage } from '@/lib/crmMessage';
import { safeAction } from './CrmBase';
import { copyText, crmMessageContextOf, type CrmMessageExtras } from './messageContext';

export function MessageMenu({ salonId, booking, data }: { salonId: number; booking: CrmScheduleBooking; data: CrmScheduleData | null }) {
  const [templates, setTemplates] = useState<CrmMessageTemplate[] | null>(null);
  const [extras, setExtras] = useState<CrmMessageExtras | null>(null);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<{ name: string; text: string } | null>(null);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [t, x] = await Promise.all([
        safeAction(listCrmMessageTemplates(salonId, { activeOnly: true })),
        safeAction(getCrmMessageExtras(salonId, booking.id)),
      ]);
      if (!alive) return;
      setTemplates(t.ok ? t.templates : []);
      if (x.ok) setExtras({ salonName: x.salonName, salonTel: x.salonTel, prev: x.prev });
    })();
    return () => { alive = false; };
  }, [salonId, booking.id]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!data || !templates || templates.length === 0) return null;

  const therapist = booking.therapistId == null ? null : data.therapists.find((t) => t.id === booking.therapistId);
  const pickOne = async (t: CrmMessageTemplate) => {
    setOpen(false); setErr('');
    const text = renderCrmMessage(t.body, crmMessageContextOf(booking, data, extras), t.hideEmptyLines);
    const ok = await copyText(text);
    if (!ok) { setErr('コピーできませんでした。下の文章を選んでコピーしてください'); }
    setDone({ name: t.name, text });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-[#3f51b5] px-3 py-1.5 text-[13px] font-bold text-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        連絡文 ▼
      </button>
      {open && (
        <div role="menu" className="absolute bottom-full left-0 z-10 mb-1 min-w-[260px] border border-slate-200 bg-white py-1 shadow-xl">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => void pickOne(t)}
              className="block w-full px-3 py-2 text-left text-[13px] font-bold text-[#3f51b5] hover:bg-indigo-50"
            >
              コピー{therapist ? `（女子：${therapist.name}）` : ''} ▶ {t.name}
            </button>
          ))}
        </div>
      )}
      {done && (
        <div className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[520px] border border-emerald-300 bg-white p-3 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="mr-auto text-[13px] font-bold text-emerald-700">{err ? '' : `「${done.name}」をコピーしました`}</span>
            {/* LINE の送る画面を開く（スマホだけ。PC は LINE の送る画面が開けないので、コピーした文を PC の LINE に貼る・第1791便と同じ） */}
            <a
              href={`https://line.me/R/share?text=${encodeURIComponent(done.text)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#06c755] px-2 py-1 text-[12px] font-bold text-white md:hidden"
            >
              LINEで開く
            </a>
            <button type="button" onClick={() => { setDone(null); setErr(''); }} className="px-1 text-[18px] font-bold text-slate-500" aria-label="閉じる">×</button>
          </div>
          {err && <p className="mt-1 text-[12px] font-bold text-rose-600">{err}</p>}
          <textarea readOnly value={done.text} rows={err ? 10 : 4} className="mt-2 w-full resize-y border border-slate-200 bg-slate-50 px-2 py-1 text-[12px] leading-relaxed text-slate-700" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
    </div>
  );
}
