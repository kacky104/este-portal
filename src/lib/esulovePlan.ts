// エステラブへ送る出勤の計画（第79便・純粋関数）。
//
// ★★★ 判断はここに集める。通信もDBも触らない。★ workPlan.ts（駅ちか）と同じ位置づけ。
//   呼び出し側は「名簿」と「フクエスの出勤」を読んで渡し、返ってきたとおりに送るだけ。
//
// ★★★ この版では【新規登録をしない】。
//   §4「新人登録を先にやらない。登録は人を増やす＝失敗すると重複掲載を自分で作る（禁則269）」。
//   ★ ㉟ で分かったとおり、エステラブは同名でもう一度登録すると黙って2人になる。
//     ★ その状態で登録を自動化するのは、いちばん危ない順番。
//   → 向こうに **ちょうど1人いる人だけ** に出勤を送る。居ない人は【送らずに名前を出す】。
//
// ★★★ もう1つ、この版でやらないこと：**休みを送らない**。
//   駅ちかは「全員×7日を丸ごと上書き」なので、休みも自動で反映された。
//   ★ エステラブは1行ずつ送る形なので、**休みにした日を送らないと向こうに残る**。
//   ★ 空の時刻で送れば消えるかもしれないが、**確かめていない**（実データで試していない）。
//   → いまは「出勤がある日だけ送る」＝増やす方向だけ。★ 減らす方向は人の手。
//     ★ そのことを summary で必ず言う。黙って片方向だけ動かさない。

import { planRosterWrite, blockedMessage, type MediaRosterEntry } from './mediaMatch';
import { toEsuloveShift, buildEsuloveWorkBody, type EsuloveWorkRow } from './esuloveWork';

/** フクエス側の1人1日ぶん。★ workPlan.ts の FukuesShift と同じ形 */
export type EsuloveShiftInput = {
  therapistId: number;
  /** 'YYYY-MM-DD'（営業日） */
  dateISO: string;
  active: boolean;
  /** 'HH:MM'。★ 素の時刻（03:00 のまま） */
  start: string | null;
  end: string | null;
};

export type EsuloveBlocked = {
  therapistId: number;
  name: string;
  /** 'ambiguous' 同名が2人以上 / 'unknown' 名簿が読めていない / 'not_registered' 向こうに居ない */
  reason: 'ambiguous' | 'unknown' | 'not_registered';
  message: string;
};

export type EsulovePlan = {
  /** 送る中身。★ 0件のこともある */
  rows: EsuloveWorkRow[];
  /** ★ 送らない人。必ず画面に出すこと。黙って飛ばさない */
  blocked: EsuloveBlocked[];
  /** 時刻を寄せた・送れなかった枠の理由。★ これも必ず出す */
  notes: string[];
  /** 送ってよいか。★ false のときは1件も送らない */
  ok: boolean;
  /** そのまま画面に出す1行 */
  summary: string;
};

/**
 * 送る中身を決める。
 *
 * @param roster 媒体側の名簿。★ null は【読めていない】。空配列（0人）とは別物
 */
