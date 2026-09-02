// フクエスの出勤を、エステラブへ送れる形に直す（第74便・純粋関数）。
//
// ★★★ 実物で確かめた形（2026-08-31・追記48 §258〜§259）
//   POST /admin/shop/therapist_schedule/daily/edit
//     TherapistSchedules[n][id]            既存の出勤行のID（★ 空なら新規）
//     TherapistSchedules[n][shop_id]       37865
//     TherapistSchedules[n][therapist_id]  696450（媒体側のセラピストID）
//     TherapistSchedules[n][day]           20260831
//     TherapistSchedules[n][start_time]    600 … 3000
//     TherapistSchedules[n][end_time]      同上
//   ★ n を1つだけ入れれば、1人・1日だけ保存できる。★ 全件上書きにしない（§11-3 の事故を避ける）。
//
// ★★★ 値は「時×100＋分」。★ 範囲は 600（6:00）〜3000（翌6:00）。30分刻み。
//   → **エステラブの出勤も「朝6時始まり」だった。**
//     フクエスの営業日（dutyStatus.ts の DAY_START_HOUR = 6）と**一致する**。
//     ★ だから【日をずらす計算が要らない】。schedule_date をそのまま day にできる。
//
// ★★ 深夜の書き方だけ違う:
//   フクエス   素の時刻（20:00〜03:00）。営業日が6時始まりなので、03:00 は【翌3:00】の意味
//   エステラブ 24時超え（2000〜2700）
//   → 6:00 より前の時刻は +24時間する。★ ここを間違えると、丸1日ずれた枠を送る。
//
// ★ 30分刻みへの寄せは timeSnap.ts を共用する（駅ちかと同じ判断・追記49）。2か所に書かない。

import { snapInward, snapNote, minutesLabel } from './timeSnap';
import { DAY_START_HOUR } from './dutyStatus';

/** エステラブの1日の始まり（分）。★ 6:00。フクエスの営業日と同じ。
 *  ★ 第104便: 数字を自前で持つのをやめ、dutyStatus から借りる（★ 6 を3か所に書かない）。
 *  ★ 駅ちか側（workPlan.toBusinessDayMinutes）も同じ物差し。 */
export const ESULOVE_DAY_START_MIN = DAY_START_HOUR * 60;
/** エステラブの1日の終わり（分）。★ 3000＝翌6:00。 */
export const ESULOVE_DAY_END_MIN = 30 * 60;

