'use client';

import { useEffect, useMemo, useState } from 'react';
import { getHpAnalytics, type HpAnalytics, type HpTotals } from '@/app/actions/hpAnalytics';
import { jstDayHour } from '@/lib/hpStats';
import { FUKUES_ORIGIN } from '@/lib/crmHost';

// ★ 第1792便（カッキーさん・2026-11-08・オイルクエスト様のご要望）: 公式HP（フクエスサイト）のアクセス解析の画面。
//   ★ すぐる君（GA4＋Looker Studio）と同じく見やすいタブ。★ そのうえで「電話・LINE につながった流入元」「時間帯」「ひとこと」を足した。
//   ★ コネックエフ（/analytics）と公式HP管理（/hp/{slug}/admin の「アクセス解析」）で同じ部品を使う。
//   ★ 色: 1系列の棒は1色（青）。時間帯の表は青の濃淡（多いほど濃い）。増減の矢印は文字＋記号（色だけにしない）。

// ★ 第1889便（カッキーさん）: スマホだけ「TOP」（数のタイル）を1ページ目にする。ほかのタブ（スマホ）は数のタイルを出さない
type Tab = 'top' | 'summary' | 'sources' | 'pages' | 'therapists' | 'hours' | 'help';
const TABS: Array<[Tab, string]> = [
  ['summary', 'サマリー'], ['sources', '流入元'], ['pages', 'ページ'], ['therapists', 'セラピスト'], ['hours', '時間帯'], ['help', '見方'],
];
const BLUE = '#2563eb';
const nf = (n: number) => n.toLocaleString('ja-JP');

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function monthRange(today: string, back: number): [string, string] {
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 - back, 1));
  const last = back === 0 ? new Date(`${today}T00:00:00Z`) : new Date(Date.UTC(y, m - back, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

// ★ 第1793便: すぐる君と同じく小数1けたの％（↑ 緑・↓ 赤。記号でも分かる）
function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (prev <= 0) return <span className="text-[12px] text-slate-400">前の期間 0</span>;
  const p = Math.round(((cur - prev) / prev) * 1000) / 10;
  if (p === 0) return <span className="text-[12px] text-slate-500">± 0.0%</span>;
  return <span className={`text-[12px] font-bold ${p > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{p > 0 ? '↑' : '↓'} {p > 0 ? '+' : ''}{p.toFixed(1)}%</span>;
}

// ★ 第1793便: タブごとの見出しと説明（すぐる君の「サマリーレポート」の形）
const TAB_HEAD: Record<Tab, [string, string]> = {
  top: ['TOP', '公式ホームページに来た人数や、電話・LINE などが押された数です'],
  summary: ['サマリーレポート', '公式ホームページに来た人数や、電話・LINE が押された数などのおおまかなレポートです'],
  sources: ['集客レポート', 'お客様がどのサイトから来たのか、そこから電話・LINE にどれだけつながったのかが分かるデータです'],
  pages: ['ページレポート', 'サイトの中のどのページがどれだけ見られたのかが分かるデータです'],
  therapists: ['セラピスト別レポート', '登録されているセラピストのページがどれだけ見られたのかが分かるデータです'],
  hours: ['時間帯レポート', '何曜日の何時に見られて、何時に電話・LINE が来るのかが分かるデータです'],
  help: ['レポートの活用方法', 'このレポートをお店の集客に役立てるための見方をご紹介します'],
};

/**
 * ★ 第1888便（カッキーさん）: siteLinks … 公式ホームページ（フクエスサイト）と、その管理画面へのリンクを出す（コネックエフから使う）。
 *   公式HP管理の中で開いているときは出さない（そこがもう管理画面なので）。
 */
export function HpAnalyticsView({ salonId, siteLinks = false }: { salonId: number; siteLinks?: boolean }) {
  const today = useMemo(() => jstDayHour(Date.now()).day, []);
  const [range, setRange] = useState<[string, string]>([addDays(today, -27), today]);
  const [preset, setPreset] = useState('28');
  // ★ 第1889便: スマホ（640px 未満）は TOP から。PC は今までどおりサマリーから（TOP のタブは無い）
  const [tab, setTab] = useState<Tab>('summary');
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 画面幅は描いたあとでないと分からない（サーバーとの食い違いを避ける）
    if (mq.matches) setTab('top');
    const onChange = () => { if (!mq.matches) setTab((t) => (t === 'top' ? 'summary' : t)); };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [res, setRes] = useState<{ key: string; data: HpAnalytics | null; err: string } | null>(null);
  const key = `${salonId}|${range[0]}|${range[1]}`;

  useEffect(() => {
    let alive = true;
    getHpAnalytics({ salonId, from: range[0], to: range[1] })
      .then((r) => { if (alive) setRes(r.ok ? { key, data: r.data, err: '' } : { key, data: null, err: r.error }); })
      .catch(() => { if (alive) setRes({ key, data: null, err: '読み込めませんでした。しばらくしてから開き直してください。' }); });
    return () => { alive = false; };
  }, [salonId, range, key]);

  const pick = (p: string) => {
    setPreset(p);
    if (p === '7') setRange([addDays(today, -6), today]);
    else if (p === '28') setRange([addDays(today, -27), today]);
    else if (p === '90') setRange([addDays(today, -89), today]);
    else if (p === 'month') setRange(monthRange(today, 0));
    else if (p === 'lastmonth') setRange(monthRange(today, 1));
  };

  const loading = !res || res.key !== key;
  const d = !loading ? res.data : null;

  const PRESETS: Array<[string, string]> = [['7', '過去7日'], ['28', '過去28日'], ['90', '過去90日'], ['month', '今月'], ['lastmonth', '先月'], ['', '期間を指定']];
  const [head, sub] = TAB_HEAD[tab];

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      {/* ★ 第1793便（カッキーさん「すぐる君に寄せて」）: タブは上の中央・青い下線。★ 第1890便: PC だけ（スマホは画面下の固定メニュー） */}
      <div className="hidden gap-x-1 overflow-x-auto border-b border-slate-200 bg-white sm:flex sm:flex-wrap sm:justify-center sm:gap-x-2">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px flex-none whitespace-nowrap border-b-[3px] px-3 py-2.5 text-[15px] font-black sm:px-5 sm:py-3 sm:text-[17px] ${tab === k ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-700 hover:text-blue-600'}`}>{l}</button>
        ))}
      </div>

      {/* 見出し・説明・期間（右にオレンジの「期間を選択」） */}
      <div className="flex flex-col gap-3 border-b-2 border-blue-500 bg-white px-3 pb-2 pt-3 sm:flex-row sm:items-end sm:px-4">
        <div className="min-w-0 sm:flex-1">
          <h2 className="text-[20px] font-black sm:text-[24px] tracking-wide text-blue-600">{head}</h2>
          <p className="mt-1 text-[13px] text-slate-600">{sub}</p>
        </div>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <p className="text-[12px] font-bold text-slate-700">▼表示するデータの期間を変更できます</p>
          <select value={preset} onChange={(e) => pick(e.target.value)} aria-label="期間を選択"
            className="w-full cursor-pointer rounded-full sm:w-auto sm:min-w-[220px] border-0 bg-amber-400 px-4 py-1.5 text-[13px] font-bold text-slate-800 shadow-sm">
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {preset === '' && (
            <span className="flex flex-wrap items-center gap-1 text-[12px] text-slate-500">
              <input type="date" value={range[0]} max={range[1]} onChange={(e) => { if (e.target.value) setRange([e.target.value, range[1]]); }} className="border border-slate-300 px-1.5 py-0.5 text-[12px]" />
              〜
              <input type="date" value={range[1]} min={range[0]} max={today} onChange={(e) => { if (e.target.value) setRange([range[0], e.target.value]); }} className="border border-slate-300 px-1.5 py-0.5 text-[12px]" />
            </span>
          )}
          <p className="text-[11px] text-slate-400">{range[0].replace(/-/g, '/')} 〜 {range[1].replace(/-/g, '/')}{d ? `（くらべる期間 ${d.prevFrom.slice(5).replace('-', '/')}〜${d.prevTo.slice(5).replace('-', '/')}）` : ''}</p>
        </div>
      </div>

      {loading ? (
        <p className="border border-slate-200 bg-white p-8 text-center text-[14px] text-slate-400">読み込み中…</p>
      ) : !d ? (
        <p className="border border-rose-200 bg-rose-50 p-4 text-[14px] font-bold text-rose-700">{res?.err}</p>
      ) : !d.site ? (
        <p className="border border-slate-200 bg-white p-6 text-[14px] leading-relaxed text-slate-600">
          公式ホームページ（フクエスサイト）を公開しているお店で使えます。公式ホームページを公開すると、その日から自動で数え始めます。
        </p>
      ) : (
        <>
          {siteLinks && (
            <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white px-4 py-3">
              <span className="mr-1 text-[13px] font-bold text-slate-600">フクエスサイト</span>
              <a href={d.site.domain ? `https://${d.site.domain}` : `${FUKUES_ORIGIN}/hp/${d.site.slug}`} target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-700 hover:bg-slate-50">
                公式ホームページを見る <span aria-hidden>↗</span>
              </a>
              <a href={`${FUKUES_ORIGIN}/hp/${d.site.slug}/admin`} target="_blank" rel="noopener"
                className="inline-flex items-center gap-1 border border-pink-300 bg-pink-50 px-3 py-1.5 text-[13px] font-bold text-pink-700 hover:bg-pink-100">
                公式HP管理（写真・文章の変更）を開く <span aria-hidden>↗</span>
              </a>
            </div>
          )}
          {/* ★ 第1889便: 数のタイル — スマホは TOP だけ／PC は今までどおり見方以外のタブで */}
          {tab !== 'help' && (
            <div className={tab === 'top' ? '' : 'hidden sm:block'}><Tiles cur={d.totals} prev={d.prev} usage={d.usage} /></div>
          )}

          {/* ひとこと（サマリーだけ）。★ 第1889便: スマホはグラフの下・PC はグラフの上（今までどおり） */}
          <div className="flex flex-col gap-4">
          {tab === 'summary' && d.insights.length > 0 && (
            <div className="order-2 border-l-4 border-blue-500 bg-blue-50 px-4 py-3 sm:order-1">
              <p className="mb-1 text-[12px] font-black text-blue-800">この期間のひとこと</p>
              <ul className="space-y-0.5 text-[14px] leading-relaxed text-slate-800">
                {d.insights.map((s, i) => <li key={i}>・{s}</li>)}
              </ul>
            </div>
          )}

          {tab === 'summary' && <div className="order-1 sm:order-2"><Summary d={d} /></div>}
          </div>
          {tab === 'sources' && <Sources d={d} />}
          {tab === 'pages' && <Pages d={d} />}
          {tab === 'therapists' && <Therapists d={d} />}
          {tab === 'hours' && <Hours d={d} />}
          {tab === 'help' && <Help />}
        </>
      )}

      {/* ★★ 第1890便（カッキーさん）: スマホは画面下に固定メニュー（アプリのように）。TOP・サマリー・流入元・ページ・ほか。
          「ほか」を押すとセラピスト・時間帯・見方を選べる小さな一覧 */}
      <MobileNav tab={tab} onPick={(t) => { setTab(t); window.scrollTo({ top: 0 }); }} />
    </div>
  );
}