// ★ shopId は受け取らない。★ ここは「誰に何を送るか」を決めるだけで、店舗IDは使わない。
//   使わない入力を受け取ると「渡せば効く」と誤解される。★ 店舗IDは esulovePlanBody で渡す。
export function planEsuloveWork(input: {
  roster: readonly MediaRosterEntry[] | null;
  therapists: ReadonlyArray<{ therapistId: number; name: string }>;
  shifts: readonly EsuloveShiftInput[];
}): EsulovePlan {
  const blocked: EsuloveBlocked[] = [];
  const notes: string[] = [];
  const rows: EsuloveWorkRow[] = [];

  // ★★ 名簿が読めていないときは【1件も送らない】。
  //   読めていないのに送ると、誰に送っているのか分からないまま書き込むことになる
  if (input.roster === null) {
    return {
      rows: [],
      blocked: input.therapists.map((t) => ({
        therapistId: t.therapistId,
        name: t.name,
        reason: 'unknown' as const,
        message: blockedMessage({ name: t.name, reason: 'unknown', castIds: [] }),
      })),
      notes: [],
      ok: false,
      summary: 'エステラブの名簿を読み取れなかったため、1件も送っていません',
    };
  }

  const match = planRosterWrite(input.roster, input.therapists.map((t) => ({ therapistId: t.therapistId, name: t.name })));

  // ★ 突き合わせで止まった人（同名2人以上／読めていない）
  for (const b of match.blocked) {
    blocked.push({
      therapistId: b.therapistId,
      name: b.name,
      reason: b.reason,
      message: blockedMessage({ name: b.name, reason: b.reason, castIds: b.castIds }),
    });
  }

  // ★★★ 向こうに居ない人は【登録しない】（§4・禁則269）。★ 送らずに名前を出す
  for (const t of match.toRegister) {
    blocked.push({
      therapistId: t.therapistId,
      name: t.name,
      reason: 'not_registered',
      message:
        t.name + 'さんは、エステラブにまだ登録されていないため送っていません。' +
        'エステラブの管理画面で登録してください（こちらからの自動登録はしていません）',
    });
  }

  // ★ 向こうにちょうど1人いる人だけ、出勤を送る
  const castIdOf = new Map<number, string>();
  for (const u of match.toUse) castIdOf.set(u.therapistId, u.castId);
  const nameOf = new Map<number, string>();
  for (const t of input.therapists) nameOf.set(t.therapistId, t.name);

  for (const sh of input.shifts) {
    const castId = castIdOf.get(sh.therapistId);
    if (castId === undefined) continue;              // ★ 送らない人。理由は blocked に出ている
    // ★★ 休みは送らない（この版）。★ 向こうに残ることを summary で言う
    if (!sh.active || !sh.start || !sh.end) continue;

    const conv = toEsuloveShift({ dateISO: sh.dateISO, start: sh.start, end: sh.end });
    if (!conv.ok) {
      // ★ 送れなかった枠は黙って捨てない。誰のどの日かを言う
      notes.push((nameOf.get(sh.therapistId) ?? String(sh.therapistId)) + ' ' + sh.dateISO + '（' + conv.reason + '）');
      continue;
    }
    if (conv.snappedNote) {
      notes.push((nameOf.get(sh.therapistId) ?? String(sh.therapistId)) + ' ' + sh.dateISO + '（' + conv.snappedNote + '）');
    }
    rows.push({ castId, day: conv.day, start: conv.start, end: conv.end, existingId: null });
  }

  return {
    rows,
    blocked,
    notes,
    ok: rows.length > 0,
    summary: buildSummary(rows, blocked, notes),
  };
}

function buildSummary(rows: EsuloveWorkRow[], blocked: EsuloveBlocked[], notes: string[]): string {
  if (rows.length === 0) {
    // ★ 0件のときに「変更なし」と言わない。なぜ0件かを言う
    if (blocked.length > 0) return 'エステラブへ送れる出勤がありません（' + blocked.length + '人は送れません）';
    return 'エステラブへ送る出勤がありません';
  }
  const people = new Set(rows.map((r) => r.castId)).size;
  const days = new Set(rows.map((r) => r.day)).size;
  const parts = [people + '人 / ' + days + '日ぶん（' + rows.length + '枠）を送ります'];
  if (blocked.length > 0) parts.push('★ ' + blocked.length + '人は送りません');
  if (notes.length > 0) parts.push('★ ' + notes.length + '件は時刻を寄せた／送れませんでした');
  // ★★ 片方向であることを必ず言う。黙って「反映しました」と言わない
  parts.push('※ 出勤のある日だけを送ります。お休みにした日はエステラブ側に残ります');
  return parts.join(' / ');
}

/** 送る中身を、POST の形にする。★ ok が false のときは呼ばないこと。 */
export function esulovePlanBody(plan: EsulovePlan, shopId: string): Record<string, string> {
  if (!plan.ok || plan.rows.length === 0) return {};
  return buildEsuloveWorkBody(shopId, plan.rows);
}
