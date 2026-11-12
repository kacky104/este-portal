'use client';

// ★ 第1928便（2026-11-11）: 上位表示設定の部品を page.tsx から分けた（エステ魂の枠の画面 /bump/esutama/<枠> でも SlotCard を使うため）
import { conecfConfirm } from '@/app/conecf/ConecfConfirm';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useLoadOnMount } from '../conecfClientUtil';
import { useConecfHref } from '../ConecfBase';
import { saveConecfBump, runConecfBumpNow, getFukuesBumpForOperator, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, bumpIntervalsFor, parseBumpTimesText, BUMP_TIMES_MAX } from '@/lib/ekichikaBump';
import { minuteLabel, minuteFromLabel, bumpQuota } from '@/lib/bumpAuto';
import { createClient } from '@/app/lib/supabase/client';
import { getBusinessDateJST } from '@/lib/dutyStatus';

export const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

export function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d);
}

export type SiteTheme = {
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
export const SITES: Record<'ekichika' | 'esutama', SiteTheme> = {
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

export function SlotCard({ site, s, many, enabled, onToast, onSaved }: {
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
    if (!(await conecfConfirm(`${name}の${site.what}を実行しますか？${left}`, { ok: '実行する' }))) return;
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


/** ★ 第1928便: 一覧の1行（駅ちか・エステ魂・フクエスで同じ形）。押すとその設定画面へ */
export function BumpRow({ href, theme, name, lit, remaining, quota, enabled, lastAt, note }: {
  href: string; theme: { border: string; big: string; hover: string };
  name: React.ReactNode; lit: boolean; remaining: number | null; quota: number | null;
  enabled: boolean; lastAt: string | null; note?: string;
}) {
  const last = lastAt ? `最後 ${hm(lastAt)}` : 'まだ押していません';
  // ★ 第1933便: スマホは2段（上: 編集・名前・残り／下: 自動更新・最後）。PC（sm 以上）は今までどおり1段
  return (
    <Link href={href} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-2 sm:gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5 bg-white border ${theme.border} shadow-sm text-[15px] sm:text-[17px] tabular-nums ${theme.hover} transition-colors`}>
      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 sm:px-3 py-1 text-[14px] sm:text-[16px] font-bold text-blue-600 border border-blue-200 bg-blue-50">✎ 編集</span>
      <span className={`flex-1 sm:flex-none sm:w-56 min-w-0 font-black ${lit ? 'conecf-shine' : 'text-slate-700'}`}>{name}</span>
      <span className="flex-shrink-0 sm:w-36 text-right sm:text-left text-slate-500 whitespace-nowrap">
        {note ? <span className="text-[14px] sm:text-[16px] font-bold text-amber-700">{note}</span>
          : <>あと <b className={`text-[22px] sm:text-[26px] font-black ${remaining === 0 ? 'text-slate-400' : theme.big}`}>{remaining === null ? '—' : remaining}</b>{quota != null && <span className="text-[13px] sm:text-[15px]"> / {quota}回</span>}</>}
      </span>
      <span className="basis-full sm:basis-auto sm:flex-1 min-w-0 flex items-center justify-between gap-2">
        {enabled ? (
          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[13px] sm:text-[16px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />自動更新中
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 text-[13px] sm:text-[16px] font-bold text-slate-500 bg-slate-50 border border-slate-200 whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />自動更新停止
          </span>
        )}
        <span className="sm:hidden text-[13px] text-slate-400 whitespace-nowrap">{last}</span>
      </span>
      <span className="hidden sm:block w-40 flex-shrink-0 text-right text-[15px] text-slate-400">{last}</span>
    </Link>
  );
}

/** 青い光（自動更新中の名前）。一覧に1回だけ置く */
export function ShineStyle() {
  return <style>{`.conecf-shine{background:linear-gradient(100deg,#334155 0%,#334155 40%,#2563eb 46%,#93c5fd 50%,#2563eb 54%,#334155 60%,#334155 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:conecf-shine 3.2s ease-in-out infinite}@keyframes conecf-shine{0%{background-position:100% 0}60%,100%{background-position:0 0}}@media (prefers-reduced-motion:reduce){.conecf-shine{animation:none;color:#334155;background:none}}`}</style>;
}

/** ★ 第1928便: フクエスの上位表示の一覧の1行（残り・自動・最後）。読み方は SalonBumpButton と同じ（運営のときはサーバー） */
export function FukuesBumpRow({ salonId, operator }: { salonId: number; operator: boolean }) {
  const href = useConecfHref();
  const [st, setSt] = useState<{ remaining: number; quota: number; enabled: boolean; lastAt: string | null } | null>(null);
  const load = useCallback(async () => {
    let day: string | null = null, used = 0, jobs = false, bumpedAt: string | null = null, enabled = false;
    if (operator) {
      const r = await getFukuesBumpForOperator();
      if (!r.ok) return;
      day = r.data.bumpDay; used = r.data.bumpUsed; jobs = r.data.jobsEnabled; bumpedAt = r.data.bumpedAt; enabled = r.data.auto?.enabled === true;
    } else {
      const sb = createClient();
      const { data } = await sb.from('salons').select('bumped_at, bump_day, bump_used, jobs_enabled').eq('id', salonId).single();
      if (!data) return;
      day = (data.bump_day as string | null) ?? null; used = Number(data.bump_used ?? 0); jobs = data.jobs_enabled === true; bumpedAt = (data.bumped_at as string | null) ?? null;
      const a = await sb.from('salons').select('bump_auto_enabled').eq('id', salonId).single();
      enabled = !a.error && a.data?.bump_auto_enabled === true;
    }
    const quota = bumpQuota(jobs);
    const u = day === getBusinessDateJST() ? used : 0;
    setSt({ remaining: Math.max(0, quota - u), quota, enabled, lastAt: bumpedAt });
  }, [salonId, operator]);
  useLoadOnMount(load);
  return (
    <BumpRow href={href('/bump/fukues')} theme={{ border: 'border-rose-100', big: 'text-rose-500', hover: 'hover:bg-rose-50/60 hover:border-rose-300' }}
      name="TOP・地域ページ" lit={!!st?.enabled} remaining={st ? st.remaining : null} quota={st ? st.quota : 40}
      enabled={!!st?.enabled} lastAt={st?.lastAt ?? null} />
  );
}
