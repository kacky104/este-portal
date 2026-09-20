'use client';

import { useState } from 'react';
import { getCrmBookingConsents } from '@/app/actions/crm';
import type { CrmConsent } from '@/app/lib/crm/types';

// フクエスCRM：同意書の表示と印刷（第560便・第573便・第574便で別ファイルに）。
// ★ スケジュールの予約の詳細・顧客台帳の予約の履歴・予約一覧で使う（過去の予約のサインもここから見られる）。

// ── 同意書の印刷（第573便）：紙の同意書と同じ形（文面・☑・サイン・日時）で1枚に出す ──────────────
export function printConsent(
  c: CrmConsent,
  info: { bookingLabel: string; therapistName: string; customerName: string; fmt: string },
) {
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch] as string));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>同意書 ${esc(info.fmt)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: sans-serif; color: #111; font-size: 12px; line-height: 1.7; }
  h1 { font-size: 18px; margin: 0 0 12px; }
  .body { white-space: pre-wrap; border: 1px solid #999; padding: 10px; }
  .agree { margin: 14px 0 6px; font-size: 14px; font-weight: bold; }
  .sig { border: 1px solid #999; height: 140px; display: flex; align-items: center; justify-content: center; }
  .sig img { max-height: 130px; max-width: 100%; }
  table { border-collapse: collapse; margin-top: 12px; width: 100%; }
  th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; font-size: 12px; }
  th { background: #f2f2f2; width: 90px; }
  .note { margin-top: 8px; color: #666; font-size: 10px; }
</style></head><body>
<h1>${esc(c.title || '同意書')}</h1>
<div class="body">${esc(c.body)}</div>
<p class="agree">☑ 上記の内容をすべて了承します</p>
<p style="margin:0 0 4px">サイン</p>
<div class="sig"><img src="${c.signaturePng}" alt="サイン"></div>
<table>
  <tr><th>了承日時</th><td>${esc(info.fmt)}</td></tr>
  <tr><th>ご予約</th><td>${esc(info.bookingLabel)}</td></tr>
  <tr><th>お名前</th><td>${esc(info.customerName || '')}</td></tr>
  <tr><th>担当</th><td>${esc(info.therapistName || '')}</td></tr>
  <tr><th>部屋</th><td>${esc(c.room || '')}</td></tr>
</table>
<p class="note">フクエスCRM の来店時の同意書（スマホで電子的に了承・サイン）を印刷したものです。${c.superseded ? '※ この後にサインし直しがあったため、有効な同意書ではありません。' : ''}</p>
<script>window.onload=function(){window.print()}<\/script>
</body></html>`);
  w.document.close();
}

// ── 同意書（第560便）：予約の詳細で了承の時刻とサインを見る ──────────────
export function ConsentView({
  salonId, bookingId, consentAt, bookingLabel, therapistName, customerName,
}: {
  salonId: number; bookingId: string; consentAt: string | null;
  bookingLabel: string; therapistName: string; customerName: string;
}) {
  const [list, setList] = useState<CrmConsent[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');
  const fmt = (iso: string) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  if (!consentAt) return <span className="text-slate-400">まだ</span>;
  const load = async () => {
    setOpen(true);
    if (list) return;
    const r = await getCrmBookingConsents(salonId, bookingId);
    if (!r.ok) { setErr(r.error); return; }
    setList(r.consents);
  };
  return (
    <div>
      <span className="bg-violet-600 px-1.5 py-0.5 text-[12px] font-bold text-white">✓ 了承済</span>
      <span className="ml-2 text-[12px] text-slate-600">{fmt(consentAt)}</span>
      {!open ? (
        <button type="button" onClick={load} className="ml-2 text-[12px] font-bold text-indigo-600 underline">サインを見る</button>
      ) : (
        <div className="mt-2 space-y-2">
          {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
          {!list && !err && <p className="text-[12px] text-slate-400">読み込み中…</p>}
          {list?.map((c) => (
            <div key={c.id} className={`border p-2 ${c.superseded ? 'border-slate-200 opacity-60' : 'border-violet-300'}`}>
              <p className="text-[11px] font-bold text-slate-500">
                {fmt(c.createdAt)}{c.room ? `・${c.room}` : ''}{c.superseded ? '（サインし直す前のもの）' : ''}
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.signaturePng} alt="サイン" className="mt-1 max-h-[120px] w-full border border-slate-200 bg-white object-contain" />
              <button
                type="button"
                onClick={() => printConsent(c, { bookingLabel, therapistName, customerName, fmt: fmt(c.createdAt) })}
                className="mt-1 border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600"
              >
                🖨 印刷する
              </button>
              <details className="mt-1">
                <summary className="cursor-pointer text-[11px] font-bold text-slate-500">了承した文面</summary>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">{c.title ? `${c.title}\n\n` : ''}{c.body}</p>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

