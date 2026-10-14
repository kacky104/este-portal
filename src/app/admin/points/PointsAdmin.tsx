'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getPointStats, listFlaggedPoints, listPointSalons, revokeVisitPoint, setPointsMember,
  type PointFlagRow, type PointSalonRow, type PointStatRow,
} from '@/app/actions/pointsAdmin';
import { POINT_VISIT, POINT_VISIT_NOTE } from '@/lib/points';

// 管理画面「フクエスポイント」（第1444便・2026-10-14・カッキーさん）。
//   ① ポイント加盟店の ON／OFF（CRM 契約中の店だけ ON にできる・加盟店の一覧はサイトに公開される＝お店の了承を取ってから）
//   ② 月ごと・店ごとの集計（付けた／使われた＝実際の負担額／期限切れ／取り消し・受け取り率）
//   ③ 予約が取り消された・消された予約に付いた来店ポイント（手で取り消せる）

function thisMonthJST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
}
function shiftMonth(m: string, n: number): string {
  const [y, mm] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mm - 1 + n, 1)).toISOString().slice(0, 7);
}
function dt(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
const yen = (n: number) => `${n.toLocaleString()}`;

export function PointsAdmin() {
  const [salons, setSalons] = useState<PointSalonRow[] | null>(null);
  const [month, setMonth] = useState(thisMonthJST());
  const [stats, setStats] = useState<{ rows: PointStatRow[]; total: PointStatRow } | null>(null);
  const [flags, setFlags] = useState<PointFlagRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadSalons = useCallback(async () => {
    const r = await listPointSalons();
    if (!r.ok) { setErr(r.error); return; }
    setSalons(r.rows);
  }, []);
  const loadFlags = useCallback(async () => {
    const r = await listFlaggedPoints();
    if (r.ok) setFlags(r.rows); else setErr(r.error);
  }, []);
  useEffect(() => { void loadSalons(); void loadFlags(); }, [loadSalons, loadFlags]);
  useEffect(() => {
    setStats(null);
    getPointStats(month).then((r) => { if (r.ok) setStats({ rows: r.rows, total: r.total }); else setErr(r.error); });
  }, [month]);

  const toggle = async (s: PointSalonRow) => {
    const on = !s.member;
    if (on && !window.confirm(`「${s.name}」をフクエスポイント加盟店にします。\n\n加盟店の一覧（fukues.com/points）とお店ページに「加盟店」と出ます。お店の了承は取れていますか？`)) return;
    if (!on && !window.confirm(`「${s.name}」を加盟店から外します。これからの来店ではポイントが付かなくなります。よろしいですか？`)) return;
    setBusyId(s.id); setErr('');
    const r = await setPointsMember(s.id, on);
    setBusyId(null);
    if (!r.ok) { setErr(r.error); return; }
    await loadSalons();
  };

  const revoke = async (f: PointFlagRow) => {
    if (!window.confirm(f.kind === 'use'
      ? `このポイントの利用（${-f.delta}pt・${f.salonName}）を取り消して、会員にポイントを戻します。請求書でも差し引かなくなります。よろしいですか？`
      : `この来店ポイント（${f.delta}pt・${f.salonName}）を取り消します。よろしいですか？`)) return;
    const r = await revokeVisitPoint(f.pointId);
    if (!r.ok) { setErr(r.error); return; }
    await loadFlags();
  };

  const th = 'px-2 py-1.5 text-left text-[11px] font-bold text-slate-500';
  const td = 'px-2 py-1.5 text-[13px]';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 text-slate-800">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin" className="text-xs text-slate-400 hover:text-pink-600">← 管理画面</Link>
        <h1 className="text-lg font-black">フクエスポイント</h1>
        <span className="text-xs text-slate-500">来店1回 {POINT_VISIT}pt{POINT_VISIT_NOTE ? `（${POINT_VISIT_NOTE}）` : ''}・1日1回まで</span>
      </div>
      {err && <p className="mb-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{err}</p>}

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-black">① ポイント加盟店</h2>
        <p className="mb-3 text-xs text-slate-500">フクエスCRM 契約中のお店だけ並びます。ON にすると、お部屋の QR の同意書から来店ポイントが付き、加盟店の一覧とお店ページに出ます（お店の了承を取ってから）。</p>
        {!salons ? <p className="text-xs text-slate-400">読み込み中…</p> : salons.length === 0 ? <p className="text-xs text-slate-400">CRM 契約中のお店がありません</p> : (
          <ul className="divide-y divide-slate-100">
            {salons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-8 text-xs text-slate-400">{s.id}</span>
                <span className="min-w-0 flex-1 text-sm font-bold">{s.name}{s.hidden && <span className="ml-1 text-[11px] text-slate-400">（非表示）</span>}{!s.crmActive && <span className="ml-1 text-[11px] text-rose-500">（CRM 契約なし）</span>}</span>
                <button type="button" disabled={busyId === s.id} onClick={() => toggle(s)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold disabled:opacity-50 ${s.member ? 'bg-pink-600 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}>
                  {s.member ? '加盟店（ON）' : 'OFF'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-black">② 月ごとの集計</h2>
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="border border-slate-300 px-2 py-0.5 text-xs">◀</button>
          <span className="text-sm font-bold">{month.replace('-', '年')}月</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="border border-slate-300 px-2 py-0.5 text-xs">▶</button>
        </div>
        <p className="mb-2 text-xs text-slate-500">「使われた」がフクエスの実際の負担額（円・税込）です。受け取り率＝同意書の送信のうち、会員がポイントを受け取った割合。</p>
        {!stats ? <p className="text-xs text-slate-400">読み込み中…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr className="border-b border-slate-200">
                <th className={th}>お店</th><th className={th}>付けた（pt・件）</th><th className={th}>使われた（円・件）</th>
                <th className={th}>期限切れ</th><th className={th}>取り消し</th><th className={th}>受け取り率</th>
              </tr></thead>
              <tbody>
                {[...stats.rows, stats.total].map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${r === stats.total ? 'bg-slate-50 font-bold' : ''}`}>
                    <td className={td}>{r === stats.total ? '合計' : r.salonId == null ? '会員登録・口コミ・期限切れ（お店なし）' : r.salonName}</td>
                    <td className={td}>{yen(r.earned)}pt・{r.earnedCount}件</td>
                    <td className={td}>¥{yen(r.used)}・{r.usedCount}件</td>
                    <td className={td}>{r.expired ? `${yen(r.expired)}pt` : '—'}</td>
                    <td className={td}>{r.revoked ? `${yen(r.revoked)}pt` : '—'}</td>
                    <td className={td}>{r.claimsIssued > 0 ? `${Math.round((r.claimsTaken / r.claimsIssued) * 100)}%（${r.claimsTaken}/${r.claimsIssued}）` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-black">③ 予約が取り消された・消された来店ポイント・ポイントの利用（直近90日）</h2>
        <p className="mb-2 text-xs text-slate-500">自動では戻しません。施術せずに帰った等で取り消すときだけ押してください。</p>
        {!flags ? <p className="text-xs text-slate-400">読み込み中…</p> : flags.length === 0 ? <p className="text-xs text-slate-400">ありません</p> : (
          <ul className="divide-y divide-slate-100">
            {flags.map((f) => (
              <li key={f.pointId} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <span className="w-28 text-xs text-slate-400">{dt(f.createdAt)}</span>
                <span className="flex-1">{f.salonName}・{f.kind === 'use' ? `利用 ${-f.delta}pt（${-f.delta}円引き）` : `来店 ${f.delta}pt`}・予約が{f.reason === 'cancelled' ? '取り消し' : '削除'}</span>
                {f.revoked ? <span className="text-xs font-bold text-slate-400">取り消し済み</span> : (
                  <button type="button" onClick={() => revoke(f)} className="border border-rose-300 bg-white px-3 py-1 text-xs font-bold text-rose-600">取り消す</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
