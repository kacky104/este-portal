'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getHeaderPoints } from '@/app/actions/headerPoints';
import { POINT_FIRST_REVIEW, POINT_SIGNUP, POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT, pointsToNextUse } from '@/lib/points';
import { POINTS_EVENT, type PointsEventDetail } from '@/lib/pointsEvents';

// ★ 第1552便（2026-10-18・カッキーさん）: 共通ヘッダーの「いまのポイント」のピル（AccountMenu の左に出る）。
// ★ 第1554便: スマホは「使える」の白いチップを出さない（幅が足りない。濃いオレンジの色で使えることを示す）
// ・P の周りのリング＝ 1,000pt（1,000円引き）までの進み具合。1,000pt 以上は濃いオレンジ＋「使える」。
// ・タップで残高・あと何pt・貯め方・有効期限・履歴への入口が開く（スマホは画面幅のカード）。
// ・受け取り／利用の直後は notifyPointsChanged() の合図で数字が変わり、+50 などを一瞬出す。
// ★ ページは ISR のまま。数字はブラウザから本人の分だけ後で取りにいく（getHeaderPoints・読み取りだけ）。
// ★ ページを移るたびに引き直さないよう、60秒だけブラウザ内で覚える（ログアウト・別の人なら捨てる）。

type Pts = { balance: number; expiresAt: string | null };
const TTL_MS = 60_000;
let CACHE: { userId: string; at: number; v: Pts } | null = null;
let INFLIGHT: { userId: string; p: Promise<Pts | null> } | null = null;

function load(userId: string): Promise<Pts | null> {
  if (CACHE && CACHE.userId === userId && Date.now() - CACHE.at < TTL_MS) return Promise.resolve(CACHE.v);
  if (INFLIGHT && INFLIGHT.userId === userId) return INFLIGHT.p;
  const p = getHeaderPoints()
    .then((r) => {
      if (!r.ok) return null;
      const v = { balance: r.balance, expiresAt: r.expiresAt };
      CACHE = { userId, at: Date.now(), v };
      return v;
    })
    .catch(() => null)
    .finally(() => { INFLIGHT = null; });
  INFLIGHT = { userId, p };
  return p;
}

function dayJa(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' }).format(d);
}

const C = 62.83; // 2π×10

