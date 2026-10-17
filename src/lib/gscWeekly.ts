// ── 週次レポートの中身を組む（第1532便）。API 呼び出しは gsc.ts、ここは比べて並べるだけ ──────
//
// 直近 7 日（今日−3 日まで。Google のデータは 2〜3 日遅れる）と、その前の 7 日を比べる。
//   ・クエリ別：クリック・表示・順位の変化。落ちたもの／伸びたもの
//   ・ページ別：同上
//   ・新しく出てきたクエリ（前の週は 0 だったもの）
// 件数は多すぎると読まれないので、各表 10 件まで。

import type { GscRow } from './gsc';

export type Period = { start: string; end: string };

export type Diff = {
  key: string;
  clicks: number; clicksPrev: number;
  impressions: number; impressionsPrev: number;
  position: number | null; positionPrev: number | null;
};

export function periods(endDate: string): { cur: Period; prev: Period } {
  const d = (s: string, minus: number) => { const t = new Date(s + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() - minus); return t.toISOString().slice(0, 10); };
  return {
    cur: { start: d(endDate, 6), end: endDate },
    prev: { start: d(endDate, 13), end: d(endDate, 7) },
  };
}

export function diffRows(cur: GscRow[], prev: GscRow[]): Diff[] {
  const map = new Map<string, Diff>();
  for (const r of cur) {
    map.set(r.keys[0], { key: r.keys[0], clicks: r.clicks, clicksPrev: 0, impressions: r.impressions, impressionsPrev: 0, position: r.position, positionPrev: null });
  }
  for (const r of prev) {
    const d = map.get(r.keys[0]);
    if (d) { d.clicksPrev = r.clicks; d.impressionsPrev = r.impressions; d.positionPrev = r.position; }
    else map.set(r.keys[0], { key: r.keys[0], clicks: 0, clicksPrev: r.clicks, impressions: 0, impressionsPrev: r.impressions, position: null, positionPrev: r.position });
  }
  return [...map.values()];
}

const fmtPos = (p: number | null) => (p === null ? '—' : p.toFixed(1));
const arrow = (a: number, b: number) => (a === b ? '→' : a > b ? '↑' : '↓');

export function line(d: Diff): string {
  return `${d.key}｜クリック ${d.clicksPrev}→${d.clicks} ${arrow(d.clicks, d.clicksPrev)}｜表示 ${d.impressionsPrev}→${d.impressions}｜順位 ${fmtPos(d.positionPrev)}→${fmtPos(d.position)}`;
}

/** メール本文を組む。 */
export function buildReport(args: { cur: Period; prev: Period; queries: Diff[]; pages: Diff[]; siteLabel: string }): { subject: string; lines: string[] } {
  const { cur, prev, queries, pages } = args;
  const sum = (rows: Diff[], k: 'clicks' | 'clicksPrev' | 'impressions' | 'impressionsPrev') => rows.reduce((a, r) => a + r[k], 0);
  const totalClicks = sum(pages, 'clicks'), totalClicksPrev = sum(pages, 'clicksPrev');
  const totalImp = sum(pages, 'impressions'), totalImpPrev = sum(pages, 'impressionsPrev');

  const dropped = queries.filter(d => d.position !== null && d.positionPrev !== null && d.impressions >= 20 && d.position - d.positionPrev >= 2)
    .sort((a, b) => (b.position! - b.positionPrev!) - (a.position! - a.positionPrev!)).slice(0, 10);
  const risen = queries.filter(d => d.position !== null && d.positionPrev !== null && d.impressions >= 20 && d.positionPrev - d.position >= 2)
    .sort((a, b) => (b.positionPrev! - b.position!) - (a.positionPrev! - a.position!)).slice(0, 10);
  const lostClicks = queries.filter(d => d.clicksPrev - d.clicks >= 3).sort((a, b) => (b.clicksPrev - b.clicks) - (a.clicksPrev - a.clicks)).slice(0, 10);
  const gainedClicks = queries.filter(d => d.clicks - d.clicksPrev >= 3).sort((a, b) => (b.clicks - b.clicksPrev) - (a.clicks - a.clicksPrev)).slice(0, 10);
  const newcomers = queries.filter(d => d.clicksPrev === 0 && d.impressionsPrev === 0 && d.impressions >= 30).sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  const topQueries = [...queries].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const topPages = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const pagesDown = pages.filter(d => d.clicksPrev - d.clicks >= 3).sort((a, b) => (b.clicksPrev - b.clicks) - (a.clicksPrev - a.clicks)).slice(0, 10);
  // 表示はあるのにクリックが少ない（CTR 1% 未満・表示 100 以上）＝タイトル・説明文を見直す候補
  const lowCtr = pages.filter(d => d.impressions >= 100 && d.clicks / d.impressions < 0.01).sort((a, b) => b.impressions - a.impressions).slice(0, 10);

  const shortUrl = (u: string) => u.replace(/^https?:\/\/fukues\.com/, '');
  const section = (title: string, rows: Diff[], map: (d: Diff) => string = line) => rows.length ? [`■ ${title}`, ...rows.map(d => '・' + map(d)), ''] : [`■ ${title}`, '・なし', ''];

  const lines = [
    `${args.siteLabel} の検索の様子（${cur.start}〜${cur.end}／前週 ${prev.start}〜${prev.end} と比較）`,
    '',
    `クリック合計 ${totalClicksPrev} → ${totalClicks} ${arrow(totalClicks, totalClicksPrev)}`,
    `表示回数合計 ${totalImpPrev} → ${totalImp} ${arrow(totalImp, totalImpPrev)}`,
    '',
    ...section('順位が落ちたクエリ（2 位以上・表示 20 以上）', dropped),
    ...section('順位が上がったクエリ', risen),
    ...section('クリックが減ったクエリ（3 以上）', lostClicks),
    ...section('クリックが増えたクエリ', gainedClicks),
    ...section('今週から出てきたクエリ（表示 30 以上）', newcomers),
    ...section('クリックが多いクエリ TOP10', topQueries),
    ...section('クリックが多いページ TOP10', topPages, d => line({ ...d, key: shortUrl(d.key) })),
    ...section('クリックが減ったページ', pagesDown, d => line({ ...d, key: shortUrl(d.key) })),
    ...section('表示は多いのにクリックされないページ（CTR 1% 未満・タイトル見直し候補）', lowCtr, d => `${shortUrl(d.key)}｜表示 ${d.impressions}・クリック ${d.clicks}・順位 ${fmtPos(d.position)}`),
    '※ Google のデータは 2〜3 日遅れるため、直近 3 日は含めていません。',
    '※ サーチコンソール: https://search.google.com/search-console/performance/search-analytics?resource_id=sc-domain%3Afukues.com',
  ];
  const subject = `【フクエス】検索の週次レポート ${cur.start}〜${cur.end}（クリック ${totalClicksPrev}→${totalClicks}）`;
  return { subject, lines };
}
