'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { getConecfBump, saveConecfBump, runConecfBumpNow, type ConecfBumpSlot } from '@/app/actions/conecfBump';
import { bumpSlotsPerDay, EKICHIKA_BUMP_INTERVALS } from '@/lib/ekichikaBump';
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
    details: ['駅ちかの管理画面トップにある「上位表示する」を、コネックエフから押します。', '回数は駅ちかの画面の値です（駅ちかで手で押した分も入ります）。'],
    defaultQuota: 40,
    border: 'border-orange-100', accent: 'text-orange-600', big: 'text-orange-500',
    btn: 'bg-gradient-to-r from-orange-400 to-amber-500 hover:from-orange-500 hover:to-amber-600',
    toggle: 'text-orange-500 hover:text-orange-600', badge: 'text-orange-700 border-orange-200 bg-orange-50', ring: 'focus:ring-orange-200',
  },
  esutama: {
    provider: 'esutama', name: 'エステ魂', what: 'アピール',
    heading: 'の集客アピール（店舗情報）', btnLabel: '⬆ アピールする',
    lead: <>エステ魂のトップページ・お店一覧でお店が<span className="font-bold text-violet-600">上位に表示</span>されます。</>,
    details: ['エステ魂の管理画面「集客ワンクリックアピール」の、店舗情報の「アピールする」をコネックエフから押します（クーポン・体験談は押しません）。', '残り回数はエステ魂の画面の値です（エステ魂で手で押した分も入ります）。1日10回で、毎朝6時に戻ります。'],
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
  const [busy, setBusy] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);

  const startMin = minuteFromLabel(start);
  const endMin = minuteFromLabel(end);
  const perDay = startMin !== null && endMin !== null ? bumpSlotsPerDay({ startMin, endMin, intervalMin: interval }) : 0;
  const quota = s.quota ?? site.defaultQuota;
  const dirty = on !== s.enabled || startMin !== s.startMin || endMin !== s.endMin || interval !== s.intervalMin;
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
    setBusy('save');
    const res = await saveConecfBump({ provider: site.provider, slot: s.slot, enabled: nextOn, startMin, endMin, intervalMin: interval });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    setOn(nextOn);
    onToast(nextOn ? `${name}の自動上位表示を保存しました（1日最大${quota != null ? Math.min(res.data.perDay, quota) : res.data.perDay}回）` : `${name}の自動上位表示を止めました`);
    await onSaved();
  };

  const runNow = async () => {
    if (!guard()) return;
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

      {s.remaining !== null ? (
        <p className="flex items-baseline justify-center gap-1 text-lg font-bold text-slate-500 tabular-nums py-1">
          <span>本日残り</span>
          <span className={`${site.big} text-6xl font-black leading-none`}>{s.remaining}</span>
          <span>{quota != null ? `/ ${quota}回` : '回'}</span>
        </p>
      ) : (
        <p className="text-center text-[13px] text-slate-500 py-2">まだ{site.name}の残り回数を読んでいません（押しに行ったときに読みます）</p>
      )}
      {s.readAt && <p className="-mt-2 text-center text-[11px] text-slate-400 tabular-nums">{hm(s.readAt)} 時点の{site.name}の回数</p>}

      <button type="button" disabled={busy !== '' || s.remaining === 0} onClick={() => void runNow()}
        className={`w-full py-3 text-sm font-black text-white shadow-md transition-all disabled:opacity-40 ${site.btn} active:scale-[0.99]`}>
        {busy === 'run' ? '受け付けています…' : s.remaining === 0 ? '本日の回数を使い切りました' : site.btnLabel}
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
            {on ? '自動実行中' : '未使用'}
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
          <div className="flex items-center gap-1.5 flex-wrap text-[13px] text-slate-600">
            <input type="time" step={600} value={start} onChange={(e) => setStart(e.target.value)}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`} />
            <span className="font-bold">〜</span>
            <input type="time" step={600} value={end} onChange={(e) => setEnd(e.target.value)}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`} />
            <span className="font-bold">の間</span>
            <select value={interval} onChange={(e) => setIntervalMin(Number(e.target.value))}
              className={`px-2 py-1.5 border border-slate-200 bg-white text-[13px] tabular-nums focus:outline-none focus:ring-2 ${site.ring}`}>
              {EKICHIKA_BUMP_INTERVALS.map((m) => <option key={m} value={m}>{m}分</option>)}
            </select>
            <span className="font-bold">ごと</span>
          </div>
          <p className="text-[12px] text-slate-500">
            この設定だと1日に最大 <b className="tabular-nums text-slate-700">{perDay}</b> 回押します。
            {quota != null && perDay > quota && <span className="text-rose-700">{site.name}は1日{quota}回までなので、超えた分は押しません。</span>}
            {startMin !== null && endMin !== null && startMin > endMin && <span>日をまたぐ時間帯として扱います。</span>}
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
            <li>残りが0回になったら、次の日の時間帯のはじめ（{start}）まで自動は止まります。</li>
            <li>反映まで1〜2分かかります。</li>
          </ul>
        </div>
      )}
    </div>
    </>
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
          {data.slots.map((s) => (
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

  // ★ 第1308便（カッキーさん・店舗様の声「窮屈」）: 下に余白を足し、最後のカードの下までスクロールできるようにする
  return (
    <div className="space-y-5 pb-40">
      <p className="text-[13.5px] text-slate-600 leading-relaxed">
        フクエス・駅ちか・エステ魂の上位表示を、ここでまとめて設定できます。どれも、手で押すボタンと、時間帯・間隔で自動で押す設定があります。
      </p>

      {/* ── フクエス（TOP・地域ページ）── */}
      <section className="space-y-2">
        <h2 className={`${section} border-rose-400`}>フクエス</h2>
        {salonId != null
          ? <SalonBumpButton salonId={salonId} />
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
