'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MEDIA_SITES } from '@/lib/mediaSites';
import { providerLabel } from '@/lib/mediaAudit';
import {
  sortLogRows,
  filterLogRows,
  hasLogFilter,
  logTally,
  logEmptyReason,
  logEmptyMessage,
  siteOnlyFilter,
  outcomeTone,
  outcomeLabel,
  nextLogLimit,
  LOG_LIMIT_STEPS,
  EMPTY_LOG_FILTER,
  type MediaLogRow,
  type LogFilter,
} from '@/lib/mediaLogView';
import { getMediaAuditRows } from '@/app/actions/mediaCredentials';

// 連携の記録（第64便・㉞ その6）。
//
// ★★ 4サイトになったので「どこへ」が要る。全部入りの履歴には媒体の列が無かった
//   （駅ちかしか無かったので要らなかった）。
//
// ★★★ 並べ替えない。失敗を上に上げない（設計メモ §201）。
//   記録は起きた順に読むもの。並べ替えると「ログインできなかった → だから送れなかった」
//   という順番が消える。★ 代わりに失敗の件数を上に出し、失敗だけに絞れるようにする。
//
// ★ 判定は src/lib/mediaLogView.ts（純粋関数）。ここは値を集めて並べるだけ。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

const fmt = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
};

const TONE_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  bad: 'bg-rose-500',
  warn: 'bg-amber-500',
  unknown: 'bg-slate-300',
};
const TONE_TEXT: Record<string, string> = {
  ok: 'text-emerald-700',
  bad: 'text-rose-600',
  warn: 'text-amber-700',
  unknown: 'text-slate-400',
};

