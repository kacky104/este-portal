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
import { snapInward, snapNote } from './timeSnap';
import { DAY_START_HOUR } from './dutyStatus';

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
    | 'change_too_large'      // ★ 無人のとき限定。作り直し級の差分（第48便）
    | 'time_not_selectable'   // 駅ちかのプルダウンに無い時刻
    | 'time_snapped'          // ★ 30分刻みへ内側に寄せて反映した（第73便）
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
  /**
   * ★★★ 突き合わせた人数（第43便・追い直し）。
   *   「変更0件」には2つの意味がある:
   *     ① 本当に一致している（targets が居て、差が無い）
   *     ② ★ 比べる相手が1人も居なかった（targets が 0）
   *   ★ 件数だけでは区別できず、②を①と読み違える。**0の理由が読み取れる形にする**
   *     （第35便の反省6）。1回目の実データでこれに引っかかった。
   */
  targets: number;
  /** フクエス側で「出勤」になっている行の数（7日ぶん）。0なら no_schedule で止まる */
  activeShifts: number;
  changes: WorkChange[];
  /** 送るとしたらこの内容（駅ちかの全員ぶん）。verifyAfterWrite に渡すのもこれ */
  sent: GirlWork[];
  fieldCount: number;
  blockers: PlanIssue[];
  notes: PlanIssue[];
  diff: WorkDiff[];
  countsBefore: number[];
  countsAfter: number[];
  /**
   * 駅ちかの7日ぶんの日付見出し（"08/28(金)" 形式）。
   * ★ 画面で差分を出すときに dayIndex だけでは「何日の話か」が分からないので一緒に持ち回す。
   *   ★ こちらで日付を組み立て直さない。**駅ちかの画面に出ている文字をそのまま使う。**
   *     組み立て直すと、ずれたときに「こちらの思っている日」を表示してしまう（§1 の逆）。
   */
  dateLabels: string[];
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

/**
 * ★★★ 無人（自動反映）のときの、厳しい方のしきい値（第48便・設計メモ §56）。
 *
 * ★ なぜ変えるのか — 手動と自動では**担保の数が違う**。
 *     手動 … ① 人が見た内容と送る内容が同じ（指紋）＋ ② この見張り
 *     自動 … ★ ①が無い。②だけ
 *   → 担保が1本減るぶん、②を厳しくする。「人が見ているかどうかで強さを変える」。
 *
 * ★★ 数字の根拠は【手動の半分にしただけ】。実データを数日見てから決め直すこと。
 *   ★ 決め打ちであることを、決め打ちのまま忘れないために、ここに書いておく。
 */
export const AUTO_SHRINK_MAX_RATIO = 0.15;
export const AUTO_SHRINK_MIN_PEOPLE = 2;
/**
 * ★ 無人のとき、変更セルが「対象人数 × 7日」の何割を超えたら止めるか。
 *   ★ 作り直し級の差分（名簿の入れ替え・7日窓のずれ等）を、人が見ないまま流さない。
 */
export const AUTO_CHANGE_MAX_RATIO = 0.5;

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
 * ★★★ 駅ちかの時刻プルダウン（2026-08-28 実機で確定・ラビリンス様の管理画面）
 *
 *   件数 60
 *   先頭  value="00:00" 表示"0:00" / "00:30" / "01:00" / "01:30"
 *   末尾  value="28:00" 表示"4:00" / "28:30" / "29:00" / "29:30" 表示"5:30"
 *
 *   ★ **value は24時超え表記。表示だけが素の時刻。**
 *     画面で「3:00」に見えているセルの value は "27:00"。
 *     → こちらの 03:00 → 27:00 の直し方は**正しい**（実機で確定）。
 *   ★ 刻みは【30分】。範囲は 00:00〜29:30（＝翌5:30まで）。
 *
 * ★★ フクエスの入力も【30分刻み】に揃えた（2026-08-31・第75便）。
 *   ★ それ以前に入った15分のデータが残るので、寄せは残す（保険）。
 *   → 20:15 のような時刻は駅ちかの選択肢に無い。翌6:00終わりも無い。
 *   ★★ 2026-08-28 の決定は「丸めない。送らない。理由をつけて画面に出す」だった。
 *   ★★★ 2026-08-31 カッキー様の決定で **「内側に寄せる」に変えた**（第73便・timeSnap.ts）。
 *     変えた理由: エステラブ（同じく30分刻み）を足すときに、寄せる／送らないが媒体ごとに
 *     違うと、同じ出勤が **駅ちかには出ないのにエステラブには出る**。店舗に説明できない。
 *     ★ 揃えるなら、出勤が出ないより出るほうがよい。
 *   ★ 寄せるのは【内側】だけ（開始は遅いほう・終了は早いほう）。実際より長く出さない。
 *   ★ 寄せた件数と中身は notes（time_snapped）に必ず出す。**黙って書き換えない。**
 */

