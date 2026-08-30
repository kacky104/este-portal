'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getMediaOverview,
  getMediaWorkPlan,
  startMediaWorkDryRun,
  startMediaWorkPush,
  type WorkPlanView,
} from '@/app/actions/mediaCredentials';
import { pushAvailability, pushButtonLabel } from '@/lib/mediaOverview';

// 出勤を送る（第57便・㉞ その2）。
//
// ★★★ この画面で【選ばせない】理由（設計メモ §169）
//   駅ちかの出勤POSTは「全員 × 7日」をまとめて送る一発で、部分更新の口が無い
//   （src/lib/workPlan.ts の冒頭コメント）。
//   ★ だから「だれの」「いつのぶんを」を選ばせる画面は作れない。
//     選べるように見せると、選んだとおりには送れない。
//   ★★ そして選ばせないことは、この機能のいちばんの取り柄でもある。
//     他社は毎回「どの女性を・どのサイトに」を選ばせている。
//     フクエスは出勤をもう持っているので、選ぶ手間そのものが要らない。
//
// ★ 問いかけは1つだけ:「どのサイトへ送りますか？」
//   ★ はじめから全部にチェック。ふだんはまとめて送るため（カッキーさん・2026-08-30）。
//
// ★★ 送る仕組みは第43〜46便のまま。ここは画面だけ。
//   確かめる（work_dryrun）→ 計画が保存される → 指紋を添えて送る（work_push）。
//   ★ 指紋が変わっていたら送らずに止まる。だから「見たものと送るもの」がずれない。

type Site = {
  provider: string; slot: number; label: string;
  direction: string; statusLabel: string; hasCredential: boolean;
};

const keyOf = (p: string, s: number) => p + '#' + s;

/** 「8/30 06:13」。★ 読めない値は空文字（"Invalid Date" を店舗に見せない）。 */
function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

/** 確かめた結果が届くのを待つ間隔と回数。★ 5分で待つのをやめる（永久に回さない） */
const POLL_MS = 15000;
const POLL_MAX = 20;

