'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { areaLabel } from '@/app/lib/areaLabel';
import {
  addMonths,
  fetchSalonStats,
  jstTodayYmd,
  resolveMonth,
  shortYmd,
  type SalonStatRow,
} from '@/app/lib/salonStats';

// /admin「契約店舗向け 月次レポート」（2026-08-06 新設）。
//
// 「店舗別アクセス・送客数」（SalonStatsManager）と同じ集計を月単位で切り出し、
// **そのまま店舗に送れる文面**にするための画面。月末〜月初に1店舗ずつコピーして
// LINE・メールで送る使い方を想定している（営業・契約更新の材料）。
//
// 集計ロジックは lib/salonStats.ts を共有。数字の定義を変えるときはそちらを直す。
//
// ■「◯月度」の定義
//   PV（page_view_weekly）が週単位（月曜起点JST）でしか残っていないため、暦月ちょうどでは
//   切れない。そこで **週の月曜日が属する月をその週の月とする**。どの週も必ず1つの月にだけ
//   属するので、月をまたいだ二重計上も抜けも起きない。
//   例）2026年8月度 = 8/3(月)〜8/30(日) の4週間。画面にも実日付を明記する。
//
// ■ 前月比
//   前月分も同時に取得して増減率を出す。前月が0件（＝計測開始前）のときは比を出さない。

/** PV計測（page_view_weekly）を始めた月。セレクタはここまで遡れる。 */
const FIRST_MONTH = '2026-07';

type Props = { onToast: (m: string) => void };

type Ranked = SalonStatRow & { rankPv: number; rankAct: number };

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

/** 増減率の表示。前月が0なら null（「—」表示にする）。 */
function diffLabel(cur: number, prev: number): string | null {
  if (prev <= 0) return null;
  const d = (cur - prev) / prev;
  const sign = d > 0 ? '+' : '';
  return `${sign}${(d * 100).toFixed(1)}%`;
}