export function HeaderPoints({ userId }: { userId: string }) {
  const [pts, setPts] = useState<Pts | null>(() => (CACHE && CACHE.userId === userId ? CACHE.v : null));
  const [open, setOpen] = useState(false);
  const [gain, setGain] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    if (CACHE && CACHE.userId !== userId) CACHE = null;
    load(userId).then((v) => { if (active && v) setPts(v); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const d = (e as CustomEvent<PointsEventDetail>).detail;
      if (!d || !Number.isFinite(d.balance)) return;
      const prev = CACHE && CACHE.userId === userId ? CACHE.v : null;
      const v: Pts = { balance: Math.max(0, d.balance), expiresAt: prev?.expiresAt ?? null };
      CACHE = { userId, at: 0, v }; // ★ 期限の日付は次に引くときに取り直す（at: 0 ＝古い扱い）
      setPts(v);
      if (d.delta && d.delta > 0) {
        setGain(d.delta);
        if (t) clearTimeout(t);
        t = setTimeout(() => setGain(null), 4000);
      }
    };
    window.addEventListener(POINTS_EVENT, on);
    return () => { window.removeEventListener(POINTS_EVENT, on); if (t) clearTimeout(t); };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!pts) return null;

  const bal = pts.balance;
  const usable = bal >= POINT_USE_UNIT;
  const ratio = usable ? 1 : Math.max(0, Math.min(1, bal / POINT_USE_UNIT));
  const toNext = pointsToNextUse(bal);
  const label = usable
    ? `保有ポイント ${bal.toLocaleString()}pt・${POINT_USE_YEN.toLocaleString()}円引きが使えます`
    : `保有ポイント ${bal.toLocaleString()}pt`;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className={
          usable
            ? 'relative inline-flex items-center gap-1 sm:gap-1.5 h-[30px] sm:h-8 pl-[3px] sm:pl-1 pr-2 sm:pr-[5px] rounded-full bg-orange-700 text-white ring-[3px] ring-orange-200'
            : 'relative inline-flex items-center gap-1 sm:gap-1.5 h-[30px] sm:h-8 pl-[3px] sm:pl-1 pr-2 sm:pr-3 rounded-full border border-orange-300 bg-orange-50 text-orange-800 ring-[3px] ring-orange-100 hover:bg-orange-100 transition-colors'
        }
      >
        <svg viewBox="0 0 24 24" className="w-[22px] h-[22px] sm:w-6 sm:h-6 flex-shrink-0" aria-hidden="true">
          {usable ? (
            <circle cx="12" cy="12" r="10" fill="#ffffff" />
          ) : (
            <>
              <circle cx="12" cy="12" r="10" fill="#ffffff" stroke="#fed7aa" strokeWidth="3" />
              {ratio > 0 && (
                <circle cx="12" cy="12" r="10" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(C * ratio).toFixed(1)} ${C}`} transform="rotate(-90 12 12)" />
              )}
            </>
          )}
          <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="800" fill={usable ? '#c2410c' : '#ea580c'} fontFamily="sans-serif">P</text>
        </svg>
        <span className="text-[14px] sm:text-[15px] font-extrabold leading-none tabular-nums">
          {bal.toLocaleString()}<span className="text-[10px] sm:text-[11px] font-bold ml-px">pt</span>
        </span>
        {usable && (
          <span className="hidden sm:inline text-[11px] font-extrabold text-orange-700 bg-white rounded-full px-2 py-0.5 leading-tight">使える</span>
        )}
        {gain !== null && (
          <span className="absolute -top-3 -right-2.5 text-[11px] font-extrabold text-white bg-green-700 rounded-full px-1.5 leading-normal shadow-md animate-bounce" aria-live="polite">
            +{gain.toLocaleString()}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-x-0 top-14 bottom-0 bg-slate-900/35 sm:hidden z-40" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="フクエスポイント"
            className="fixed left-2.5 right-2.5 top-16 sm:absolute sm:left-auto sm:-right-2 sm:top-full sm:mt-2 sm:w-[300px] rounded-2xl sm:rounded-[14px] border border-slate-200 bg-white shadow-xl overflow-hidden z-50 text-left"
          >
            <div className="px-[18px] pt-4 pb-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">フクエスポイント</p>
                  <p className="mt-0.5 text-[32px] font-extrabold text-slate-900 leading-tight tabular-nums">
                    {bal.toLocaleString()}<span className="text-[15px] font-bold ml-1">pt</span>
                  </p>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="閉じる"
                  className="sm:hidden w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="mt-3 h-2 rounded-full bg-orange-100 overflow-hidden">
                <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
              {usable ? (
                <div className="mt-3.5 rounded-[10px] border border-orange-200 bg-orange-50 px-3.5 py-3">
                  <p className="text-[15px] font-extrabold text-orange-800">{POINT_USE_YEN.toLocaleString()}円引きが使えます</p>
                  <p className="mt-1 text-xs leading-relaxed text-orange-900">ご来店時、お部屋のQRから開く同意書の完了画面で「ポイントを使う」を押してください。</p>
                </div>
              ) : (
                <>
                  <div className="mt-1.5 flex justify-between text-[11px] text-slate-500"><span>0</span><span>{POINT_USE_UNIT.toLocaleString()}pt</span></div>
                  <p className="mt-2.5 text-sm font-bold text-orange-800">あと {toNext.toLocaleString()}pt で {POINT_USE_YEN.toLocaleString()}円引き</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    <span className="text-xs text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">来店1回 +{POINT_VISIT}pt</span>
                    <span className="text-xs text-slate-600 bg-slate-100 rounded-md px-2 py-0.5">はじめての口コミ +{POINT_FIRST_REVIEW}pt</span>
                  </div>
                </>
              )}
              {pts.expiresAt && <p className="mt-2.5 text-xs text-slate-500">有効期限 {dayJa(pts.expiresAt)}まで</p>}
            </div>
            <Link href="/member/points" onClick={() => setOpen(false)}
              className="flex items-center justify-between min-h-12 px-[18px] border-t border-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-50">
              ポイントの履歴・使い方
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </Link>
            <Link href="/member" onClick={() => setOpen(false)}
              className="flex items-center justify-between min-h-12 px-[18px] border-t border-slate-100 text-sm font-bold text-pink-700 hover:bg-pink-50">
              マイページを開く
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f9a8d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** 未ログインのときの「会員登録で 50pt」（→ /join） */
export function SignupPointsPill() {
  return (
    <Link
      href="/join"
      className="flex-shrink-0 inline-flex items-center gap-1 sm:gap-1.5 h-8 pl-[7px] sm:pl-2 pr-2.5 sm:pr-3 rounded-full border border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="8" width="18" height="4" rx="1" />
        <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
      </svg>
      <span className="text-[11px] sm:text-xs font-bold"><span className="hidden sm:inline">会員</span>登録で</span>
      <span className="text-sm sm:text-[15px] font-extrabold">{POINT_SIGNUP}pt</span>
    </Link>
  );
}