export function WorkSend({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [plans, setPlans] = useState<Record<string, WorkPlanView | null>>({});
  const [off, setOff] = useState<Set<string>>(new Set());   // ★ 外したサイトだけ覚える（既定は全部オン）
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPush, setConfirmPush] = useState<string | null>(null);
  /** ★ 確かめた結果を待っている枠。値は押した時点の作成時刻（変わったら届いた合図） */
  const [waiting, setWaiting] = useState<Record<string, string>>({});
  const pollCount = useRef(0);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const ov = await getMediaOverview({ salonId });
    if (!ov.ok) { setError(ov.error); setLoading(false); return; }
    setSites(ov.data.sites);

    // ★ 反映の向きになっている枠だけ、計画を読む。★ 読む向きの枠には計画が無くて当たり前
    const targets = ov.data.sites.filter((s) => s.direction === 'write');
    const got = await Promise.all(
      targets.map((s) => getMediaWorkPlan({ salonId, provider: s.provider, slot: s.slot }))
    );
    const next: Record<string, WorkPlanView | null> = {};
    targets.forEach((s, i) => {
      const r = got[i];
      next[keyOf(s.provider, s.slot)] = r.ok ? r.data : null;
    });
    setPlans(next);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  // ★★ 確かめた結果は中継が動いたあとに届く（その場では返ってこない）。
  //   ★ 「数分後に開き直してください」で終わりにせず、こちらで見に行く。
  //   ★ 5分待って届かなければ、待つのをやめてそう伝える（黙って回し続けない）。
  useEffect(() => {
    const keys = Object.keys(waiting);
    if (keys.length === 0 || salonId == null) return;
    pollCount.current = 0;
    const timer = setInterval(() => {
      pollCount.current += 1;
      (async () => {
        for (const k of Object.keys(waiting)) {
          const [provider, slotStr] = k.split('#');
          const res = await getMediaWorkPlan({ salonId, provider, slot: Number(slotStr) });
          if (!res.ok || !res.data) continue;
          if (res.data.createdAt === waiting[k]) continue;   // ★ まだ前の計画のまま
          setPlans((p) => ({ ...p, [k]: res.data }));
          setWaiting((w) => { const n = { ...w }; delete n[k]; return n; });
          onToast('内容ができました。送る前にご確認ください（まだ送っていません）');
        }
      })();
      if (pollCount.current >= POLL_MAX) {
        setWaiting({});
        onToast('確認の結果がまだ届きません。しばらくしてからこの画面を開き直してください');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, salonId, onToast]);

  const onDryRun = async (s: Site) => {
    if (salonId == null) return;
    const k = keyOf(s.provider, s.slot);
    setBusy(k);
    try {
      const res = await startMediaWorkDryRun({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      // ★ 押した時点の作成時刻を覚える。★ 計画そのものが無いときは空文字（できたら必ず変わる）
      setWaiting((w) => ({ ...w, [k]: plans[k]?.createdAt ?? '' }));
      onToast('内容を確かめています。できあがるとこの画面に出ます（まだ送っていません）');
    } finally {
      setBusy(null);
    }
  };

  const onPush = async (s: Site) => {
    if (salonId == null) return;
    const k = keyOf(s.provider, s.slot);
    const plan = plans[k];
    if (!plan) return;
    setBusy(k);
    try {
      const res = await startMediaWorkPush({
        salonId, provider: s.provider, slot: s.slot, fingerprint: plan.fingerprint,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast('送りました。結果は「連携の記録」に出ます');
      setConfirmPush(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (salonId == null) return null;

  const sendable = sites.filter((s) => s.direction === 'write');
  const chosen = sendable.filter((s) => !off.has(keyOf(s.provider, s.slot)));
  const others = sites.filter((s) => s.direction !== 'write');

  return (
    <div className="space-y-3">

      {/* ── どのサイトへ送るか ───────────────────────────
          ★ 問いかけはこれ1つだけ。★ はじめから全部にチェックが入っている */}
      <div className="bg-white rounded-[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-700">どのサイトへ送りますか？</h3>
          <span className="text-[11px] font-bold text-indigo-600 tabular-nums">
            {chosen.length} / {sendable.length}サイト
          </span>
        </div>

        {loading ? (
          <p className="text-[12px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-600 leading-relaxed">
            連携の状態を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sendable.map((s) => {
              const k = keyOf(s.provider, s.slot);
              const on = !off.has(k);
              return (
                <button
                  key={k}
                  onClick={() => setOff((prev) => {
                    const n = new Set(prev);
                    if (n.has(k)) n.delete(k); else n.add(k);
                    return n;
                  })}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-bold transition-colors ${
                    on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  <span className={`w-[15px] h-[15px] rounded-[5px] border grid place-items-center ${
                    on ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'
                  }`}>
                    {on && (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"
                           strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </span>
                  {s.label}
                </button>
              );
            })}

            {/* ★ 送れないサイトは【理由をその場に書く】。★ 灰色にして終わりにしない */}
            {others.map((s) => (
              <span
                key={keyOf(s.provider, s.slot)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-[12px] font-bold text-slate-300"
              >
                {s.label}
                <span className="font-medium text-slate-400">
                  （{s.direction === 'read' ? 'いまは読み込み中' : '未設定'}）
                </span>
              </span>
            ))}
          </div>
        )}

        {!loading && !error && sendable.length === 0 && (
          <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-slate-600">
              <b className="font-bold text-sky-700">いま送れるサイトがありません。</b>{' '}
              駅ちかは読み込み中のあいだは送れません。送るには向きを変えてください。
              変えると駅ちかからの取り込みは止まります。
            </p>
            <Link
              href="/mypage/media/all#login"
              className="mt-2 inline-block text-[12px] font-bold text-sky-700 underline"
            >
              向きを変える
            </Link>
          </div>
        )}
      </div>

      {/* ── サイトごとの内容 ──────────────────────────── */}
      {chosen.map((s) => {
        const k = keyOf(s.provider, s.slot);
        const plan = plans[k];
        const isWaiting = k in waiting;
        const isBusy = busy === k;

        return (
          <div key={k} className="bg-white rounded-[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-700">{s.label}へ送る内容</h3>
              {plan && <span className="text-[11px] text-slate-400">{fmt(plan.createdAt)} に確認</span>}
            </div>

            {/* ★★ この画面でいちばん誤解が起きやすい場所。**まだ送っていない**を繰り返し書く */}
            <p className="text-[11px] font-bold text-indigo-600">
              これは「送ったらこうなる」という内容です。まだ送っていません。
            </p>

            {isWaiting ? (
              <p className="text-[12px] text-slate-500">
                内容を確かめています。できあがるとここに出ます（数分かかります）。
              </p>
            ) : !plan ? (
              <>
                <p className="text-[12px] text-slate-500">
                  まだ内容を確かめていません。「内容を確かめる」を押すと、送ったらどうなるかをお見せします。
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => onDryRun(s)}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-600 disabled:opacity-50"
                  >
                    内容を確かめる
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* ★ 突き合わせ0人は「一致」ではない。ここを最初に出す（第43便-b §26） */}
                {plan.targets === 0 ? (
                  <p className="text-[12px] text-rose-600 bg-rose-50 rounded-lg px-3 py-2 leading-relaxed">
                    {s.label}の出勤表と結びつく方が1人も見つかりませんでした。内容を比べられていません。
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[10px] font-bold text-slate-400">送る相手</dt>
                        <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                          {plan.targets}<span className="text-[11px] font-bold text-slate-400 ml-0.5">名</span>
                        </dd>
                      </div>
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[10px] font-bold text-slate-400">送る範囲</dt>
                        <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                          {plan.dateLabels.length || 7}<span className="text-[11px] font-bold text-slate-400 ml-0.5">日ぶん</span>
                        </dd>
                      </div>
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[10px] font-bold text-slate-400">変わるところ</dt>
                        <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                          {plan.changeCount}<span className="text-[11px] font-bold text-slate-400 ml-0.5">件</span>
                        </dd>
                      </div>
                    </dl>
                    {/* ★★ 選ばせない理由を、その場に書く。★ 「選べないのか」で終わらせない */}
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      選ぶところはありません。フクエスに入っている出勤が、そのまま{s.label}の内容になります。
                      送りたくない方がいるときは、フクエスの出勤を直してから送ってください。
                    </p>
                  </>
                )}

                {/* 止めた理由 → 伝えること → 差分の表 の順。★ 差分を先に出すと理由が読まれない */}
                {plan.blockers.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.blockers.map((b, i) => (
                      <li key={`b-${i}`} className="text-[12px] text-rose-600 bg-rose-50 rounded-lg px-3 py-2 leading-relaxed">
                        {b.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.notes.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.notes.map((n, i) => (
                      <li key={`n-${i}`} className="text-[12px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">
                        {n.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.changeCount === 0 ? (
                  plan.targets > 0 && (
                    <p className="text-[12px] text-slate-500">
                      いまの{s.label}の内容と一致しています。変えるところはありません。
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <p className="text-[12px] font-bold text-slate-700">変わるところ（{plan.changeCount}件）</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-slate-400 text-left">
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">日付</th>
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">いまの{s.label}</th>
                            <th className="font-medium py-1 whitespace-nowrap">送ったあと</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.diff.map((d, i) => (
                            <tr key={`d-${i}`} className="border-t border-slate-100 align-top">
                              <td className="py-1.5 pr-3 text-slate-700 break-words">{d.name || d.girlId}</td>
                              <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                                {plan.dateLabels[d.dayIndex] ?? `日${d.dayIndex}`}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{d.before}</td>
                              <td className="py-1.5 text-indigo-700 font-bold whitespace-nowrap">{d.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      同じ内容の行は出していません。{plan.dateLabels.length || 7}日ぶんのうち、変わる{plan.changeCount}件だけです。
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <button
                    onClick={() => onDryRun(s)}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-600 disabled:opacity-50"
                  >
                    内容を確かめ直す
                  </button>

                  {/* ★★★ ここが送り先を書き換える唯一の場所。★ 確認を一段はさむ */}
                  {confirmPush === k ? (
                    <>
                      <button
                        onClick={() => setConfirmPush(null)}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-500"
                      >
                        やめる
                      </button>
                      <button
                        onClick={() => onPush(s)}
                        disabled={isBusy}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[12px] font-bold shadow-sm disabled:opacity-50"
                      >
                        {isBusy ? '送っています…' : 'この内容で送る（確定）'}
                      </button>
                    </>
                  ) : (() => {
                    // ★★ 押せないときは、ボタン自体に理由を書く（第58便・設計メモ §173）。
                    //   ★ 灰色にして終わりにしない。すぐ上に理由が書いてあっても、
                    //     ボタンが「押せない」としか言わないと、なぜ押せないかは伝わらない。
                    const av = pushAvailability({
                      hasPlan: true,
                      sendable: plan.sendable,
                      changeCount: plan.changeCount,
                      fingerprint: plan.fingerprint,
                    });
                    return (
                      <button
                        onClick={() => setConfirmPush(k)}
                        disabled={av !== 'ready'}
                        className={`px-4 py-2 rounded-lg text-[12px] font-bold shadow-sm ${
                          av === 'ready'
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-700 text-white'
                            : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                        }`}
                      >
                        {pushButtonLabel(av)}
                      </button>
                    );
                  })()}
                </div>

                <p className="text-[11px] text-slate-400 text-right leading-relaxed">
                  いま見えている内容と送る内容が同じであることを確かめてから送ります。
                  途中で内容が新しくなっていたときは、送らずに止まります。
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
