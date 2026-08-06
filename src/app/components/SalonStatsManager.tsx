'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { fetchAllRows } from '@/app/lib/fetchAllRows';
import { areaLabel } from '@/app/lib/areaLabel';

// /admin「店舗別アクセス・送客数」（2026-08-06 新設）。
//
// 3つのデータを店舗ごとに突き合わせて1枚の表にする。
//   ・インプレ … salon_impression_daily（日単位・JST）。一覧カード/バナーが画面に50%見えた回数
//                （ImpressionMark.tsx）。面別: card=店舗カード / therapist=セラピストカード / banner=店舗バナー。
//   ・PV       … page_view_weekly（週単位・月曜JST起点）。詳細ページの PageViewLogger が加算。
//                店舗ページのPVと、その店に所属するセラピスト詳細ページのPV合計を別列で出す。
//   ・送客     … salon_action_daily（日単位・JST）。詳細ページの3ボタンのクリック。
//
// 期間の粒度が「週」と「日」で混在するため、期間の選択肢は揃うよう **週（月曜起点）** に丸める。
// 「今週」だけは今日までの途中経過（PVも同じく途中経過の行なので整合する）。
//
// インプレ・PV・送客はすべて「同一セッションで1回」の人数ベースで数えているので、
//   インプレ（一覧で見えた）→ PV（詳細を開いた）→ 送客（電話・予約した）
// のファネルが比率として読める。CTR = PV合計 ÷ 表示計（参考値：PVには検索やSNSからの
// 直接流入も含まれるため、厳密な「カードのクリック率」ではない）。
//
// 取得は全件ページング（fetchAllRows）。店舗数×セラピスト数×週数で1000行を軽く超えるため。

const supabase = createClient();

type PeriodKey = 'this' | 'last' | 'w4' | 'all';
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this', label: '今週' },
  { key: 'last', label: '先週' },
  { key: 'w4', label: '過去4週' },
  { key: 'all', label: '全期間' },
];

type SortKey =
  | 'name'
  | 'impCard' | 'impTher' | 'impBanner' | 'impTotal' | 'ctr'
  | 'pvSalon' | 'pvTherapist' | 'pvTotal'
  | 'tel' | 'line' | 'book' | 'actions' | 'rate';

type Row = {
  id: number;
  name: string;
  area: string;
  hidden: boolean;
  impCard: number;    // 店舗カードの表示回数
  impTher: number;    // セラピストカードの表示回数（所属店舗に紐づけ）
  impBanner: number;  // 店舗バナー（ピックアップ/おすすめ）の表示回数
  impTotal: number;
  ctr: number;        // PV合計 ÷ 表示計（表示0なら0）
  pvSalon: number;
  pvTherapist: number;
  pvTotal: number;
  tel: number;
  line: number;
  book: number;
  actions: number;
  rate: number; // 送客計 ÷ PV合計（PV0なら0）
};

// ── 日付ユーティリティ（すべて JST の暦日を 'YYYY-MM-DD' 文字列で扱う） ──
// Date のローカルタイムゾーンに依存しないよう、計算は UTC メソッドだけで行う。
function jstTodayYmd(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** その日を含む週の月曜（page_view_weekly.week_start と同じ定義）。 */
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const diff = (d.getUTCDay() + 6) % 7; // 月曜=0, 日曜=6
  return addDays(ymd, -diff);
}

/** 選択中の期間を「対象の週初リスト」と「日付範囲」に変換する（null は無制限＝全期間）。 */
function resolvePeriod(key: PeriodKey): { weeks: string[] | null; from: string | null; to: string | null } {
  const today = jstTodayYmd();
  const thisMon = mondayOf(today);
  if (key === 'this') return { weeks: [thisMon], from: thisMon, to: today };
  if (key === 'last') {
    const lastMon = addDays(thisMon, -7);
    return { weeks: [lastMon], from: lastMon, to: addDays(lastMon, 6) };
  }
  if (key === 'w4') {
    const start = addDays(thisMon, -21);
    return { weeks: [0, 1, 2, 3].map((i) => addDays(start, i * 7)), from: start, to: today };
  }
  return { weeks: null, from: null, to: null };
}

function Arrow({ active, desc }: { active: boolean; desc: boolean }) {
  return (
    <span className={`inline-block ml-0.5 text-[9px] ${active ? 'text-pink-500' : 'text-slate-300'}`}>
      {active ? (desc ? '▼' : '▲') : '▼'}
    </span>
  );
}

