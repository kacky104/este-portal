// フクエスの出勤 → 駅ちかの出勤フォームへの「計画」を立てる（第43便・純粋関数）。
//
// ★★★ このファイルは通信もDBも触らない。入力は全部引数で受ける。
//   理由は relayFlow.ts と同じ:【判断は、固定して見返せる形に置く】。
//
// ★★★ この便の射程 —— **試し打ちまで。駅ちかへは1文字も送らない。**
//   設計メモ §11-3:「切り替え直後の1回目は、必ず試し打ち（差分を見せる）→ 人が承認」。
//   だからこのファイルの出口は「送るもの」ではなく「送るとこうなる、という計画」。
//
// ★★★ 出勤フォームには【部分更新の口が無い】（第38便 §17-3）。
//   送った内容がその店の7日ぶん全部になる。だから:
//     ・読んだ全員をそのまま返す（フクエスが知らない子も、読んだ値のまま）
//     ・「触らない」は選べない。**送らないか、全部送るか**の二択
//   → 危ないのは【消える方向】だけ。この計画は消える方向に厚く見張る。
//
// ★★ 静かにこぼさない（第37便「送ったつもりを作らない」）。
//   送れなかったもの・送らなかったものは、必ず notes / blockers に理由つきで出す。

import {
  WORK_DAYS,
  PHP_MAX_INPUT_VARS_DEFAULT,
  applyChanges,
  buildPayload,
  countWorkingByDay,
  ekichikaTimeToMinutes,
  isoToDateLabelPrefix,
  minutesToEkichikaTime,
  type GirlWork,
  type WorkCell,
  type WorkChange,
  type WorkPage,
} from './ekichikaWorkParse';

/** フクエス側の1人1日ぶんの出勤。therapist_schedules の1行に対応する。 */
export type FukuesShift = {
  therapistId: number;
  /** 'YYYY-MM-DD' */
  dateISO: string;
  active: boolean;
  /** 'HH:MM'。★ 日跨ぎでも素の時刻（03:00 のまま。駅ちかの 27:00 表記ではない） */
  start: string | null;
  end: string | null;
};

export type PlanIssue = {
  kind:
    | 'date_shifted'          // 駅ちかの先頭がこちらの今日ではない（深夜またぎ）
    | 'no_schedule'           // フクエス側に7日ぶんの出勤が1件も無い
    | 'shrink_too_much'       // 出勤が大きく減る方向の差
    | 'time_not_selectable'   // 駅ちかのプルダウンに無い時刻
    | 'too_many_fields'       // max_input_vars を超える
    | 'unmapped_therapist'    // この枠での castId が無い＝駅ちかに出せない
    | 'unknown_girl'          // 駅ちかに居てフクエスに居ない＝読んだまま返す
    | 'missing_row_as_rest';  // フクエスに行が無い日を「休み」として扱った
  detail: string;
  /** 人が読む用。件数だけ入れる（名前やURLを監査ログに流さないため） */
  count?: number;
};

export type WorkDiff = {
  girlId: string;
  name: string;
  dayIndex: number;
  before: string;
  after: string;
};

export type WorkPlan = {
  /** blockers が空なら「このまま送れる」。★ 送るかどうかを決めるのは人（第43便では送らない） */
  ok: boolean;
  changes: WorkChange[];
  /** 送るとしたらこの内容（駅ちかの全員ぶん）。verifyAfterWrite に渡すのもこれ */
  sent: GirlWork[];
  fieldCount: number;
  blockers: PlanIssue[];
  notes: PlanIssue[];
  diff: WorkDiff[];
  countsBefore: number[];
  countsAfter: number[];
};

// ───────────────────────────── 見張りの閾値 ─────────────────────────────

/**
 * ★★★ 1日ぶんの出勤が、これ以上の割合で減るなら止める。
 *   取り込み側の掃除（IMPORT_SWEEP）が使っている 0.3 と同じ値にそろえてある。
 *   ★ 「減る方向だけ」見る。増える方向は事故にならない（誰も消えない）。
 */
export const SHRINK_MAX_RATIO = 0.3;
/** 割合が大きくても、人数が小さいうちは止めない（3人→2人で止めない）。 */
export const SHRINK_MIN_PEOPLE = 3;

// ───────────────────────────── 日付 ─────────────────────────────

