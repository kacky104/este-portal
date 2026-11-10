'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfActing } from '../ConecfSession';
import { OperatorNotYet } from '../OperatorBar';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, saveConecfBump, runConecfBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, EKICHIKA_BUMP_INTERVALS, bumpIntervalsFor, parseBumpTimesText, BUMP_TIMES_MAX } from '@/lib/ekichikaBump';
import { minuteLabel, minuteFromLabel } from '@/lib/bumpAuto';
import { SalonBumpButton } from '@/app/components/SalonBumpButton';

// コネックエフ「上位表示設定」（第1305便で駅ちかを作り、第1306便でフクエスも同じ画面に入れた・2026-10-08・カッキーさん）。
// ★ フクエスの部分は、マイページの「今すぐ」画面と同じ部品（SalonBumpButton）をそのまま置いている（★ 2か所に別々に書かない）。
// ★ 駅ちかの管理画面トップの「上位表示する」を、自動（時間帯・間隔）と今すぐの2通りで押す。
// ★ フクエスの自動上位表示（マイページ）と同じ形: ON/OFF・時間帯・間隔（10/15/20/30/60分）。
// ★ 残り回数・最後の上位表示は、押しに行ったときに駅ちかの画面から読んだ値（手で押した分も入る）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}

type SiteTheme = {
  provider: 'ekichika' | 'esutama';
  name: string;
  /** 押すことの呼び名（トーストに使う） */
  what: string;
  heading: string;
  btnLabel: string;
  lead: React.ReactNode;
  details: string[];
  /** 1日の回数が読めないときの見込み。★ null は「出さない」 */
  defaultQuota: number | null;
  border: string; accent: string; big: string; btn: string; toggle: string; badge: string; ring: string;
};

// ★ 第1314便: エステ魂（紫）を足した。★ Tailwind は文字列のまま書く（組み立てると色が出ない）
const SITES: Record<'ekichika' | 'esutama', SiteTheme> = {
  ekichika: {
    provider: 'ekichika', name: '駅ちか', what: '上位表示',
    heading: 'の上位表示（エリア・市区町村・駅の一覧）', btnLabel: '⬆ 上位表示する',
    lead: <>駅ちかの一覧でお店が<span className="font-bold text-orange-600">上位に表示</span>されます。</>,
    details: ['駅ちかの管理画面トップの「上位表示する」を押します。', '残り回数は、最後に駅ちかの画面を読んだときの値です。'],
    defaultQuota: 40,
    border: 'border-orange-100', accent: 'text-orange-600', big: 'text-orange-500',
    btn: 'bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600',
    toggle: 'text-orange-500 hover:text-orange-600', badge: 'text-orange-700 border-orange-200 bg-orange-50', ring: 'focus:ring-orange-200',
  },
  esutama: {
    provider: 'esutama', name: 'エステ魂', what: 'アピール',
    heading: 'の集客アピール', btnLabel: '⬆ アピールする',
    lead: <>エステ魂のトップページ・お店一覧でお店が<span className="font-bold text-violet-600">上位に表示</span>されます。</>,
    details: ['エステ魂の「集客ワンクリックアピール」（店舗情報・クーポン・お店体験談）を押します。残りがある行だけです。', '残り回数は最後にエステ魂の画面を読んだときの値です。回数はプランで違い、毎朝6時に戻ります。'],
    defaultQuota: 10,   // ★ 第1314便の2: エステ魂は1日10回（画面に上限が出ないため、ここで持つ）
    border: 'border-violet-100', accent: 'text-violet-600', big: 'text-violet-500',
    btn: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
    toggle: 'text-violet-500 hover:text-violet-600', badge: 'text-violet-700 border-violet-200 bg-violet-50', ring: 'focus:ring-violet-200',
  },
};