function Pills({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: Array<{ v: string; t: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-bold text-slate-400 w-9 flex-none">{label}</span>
      <div className="flex gap-1.5 flex-wrap">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`px-2.5 py-1 border text-[11.5px] font-bold transition-colors ${
              value === o.v
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
            }`}
          >
            {o.t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LogBoard({ salonId }: { salonId: number | null }) {
  const [rows, setRows] = useState<MediaLogRow[]>([]);
  /** ★ 読めたか。★ false のあいだ「記録がありません」と書かない */
  const [known, setKnown] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [limit, setLimit] = useState<number>(LOG_LIMIT_STEPS[0]);
  const [filter, setFilter] = useState<LogFilter>(EMPTY_LOG_FILTER);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const res = await getMediaAuditRows({ salonId, limit });
    if (res.ok) {
      setRows(res.data as MediaLogRow[]);
      setKnown(true);
      setLoadError('');
    } else {
      setKnown(false);
      setLoadError(res.error);
    }
  }, [salonId, limit]);

  useEffect(() => { void load(); }, [load]);

  const sorted = useMemo(() => sortLogRows(rows), [rows]);
  const shown = useMemo(() => filterLogRows(sorted, filter), [sorted, filter]);
  // ★★ 上の数はサイトだけで絞る（§205）。結果の絞り込みは一覧にだけ効かせる。
  //   ★ そうしないと「うまくいかなかったもの」を選んだとき、2つの数が同じ値になる。
  const forTally = useMemo(() => filterLogRows(sorted, siteOnlyFilter(filter)), [sorted, filter]);
  const tally = logTally({ known, rows: forTally });

  const reason = logEmptyReason({ known, filter, totalBeforeFilter: sorted.length });
  const filteredSiteName = filter.provider === '' ? '' : providerLabel(filter.provider);
  const more = nextLogLimit(limit);

  return (
    <div className="space-y-3">
      {/* ── この画面は何か ── */}
      <div className={`${CARD} p-4`}>
        <p className="text-[12.5px] text-slate-500 leading-relaxed">
          フクエスが各サイトに対して行ったことの記録です。
          <b className="text-slate-700">あとから書き換えられません。</b>
          <br />
          {/* ★ 並べ替えないことを、店舗に対しても書く。理由といっしょに */}
          起きた順（新しいものが上）に並んでいます。うまくいかなかったものも、順番のまま残します。
        </p>
      </div>

      {/* ── 数 ── */}
      <div className={`${CARD} grid grid-cols-2`}>
        <div className="px-3 py-2.5 border-r border-slate-200">
          <div className="text-[10.5px] font-bold text-slate-400">
            {filter.provider === '' ? '記録' : `${providerLabel(filter.provider)}の記録`}
          </div>
          <div className="text-[19px] font-black tabular-nums text-slate-800">
            {/* ★★ 読めていなければ 0 ではなく「—」 */}
            {tally === null ? '—' : tally.total}
            {tally !== null && <span className="text-[11.5px] font-bold text-slate-400 ml-0.5">件</span>}
          </div>
        </div>
        <div className="px-3 py-2.5">
          <div className="text-[10.5px] font-bold text-slate-400">うまくいかなかったもの</div>
          <div className={`text-[19px] font-black tabular-nums ${tally && tally.failed > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
            {tally === null ? '—' : tally.failed}
            {tally !== null && <span className="text-[11.5px] font-bold text-slate-400 ml-0.5">件</span>}
          </div>
        </div>
      </div>

      {/* ── 絞り込み ── */}
      <div className={`${CARD} p-3.5 space-y-2.5`}>
        <Pills
          label="サイト"
          value={filter.provider}
          onChange={(v) => setFilter((f) => ({ ...f, provider: v }))}
          options={[
            { v: '', t: 'すべて' },
            // ★★ 記録が1件も無いサイトも選べるようにする。
            //   ★ 選べないと「まだ動いていない」ことを確かめられない
            ...MEDIA_SITES.map((s) => ({ v: s.provider, t: s.name })),
          ]}
        />
        <Pills
          label="結果"
          value={filter.outcome}
          onChange={(v) => setFilter((f) => ({ ...f, outcome: v }))}
          options={[
            { v: '', t: 'すべて' },
            { v: 'ok', t: 'できたもの' },
            { v: 'failed', t: 'うまくいかなかったもの' },
          ]}
        />
        {hasLogFilter(filter) && (
          <button
            type="button"
            onClick={() => setFilter(EMPTY_LOG_FILTER)}
            className="text-[11.5px] font-bold text-indigo-700 hover:underline"
          >
            絞り込みを外す
          </button>
        )}
      </div>

      {loadError && (
        <p className="text-[12px] text-rose-600 leading-relaxed px-1">
          記録を読み込めませんでした：{loadError}
          <br />
          記録が無いのか読めていないのかが分からないため、この画面では件数を「—」にしています。
        </p>
      )}

      {/* ── 記録 ── */}
      <div className={`${CARD} p-4`}>
        {shown.length === 0 ? (
          <p className="text-[12px] text-slate-400 leading-relaxed">
            {logEmptyMessage(reason, filteredSiteName)}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => {
              const tone = outcomeTone(r.outcome);
              return (
                <li key={r.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-2.5">
                  <span
                    className={`mt-1.5 w-1.5 h-1.5 flex-none ${TONE_DOT[tone]}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-slate-400 tabular-nums">{fmt(r.createdAt)}</span>
                      {/* ★★ 4サイトになったので、どこへの記録かを毎行に出す */}
                      <span className="text-[11px] font-bold px-1.5 border border-slate-200 text-slate-500">
                        {providerLabel(r.provider)}（枠{r.slot}）
                      </span>
                      <span className={`text-[11px] font-bold ${TONE_TEXT[tone]}`}>
                        {outcomeLabel(r.outcome)}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-600 leading-relaxed mt-0.5">{r.summary}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── もっと見る ── */}
      {known && sorted.length >= limit && (
        <div className="text-center">
          {more === null ? (
            <p className="text-[11.5px] text-slate-400">
              直近{limit}件まで表示しています。これより古い記録はこの画面には出しません。
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setLimit(more)}
              className="px-4 py-2 border border-slate-300 bg-white text-[12px] font-bold text-slate-600 hover:bg-slate-50"
            >
              もっと見る（{more}件まで）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
