'use client';

// フクエスCRM 着信ポップ（CTI・第1686便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §4
// ★ CrmShell に1つだけ置く → どのタブを開いていても右上にポップが出る（カッキーさん決定①）。
// ★ 3 秒ごとに getCrmIncomingCalls（軽い読み）。端末もテスト着信も無い店は最初の1回で enabled: false → それ以上聞かない。
// ★ ポップの中身は lookupCtiCaller（受付フォームと同じ台帳・グループ共有の判定）。
// ★ 「見た」は【このブラウザだけ】（localStorage の lastId）。複数の画面を開いていれば全部に出る（受付2人でも OK）。
// ★ 音は既定で鳴らす（決定②）。ブラウザは画面を一度触るまで音を出せないので、最初の操作で音の仕組みを起こす（unlockAlarmAudio）。
//   鳴らせないときは振動（対応端末だけ）。音・表示の ON/OFF は設定タブ（ブラウザごと・ctiPrefs.ts）。
// ★ 同じ番号から 5 分以内にもう一度 → 既存のポップの時刻だけ更新（積まない）。最大 3 枚。3 分たったら薄くなる。手で閉じるまで消えない。
// ★ 第1994便（カッキーさん 11/12）: 新しい着信は【大きな窓】（CtiCallPanel・風俗CTI の着信の窓にならう）で開く。
//   「小さくする」で今までの右上のカードにたたむ（カードの「詳細」でまた開く）。

import { useCallback, useEffect, useRef, useState } from 'react';
import { getCrmIncomingCalls, lookupCtiCaller, type CrmIncomingCall, type CtiCallerInfo } from '@/app/actions/crmCti';
import { CRM_CATEGORY_CLASS, CRM_CATEGORY_LABEL } from '@/app/lib/crm/types';
import { alarmAudioReady, playAlarmOnce, resumeAlarmAudio, unlockAlarmAudio, vibrateAlarm } from '@/app/lib/crm/alarmSound';
import { ctiPrefs, ctiLastId, setCtiLastId } from '@/app/lib/crm/ctiPrefs';
import { crmGroupBadge } from '@/lib/crmGroup';
import { safeAction, useCrmLinks } from './CrmBase';
import { createClient } from '@/app/lib/supabase/client';
import { CtiCallPanel, fmtTel, withQuery } from './CtiCallPanel';

const POLL_MS = 3_000;
// ★ 第1973便（2026-11-12・点検#5）: 見張りを軽くする。
//   前は 3秒ごとに Server Action（Vercel の関数1回＋Supabase 4往復）。画面1つで1日 約2.9万回。
//   → 3秒ごとに読むのは「店ごとの印」（crm_cti_marks・最後の着信の番号だけ）を、ブラウザから Supabase へ直接1往復。
//     番号が進んだときだけ、今までどおり Server Action で着信の中身を取りに行く。
//   ・印を読めないとき（SQL の前・通信の失敗）は、その回は今までどおり Server Action で聞く（遅れない）
//   ・印が動かなくても、SERVER_EVERY 回に1回（約60秒ごと）は Server Action で確かめる（印の付け忘れ・トリガーが無いときの保険）
//   ・端末の無い店（60秒ごと）も、印が動いていなければ聞かない。IDLE_SERVER_EVERY 回に1回（約10分ごと）だけ確かめる
const SERVER_EVERY = 20;
const IDLE_SERVER_EVERY = 10;
const IDLE_MS = 60_000; // 端末もテスト着信も無い店：1 分ごとに「まだ無いか」だけ軽く聞く（★ 第1686便の直し：前は止めっぱなしで、テスト着信を入れても画面更新まで出なかった）
/** 設定タブの「テスト着信」が押されたとき（CtiSettingsSection → ここ）。すぐ聞きに行く */
export const CTI_TEST_EVENT = 'crm:cti-test';
const MAX_CARDS = 3;
const SAME_PHONE_MS = 5 * 60_000;
const FADE_MS = 3 * 60_000;
const SOUND_NO = 3; // ピロリン（上がる3音）。予約アラームと聞き分けられる音