/**
 * ★★★ フクエスの出勤（15分刻み）を、駅ちかへ送れる形（30分刻み・24時超え表記）に直す。
 *   ★ 第73便で追加。★ 寄せた場合は snappedNote に「20:15〜26:45 → 20:30〜26:30」が入る。
 *   ★ 寄せると勤務が無くなる場合は ok:false（送らない。時間を勝手に足さない）。
 */
export function toEkichikaRange(
  start: string,
  end: string,
): { ok: true; start: string; end: string; snappedNote: string | null } | { ok: false; reason: string } {
  const b = toBusinessDayMinutes(start, end);
  if (!b.ok) return b;
  const s = b.startMin;
  const endMin = b.endMin;

  const snapped = snapInward(s, endMin);
  if (!snapped.ok) return { ok: false, reason: snapped.reason };
  return {
    ok: true,
    start: minutesToEkichikaTime(snapped.startMin),
    end: minutesToEkichikaTime(snapped.endMin),
    snappedNote: snapNote(s, endMin, snapped),
  };
}

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
  const b = toBusinessDayMinutes(start, end);
  if (!b.ok) return b;
  return { ok: true, value: minutesToEkichikaTime(b.endMin) };
}

/**
 * ★★★ フクエスの素の時刻（0:00〜23:59）を、駅ちかの【営業日の中の位置】に直す（第104便）。
 *
 * ★★★ なぜ要るか —— §272 の宿題。2026-09-02 に駅ちかの実物で確かめた（ひなこ様・enju）
 *   ```
 *   駅ちかの個人ページ   09/03(木)  翌1:00 ▼ 翌6:00     ★ 開始にも「翌」が付く
 *   フクエス             schedule_date=09/03 / 01:00〜06:00
 *   ```
 *   ★ 駅ちかの1行は【6時始まりの営業日】。★ フクエスも同じ（dutyStatus.ts DAY_START_HOUR=6）。
 *   ★ だから【読む向き】はずれていない（09/03 の行の翌1:00 ＝ 09/04 の 1:00 ＝ フクエスも同じ意味）。
 *   ★★ だが【書く向き】は、01:00 をそのまま "01:00" で送っていた。
 *     駅ちかの 09/03 の行で "01:00" は 09/03 の朝1時（営業日の外）。★ 正しくは "25:00"（翌1:00）。
 *   ★ 一度も送っていないので実害はゼロ。★ 送る前に見つかった。
 *
 * ★★ 物差しはこれ1本。★ toEkichikaRange と toEkichikaEnd の両方がここを通る。
 *   ★ 2つの関数が別々の解釈を持つと、片方だけ直した日に嘘になる。
 *
 * ★ 6:00 より前の開始は【翌】（+24時間）。★ 6:00 ちょうどは当日（境界・§271 と同じ）。
 * ★ 終了は開始より後になるまで +24時間。★ 06:00 終わりは 30:00（翌6:00）になる。
 *   ★ 30:00 が駅ちかの選択肢に無ければ、呼び出し側の canSelect で止まる（第43便の守り）。
 * ★ 24時超えの表記（25:00 など）が【入力】に来たら断る。★ それはフクエスの値ではない。
 *   ★ 通すと、+24 が二重に掛かって丸1日ずれる。
 */
