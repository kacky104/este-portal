// 店舗別の「表示 → PV → 送客」ファネル集計の共通ロジック（2026-08-06）。
//
// 元は SalonStatsManager.tsx のローカル実装。月次レポート（SalonMonthlyReport.tsx）でも
// 同じ数字を使うため共有化した。**集計の定義を変えるときはここだけを直す**。
//
// 3つのデータを店舗ごとに突き合わせる。
//   ・インプレ … salon_impression_daily（日単位・JST）。一覧カード/バナーが画面に50%見えた回数
//                （ImpressionMark.tsx）。面別: card=店舗カード / therapist=セラピストカード / banner=店舗バナー。
//   ・PV       … page_view_weekly（週単位・月曜JST起点）。詳細ページの PageViewLogger が加算。
//                店舗ページのPVと、その店に所属するセラピスト詳細ページのPV合計を別々に持つ。
//   ・送客     … salon_action_daily（日単位・JST）。詳細ページの3ボタンのクリック。
//
// インプレ・PV・送客はすべて「同一セッションで1回」の人数ベースなので、
//   インプレ（一覧で見えた）→ PV（詳細を開いた）→ 送客（電話・予約した）
// のファネルが比率として読める。
//
// 取得は全件ページング（fetchAllRows）。店舗数×セラピスト数×週数で1000行を軽く超えるため。

import { createClient } from '@/app/lib/supabase/client';
import { fetchAllRows } from '@/app/lib/fetchAllRows';

const supabase = createClient();

// ── 日付ユーティリティ（すべて JST の暦日を 'YYYY-MM-DD' 文字列で扱う） ──
// Date のローカルタイムゾーンに依存しないよう、計算は UTC メソッドだけで行う。

/** 今日（JST）を 'YYYY-MM-DD' で返す。 */
export function jstTodayYmd(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' に n 日足す（負数可）。 */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** その日を含む週の月曜（page_view_weekly.week_start と同じ定義）。 */
export function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const diff = (d.getUTCDay() + 6) % 7; // 月曜=0, 日曜=6
  return addDays(ymd, -diff);
}

/** 'YYYY-MM-DD' → 'M/D'（画面表示用）。 */
export function shortYmd(ymd: string): string {
  const [, m, d] = ymd.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * 「◯月度」の期間（週の月曜が対象月に属する週の集合）。
 *
 * PV が週単位（月曜起点）でしか残っていないため、暦月ちょうどでは切れない。
 * そこで **週の月曜日が属する月をその週の月とする**。こうすると
 * どの週も必ず1つの月にだけ属し、月をまたいだ二重計上も抜けも起きない。
 * 例）2026年8月度 = 8/3(月)〜8/30(日) の4週間。
 *
 * 当月を選んだときは to を今日で止める（途中経過）。
 */
export function resolveMonth(ym: string): { weeks: string[]; from: string; to: string; end: string } {
  const first = `${ym}-01`;
  // 1日を含む週の月曜が前月なら、翌週の月曜がこの月の最初の週になる。
  let mon = mondayOf(first);
  if (mon < first) mon = addDays(mon, 7);
  const weeks: string[] = [];
  while (mon.slice(0, 7) === ym) {
    weeks.push(mon);
    mon = addDays(mon, 7);
  }
  const from = weeks[0];
  const end = addDays(weeks[weeks.length - 1], 6); // 期間の終わり（日曜）
  const today = jstTodayYmd();
  return { weeks, from, to: end > today ? today : end, end };
}

/** ym('YYYY-MM') に n ヶ月足す。 */
export function addMonths(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + n;
  const ny = y + Math.floor(m / 12);
  const nm = ((m % 12) + 12) % 12;
  return `${ny}-${String(nm + 1).padStart(2, '0')}`;
}

export type SalonStatRow = {
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
  rate: number;       // 送客計 ÷ PV合計（PV0なら0）
};

/** 集計対象の期間。weeks=null / from=null / to=null は「全期間」。 */
export type StatsRange = { weeks: string[] | null; from: string | null; to: string | null };

/**
 * 指定期間の店舗別ファネルを集計して返す（非表示店舗も含む全店）。
 * 失敗時は例外を投げる（呼び出し側で握って画面にメッセージを出す）。
 */
export async function fetchSalonStats({ weeks, from, to }: StatsRange): Promise<SalonStatRow[]> {
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

  return salons.map((s) => {
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
  });
}