export default function SalonMonthlyReport({ onToast }: Props) {
  const months = useMemo(() => {
    const now = jstTodayYmd().slice(0, 7);
    const list: string[] = [];
    for (let m = now; m >= FIRST_MONTH; m = addMonths(m, -1)) list.push(m);
    return list;
  }, []);

  const [ym, setYm] = useState(() => jstTodayYmd().slice(0, 7));
  const [salonId, setSalonId] = useState<number | 'all'>('all');
  const [rows, setRows] = useState<SalonStatRow[]>([]);
  const [prevRows, setPrevRows] = useState<SalonStatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [includeHidden, setIncludeHidden] = useState(false);

  const range = useMemo(() => resolveMonth(ym), [ym]);
  const prevRange = useMemo(() => resolveMonth(addMonths(ym, -1)), [ym]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cur, prev] = await Promise.all([
        fetchSalonStats({ weeks: range.weeks, from: range.from, to: range.to }),
        fetchSalonStats({ weeks: prevRange.weeks, from: prevRange.from, to: prevRange.to }),
      ]);
      setError('');
      setRows(cur);
      setPrevRows(prev);
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [range, prevRange]);

  useEffect(() => {
    void load();
  }, [load]);

  const prevById = useMemo(() => new Map(prevRows.map((r) => [r.id, r])), [prevRows]);

  /** 順位は「掲載中の店舗」の中で付ける（非表示店を混ぜると店舗に渡す順位がぶれるため）。 */
  const ranked = useMemo<Ranked[]>(() => {
    const visible = rows.filter((r) => !r.hidden);
    const byPv = [...visible].sort((a, b) => b.pvTotal - a.pvTotal).map((r) => r.id);
    const byAct = [...visible].sort((a, b) => b.actions - a.actions).map((r) => r.id);
    const pvRank = new Map(byPv.map((id, i) => [id, i + 1]));
    const actRank = new Map(byAct.map((id, i) => [id, i + 1]));
    return rows.map((r) => ({
      ...r,
      rankPv: pvRank.get(r.id) ?? 0,
      rankAct: actRank.get(r.id) ?? 0,
    }));
  }, [rows]);

  const listed = useMemo(
    () =>
      ranked
        .filter((r) => includeHidden || !r.hidden)
        .sort((a, b) => b.pvTotal - a.pvTotal || a.name.localeCompare(b.name, 'ja')),
    [ranked, includeHidden],
  );

  const visibleCount = useMemo(() => rows.filter((r) => !r.hidden).length, [rows]);
  const selected = useMemo(
    () => (salonId === 'all' ? null : (ranked.find((r) => r.id === salonId) ?? null)),
    [ranked, salonId],
  );

  const periodLabel = `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月度（${shortYmd(range.from)}〜${shortYmd(range.end)}）`;
  const isCurrentMonth = ym === jstTodayYmd().slice(0, 7);

  /** 1店舗分のレポート文面。そのまま LINE・メールに貼れるプレーンテキスト。 */
  const buildReport = useCallback(
    (r: Ranked): string => {
      const p = prevById.get(r.id);
      const dPv = p ? diffLabel(r.pvTotal, p.pvTotal) : null;
      const dAct = p ? diffLabel(r.actions, p.actions) : null;
      const dImp = p ? diffLabel(r.impTotal, p.impTotal) : null;
      const suffix = (d: string | null) => (d ? `（前月比 ${d}）` : '');
      return [
        `■ ${r.name} 様｜フクエス 月次レポート`,
        `対象期間：${periodLabel}${isCurrentMonth ? '　※今日までの途中経過' : ''}`,
        '',
        `【一覧・バナーでの表示回数】${r.impTotal.toLocaleString()} 回${suffix(dImp)}`,
        `　店舗カード ${r.impCard.toLocaleString()} ／ セラピストカード ${r.impTher.toLocaleString()} ／ バナー ${r.impBanner.toLocaleString()}`,
        '',
        `【ページの閲覧数（PV）】${r.pvTotal.toLocaleString()} 回${suffix(dPv)}`,
        `　店舗ページ ${r.pvSalon.toLocaleString()} ／ セラピストページ ${r.pvTherapist.toLocaleString()}`,
        `　一覧からの誘導率：${r.impTotal > 0 ? pct(r.ctr) : '—'}`,
        '',
        `【ご予約・お問い合わせの操作】${r.actions.toLocaleString()} 回${suffix(dAct)}`,
        `　電話 ${r.tel.toLocaleString()} ／ LINE予約 ${r.line.toLocaleString()} ／ ネット予約 ${r.book.toLocaleString()}`,
        `　閲覧からの送客率：${r.pvTotal > 0 ? pct(r.rate) : '—'}`,
        '',
        `サイト内順位：PV ${r.rankPv || '—'}位 ／ 送客 ${r.rankAct || '—'}位（掲載${visibleCount}店中）`,
        '',
        '※ 表示回数は一覧カード・バナーが画面に見えた回数です。',
        '※ 電話は確認画面で「電話をかける」を押した数、ネット予約は予約ページへ進んだ数です（予約完了数ではありません）。',
        '※ 同じ方の同じご利用中は、いずれも1回として数えています。',
      ].join('\n');
    },
    [prevById, periodLabel, isCurrentMonth, visibleCount],
  );

  const copyText = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(msg);
    } catch {
      onToast('コピーに失敗しました');
    }
  };

  const copyCsv = () => {
    const head = [
      '対象月', '店舗名', 'エリア',
      '表示計', '表示(カード)', '表示(セラピ)', '表示(バナー)',
      'PV合計', 'PV(店舗)', 'PV(セラピスト)', 'CTR',
      '送客計', '電話', 'LINE', 'ネット予約', '送客率',
      '前月PV', 'PV前月比', '前月送客', '送客前月比', 'PV順位', '送客順位',
    ];
    const body = listed.map((r) => {
      const p = prevById.get(r.id);
      return [
        periodLabel, r.name, areaLabel(r.area),
        r.impTotal, r.impCard, r.impTher, r.impBanner,
        r.pvTotal, r.pvSalon, r.pvTherapist, r.impTotal > 0 ? pct(r.ctr) : '-',
        r.actions, r.tel, r.line, r.book, r.pvTotal > 0 ? pct(r.rate) : '-',
        p?.pvTotal ?? 0, (p ? diffLabel(r.pvTotal, p.pvTotal) : null) ?? '-',
        p?.actions ?? 0, (p ? diffLabel(r.actions, p.actions) : null) ?? '-',
        r.rankPv || '-', r.rankAct || '-',
      ];
    });
    // 店名にカンマが含まれても壊れないよう全項目をダブルクォートで囲む。
    const csv = [head, ...body]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    void copyText(csv, 'CSVをコピーしました');
  };

  const th = 'px-2 py-2 text-right font-bold whitespace-nowrap';
  const td = 'px-2 py-2 text-right tabular-nums whitespace-nowrap';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-6">
      <p className="text-xs text-slate-500 leading-relaxed mb-4">
        契約店舗にそのまま送れる月次レポートを作ります。店舗を選ぶと文面ができるので、
        「文面をコピー」でLINE・メールに貼り付けてください。数字は「店舗別アクセス・送客数」と同じ計測です。
        <br />
        <strong className="text-slate-700">◯月度</strong>は、月曜はじまりの週のうち
        <strong className="text-slate-700">月曜日がその月に入っている週</strong>をまとめた期間です
        （PVが週単位の記録のため。月をまたいだ二重計上は起きません）。
      </p>

      {/* 対象月・対象店舗 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="space-y-1">
          <label htmlFor="monthly-report-ym" className="text-[11px] font-bold text-slate-400 block">
            対象月
          </label>
          <select
            id="monthly-report-ym"
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {Number(m.slice(0, 4))}年{Number(m.slice(5, 7))}月度
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 min-w-0">
          <label htmlFor="monthly-report-salon" className="text-[11px] font-bold text-slate-400 block">
            対象店舗
          </label>
          <select
            id="monthly-report-salon"
            value={salonId === 'all' ? 'all' : String(salonId)}
            onChange={(e) => setSalonId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="max-w-full sm:w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
          >
            <option value="all">全店舗（一覧で見る）</option>
            {listed.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.hidden ? '（非表示）' : ''}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-1.5 text-xs text-slate-500 pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setIncludeHidden(e.target.checked)}
            className="accent-pink-500"
          />
          非表示店舗も含める
        </label>

        <div className="flex-1" />
        <button
          type="button"
          onClick={copyCsv}
          disabled={loading || listed.length === 0}
          className="px-3 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors disabled:opacity-40"
        >
          全店舗CSVをコピー
        </button>
      </div>

      <p className="text-[11px] text-slate-400 mb-3">
        集計期間：{range.from} 〜 {range.to}
        {isCurrentMonth && <span className="ml-1 text-amber-600">（今月＝今日までの途中経過）</span>}
      </p>

      {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400 py-10 text-center">読み込み中…</p>
      ) : listed.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">対象の店舗がありません</p>
      ) : selected ? (
        /* ── 1店舗分のレポート ── */
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void copyText(buildReport(selected), 'レポート文面をコピーしました')}
              className="px-4 py-2 rounded-full bg-pink-500 text-white text-xs font-bold hover:bg-pink-600 transition-colors"
            >
              文面をコピー
            </button>
            <a
              href={`/salon/${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold text-slate-400 hover:text-pink-600"
            >
              店舗ページを開く →
            </a>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-2xl bg-slate-50 border border-slate-100 p-4 text-xs leading-relaxed text-slate-700 font-sans">
            {buildReport(selected)}
          </pre>
        </div>
      ) : (
        /* ── 全店舗の一覧（どの店に送るか選ぶための早見表） ── */
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="min-w-[760px] w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200">
                <th className="px-2 py-2 text-left font-bold whitespace-nowrap sticky left-0 bg-white">店舗名</th>
                <th className={th}>表示計</th>
                <th className={th}>PV合計</th>
                <th className={th}>PV前月比</th>
                <th className={th}>送客計</th>
                <th className={th}>送客前月比</th>
                <th className={th}>送客率</th>
                <th className={th}>PV順位</th>
                <th className={th}>文面</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => {
                const p = prevById.get(r.id);
                const dPv = p ? diffLabel(r.pvTotal, p.pvTotal) : null;
                const dAct = p ? diffLabel(r.actions, p.actions) : null;
                const tone = (d: string | null) =>
                  d == null ? 'text-slate-300' : d.startsWith('+') ? 'text-emerald-600' : 'text-slate-400';
                return (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                    <td className="px-2 py-2 text-left sticky left-0 bg-white">
                      <button
                        type="button"
                        onClick={() => setSalonId(r.id)}
                        className="font-bold text-slate-700 hover:text-pink-600 text-left"
                      >
                        {r.name}
                      </button>
                      {r.hidden && <span className="ml-1 text-[9px] text-slate-400">(非表示)</span>}
                      <span className="block text-[10px] text-slate-400">{areaLabel(r.area)}</span>
                    </td>
                    <td className={`${td} text-slate-500`}>{r.impTotal.toLocaleString()}</td>
                    <td className={`${td} font-bold text-slate-700`}>{r.pvTotal.toLocaleString()}</td>
                    <td className={`${td} ${tone(dPv)}`}>{dPv ?? '—'}</td>
                    <td className={`${td} font-bold text-pink-600`}>{r.actions.toLocaleString()}</td>
                    <td className={`${td} ${tone(dAct)}`}>{dAct ?? '—'}</td>
                    <td className={`${td} text-slate-500`}>{r.pvTotal > 0 ? pct(r.rate) : '-'}</td>
                    <td className={`${td} text-slate-500`}>{r.rankPv || '-'}</td>
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => void copyText(buildReport(r), `${r.name} のレポートをコピーしました`)}
                        className="px-2 py-1 rounded-full border border-slate-200 text-[10px] font-bold text-slate-500 hover:text-pink-600 hover:border-pink-200 transition-colors"
                      >
                        コピー
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
        ※ 表示回数・送客アクションの記録は 2026-08-06 開始です。8月度は 8/3〜8/5 の分が含まれません（PVは以前から記録あり）。<br />
        ※ 順位は掲載中（非表示でない）の店舗の中で付けています。<br />
        ※ 「一覧からの誘導率」は参考値です。PVには検索・SNSからの直接流入も含まれます。
      </p>
    </div>
  );
}