/** "HH:MM" → 分（0〜1439）。読めなければ null。★ 推測で埋めない。 */
export function parseClock(t: string): number | null {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * 分 → エステラブの値（"2700" など）。
 * ★ 「時×100＋分」。★ 30分刻みでない値は null（送れる形にならない）。
 */
export function toEsuloveTimeValue(min: number): string | null {
  if (!Number.isFinite(min)) return null;
  if (min < ESULOVE_DAY_START_MIN || min > ESULOVE_DAY_END_MIN) return null;
  if (min % 30 !== 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return String(h * 100 + m);
}

/** 'YYYY-MM-DD' → 'YYYYMMDD'。★ 形が違えば null（勝手に直さない）。 */
export function toEsuloveDay(dateISO: string): string | null {
  if (typeof dateISO !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO.trim());
  return m ? m[1] + m[2] + m[3] : null;
}

export type EsuloveShift =
  | { ok: true; day: string; start: string; end: string; snappedNote: string | null }
  | { ok: false; reason: string };

/**
 * フクエスの1人1日ぶんを、エステラブへ送れる形に直す。
 *
 * ★★★ 日はずらさない。エステラブもフクエスも朝6時始まりなので、営業日がそのまま day になる。
 * ★ 6:00 より前の時刻は「翌」として +24時間する（20:00〜03:00 → 2000〜2700）。
 */
export function toEsuloveShift(input: { dateISO: string; start: string; end: string }): EsuloveShift {
  const day = toEsuloveDay(input.dateISO);
  if (day === null) return { ok: false, reason: '日付の形が読めません（' + input.dateISO + '）' };

  const s0 = parseClock(input.start);
  const e0 = parseClock(input.end);
  if (s0 === null || e0 === null) {
    return { ok: false, reason: '時刻の形が読めません（' + input.start + '〜' + input.end + '）' };
  }
  // ★ 等しいものは解釈しない。24時間勤務と決めつけない（駅ちかと同じ・§157）
  if (s0 === e0) return { ok: false, reason: '開始と終了が同じ時刻（' + input.start + '）' };

  // ★ 営業日は6時始まり。6:00 より前は「翌」の意味
  const s = s0 < ESULOVE_DAY_START_MIN ? s0 + 1440 : s0;
  let e = e0 < ESULOVE_DAY_START_MIN ? e0 + 1440 : e0;
  // ★ それでも終了が開始より後にならなければ、さらに翌日（20:00〜20:00 は上で弾いてある）
  if (e <= s) e += 1440;

  const snapped = snapInward(s, e);
  if (!snapped.ok) return { ok: false, reason: snapped.reason };

  const startValue = toEsuloveTimeValue(snapped.startMin);
  const endValue = toEsuloveTimeValue(snapped.endMin);
  if (startValue === null || endValue === null) {
    // ★ 範囲の外。★ 「送れない」と言い切り、勝手に端へ寄せない
    return {
      ok: false,
      reason:
        'エステラブで選べない時刻です（' + minutesLabel(snapped.startMin) + '〜' + minutesLabel(snapped.endMin) +
        '。エステラブは6:00〜翌6:00まで）',
    };
  }
  return { ok: true, day, start: startValue, end: endValue, snappedNote: snapNote(s, e, snapped) };
}

// ─────────────────────────────────────────────────────────
// 送る中身を組み立てる
// ─────────────────────────────────────────────────────────

export type EsuloveWorkRow = {
  /** 媒体側のセラピストID（mediaMatch の castId） */
  castId: string;
  day: string;
  start: string;
  end: string;
  /** 既存の出勤行のID。★ 無ければ空文字（＝新規）。推測で番号を作らない */
  existingId?: string | null;
};

/**
 * POST の中身を組み立てる。★ 送る行だけを入れる（全件送りにしない）。
 *
 * ★★ 0行のときは空を返す。★ 呼び出し側は空を送らないこと。
 *   空で送ると「全部消す」の意味になりかねない。★ 確かめていないことを試さない。
 */
export function buildEsuloveWorkBody(shopId: string, rows: readonly EsuloveWorkRow[]): Record<string, string> {
  const body: Record<string, string> = {};
  rows.forEach((r, i) => {
    const p = 'TherapistSchedules[' + i + ']';
    body[p + '[id]'] = r.existingId ?? '';
    body[p + '[shop_id]'] = shopId;
    body[p + '[therapist_id]'] = r.castId;
    body[p + '[day]'] = r.day;
    body[p + '[start_time]'] = r.start;
    body[p + '[end_time]'] = r.end;
  });
  return body;
}

/** 送る前に画面へ出す1行。★ 0件のときに「変更なし」と言わない。 */
export function esuloveWorkSummary(rows: readonly EsuloveWorkRow[]): string {
  if (rows.length === 0) return 'エステラブへ送る出勤はありません';
  const days = new Set(rows.map((r) => r.day)).size;
  const people = new Set(rows.map((r) => r.castId)).size;
  return people + '人 / ' + days + '日ぶん（' + rows.length + '枠）をエステラブへ送ります';
}


// ─────────────────────────────────────────────────────────
// 出勤ページから shop_id を読む（第81便）
// ─────────────────────────────────────────────────────────

/**
 * 出勤（日別）のページから、この店の shop_id を読む。
 *
 * ★★★ なぜ人に入力させないか —— カッキー様の指摘「店舗オーナーはここで？になります」
 *   エステラブには「店舗ID」と呼べる値が2つある:
 *     ログインID      shop837865   ← 店舗が知っている値
 *     出勤の shop_id  37865        ← 掲載ページ /shop/37865 の番号
 *   ★ 別物なのに、どちらも「店舗ID」と呼べてしまう。★ 必ず取り違える。
 *   → **こちらが読む。** 出勤ページの hidden にそのまま入っている（実測・§258）。
 *
 * ★ 読めなければ null。★ 「たぶんこれ」で組み立てない（間違った店に書き込む）。
 */
export function readEsuloveShopId(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) return null;
  // name="TherapistSchedules[0][shop_id]" value="37865"（属性の並びは前後どちらでもよい）
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  const found = new Set<string>();
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    if (!/name\s*=\s*["'][^"']*\[shop_id\]["']/.test(tag)) continue;
    const v = /value\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const val = v ? (v[2] ?? v[3] ?? '') : '';
    if (/^\d+$/.test(val)) found.add(val);
  }
  // ★★ 2つ以上あったら、どれが正しいか決められない。★ 決めつけずに null
  if (found.size !== 1) return null;
  return Array.from(found)[0] ?? null;
}