const NAV_ICON: Record<string, React.ReactNode> = {
  top: <path d="M3 11l9-8 9 8M5 10v10h14V10" />,
  summary: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  sources: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  pages: <><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};
const MORE_TABS: Array<[Tab, string]> = [['therapists', 'セラピスト'], ['hours', '時間帯'], ['help', '見方']];

function MobileNav({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const items: Array<[Tab | 'more', string]> = [['top', 'TOP'], ['summary', 'サマリー'], ['sources', '流入元'], ['pages', 'ページ'], ['more', 'ほか']];
  const inMore = MORE_TABS.some(([k]) => k === tab);
  return (
    <div className="sm:hidden">
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />}
      {open && (
        <div className="fixed bottom-[68px] right-2 z-50 w-44 border border-slate-200 bg-white py-1 shadow-xl" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          {MORE_TABS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setOpen(false); onPick(k); }}
              className={`block w-full px-4 py-3 text-left text-[15px] font-bold ${tab === k ? 'bg-blue-50 text-blue-600' : 'text-slate-700'}`}>{l}</button>
          ))}
        </div>
      )}
      <nav aria-label="レポートの切り替え"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {items.map(([k, l]) => {
          const on = k === 'more' ? inMore || open : tab === k;
          return (
            <button key={k} type="button" aria-current={on ? 'page' : undefined}
              onClick={() => (k === 'more' ? setOpen((v) => !v) : (setOpen(false), onPick(k)))}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${on ? 'text-blue-600' : 'text-slate-500'}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{NAV_ICON[k]}</svg>
              {k === 'more' && inMore ? (MORE_TABS.find(([t]) => t === tab)?.[1] ?? l) : l}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

// ★ 第1879便（カッキーさん）: 使っていないもの（LINE・ネット予約・お問い合わせ）は、0件と見分けがつくよう「未使用」と出す
const UNUSED_NOTE: Record<string, [string, string]> = {
  'LINEタップ': ['LINEのURL未登録', 'フクエスのマイページで LINE 予約の URL を入れると、公式ホームページに LINE 予約のボタンが出ます'],
  'ネット予約タップ': ['予約受付OFF', 'フクエスのマイページでネット予約の受付を ON にすると、公式ホームページにネット予約のボタンが出ます'],
  'お問い合わせ': ['フォームOFF', '「お問い合わせ」でお問い合わせフォームを ON にすると、公式ホームページにお問い合わせのページが出ます'],
};

function Tiles({ cur, prev, usage }: { cur: HpTotals; prev: HpTotals; usage?: HpAnalytics['usage'] }) {
  const unused = (l: string) => !!usage && ((l === 'LINEタップ' && !usage.line) || (l === 'ネット予約タップ' && !usage.book) || (l === 'お問い合わせ' && !usage.contact));
  const items: Array<[string, number, number, string]> = [
    ['人数', cur.users, prev.users, '1日ごとに数えた、見に来た人（端末）の数の合計'],
    ['はじめての人', cur.newUsers, prev.newUsers, 'この端末ではじめて公式ホームページを見た人'],
    ['訪問', cur.sessions, prev.sessions, '見に来た回数（同じ人でも、間をあけてまた来たら1回）'],
    ['閲覧ページ', cur.pv, prev.pv, '見られたページの数'],
    ['電話タップ', cur.tel, prev.tel, '電話番号のボタンが押された数'],
    ['LINEタップ', cur.line, prev.line, 'LINE 予約のボタンが押された数'],
    // ★ 第1878便: ネット予約（フクエスの予約ページへ）のボタン
    ['ネット予約タップ', cur.book ?? 0, prev.book ?? 0, 'ネット予約のボタンが押された数'],
    ['お問い合わせ', cur.contact, prev.contact, 'お問い合わせフォームが送られた数'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 bg-[#ececec] p-2 sm:grid-cols-[repeat(auto-fit,minmax(118px,1fr))] sm:gap-3 sm:p-3">
      {items.map(([l, c, p, t]) => (
        unused(l) && c === 0 ? (
          <div key={l} title={UNUSED_NOTE[l][1]} className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-center">
            <p className="whitespace-nowrap text-[13px] text-slate-500">{l}</p>
            <p className="mt-1.5 inline-block rounded-full bg-slate-200 px-3 py-1 text-[14px] font-bold text-slate-600">未使用</p>
            <p className="mt-1.5 text-[11.5px] leading-tight text-slate-400">{UNUSED_NOTE[l][0]}</p>
          </div>
        ) : (
          <div key={l} title={t} className="rounded-lg bg-white px-3 py-3 text-center shadow-sm">
            <p className="whitespace-nowrap text-[13px] text-slate-600">{l}</p>
            <p className="mt-0.5 text-[26px] leading-tight sm:text-[30px] tabular-nums text-slate-800">{nf(c)}</p>
            <Delta cur={c} prev={p} />
          </div>
        )
      ))}
    </div>
  );
}

// ★ 第1793便: すぐる君と同じ形の棒グラフ（灰色の台・目盛り線・棒の上に数・下に日付）
function niceMax(v: number): number {
  if (v <= 5) return 5;
  if (v <= 10) return 10;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function Bars({ data, label }: { data: Array<{ x: string; v: number; sub?: string }>; label: string }) {
  const max = niceMax(Math.max(1, ...data.map((p) => p.v)));
  // ★ 第1795便: 日付は重ならないよう間引く（7日まで毎日・14日まで1日おき・それ以上は約8か所）。0の数は31日まで
  const many = data.length > 31;
  const step = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 8);
  // ★ 第1796便: スマホは幅が狭いので、8本以上あるときは棒の上の数を隠す（タップ・長押しで title に出る）
  const numCls = data.length > 7 ? 'hidden sm:inline' : '';
  return (
    <div>
      <p className="mb-1.5 text-[15px] font-bold text-slate-700">▼{label}</p>
      <div className="bg-[#ececec] px-3 pb-2 pt-4">
        <div className="relative ml-8 h-[190px]">
          {[0, 0.5, 1].map((r) => (
            <div key={r} className="pointer-events-none absolute left-0 right-0 border-t border-slate-300" style={{ bottom: `${r * 100}%` }}>
              <span className="absolute -left-8 -translate-y-1/2 text-[11px] text-slate-600">{nf(Math.round(max * r))}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end gap-[3px] px-1">
            {data.map((p) => (
              <div key={p.x} className="group relative flex h-full flex-1 items-end justify-center" title={`${p.x.replace(/-/g, '/')}　${nf(p.v)}${p.sub ? `　${p.sub}` : ''}`}>
                <div className="relative w-full max-w-[28px] group-hover:opacity-80" style={{ height: `${(p.v / max) * 100}%`, background: BLUE }}>
                  {!many && p.v > 0 && (
                    <span className={`absolute left-1/2 -translate-x-1/2 text-[11px] font-bold tabular-nums sm:text-[12px] ${numCls} ${(p.v / max) > 0.12 ? 'top-0.5 text-white' : '-top-4 text-blue-700'}`}>{p.v}</span>
                  )}
                </div>
                {!many && p.v === 0 && <span className={`absolute bottom-0.5 text-[11px] text-blue-600 ${numCls}`}>0</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="ml-8 mt-1 flex gap-[3px] px-1">
          {data.map((p, i) => (
            <div key={p.x} className="flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-slate-600">
              {(i % step === 0 || i === data.length - 1) && (data.length - 1 - i >= step || i === data.length - 1) ? (data.length <= 7
                ? <><span className="sm:hidden">{p.x.slice(5).replace('-', '/')}</span><span className="hidden sm:inline">{p.x.replace(/-/g, '/')}</span></>
                : p.x.slice(5).replace('-', '/')) : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Summary({ d }: { d: HpAnalytics }) {
  const total = d.devices.sp + d.devices.pc;
  const spPct = total > 0 ? Math.round((d.devices.sp / total) * 100) : 0;
  return (
    <div className="space-y-5 border border-slate-200 bg-white p-3 sm:p-4">
      <Bars label="人数の推移" data={d.daily.map((x) => ({ x: x.day, v: x.users, sub: `閲覧 ${nf(x.pv)}・電話 ${x.tel}・LINE ${x.line}・ネット予約 ${x.book ?? 0}` }))} />
      <Bars label="電話・LINE・ネット予約・お問い合わせの推移" data={d.daily.map((x) => ({ x: x.day, v: x.tel + x.line + (x.book ?? 0) + x.contact, sub: `電話 ${x.tel}・LINE ${x.line}・ネット予約 ${x.book ?? 0}・お問い合わせ ${x.contact}` }))} />
      {total > 0 && (
        <div>
          <p className="mb-1.5 text-[15px] font-bold text-slate-700">▼見ている端末</p>
          <div className="flex h-5 overflow-hidden border border-slate-200 text-[11px] font-bold text-white">
            <div className="flex items-center justify-center" style={{ width: `${spPct}%`, background: BLUE }}>{spPct >= 12 ? `スマホ ${spPct}%` : ''}</div>
            <div className="flex items-center justify-center bg-slate-400" style={{ width: `${100 - spPct}%` }}>{100 - spPct >= 12 ? `パソコン ${100 - spPct}%` : ''}</div>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">スマホ {nf(d.devices.sp)}人・パソコン {nf(d.devices.pc)}人</p>
        </div>
      )}
    </div>
  );
}

const th = 'px-2 py-2 text-left text-[12px] font-bold text-slate-500 whitespace-nowrap';
const td = 'px-2 py-2 text-[13px] tabular-nums text-slate-700 whitespace-nowrap';

function Sources({ d }: { d: HpAnalytics }) {
  const kindLabel = { search: '検索', direct: '直接', site: '外部サイト' } as const;
  return (
    <div className="space-y-2 border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-[13px] leading-relaxed text-slate-600">どこから見に来て、電話・LINE・ネット予約・お問い合わせにどれだけつながったかが分かります。「つながった率」は、訪問のうちそれらがあった割合です。</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50">
            <th className={th}>流入元</th><th className={th}>種類</th><th className={`${th} text-right`}>人数</th><th className={`${th} text-right`}>訪問</th>
            <th className={`${th} text-right`}>電話</th><th className={`${th} text-right`}>LINE</th><th className={`${th} text-right`}>ネット予約</th><th className={`${th} text-right`}>お問い合わせ</th><th className={`${th} text-right`}>つながった率</th>
            <th className={`${th} text-right`} title="その人が最初に公式ホームページを知った流入元で数えた電話・LINE・ネット予約・お問い合わせ">最初に知った<br />きっかけの成果</th>
          </tr></thead>
          <tbody>
            {d.sources.map((s) => {
              const out = s.tel + s.line + s.contact + (s.book ?? 0);
              return (
                <tr key={s.key} className="border-b border-slate-100">
                  <td className={`${td} font-bold`}>{s.label}{s.label !== s.key && <span className="ml-1 text-[11px] font-normal text-slate-400">{s.key}</span>}</td>
                  <td className={td}>{kindLabel[s.kind]}</td>
                  <td className={`${td} text-right`}>{nf(s.users)} <Delta cur={s.users} prev={s.prevUsers} /></td>
                  <td className={`${td} text-right`}>{nf(s.sessions)}</td>
                  <td className={`${td} text-right`}>{s.tel || '—'}</td>
                  <td className={`${td} text-right`}>{s.line || '—'}</td>
                  <td className={`${td} text-right`}>{s.book || '—'}</td>
                  <td className={`${td} text-right`}>{s.contact || '—'}</td>
                  <td className={`${td} text-right font-bold`}>{s.sessions > 0 && out > 0 ? `${Math.round((out / s.sessions) * 1000) / 10}%` : '—'}</td>
                  <td className={`${td} text-right`}>{s.firstTel + s.firstLine + s.firstContact + (s.firstBook ?? 0) || '—'}</td>
                </tr>
              );
            })}
            {d.sources.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-[13px] text-slate-400">この期間の記録はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Pages({ d }: { d: HpAnalytics }) {
  return (
    <div className="space-y-2 border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-[13px] text-slate-600">どのページがどれだけ見られたか（セラピストのページは「セラピスト」のタブ）。電話・LINE・ネット予約は、そのページを見ているときに押された数です。</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50">
            <th className={th}>ページ</th><th className={`${th} text-right`}>閲覧</th><th className={`${th} text-right`}>電話</th><th className={`${th} text-right`}>LINE</th><th className={`${th} text-right`}>ネット予約</th><th className={`${th} text-right`}>お問い合わせ</th>
          </tr></thead>
          <tbody>
            {d.pages.map((p) => (
              <tr key={p.key} className="border-b border-slate-100">
                <td className={`${td} font-bold`}>{p.label}<span className="ml-1 text-[11px] font-normal text-slate-400">{p.key}</span></td>
                <td className={`${td} text-right`}>{nf(p.pv)} <Delta cur={p.pv} prev={p.prevPv} /></td>
                <td className={`${td} text-right`}>{p.tel || '—'}</td>
                <td className={`${td} text-right`}>{p.line || '—'}</td>
                <td className={`${td} text-right`}>{p.book || '—'}</td>
                <td className={`${td} text-right`}>{p.contact || '—'}</td>
              </tr>
            ))}
            {d.pages.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[13px] text-slate-400">この期間の記録はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Therapists({ d }: { d: HpAnalytics }) {
  return (
    <div className="space-y-2 border border-slate-200 bg-white p-3 sm:p-4">
      <p className="text-[13px] leading-relaxed text-slate-600">セラピストのプロフィールページがどれだけ見られたか。出勤した日数・写メ日記の数と並べると、「日記を出すと見られる」「出勤が多い子ほど見られる」が分かります。</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead><tr className="border-b border-slate-200 bg-slate-50">
            <th className={th}>セラピスト</th><th className={`${th} text-right`}>閲覧</th><th className={`${th} text-right`}>電話・LINE・ネット予約</th>
            <th className={`${th} text-right`}>出勤日数</th><th className={`${th} text-right`}>写メ日記</th><th className={`${th} text-right`}>1出勤あたりの閲覧</th>
          </tr></thead>
          <tbody>
            {d.therapists.map((t) => (
              <tr key={t.id} className="border-b border-slate-100">
                <td className={`${td} font-bold`}>
                  <span className="flex items-center gap-2">
                    {t.imageUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={t.imageUrl} alt="" className="h-8 w-8 flex-none rounded-full object-cover" loading="lazy" />
                      : <span className="h-8 w-8 flex-none rounded-full bg-slate-100" />}
                    {t.name}
                  </span>
                </td>
                <td className={`${td} text-right`}>{nf(t.pv)} <Delta cur={t.pv} prev={t.prevPv} /></td>
                <td className={`${td} text-right`}>{t.tel + t.line + (t.book ?? 0) || '—'}</td>
                <td className={`${td} text-right`}>{t.workDays}日</td>
                <td className={`${td} text-right`}>{t.diaries}件</td>
                <td className={`${td} text-right`}>{t.workDays > 0 ? Math.round((t.pv / t.workDays) * 10) / 10 : '—'}</td>
              </tr>
            ))}
            {d.therapists.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-[13px] text-slate-400">この期間の記録はありません</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Hours({ d }: { d: HpAnalytics }) {
  const [mode, setMode] = useState<'pv' | 'out'>('pv');
  const grid = mode === 'pv' ? d.heat : d.heatOut;
  const max = Math.max(1, ...grid.flat());
  const order = [1, 2, 3, 4, 5, 6, 0]; // 月〜日
  return (
    <div className="space-y-3 border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-slate-600">何曜日の何時に多いか（日本時間）。濃いほど多い。</p>
        <span className="ml-auto flex gap-1">
          {([['pv', '閲覧'], ['out', '電話・LINE・お問い合わせ']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setMode(k)}
              className={`border px-2.5 py-1 text-[12px] font-bold ${mode === k ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-600'}`}>{l}</button>
          ))}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="w-7 text-center text-[10px] font-normal text-slate-400">{h}</th>)}</tr></thead>
          <tbody>
            {order.map((dow) => (
              <tr key={dow}>
                <th className="pr-2 text-right text-[12px] font-bold text-slate-500">{'日月火水木金土'[dow]}</th>
                {grid[dow].map((v, h) => {
                  const a = v / max;
                  return (
                    <td key={h} title={`${'日月火水木金土'[dow]}曜 ${h}時台：${nf(v)}`} className="h-7 w-7 border border-white text-center text-[10px] tabular-nums"
                      style={{ background: v > 0 ? `rgba(37,99,235,${0.12 + a * 0.88})` : '#f1f5f9', color: a > 0.55 ? '#fff' : '#334155' }}>
                      {v > 0 ? v : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Help() {
  return (
    <div className="space-y-3 border border-slate-200 bg-white p-3 sm:p-4 text-[14px] leading-relaxed text-slate-700">
      <p className="font-black text-slate-800">見方と使い方</p>
      <p>・<b>上の数字の ▲▼</b> は、選んだ期間の「すぐ前の同じ長さの期間」とくらべた増減です（28日なら、その前の28日）。</p>
      <p>・<b>流入元</b>：どこから見に来たか。「つながった率」が高いところは、お客様が来てくれやすい入口です。「最初に知ったきっかけの成果」は、その人がはじめて公式ホームページを知った入口で数えた電話・LINE です（いつもは検索から来る人でも、最初は媒体で知った、が分かります）。</p>
      <p>・<b>セラピスト</b>：写メ日記を出した期間や出勤が多い期間に、見られる数が増えているかを見てください。</p>
      <p>・<b>時間帯</b>：電話・LINE が多い時間に出勤を厚くする、媒体の上位表示をその少し前に入れる、などに使えます。</p>
      <p className="font-black text-slate-800">大事なのは「変化」を追うこと</p>
      <p>媒体のバナーを変えた・コンセプトのページを作った・ピックアップする女の子を変えた、などのあとで、数字がどう変わったかを見ると、その変更が効いたかどうかが分かります。</p>
      <p className="text-[12px] text-slate-500">※ 数は公式ホームページに計測を入れた日（2026年11月）からです。人数は1日ごとに数えた合計です（同じ人が2日来たら2人）。年齢・性別は数えていません。</p>
    </div>
  );
}