function SlotCard({ site, s, many, enabled, onToast, onSaved }: {
  site: SiteTheme; s: ConecfBumpSlot; many: boolean; enabled: boolean; onToast: (m: string) => void; onSaved: () => Promise<void>;
}) {
  const href = useConecfHref();
  const [on, setOn] = useState(s.enabled);
  const [start, setStart] = useState(minuteLabel(s.startMin));
  const [end, setEnd] = useState(minuteLabel(s.endMin));
  const [interval, setIntervalMin] = useState(s.intervalMin);
  // ★ 第1922便（オイルクエスト様「ベンリーと同じに」）: 間隔で押す／時刻を指定して押す（駅ちかだけ）
  const [mode, setMode] = useState<'interval' | 'times'>(s.times ? 'times' : 'interval');
  const [timesText, setTimesText] = useState((s.times ?? []).map((t) => minuteLabel(t)).join(' '));
  const [busy, setBusy] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const startMin = minuteFromLabel(start);
  const endMin = minuteFromLabel(end);
  const parsed = parseBumpTimesText(timesText);
  const useTimes = s.timesReady && mode === 'times';
  const perDay = useTimes ? parsed.times.length
    : startMin !== null && endMin !== null ? bumpSlotsPerDay({ startMin, endMin, intervalMin: interval }) : 0;
  const quota = s.quota ?? site.defaultQuota;
  // ★ 第1407便: 読んだあとにサイトの回数が戻る時刻を過ぎていたら、サイトでは1日の回数に戻っている。
  //   ★ 古い「0回」のままボタンを止めない（本当の残りは、押しに行ったときにサイトの画面で確かめる）
  const remaining = s.countStale && quota != null ? quota : s.remaining;
  const resetLabel = s.resetMin != null ? minuteLabel(s.resetMin) : null;
  const timesKey = (a: number[] | null) => (a ?? []).join(',');
  const dirty = on !== s.enabled || startMin !== s.startMin || endMin !== s.endMin || interval !== s.intervalMin
    || (s.timesReady && (useTimes ? timesKey(parsed.times) !== timesKey(s.times) : !!s.times));
  const usable = s.hasCredential && !s.linkOff;
  const name = site.name + (many ? `（枠${s.slot}）` : '');

  const guard = () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    if (!usable) { onToast(`${name}のID・パスワードが登録されていないか、止めています。「ID・パスワード登録」をご確認ください`); return false; }
    return true;
  };

  const save = async (nextOn: boolean) => {
    if (!guard()) return;
    if (startMin === null || endMin === null) { onToast('時間帯を「10:00」のような形で入れてください'); return; }
    if (useTimes && nextOn) {
      if (parsed.bad.length > 0) { onToast(`読めない時刻があります: ${parsed.bad.slice(0, 5).join('・')}（「9:32」のような形で入れてください）`); return; }
      if (parsed.times.length === 0) { onToast('押す時刻を1つ以上入れてください'); return; }
      if (parsed.times.length > BUMP_TIMES_MAX) { onToast(`時刻は${BUMP_TIMES_MAX}個までです（いま ${parsed.times.length}個）`); return; }
    }
    setBusy('save');
    const times = !s.timesReady ? undefined : useTimes ? (nextOn ? parsed.times : undefined) : (s.times ? [] : undefined);
    const res = await saveConecfBump({ provider: site.provider, slot: s.slot, enabled: nextOn, startMin, endMin, intervalMin: interval, times });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    setOn(nextOn);
    onToast(nextOn ? `${name}の自動上位表示を保存しました（1日最大${quota != null ? Math.min(res.data.perDay, quota) : res.data.perDay}回）` : `${name}の自動上位表示を止めました`);
    await onSaved();
  };

  const runNow = async () => {
    if (!guard()) return;
    // ★ 第1315便（カッキーさん）: フクエスと同じく、押す前に1回確かめる
    const left = remaining !== null ? `（本日残り ${remaining}回）` : '';
    if (!window.confirm(`${name}の${site.what}を実行しますか？${left}`)) return;
    setBusy('run');
    const res = await runConecfBumpNow({ provider: site.provider, slot: s.slot });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`${name}の${site.what}を受け付けました。1〜2分で${site.name}に反映されます。結果は「更新結果」に出ます`);
  };

  // ★ 第1306便（カッキーさん）: フクエスのカード（SalonBumpButton）と同じ形にそろえ、色だけオレンジにして見分ける。
  //   ★ 手で押すカードと、自動の設定カードを分ける（フクエスと同じ。自動は既定で閉じる）
  return (
    <>
    <div className={`bg-white border ${site.border} shadow-sm p-5 space-y-3`}>
      <div className="flex items-baseline justify-center gap-2 flex-wrap">
        <h3 className="text-sm font-black text-slate-700">{name}{site.heading}</h3>
        {s.lastAt && <span className={`text-xs font-bold ${site.accent}`}>※ {hm(s.lastAt)} に実行</span>}
      </div>

      {remaining !== null ? (
        <p className="flex items-baseline justify-center gap-1 text-lg font-bold text-slate-500 tabular-nums py-1">
          <span>本日残り</span>
          <span className={`${site.big} text-6xl font-black leading-none`}>{remaining}</span>
          <span>{quota != null ? `/ ${quota}回` : '回'}</span>
          {/* ★ 第1417便: 戻る時刻を過ぎて計算した数字は見込み（サイトで手で押した分はまだ入っていない） */}
          {s.countStale && <span className="ml-1 text-[12px] font-bold text-slate-400">（見込み）</span>}
        </p>
      ) : (
        <p className="text-center text-[13px] text-slate-500 py-2">まだ{site.name}の残り回数を読んでいません（押しに行ったときに読みます）</p>
      )}
      {s.readAt && (s.countStale
        ? <p className="-mt-2 text-center text-[11px] text-slate-400 tabular-nums">{resetLabel ? `毎日${resetLabel}に` : ''}{site.name}の回数が戻るので、その分を足した見込みです（最後に読んだのは {hm(s.readAt)}・{site.name}で手で押した分は入っていません）</p>
        : <p className="-mt-2 text-center text-[11px] text-slate-400 tabular-nums">{hm(s.readAt)} 時点の{site.name}の回数</p>)}

      <button type="button" disabled={busy !== '' || remaining === 0} onClick={() => void runNow()}
        className={`w-full py-3 text-sm font-black text-white shadow-md transition-all disabled:opacity-40 ${site.btn} active:scale-[0.99]`}>
        {busy === 'run' ? '受け付けています…' : remaining === 0 ? '本日の回数を使い切りました' : site.btnLabel}
      </button>

      {!usable && (
        <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {name}のID・パスワードが登録されていないか、止めています。<Link href={href('/sites')} className="font-bold underline">ID・パスワード登録</Link>をご確認ください。
        </p>
      )}

      <p className="text-xs text-slate-500 leading-relaxed text-center">
        {site.lead}
        {' '}
        <button type="button" onClick={() => setDetailOpen((v) => !v)} aria-expanded={detailOpen}
          aria-label={detailOpen ? '説明を閉じる' : '説明をひらく'}
          className={`${site.toggle} transition-colors align-baseline`}>
          {detailOpen ? '▲' : '▼'}
        </button>
      </p>
      {detailOpen && (
        <ul className="text-[11px] text-slate-500 leading-relaxed list-disc pl-4 space-y-0.5">
          {site.details.map((d) => <li key={d}>{d}</li>)}
          <li>押してから1〜2分で{site.name}に反映されます。結果は<Link href={href('/log')} className="font-bold underline">更新結果</Link>に出ます。</li>
        </ul>
      )}
    </div>

    <div className={`bg-white border ${site.border} shadow-sm p-5 mt-6`}>
      <button type="button" onClick={() => setAutoOpen((v) => !v)} aria-expanded={autoOpen}
        className="w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-black text-slate-700">自動上位設定</h3>
          <span className={'text-[11px] font-bold px-1.5 py-0.5 border ' + (on
            ? site.badge
            : 'text-slate-400 border-slate-200 bg-slate-50')}>
            {on ? '自動更新中' : '自動更新停止'}
          </span>
          {dirty && <span className="text-[11px] font-bold text-rose-500">未保存</span>}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`flex-shrink-0 text-slate-400 transition-transform duration-200 ${autoOpen ? 'rotate-180' : ''}`} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {autoOpen && (
        <div className="mt-3 space-y-3">
          {s.timesReady && (
            <div className="inline-flex border border-slate-300 text-[13px] font-bold">
              {([['interval', '間隔で押す'], ['times', '時刻を指定して押す']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
                  className={`px-3 py-1.5 transition-colors ${mode === k ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>{label}</button>
              ))}
            </div>
          )}
          {useTimes ? (
            <div className="space-y-2">
              <textarea value={timesText} onChange={(e) => setTimesText(e.target.value)} rows={4}
                placeholder="09:32 10:08 10:21 12:06 …（空白・改行・読点で区切って、まとめて貼り付けできます）"
                className={`w-full px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums leading-relaxed focus:outline-none focus:ring-2 ${site.ring}`} />
              {parsed.times.length > 0 && (
                <div className="flex flex-wrap gap-1 text-[12px] tabular-nums">
                  {parsed.times.map((t) => <span key={t} className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-slate-600">{minuteLabel(t)}</span>)}
                </div>
              )}
              {parsed.bad.length > 0 && <p className="text-[12px] font-bold text-rose-600">読めない時刻: {parsed.bad.slice(0, 8).join('・')}</p>}
            </div>
          ) : (
          <div className="flex items-center gap-1.5 flex-wrap text-[13px] text-slate-600">
            <input type="time" step={60} value={start} onChange={(e) => setStart(e.target.value)}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`} />
            <span className="font-bold">〜</span>
            <input type="time" step={60} value={end} onChange={(e) => setEnd(e.target.value)}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`} />
            <span className="font-bold">の間</span>
            <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`}>
              {bumpIntervalsFor(site.provider).map((m) => <option key={m} value={m}>{m >= 60 && m % 30 === 0 && m !== 60 ? `${m / 60}時間` : `${m}分`}</option>)}
            </select>
            <span className="font-bold">ごと</span>
          </div>
          )}
          <p className="text-[12px] text-slate-500">
            この設定だと1日に最大 <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。
            {quota != null && perDay > quota && <span className="text-rose-700">{site.name}は1日{quota}回までなので、超えた分は押しません。</span>}
            {!useTimes && startMin !== null && endMin !== null && startMin > endMin && <span>日をまたぐ時間帯として扱います。</span>}
            {useTimes && <span>見回りは5分ごとなので、実際に押すのは指定の時刻の1〜6分あとです。時刻を30分以上過ぎた回は、あとから押しません。</span>}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" onClick={() => void save(true)} disabled={busy !== ''}
              className="px-4 py-2 text-[13px] font-black text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 transition-colors">
              {busy === 'save' ? '保存中…' : '設定を保存する'}
            </button>
            <button type="button" onClick={() => void save(false)} disabled={busy !== '' || !on}
              className="px-4 py-2 text-[13px] font-black text-slate-500 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-colors">
              設定解除
            </button>
          </div>

          <ul className="text-[11px] text-slate-500 leading-relaxed list-disc pl-4 space-y-0.5">
            <li>手動のボタンはいつでも押せます。</li>
            <li>{site.name}で手で押した直後は、自動では押しません。</li>
            <li>{s.resetMin != null
              ? `残りが0回になったら、${site.name}の回数が戻る${minuteLabel(s.resetMin)}まで自動は止まります（その時刻が時間帯の外なら、時間帯のはじめ ${start} から）。`
              : `残りが0回になったら、次の日の時間帯のはじめ（${start}）まで自動は止まります。`}</li>
            <li>反映まで1〜2分かかります。</li>
          </ul>
        </div>
      )}
    </div>
    </>
  );
}