/** 'YYYY-MM-DD' に日数を足す。★ タイムゾーンを持ち込まないため UTC で計算する。 */
export function addDaysISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error('ISO日付ではない: ' + JSON.stringify(iso));
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86400000;
  const d = new Date(t);
  return (
    d.getUTCFullYear() +
    '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getUTCDate()).padStart(2, '0')
  );
}

// ───────────────────────────── 時刻の向き直し ─────────────────────────────

/**
 * ★★★ フクエスの終了時刻を、駅ちかの表記に直す。
 *
 *   フクエス … 日跨ぎでも素の時刻（20:00〜03:00）。表示側が「翌」を付けている
 *   駅ちか   … 24時超えの表記（20:00〜27:00）
 *
 * ★ 終了が開始以下なら翌日とみなして +24時間する。
 *   ★ 等しいとき（20:00〜20:00）も翌日扱いにする。0分の勤務は入力ミスの方がありそうだが、
 *     ここで勝手に「0分」と決めるより、24時間として出して人が気づく方が安全…ではない。
 *     → ★ 等しいものは【送らない対象】として呼び出し側に返す（invalid を返す）。
 *       静かに解釈を足さない。
 */
export function toEkichikaEnd(start: string, end: string): { ok: true; value: string } | { ok: false; reason: string } {
  let s: number, e: number;
  try {
    s = ekichikaTimeToMinutes(start);
    e = ekichikaTimeToMinutes(end);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  if (e === s) return { ok: false, reason: '開始と終了が同じ時刻（' + start + '）' };
  const minutes = e > s ? e : e + 24 * 60;
  if (minutes > 47 * 60 + 59) return { ok: false, reason: '終了が遠すぎる（' + start + '〜' + end + '）' };
  return { ok: true, value: minutesToEkichikaTime(minutes) };
}

/** 見た目が違っても同じ時刻か（"27:00" と "27:00"、前ゼロ違いなど）。 */
function sameTime(a: string, b: string): boolean {
  try {
    return ekichikaTimeToMinutes(a) === ekichikaTimeToMinutes(b);
  } catch {
    return a === b;
  }
}

function sameCell(a: WorkCell, b: WorkCell): boolean {
  if (a.work !== b.work) return false;
  if (!a.work) return true; // 休み同士は時刻を比べない（送信時に値が出ないため）
  return sameTime(a.start, b.start) && sameTime(a.end, b.end);
}

function cellLabel(c: WorkCell): string {
  return c.work ? c.start + '〜' + c.end : '休み';
}

// ───────────────────────────── 本体 ─────────────────────────────

export function buildWorkPlan(input: {
  /** 駅ちかから読んだ現在値。★ これが正本の起点 */
  page: WorkPage;
  /** こちらが思っている「今日」（Asia/Tokyo）。'YYYY-MM-DD' */
  todayISO: string;
  /** フクエスの7日ぶんの出勤（行が無い日は「休み」として扱う） */
  shifts: FukuesShift[];
  /** therapist_id → この枠での castId（therapist_media_ids） */
  castIdOf: Map<number, string>;
  /** max_input_vars。分かっていれば店舗の設定値を渡す */
  inputVarLimit?: number;
}): WorkPlan {
  const { page, todayISO, shifts } = input;
  const blockers: PlanIssue[] = [];
  const notes: PlanIssue[] = [];

  // ── 1. 日付の起点が合っているか（深夜またぎ）────────────────────────────
  //   POST に日付は入らない。ずれたまま送ると【1日ずれた出勤】を全員に書く。
  const wantPrefix = isoToDateLabelPrefix(todayISO);
  const gotLabel = page.dateLabels[0] ?? '(なし)';
  if (!gotLabel.startsWith(wantPrefix)) {
    blockers.push({
      kind: 'date_shifted',
      detail: 'こちらの今日=' + wantPrefix + ' / 駅ちかの先頭=' + gotLabel + '（深夜0時をまたいだ可能性）',
    });
  }

  // ── 2. 送れる時刻の集合 ──────────────────────────────────────────────
  const selectable = new Set<number>();
  for (const v of page.timeOptions) {
    try {
      selectable.add(ekichikaTimeToMinutes(v));
    } catch {
      /* 選択肢に時刻でないものが混ざっていても無視する */
    }
  }
  const canSelect = (t: string): boolean => {
    if (selectable.size === 0) return true; // 読めていないなら、この見張りは効かせない
    try {
      return selectable.has(ekichikaTimeToMinutes(t));
    } catch {
      return false;
    }
  };

  // ── 3. フクエスの出勤を (castId, 日) で引ける形にする ─────────────────
  const dayOfISO = new Map<string, number>();
  for (let d = 0; d < WORK_DAYS; d++) dayOfISO.set(addDaysISO(todayISO, d), d);

  const onPage = new Set(page.girls.map((g) => g.girlId));

  // ★★★ 「送る対象」は【この枠の castId が分かっていて、いま駅ちかの出勤表に居る子】。
  //   ★ 出勤の行があるかどうかで決めない。行が無い＝お休み、であって「対象外」ではない
  //     （部分更新の口が無いので、対象に入れた以上は7日ぶん全部を決める必要がある）。
  const wanted = new Map<string, Array<FukuesShift | null>>(); // castId → 7日
  const notOnPage = new Set<string>();
  for (const [, castId] of input.castIdOf) {
    if (!onPage.has(castId)) {
      notOnPage.add(castId);
      continue;
    }
    if (!wanted.has(castId)) wanted.set(castId, Array.from({ length: WORK_DAYS }, () => null));
  }

  const unmapped = new Set<number>();
  for (const sh of shifts) {
    const castId = input.castIdOf.get(sh.therapistId);
    if (!castId) {
      unmapped.add(sh.therapistId);   // フクエスに居るが、この枠の番号が無い
      continue;
    }
    const row = wanted.get(castId);
    if (!row) continue;               // 駅ちかの出勤表に居ない。notOnPage で報告済み
    const d = dayOfISO.get(sh.dateISO);
    if (d === undefined) continue;    // 7日窓の外。送る対象ではない
    row[d] = sh;
  }

  if (unmapped.size > 0) {
    notes.push({
      kind: 'unmapped_therapist',
      count: unmapped.size,
      detail:
        unmapped.size +
        '名は、この掲載枠での駅ちかの番号（castId）が分からないため駅ちかへ出せません。' +
        '駅ちか側にその方が載っていない可能性があります',
    });
  }
  if (notOnPage.size > 0) {
    notes.push({
      kind: 'unmapped_therapist',
      count: notOnPage.size,
      detail: notOnPage.size + '名は番号は分かりますが、いま駅ちかの出勤表に居ないため触れません',
    });
  }

  // ★ 「フクエスの出勤が1件も無い」は【休み全員】ではない。まだ入れていないだけかもしれない。
  //   ここで送ると駅ちかの出勤が全部消える（設計メモ §11-3）。
  const activeCount = shifts.filter((s) => s.active).length;
  if (activeCount === 0) {
    blockers.push({
      kind: 'no_schedule',
      detail:
        'フクエス側に、この7日ぶんの出勤が1件も入っていません。' +
        '0件を「全員お休み」として送ると駅ちかの出勤が消えるため、送りません',
    });
  }

  // ── 4. 1人1日ずつ、送りたい中身を決める ───────────────────────────────
  const changes: WorkChange[] = [];
  const diff: WorkDiff[] = [];
  let missingRowAsRest = 0;
  const notSelectable: string[] = [];

  for (const g of page.girls) {
    const row = wanted.get(g.girlId);
    if (!row) continue; // フクエスが知らない子。★ 読んだまま返す（applyChanges が現在値を保つ）

    for (let d = 0; d < WORK_DAYS; d++) {
      const current = g.days[d];
      const sh = row[d];

      let next: WorkCell;
      if (sh && sh.active && sh.start && sh.end) {
        const end = toEkichikaEnd(sh.start, sh.end);
        if (!end.ok) {
          notSelectable.push(g.girlId + '/日' + d + '（' + end.reason + '）');
          continue; // ★ 解釈できない時刻は触らない。現在値のまま
        }
        if (!canSelect(sh.start) || !canSelect(end.value)) {
          notSelectable.push(g.girlId + '/日' + d + '（' + sh.start + '〜' + end.value + '）');
          continue; // ★ プルダウンに無い＝送っても何が起きるか分からない。触らない
        }
        next = { start: sh.start, end: end.value, work: true };
      } else {
        // 休み。★ 時刻は現在値のまま残す（work_flg を出さないだけ）
        if (!sh) missingRowAsRest += 1;
        next = { start: current.start, end: current.end, work: false };
      }

      if (sameCell(current, next)) continue;
      changes.push({ girlId: g.girlId, dayIndex: d, cell: next });
      diff.push({
        girlId: g.girlId,
        name: g.name,
        dayIndex: d,
        before: cellLabel(current),
        after: cellLabel(next),
      });
    }
  }

  if (notSelectable.length > 0) {
    blockers.push({
      kind: 'time_not_selectable',
      count: notSelectable.length,
      detail:
        notSelectable.length +
        '件、駅ちかの選択肢に無い時刻がありました。' +
        '送っても何が起きるか分からないため、その枠は触らずに止めます',
    });
  }
  if (missingRowAsRest > 0) {
    notes.push({
      kind: 'missing_row_as_rest',
      count: missingRowAsRest,
      detail:
        missingRowAsRest +
        '件は、フクエス側に入力が無い日のため「お休み」として扱いました' +
        '（駅ちかは部分更新ができないため、入力が無い＝お休みになります）',
    });
  }

  // ── 5. 送るとどうなるか ────────────────────────────────────────────────
  let sent: GirlWork[];
  try {
    sent = applyChanges(page, changes);
  } catch (e) {
    // ★ ここへ来るのは枠の取り違え。計画そのものが成り立たない
    return {
      ok: false,
      changes,
      sent: page.girls,
      fieldCount: 0,
      blockers: [...blockers, { kind: 'unknown_girl', detail: (e as Error).message.slice(0, 200) }],
      notes,
      diff,
      countsBefore: countWorkingByDay(page.girls),
      countsAfter: countWorkingByDay(page.girls),
    };
  }

  const countsBefore = countWorkingByDay(page.girls);
  const countsAfter = countWorkingByDay(sent);

  // ★★★ 消える方向の急減を止める。これがこの計画のいちばんの見張り。
  for (let d = 0; d < WORK_DAYS; d++) {
    const before = countsBefore[d] ?? 0;
    const after = countsAfter[d] ?? 0;
    const lost = before - after;
    if (lost <= 0) continue;
    if (lost < SHRINK_MIN_PEOPLE) continue;
    if (lost <= before * SHRINK_MAX_RATIO) continue;
    blockers.push({
      kind: 'shrink_too_much',
      count: lost,
      detail:
        (page.dateLabels[d] ?? '日' + d) +
        ' の出勤が ' +
        before +
        '名 → ' +
        after +
        '名（' +
        lost +
        '名 減）。減り方が大きいので止めました',
    });
  }

  const fields = buildPayload(page, sent);
  const limit = input.inputVarLimit ?? PHP_MAX_INPUT_VARS_DEFAULT;
  if (fields.length > limit) {
    blockers.push({
      kind: 'too_many_fields',
      count: fields.length,
      detail:
        '送信項目が ' +
        fields.length +
        '件で上限 ' +
        limit +
        '件を超えます。超えた分は相手側で黙って捨てられ、出勤が消えるため送りません',
    });
  }

  // 駅ちかに居てフクエスに居ない子（触らないことを伝える）
  const untouched = page.girls.length - wanted.size;   // ★ wanted ＝ 送る対象の人数
  if (untouched > 0) {
    notes.push({
      kind: 'unknown_girl',
      count: untouched,
      detail: untouched + '名は駅ちかにだけ登録がある方です。読んだ内容をそのままお返しします（変更しません）',
    });
  }

  return {
    ok: blockers.length === 0,
    changes,
    sent,
    fieldCount: fields.length,
    blockers,
    notes,
    diff,
    countsBefore,
    countsAfter,
  };
}

/**
 * 監査ログの detail に入れる形にする。
 * ★ 名前・URL・時刻の羅列を入れない。**件数と、店舗が読める1行だけ。**
 *   （mediaAudit の scrubAuditDetail が落とすが、落とされる前提のものを渡さない）
 */
export function summarizePlan(plan: WorkPlan): {
  detail: Record<string, string | number | boolean | null>;
  summary: string;
} {
  const detail = {
    changes: plan.changes.length,
    people: plan.sent.length,
    fields: plan.fieldCount,
    blockers: plan.blockers.length,
    notes: plan.notes.length,
    sendable: plan.ok,
  };
  if (!plan.ok) {
    return { detail, summary: '駅ちかへの反映を止めました: ' + (plan.blockers[0]?.detail ?? '理由不明') };
  }
  if (plan.changes.length === 0) {
    return { detail, summary: '駅ちかの出勤は、フクエスの内容と既に一致しています（変更はありません）' };
  }
  return {
    detail,
    summary: '駅ちかへ反映できる状態です（変更 ' + plan.changes.length + '件・' + plan.sent.length + '名ぶんを送ります）',
  };
}
