'use client';

import { useState } from 'react';
import { listCrmOperatorSalons, type CrmOperatorSalon } from '@/app/actions/crm';
import { crmLeaveOk } from './CrmBase';

// フクエスCRM: 運営だけに出る帯（第1438便・2026-10-13・カッキーさん。コネックエフの第1399便と同じ見た目）。
//
// ★ 運営アカウントでログインしているときだけ CrmShell が置く（店舗様には出ない）。
// ★ 店は URL の ?salon=店舗ID（cookie は使わない）。タブごとに店がはっきりしているので、
//   別のタブで店を変えても、このタブの保存先は変わらない。
// ★ 店を変える・やめるときは画面をまるごと読み直す（前の店の内容を画面に残したまま次の店を操作しないため）。
// ★ 保存できるかの判定はサーバー（lib/crm/auth.ts の assertCrmOwner）。ここは店を選ぶだけ。
//   規約の同意・グループの署名／承認は、運営からは今までどおりできない（店舗様ご本人のもの）。

export function CrmOperatorBar({ salonId, salonName }: { salonId: number | null; salonName: string }) {
  const acting = salonId != null;
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<CrmOperatorSalon[] | null>(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const go = (id: number | null) => {
    if (!crmLeaveOk()) return;
    const path = window.location.pathname;
    window.location.assign(id == null ? path : `${path}?salon=${id}`);
  };

  const onOpen = async () => {
    setOpen(true);
    setError('');
    if (list) return;
    setBusy(true);
    try {
      const res = await listCrmOperatorSalons();
      if (!res.ok) { setError(res.error); return; }
      setList(res.data);
      if (salonId != null) setPick(String(salonId));
    } catch {
      setError('読み込めませんでした。画面を更新してもう一度お試しください');
    } finally {
      setBusy(false);
    }
  };

  const btn = 'h-8 px-3 text-[13px] font-bold border disabled:opacity-40';

  return (
    <div className={acting ? 'bg-amber-300 text-slate-900' : 'bg-slate-800 text-white'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 md:px-4">
        {acting ? (
          <>
            <b className="text-[14px] leading-snug">運営として「{salonName || `店舗 ${salonId}`}」を操作中</b>
            <span className="text-[12.5px] leading-snug">保存は、この店舗様の内容として実行されます。</span>
          </>
        ) : (
          <span className="text-[13px] font-bold">運営メニュー</span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void onOpen()} disabled={busy}
            className={`${btn} ${acting ? 'border-slate-800 bg-white text-slate-900' : 'border-white/70 bg-transparent text-white'}`}>
            {acting ? '店舗を変える' : '店舗を選んで開く'}
          </button>
          {acting && (
            <button type="button" onClick={() => go(null)} className={`${btn} border-slate-800 bg-slate-800 text-white`}>
              やめる
            </button>
          )}
        </span>
      </div>
      {open && (
        <div className="px-3 pb-3 md:px-4">
          <div className="space-y-2 border border-slate-300 bg-white p-3 text-slate-900">
            <p className="text-[13px] leading-relaxed">
              開く店舗を選んでください。選ぶと、その店舗様のフクエスCRMをそのまま操作できます（設定・QR コード・予約の保存もできます）。
              いま開いている画面（スケジュール・設定など）のまま、店舗だけが切り替わります。
            </p>
            {list == null ? (
              <p className="text-[13px] text-slate-500">{busy ? '読み込み中…' : ''}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="店舗"
                  className="h-9 min-w-0 flex-1 basis-[240px] border border-slate-300 bg-white px-2 text-[14px]">
                  <option value="">店舗を選ぶ</option>
                  {list.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.id}：{s.name || '（店名なし）'}（{s.contract ? '契約あり' : '契約なし'}{s.hidden ? '・非表示' : ''}）
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => { const id = Number(pick); if (Number.isInteger(id) && id > 0) go(id); }}
                  disabled={pick === ''} className={`${btn} border-indigo-700 bg-indigo-700 text-white`}>
                  この店舗を開く
                </button>
                <button type="button" onClick={() => { setOpen(false); setError(''); }} className={`${btn} border-slate-300 bg-white text-slate-600`}>
                  閉じる
                </button>
              </div>
            )}
            {error && <p className="text-[13px] font-bold text-rose-700">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