type Card = {
  key: string;            // phone か 'hidden-<id>'
  call: CrmIncomingCall;  // 最新の着信
  count: number;          // 5 分以内に何回
  info: CtiCallerInfo | null | 'loading' | 'failed';
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function CrmIncomingCalls({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const links = useCrmLinks();
  const [cards, setCards] = useState<Card[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null); // ★ 第1994便: 大きな窓で開いているカード
  const [now, setNow] = useState(() => Date.now()); // 「◯分前」「薄くなる」の再描画（15 秒ごと・着信のたび）
  const lastIdRef = useRef<number | null>(null);
  const enabledRef = useRef<boolean>(true);
  const cardsRef = useRef<Card[]>([]);
  useEffect(() => { cardsRef.current = cards; }, [cards]);

  // ★ 最初の操作で音の仕組みを起こす（ブラウザの決まり）。1回起きれば以後は鳴る
  useEffect(() => {
    const wake = () => { void unlockAlarmAudio(); };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', wake, opts);
    window.addEventListener('keydown', wake, opts);
    const onVis = () => { if (document.visibilityState === 'visible') void resumeAlarmAudio(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const notify = useCallback(() => {
    const p = ctiPrefs();
    if (p.sound) {
      if (alarmAudioReady()) playAlarmOnce(SOUND_NO); else vibrateAlarm();
    }
  }, []);

  const arrive = useCallback((calls: CrmIncomingCall[]) => {
    if (calls.length === 0) return;
    if (!ctiPrefs().pop) return; // 表示 OFF（設定）。見張りは続ける（lastId は進める）
    const now = Date.now();
    let changed = false;
    let fresh: Card[] = [...cardsRef.current];
    let openNext: string | null = null;
    const toLookup: Array<{ key: string; phone: string }> = [];
    for (const c of calls) {
      const key = c.phone ?? `hidden-${c.id}`;
      const ex = c.phone ? fresh.find((x) => x.key === key) : undefined;
      if (ex && now - new Date(ex.call.rangAtISO).getTime() < SAME_PHONE_MS) {
        fresh = fresh.map((x) => (x.key === key ? { ...x, call: c, count: x.count + 1 } : x));
        changed = true;
        continue;
      }
      fresh = fresh.filter((x) => x.key !== key);
      fresh.unshift({ key, call: c, count: 1, info: c.phone ? 'loading' : null });
      openNext = key;
      if (c.phone) toLookup.push({ key, phone: c.phone });
      changed = true;
    }
    if (!changed) return;
    fresh = fresh.slice(0, MAX_CARDS);
    setCards(fresh);
    if (openNext) setOpenKey(openNext);
    setNow(now);
    notify();
    if (document.visibilityState !== 'visible') {
      // 裏のタブでも気づけるように（戻ると元に戻す）
      const orig = document.title;
      document.title = '📞 着信 ' + orig.replace(/^📞 着信 /, '');
      const back = () => { if (document.visibilityState === 'visible') { document.title = orig.replace(/^📞 着信 /, ''); document.removeEventListener('visibilitychange', back); } };
      document.addEventListener('visibilitychange', back);
    }
    for (const t of toLookup) {
      safeAction(lookupCtiCaller(salonId, t.phone)).then((r) => {
        setCards((cur) => cur.map((x) => (x.key === t.key ? { ...x, info: r.ok ? r : 'failed' } : x)));
      });
    }
  }, [notify, salonId]);

  // ★ 見張り（3 秒ごと）。裏のタブでも続ける（ブラウザが間隔を伸ばすことはある）
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let sinceServer = 0;                 // 最後に Server Action で聞いてから、印だけで済ませた回数
    let idleMark: number | null = null;  // 端末の無い店で、最後に見た印の番号
    let first = true;
    /** 店ごとの印（最後の着信の番号）。読めなければ null */
    const readMark = async (): Promise<number | null> => {
      try {
        const { data, error } = await createClient().from('crm_cti_marks').select('last_call_id').eq('salon_id', salonId).maybeSingle();
        if (error) return null;
        return data ? Number(data.last_call_id) || 0 : 0;
      } catch { return null; }
    };
    const poll = async () => {
      if (!alive || busy) return;
      busy = true;
      try {
        // ★ 第1973便: まず印だけ読む。動いていなければ、この回はここで終わり（Server Action を呼ばない）
        if (!first) {
          const every = enabledRef.current ? SERVER_EVERY : IDLE_SERVER_EVERY;
          if (sinceServer < every - 1) {
            const mark = await readMark();
            if (!alive) return;
            if (mark !== null) {
              const known = enabledRef.current ? lastIdRef.current : idleMark;
              if (!enabledRef.current && idleMark === null) { idleMark = mark; sinceServer += 1; return; }
              if (known != null && mark <= known) { sinceServer += 1; return; }
              if (!enabledRef.current) idleMark = mark;
            }
          }
        }
        first = false;
        sinceServer = 0;
        const r = await safeAction(getCrmIncomingCalls(salonId, lastIdRef.current));
        if (!alive) return;
        if (r.ok) {
          if (!r.enabled) { enabledRef.current = false; return; }
          enabledRef.current = true;
          // 開いた直後: このブラウザで最後に見た id より後だけを「新しい」とみなす
          let calls = r.calls;
          if (lastIdRef.current == null) {
            const seen = ctiLastId(salonId);
            if (seen != null) calls = calls.filter((c) => c.id > seen);
          }
          arrive(calls);
          if (r.latestId != null) { lastIdRef.current = r.latestId; setCtiLastId(salonId, r.latestId); }
        }
        // 読めなかったときは次の周でもう一度（画面には出さない）
      } finally {
        busy = false;
        if (alive) timer = setTimeout(() => { void poll(); }, enabledRef.current ? POLL_MS : IDLE_MS);
      }
    };
    // ★ テスト着信のボタン（設定タブ）→ 待たずにすぐ聞く
    const onTest = () => { first = true; if (timer) clearTimeout(timer); timer = setTimeout(() => { void poll(); }, 300); };
    window.addEventListener(CTI_TEST_EVENT, onTest);
    void poll();
    return () => { alive = false; if (timer) clearTimeout(timer); window.removeEventListener(CTI_TEST_EVENT, onTest); };
  }, [salonId, arrive]);

  useEffect(() => {
    if (cards.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [cards.length]);

  if (cards.length === 0) return null;
  const q = adminSalonQuery ? Object.fromEntries(new URLSearchParams(adminSalonQuery)) : {};
  const opened = openKey ? cards.find((x) => x.key === openKey) ?? null : null;
  const closeCard = (key: string) => { setCards((cur) => cur.filter((x) => x.key !== key)); setOpenKey((k) => (k === key ? null : k)); };
  const custOf = (card: Card) => (card.info && typeof card.info === 'object' ? card.info.customer : null);

  return (
    <>
    {opened && (
      <CtiCallPanel
        call={{ ...opened.call, count: opened.count }}
        info={opened.info}
        nowMs={now}
        receptionHref={opened.call.phone ? withQuery(links.href('/'), { ...q, tel: opened.call.phone }) : null}
        ledgerHref={opened.call.phone ? withQuery(links.href('/customers'), custOf(opened) ? { ...q, customer: String(custOf(opened)!.id) } : { ...q, tel: opened.call.phone }) : null}
        onClose={() => closeCard(opened.key)}
        onMinimize={() => setOpenKey(null)}
      />
    )}
    <div className="pointer-events-none fixed right-2 top-[88px] z-[60] flex w-[min(360px,calc(100vw-16px))] flex-col gap-2 md:top-[110px]" aria-live="polite">
      {cards.filter((card) => card.key !== openKey).map((card) => {
        const c = card.call;
        const age = now - new Date(c.rangAtISO).getTime();
        const faded = age > FADE_MS;
        const info = card.info;
        const cust = info && typeof info === 'object' ? info.customer : null;
        const hits = info && typeof info === 'object' ? info.groupHits : [];
        const badge = crmGroupBadge(hits);
        const isNg = cust?.category === 'ng' || badge === 'ng';
        const isCaution = !isNg && (badge != null || (cust?.cautionMemo ?? '') !== '');
        const tone = isNg ? 'border-rose-600 bg-rose-50' : isCaution ? 'border-amber-500 bg-amber-50' : !c.phone ? 'border-slate-400 bg-slate-50' : cust ? 'border-indigo-500 bg-white' : 'border-violet-600 bg-violet-50';
        const close = () => closeCard(card.key);
        return (
          <div key={card.key} className={`pointer-events-auto border-l-[6px] border border-slate-300 shadow-xl transition-opacity ${tone} ${faded ? 'opacity-60' : ''}`} role="status">
            <div className="flex items-start gap-2 px-3 pt-2">
              <span className="text-[18px]" aria-hidden>📞</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="font-bold">着信 {hhmm(c.rangAtISO)}</span>
                  {card.count > 1 && <span>（{card.count}回目）</span>}
                  {c.test && <span className="border border-slate-300 bg-white px-1 text-[10px] font-bold text-slate-500">テスト</span>}
                </p>
                {!c.phone ? (
                  <p className="mt-0.5 text-[16px] font-black text-slate-700">{c.hidden === 'payphone' ? '公衆電話' : '非通知'}</p>
                ) : (
                  <>
                    <p className="mt-0.5 text-[16px] font-black tracking-wide text-slate-800">{fmtTel(c.phone)}</p>
                    {info === 'loading' && <p className="text-[12px] text-slate-400">台帳を確認しています…</p>}
                    {info === 'failed' && <p className="text-[12px] font-bold text-amber-700">台帳を確認できませんでした（「台帳」で開いて確かめてください）</p>}
                    {info && typeof info === 'object' && (
                      cust ? (
                        <div className="mt-1 space-y-0.5">
                          <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-black text-slate-800">
                            <span className="truncate">{cust.name || '（名前なし）'} 様</span>
                            {cust.category !== 'general' && <span className={`border px-1.5 py-0.5 text-[11px] font-bold leading-none ${CRM_CATEGORY_CLASS[cust.category]}`}>{CRM_CATEGORY_LABEL[cust.category]}</span>}
                            <span className="border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-indigo-700">次は {info.bookingCount + 1} 回目</span>
                          </p>
                          {cust.stats.lastVisitISO && <p className="text-[12px] text-slate-500">最終利用 {cust.stats.lastVisitISO.slice(0, 10).replace(/-/g, '/')}・来店 {cust.stats.visits} 回{cust.stats.badCancels > 0 ? `・悪質キャンセル ${cust.stats.badCancels}` : ''}</p>}
                          {cust.ngTherapistIds.length > 0 && <p className="text-[12px] font-bold text-rose-700">女子NG あり（{cust.ngTherapistIds.length} 人）</p>}
                          {cust.cautionMemo && <p className="line-clamp-2 text-[12px] font-bold text-amber-800">⚠ {cust.cautionMemo}</p>}
                        </div>
                      ) : (
                        <p className="mt-1"><span className="bg-violet-600 px-1.5 py-0.5 text-[12px] font-bold text-white">新規</span><span className="ml-2 text-[12px] text-slate-500">台帳にない番号です</span></p>
                      )
                    )}
                    {hits.filter((h) => !h.mine).map((h) => (
                      <p key={h.id} className={`mt-1 border-l-4 px-2 py-1 text-[12px] ${h.level === 'ng' ? 'border-rose-900 bg-rose-600 font-bold text-white' : 'border-amber-500 bg-amber-100 text-amber-900'}`}>
                        <span className="font-bold">{h.level === 'ng' ? 'グループ・提携店でNG' : 'グループ・提携店で要注意'}</span>
                        {h.what && <span className="ml-1 whitespace-pre-line">{h.what}</span>}
                      </p>
                    ))}
                    {info && typeof info === 'object' && info.groupFailed && <p className="mt-1 text-[11px] font-bold text-amber-800">共有リストを確認できませんでした</p>}
                  </>
                )}
              </div>
              <button type="button" onClick={close} className="-mr-1 -mt-1 px-2 py-1 text-[18px] leading-none text-slate-400 hover:text-slate-700" aria-label="閉じる">×</button>
            </div>
            <div className="flex gap-2 px-3 pb-2 pt-2">
              {c.phone && (
                <>
                  <a href={withQuery(links.href('/'), { ...q, tel: c.phone })} onClick={close} className="flex-1 bg-indigo-600 py-1.5 text-center text-[13px] font-bold text-white">受付へ</a>
                  <a href={withQuery(links.href('/customers'), cust ? { ...q, customer: String(cust.id) } : { ...q, tel: c.phone })} onClick={close} className="flex-1 border border-indigo-300 bg-white py-1.5 text-center text-[13px] font-bold text-indigo-700">台帳</a>
                </>
              )}
              <button type="button" onClick={() => setOpenKey(card.key)} className="border border-indigo-300 bg-white px-3 py-1.5 text-[13px] font-bold text-indigo-700">詳細</button>
              <button type="button" onClick={close} className={`${c.phone ? '' : 'flex-1 '}border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-600`}>閉じる</button>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