export default function SalonStatsManager({ onToast }: { onToast: (m: string) => void }) {
  const [period, setPeriod] = useState<PeriodKey>('w4');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('pvTotal');
  const [desc, setDesc] = useState(true);

  const load = useCallback(async (p: PeriodKey) => {
    setLoading(true);
    const { weeks, from, to } = resolvePeriod(p);
    try {
      const [salons, therapists, pvRows, actionRows, impRows] = await Promise.all([
        // 店舗（非表示も含めて全件。非表示は行にバッジを付けて区別する）
        fetchAllRows<{ id: number; name: string | null; area: string | null; is_hidden: boolean | null }>(
          (f, t) => supabase.from('salons').select('id, name, area, is_hidden').order('id').range(f, t),
        ),
        // セラピスト → 所属店舗の対応（PVを店舗に足し上げるため。退店・非公開も含めて全件）
        fetchAllRows<{ id: number; salon_id: number | null }>(
          (f, t) => supabase.from('therapists').select('id, salon_id').order('id').range(f, t),
        ),
        // PV（週次）
        fetchAllRows<{ item_type: string; item_id: number; views: number }>((f, t) => {
          let query = supabase
            .from('page_view_weekly')
            .select('item_type, item_id, views, week_start')
            .order('item_id');
          if (weeks) query = query.in('week_start', weeks);
          return query.range(f, t);
        }),
        // 送客アクション（日次）
        fetchAllRows<{ salon_id: number; action: string; count: number }>((f, t) => {
          let query = supabase.from('salon_action_daily').select('salon_id, action, count, day').order('salon_id');
          if (from) query = query.gte('day', from);
          if (to) query = query.lte('day', to);
          return query.range(f, t);
        }),
        // インプレッション（日次・面別）
        fetchAllRows<{ salon_id: number; surface: string; count: number }>((f, t) => {
          let query = supabase.from('salon_impression_daily').select('salon_id, surface, count, day').order('salon_id');
          if (from) query = query.gte('day', from);
          if (to) query = query.lte('day', to);
          return query.range(f, t);
        }),
      ]);

      // セラピストID → 店舗ID
      const therapistSalon = new Map<number, number>();
      for (const t of therapists) {
        if (t.salon_id != null) therapistSalon.set(Number(t.id), Number(t.salon_id));
      }

      const pvSalon = new Map<number, number>();
      const pvTherapist = new Map<number, number>();
      for (const r of pvRows) {
        const views = Number(r.views) || 0;
        if (r.item_type === 'salon') {
          pvSalon.set(r.item_id, (pvSalon.get(r.item_id) ?? 0) + views);
        } else if (r.item_type === 'therapist') {
          const sid = therapistSalon.get(Number(r.item_id));
          if (sid != null) pvTherapist.set(sid, (pvTherapist.get(sid) ?? 0) + views);
        }
      }

      const act = new Map<number, { tel: number; line: number; book: number }>();
      for (const r of actionRows) {
        const cur = act.get(r.salon_id) ?? { tel: 0, line: 0, book: 0 };
        const n = Number(r.count) || 0;
        if (r.action === 'tel') cur.tel += n;
        else if (r.action === 'line') cur.line += n;
        else if (r.action === 'book') cur.book += n;
        act.set(r.salon_id, cur);
      }

      const imp = new Map<number, { card: number; ther: number; banner: number }>();
      for (const r of impRows) {
        const cur = imp.get(r.salon_id) ?? { card: 0, ther: 0, banner: 0 };
        const n = Number(r.count) || 0;
        if (r.surface === 'card') cur.card += n;
        else if (r.surface === 'therapist') cur.ther += n;
        else if (r.surface === 'banner') cur.banner += n;
        imp.set(r.salon_id, cur);
      }

      setError('');
      setRows(
        salons.map((s) => {
          const a = act.get(s.id) ?? { tel: 0, line: 0, book: 0 };
          const im = imp.get(s.id) ?? { card: 0, ther: 0, banner: 0 };
          const ps = pvSalon.get(s.id) ?? 0;
          const pt = pvTherapist.get(s.id) ?? 0;
          const pvTotal = ps + pt;
          const actions = a.tel + a.line + a.book;
          const impTotal = im.card + im.ther + im.banner;
          return {
            id: s.id,
            name: s.name ?? '',
            area: s.area ?? '',
            hidden: Boolean(s.is_hidden),
            impCard: im.card,
            impTher: im.ther,
            impBanner: im.banner,
            impTotal,
            ctr: impTotal > 0 ? pvTotal / impTotal : 0,
            pvSalon: ps,
            pvTherapist: pt,
            pvTotal,
            tel: a.tel,
            line: a.line,
            book: a.book,
            actions,
            rate: pvTotal > 0 ? actions / pvTotal : 0,
          };
        }),
      );
    } catch {
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const sorted = useMemo(() => {
    const kw = q.trim();
    const filtered = kw ? rows.filter((r) => r.name.includes(kw) || r.area.includes(kw)) : rows;
    const sign = desc ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return sign * a.name.localeCompare(b.name, 'ja');
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      if (av !== bv) return sign * (av - bv);
      return a.name.localeCompare(b.name, 'ja'); // 同値は店名順で安定させる
    });
  }, [rows, q, sortKey, desc]);

  const totals = useMemo(
    () =>
      sorted.reduce(
        (acc, r) => ({
          impCard: acc.impCard + r.impCard,
          impTher: acc.impTher + r.impTher,
          impBanner: acc.impBanner + r.impBanner,
          impTotal: acc.impTotal + r.impTotal,
          pvSalon: acc.pvSalon + r.pvSalon,
          pvTherapist: acc.pvTherapist + r.pvTherapist,
          pvTotal: acc.pvTotal + r.pvTotal,
          tel: acc.tel + r.tel,
          line: acc.line + r.line,
          book: acc.book + r.book,
          actions: acc.actions + r.actions,
        }),
        { impCard: 0, impTher: 0, impBanner: 0, impTotal: 0, pvSalon: 0, pvTherapist: 0, pvTotal: 0, tel: 0, line: 0, book: 0, actions: 0 },
      ),
    [sorted],
  );

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) {
      setDesc((d) => !d);
    } else {
      setSortKey(k);
      setDesc(k !== 'name'); // 数値は多い順、店名は五十音順から
    }
  };

  const copyCsv = async () => {
    const head = ['店舗名', 'エリア', '表示(カード)', '表示(セラピ)', '表示(バナー)', '表示計', 'PV(店舗)', 'PV(セラピスト)', 'PV合計', 'CTR', '電話', 'LINE', 'ネット予約', '送客計', '送客率'];
    const body = sorted.map((r) => [
      r.name,
      areaLabel(r.area),
      r.impCard,
      r.impTher,
      r.impBanner,
      r.impTotal,
      r.pvSalon,
      r.pvTherapist,
      r.pvTotal,
      r.impTotal > 0 ? `${(r.ctr * 100).toFixed(1)}%` : '-',
      r.tel,
      r.line,
      r.book,
      r.actions,
      r.pvTotal > 0 ? `${(r.rate * 100).toFixed(1)}%` : '-',
    ]);
    // 店名にカンマが含まれても壊れないよう全項目をダブルクォートで囲む。
    const csv = [head, ...body].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      await navigator.clipboard.writeText(csv);
      onToast('CSVをコピーしました');
    } catch {
      onToast('コピーに失敗しました');
    }
  };

  const th = 'px-2 py-2 text-right font-bold whitespace-nowrap cursor-pointer select-none hover:text-pink-600';
  const td = 'px-2 py-2 text-right tabular-nums whitespace-nowrap';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 sm:p-6">
      <p className="text-xs text-slate-500 leading-relaxed mb-4">
        一覧カード・バナーの表示回数（インプレッション）、店舗・セラピストページの閲覧数（PV）、
        店舗詳細の「電話をする」「LINE予約」「ネット予約」のクリック数を店舗別に集計します。
        いずれも<strong className="text-slate-700">同じ人のセッション中は1回</strong>として数えるため、
        表示 → 詳細PV → 送客 のファネルが比率として読めます（CTR = PV合計 ÷ 表示計、送客率 = 送客計 ÷ PV合計）。
        期間は月曜はじまりの週単位です（「今週」は今日までの途中経過）。
      </p>

      {/* 期間切替 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriod(p.key)}
            aria-pressed={period === p.key}
            className={`px-4 py-1.5 rounded-full border text-xs font-bold transition-colors ${
              period === p.key
                ? 'bg-pink-50 text-pink-600 border-pink-300'
                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            {p.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={copyCsv}
          disabled={loading || sorted.length === 0}
          className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors disabled:opacity-40"
        >
          CSVをコピー
        </button>
      </div>

      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="店舗名・エリアで絞り込み"
        className="w-full sm:w-72 mb-3 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
      />

      {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400 py-10 text-center">読み込み中…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">該当する店舗がありません</p>
      ) : (
        // 列が多いので横スクロール。店舗名列は sticky で残す。
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="min-w-[1000px] w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200">
                <th
                  className="px-2 py-2 text-left font-bold whitespace-nowrap cursor-pointer select-none hover:text-pink-600 sticky left-0 bg-white"
                  onClick={() => toggleSort('name')}
                >
                  店舗名<Arrow active={sortKey === 'name'} desc={desc} />
                </th>
                {/* 表示（インプレッション）→ PV → 送客 のファネル順に並べる */}
                <th className={th} onClick={() => toggleSort('impCard')}>ｶｰﾄﾞ表示<Arrow active={sortKey === 'impCard'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('impTher')}>ｾﾗﾋﾟ表示<Arrow active={sortKey === 'impTher'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('impBanner')}>ﾊﾞﾅｰ表示<Arrow active={sortKey === 'impBanner'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('impTotal')}>表示計<Arrow active={sortKey === 'impTotal'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('pvSalon')}>店舗PV<Arrow active={sortKey === 'pvSalon'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('pvTherapist')}>セラピPV<Arrow active={sortKey === 'pvTherapist'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('pvTotal')}>PV合計<Arrow active={sortKey === 'pvTotal'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('ctr')}>CTR<Arrow active={sortKey === 'ctr'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('tel')}>電話<Arrow active={sortKey === 'tel'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('line')}>LINE<Arrow active={sortKey === 'line'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('book')}>予約<Arrow active={sortKey === 'book'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('actions')}>送客計<Arrow active={sortKey === 'actions'} desc={desc} /></th>
                <th className={th} onClick={() => toggleSort('rate')}>送客率<Arrow active={sortKey === 'rate'} desc={desc} /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-2 py-2 text-left sticky left-0 bg-white">
                    <a href={`/salon/${r.id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-700 hover:text-pink-600">
                      {r.name}
                    </a>
                    {r.hidden && <span className="ml-1 text-[9px] text-slate-400">(非表示)</span>}
                    <span className="block text-[10px] text-slate-400">{areaLabel(r.area)}</span>
                  </td>
                  <td className={`${td} text-slate-500`}>{r.impCard.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.impTher.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.impBanner.toLocaleString()}</td>
                  <td className={`${td} font-bold text-slate-700`}>{r.impTotal.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.pvSalon.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.pvTherapist.toLocaleString()}</td>
                  <td className={`${td} font-bold text-slate-700`}>{r.pvTotal.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.impTotal > 0 ? `${(r.ctr * 100).toFixed(1)}%` : '-'}</td>
                  <td className={`${td} text-slate-500`}>{r.tel.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.line.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.book.toLocaleString()}</td>
                  <td className={`${td} font-bold text-pink-600`}>{r.actions.toLocaleString()}</td>
                  <td className={`${td} text-slate-500`}>{r.pvTotal > 0 ? `${(r.rate * 100).toFixed(1)}%` : '-'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-slate-700">
                <td className="px-2 py-2 text-left sticky left-0 bg-white">合計（{sorted.length}店）</td>
                <td className={td}>{totals.impCard.toLocaleString()}</td>
                <td className={td}>{totals.impTher.toLocaleString()}</td>
                <td className={td}>{totals.impBanner.toLocaleString()}</td>
                <td className={td}>{totals.impTotal.toLocaleString()}</td>
                <td className={td}>{totals.pvSalon.toLocaleString()}</td>
                <td className={td}>{totals.pvTherapist.toLocaleString()}</td>
                <td className={td}>{totals.pvTotal.toLocaleString()}</td>
                <td className={td}>
                  {totals.impTotal > 0 ? `${((totals.pvTotal / totals.impTotal) * 100).toFixed(1)}%` : '-'}
                </td>
                <td className={td}>{totals.tel.toLocaleString()}</td>
                <td className={td}>{totals.line.toLocaleString()}</td>
                <td className={td}>{totals.book.toLocaleString()}</td>
                <td className={`${td} text-pink-600`}>{totals.actions.toLocaleString()}</td>
                <td className={td}>
                  {totals.pvTotal > 0 ? `${((totals.actions / totals.pvTotal) * 100).toFixed(1)}%` : '-'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
        ※ 送客アクション・表示回数の記録は 2026-08-06 開始です。それ以前の期間を選ぶとこれらの列は 0 になります。<br />
        ※ 表示回数は一覧カード/バナーが画面に50%以上見えた時点で1件（画面外・スクロール前は数えません）。
        カード表示=TOP/地域の店舗カード、セラピ表示=セラピストカード（所属店に合算）、
        バナー表示=ピックアップ店舗スライダー・おすすめ店舗バナー。セラピストピックアップ枠は店舗IDを持たないため対象外です。<br />
        ※ CTR（PV合計 ÷ 表示計）は参考値です。PVには検索・SNSなどからの直接流入も含まれます。<br />
        ※ 電話は確認ポップアップの「電話をかける」を押した時点で1件です（ボタンを開いただけでは数えません）。<br />
        ※ ネット予約は予約ページへ進んだ数で、予約完了数ではありません。
      </p>
    </div>
  );
}