export function toBusinessDayMinutes(
  start: string,
  end: string,
): { ok: true; startMin: number; endMin: number } | { ok: false; reason: string } {
  let s: number, e: number;
  try {
    s = ekichikaTimeToMinutes(start);
    e = ekichikaTimeToMinutes(end);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  // ★ 入力はフクエスの素の時刻。24時超えは受け取らない（+24 が二重に掛かる）
  if (s >= 24 * 60 || e >= 24 * 60) {
    return { ok: false, reason: '24時超えの表記はフクエスの値ではない（' + start + '〜' + end + '）' };
  }
  // ★ 等しいものは「静かに解釈を足さない」。24時間勤務と決めつけない（§157 のまま）
  if (e === s) return { ok: false, reason: '開始と終了が同じ時刻（' + start + '）' };

  const dayStart = DAY_START_HOUR * 60;
  // ★ 営業日の中の位置。6:00 より前は【翌】
  const startMin = s < dayStart ? s + 24 * 60 : s;
  let endMin = e < dayStart ? e + 24 * 60 : e;
  // ★ それでも開始以下なら、もう1日先（10:00〜06:00 → 10:00〜30:00 など）
  if (endMin <= startMin) endMin += 24 * 60;

  if (endMin > 47 * 60 + 59) return { ok: false, reason: '終了が遠すぎる（' + start + '〜' + end + '）' };
  return { ok: true, startMin, endMin };
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
  /**
   * ★★★ 人が見ずに送るのか（自動反映・第48便）。
   *   true にすると見張りが厳しくなる（AUTO_* のしきい値）。★ 緩くはならない。
   */
  unattended?: boolean;
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
  // ★ 刻みに合わせて寄せたもの。★ 黙って書き換えないので、必ず数えて notes に出す
  const snappedList: string[] = [];

  for (const g of page.girls) {
    const row = wanted.get(g.girlId);
    if (!row) continue; // フクエスが知らない子。★ 読んだまま返す（applyChanges が現在値を保つ）

    for (let d = 0; d < WORK_DAYS; d++) {
      const current = g.days[d];
      const sh = row[d];

      let next: WorkCell;
      if (sh && sh.active && sh.start && sh.end) {
        // ★ 第73便: 30分刻みへ内側に寄せてから、選べるかを見る
        const r = toEkichikaRange(sh.start, sh.end);
        if (!r.ok) {
          notSelectable.push(g.girlId + '/日' + d + '（' + r.reason + '）');
          continue; // ★ 解釈できない・寄せると無くなる時刻は触らない。現在値のまま
        }
        if (!canSelect(r.start) || !canSelect(r.end)) {
          // ★ 寄せてもプルダウンに無い（範囲の外＝翌6:00終わりなど）。★ 触らない
          notSelectable.push(g.girlId + '/日' + d + '（' + r.start + '〜' + r.end + '）');
          continue;
        }
        if (r.snappedNote) snappedList.push(g.girlId + '/日' + d + '（' + r.snappedNote + '）');
        next = { start: r.start, end: r.end, work: true };
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
    // ★★★ カッキーさんの決定（2026-08-28）: **その枠だけ送らない。全体は止めない。**
    //   駅ちかは30分刻み・翌5:30まで。フクエスも30分刻みに揃えた（第75便）。
    //   ★ 1人が 20:15 を入れただけで店舗ぜんぶの反映が止まるのは、使えない道具になる。
    //   ★ かといって丸めない（静かに解釈を足さない）。**送らずに、理由をつけて画面に出す。**
    //     設計メモ §14-3 案A「静かにこぼさない。出ていない人を画面に出す」と同じ形。
    notes.push({
      kind: 'time_not_selectable',
      count: notSelectable.length,
      detail:
        notSelectable.length +
        '件は、駅ちかで選べない時刻のため反映していません' +
        '（駅ちかは30分刻み・翌5:30まで。30分に寄せると勤務時間が無くなる場合や、' +
        'それより遅い終了時刻は選べません）。その枠は駅ちかの元の内容のままです',
    });
  }
  if (snappedList.length > 0) {
    // ★★★ 店舗が入れた時刻を書き換えている。**黙ってやらない**（§14-3・第73便）。
    //   ★ 内側にしか寄せていない＝実際より長く出していないことも、文で言う。
    notes.push({
      kind: 'time_snapped',
      count: snappedList.length,
      detail:
        snappedList.length +
        '件は、駅ちかが30分刻みのため時刻を寄せて反映しました' +
        '（開始は遅いほう・終了は早いほうへ。実際より長くは出しません）',
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
      targets: wanted.size,
      activeShifts: activeCount,
      dateLabels: page.dateLabels,
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
    // ★ 無人なら厳しい方を使う（§56）。★ どちらでも「減る方向だけ」見るのは同じ
    const minPeople = input.unattended ? AUTO_SHRINK_MIN_PEOPLE : SHRINK_MIN_PEOPLE;
    const maxRatio = input.unattended ? AUTO_SHRINK_MAX_RATIO : SHRINK_MAX_RATIO;
    if (lost < minPeople) continue;
    if (lost <= before * maxRatio) continue;
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

  // ★★★ 無人のとき、差分が大きすぎるなら送らない（第48便・§56）。
  //   ★ 「大きい差分が間違いだ」とは言えない。言えるのは【人が見ずに流す量ではない】だけ。
  //     だから止め方は blocker（送らない）で、直し方は「人が画面で承認する」。
  if (input.unattended && wanted.size > 0) {
    const cells = wanted.size * WORK_DAYS;
    if (changes.length > cells * AUTO_CHANGE_MAX_RATIO) {
      blockers.push({
        kind: 'change_too_large',
        count: changes.length,
        detail:
          '変更が ' + changes.length + '件（対象 ' + cells + '枠）と大きいため、' +
          '自動では送りません。画面で内容をご確認のうえ承認してください',
      });
    }
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
    targets: wanted.size,
    activeShifts: activeCount,
    dateLabels: page.dateLabels,
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
 * ★★★ 承認した内容の指紋（第46便）。
 *
 *   人が画面で見て承認したのは【そのときの差分】。送るのは【送る直前に読み直した差分】。
 *   ★ そのあいだに駅ちか側やフクエス側が変われば、**承認していない内容を送る**ことになる。
 *   → 指紋を突き合わせ、違ったら送らずに止めて、もう一度人に見せる。
 *
 * ★ 指紋に入れるのは「何をどう変えるか」だけ（girlId・日・変更後の中身）。
 *   変更前の値は入れない（駅ちか側が別の理由で変わっただけのときに、無用に止めないため）。
 *   ★ 順序で結果が変わらないように並べ替えてから連結する。
 */
export function planFingerprint(plan: WorkPlan): string {
  return plan.changes
    .map((c) => c.girlId + ':' + c.dayIndex + ':' + (c.cell.work ? c.cell.start + '-' + c.cell.end : 'off'))
    .sort()
    .join('|');
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
    // ★ targets / active を必ず入れる。これが無いと「変更0件」の意味が読めない
    targets: plan.targets,
    active: plan.activeShifts,
    people: plan.sent.length,
    fields: plan.fieldCount,
    blockers: plan.blockers.length,
    notes: plan.notes.length,
    sendable: plan.ok,
  };
  if (!plan.ok) {
    return { detail, summary: '駅ちかへの反映を止めました: ' + (plan.blockers[0]?.detail ?? '理由不明') };
  }
  // ★★★ 突き合わせる相手が0人なら「一致している」と言ってはいけない。
  //   何も比べていないのに「一致」と出すのが、この機能でいちばん危ない嘘になる。
  if (plan.targets === 0) {
    return {
      detail,
      summary:
        '駅ちかの出勤表と結びつく方が1人も見つからなかったため、比較できませんでした' +
        '（駅ちか側の番号がフクエスに登録されていない可能性があります）',
    };
  }
  if (plan.changes.length === 0) {
    return {
      detail,
      summary:
        '駅ちかの出勤は、フクエスの内容と既に一致しています（' +
        plan.targets +
        '名を突き合わせ、変更はありません）',
    };
  }
  return {
    detail,
    summary: '駅ちかへ反映できる状態です（変更 ' + plan.changes.length + '件・' + plan.sent.length + '名ぶんを送ります）',
  };
}