// ★ 第1923便（2026-11-11・カッキーさん「ベンリーみたいに」）: 駅ちかは枠ごとに1行。行を押すと、その枠の設定画面
//   （/bump/ekichika/<枠>・タイマー更新／時刻指定更新）が開く。★ 「4枠まとめて」はやめた（枠ごとに方式が違うため）
function EkichikaSlotList({ site, slots }: { site: SiteTheme; slots: ConecfBumpSlot[] }) {
  const href = useConecfHref();
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {slots.map((s) => {
          const ok = s.hasCredential && !s.linkOff;
          const quota = s.quota ?? site.defaultQuota;
          const r = s.countStale && quota != null ? quota : s.remaining;
          return (
            <li key={s.slot}>
              <Link href={href(`/bump/ekichika/${s.slot}`)} className={`flex items-center gap-3 px-4 py-4 bg-white border ${site.border} shadow-sm text-[13px] tabular-nums hover:bg-orange-50/60 hover:border-orange-300 transition-colors`}>
                <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-bold text-blue-600 border border-blue-200 bg-blue-50">✎ 編集</span>
                <span className="w-40 flex-shrink-0 min-w-0">
                  <span className="font-black text-slate-700">枠{s.slot}</span>
                  {s.area && <span className="ml-1.5 text-[12px] font-bold text-slate-500">{s.area}</span>}
                </span>
                <span className="w-28 flex-shrink-0 text-slate-500">
                  {ok ? <>あと <b className={`text-[18px] font-black ${r === 0 ? 'text-slate-400' : site.big}`}>{r === null ? '—' : r}</b>{quota != null && <span className="text-[11px]"> / {quota}回</span>}</> : <span className="text-[12px] font-bold text-amber-700">ID・PW 未登録</span>}
                </span>
                <span className="flex-1 min-w-0">
                  {s.enabled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />自動更新中
                      <span className="font-normal text-emerald-600">{s.times ? `（時刻指定・${s.times.length}回）` : `（タイマー・${minuteLabel(s.startMin)}〜${minuteLabel(s.endMin)}・${s.intervalMin}分ごと）`}</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[12px] font-bold text-slate-500 bg-slate-50 border border-slate-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />自動更新停止
                    </span>
                  )}
                </span>
                <span className="hidden sm:block w-32 flex-shrink-0 text-right text-[11px] text-slate-400">{s.lastAt ? `最後 ${hm(s.lastAt)}` : 'まだ押していません'}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="px-1 text-[11px] text-slate-400">枠を押すと、その枠の「タイマー更新／時刻指定更新」の設定と「いま1回上位表示する」が開きます。</p>
    </div>
  );
}

function SiteSection({ site, heading, enabled, onToast }: { site: SiteTheme; heading: string; enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<{ ready: boolean; slots: ConecfBumpSlot[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const res = await getConecfBump(site.provider);
    if (!res.ok) { setError(res.error); return; }
    setData({ ready: res.data.ready, slots: res.data.slots }); setError('');
  }, [site.provider]);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="space-y-2">
      <h2 className={heading}>{site.name}</h2>
      {error && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>}
      {!error && !data && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
      {!error && data && !data.ready && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>準備中です。もうしばらくお待ちください。</div>}
      {!error && data && data.ready && (
        <>
          {!enabled && (
            <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
              {site.name}の設定は、いまは見るだけです。保存するには、<Link href={href('/')} className="font-bold underline">ホーム</Link>で「コネックエフに切り替える」を押してください。
            </div>
          )}
          {data.slots.length === 0 && (
            <div className={`${CARD} p-5 text-[14px] text-slate-500`}>{site.name}の店舗ページが登録されていません。「ID・パスワード登録」から{site.name}を登録してください。</div>
          )}
          {site.provider === 'ekichika' && data.slots.length > 0
            ? <EkichikaSlotList site={site} slots={data.slots} />
            : data.slots.map((s) => (
            <SlotCard key={s.slot + ':' + s.enabled + ':' + s.startMin + ':' + s.endMin + ':' + s.intervalMin} site={site} s={s} many={data.slots.length > 1} enabled={enabled} onToast={onToast} onSaved={load} />
          ))}
        </>
      )}
    </section>
  );
}

function Body({ salonId, enabled, onToast }: { salonId: number | null; enabled: boolean; onToast: (m: string) => void }) {
  // ★ 見出しの左線の色でサイトを見分ける（フクエス＝ピンク・駅ちか＝オレンジ・エステ魂＝紫）
  const section = 'text-[15px] font-black text-slate-800 border-l-4 pl-2.5';
  // ★ 第1399便: フクエスの上位表示（SalonBumpButton）は、DB の決まりが「持ち主だけ」。運営がほかの人の店を操作中は案内に替える（次の便で対応）
  const acting = useConecfActing();

  // ★ 第1308便（カッキーさん・店舗様の声「窮屈」）: 下に余白を足し、最後のカードの下までスクロールできるようにする
  return (
    <div className="space-y-5 pb-40">
      <p className="text-[13.5px] text-slate-600 leading-relaxed">
        フクエス・駅ちか・エステ魂の上位表示を、今すぐ押す・時間帯と間隔で自動で押す、のどちらでも設定できます。
      </p>

      {/* ── フクエス（TOP・地域ページ）── */}
      <section className="space-y-2">
        <h2 className={`${section} border-rose-400`}>フクエス</h2>
        {salonId != null
          ? (acting ? <OperatorNotYet what="フクエスの上位表示" /> : <SalonBumpButton salonId={salonId} />)
          : <div className={`${CARD} p-5 text-[14px] text-slate-500`}>店舗情報が見つかりません</div>}
      </section>

      {/* ── 駅ちか（エリア・市区町村・駅の店舗一覧）── */}
      <SiteSection site={SITES.ekichika} heading={`${section} border-orange-400`} enabled={enabled} onToast={onToast} />

      {/* ── エステ魂（集客ワンクリックアピール・店舗情報）第1314便 ── */}
      <SiteSection site={SITES.esutama} heading={`${section} border-violet-400`} enabled={enabled} onToast={onToast} />
    </div>
  );
}

export default function ConecfBumpPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="bump" title="上位表示設定" toast={toast}>
      {(a) => <Body salonId={a.salonId} enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
