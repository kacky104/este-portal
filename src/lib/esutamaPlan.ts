// エステ魂へ送る出勤の計画（第109便・純粋関数）。
//
// ★★★ 判断はここに集める。通信もDBも触らない。★ esulovePlan.ts / workPlan.ts と同じ位置づけ。
//
// ★★★ この版でやらないこと（esulovePlan と同じ）:
//   ・新規登録をしない。向こうに **ちょうど1人いる人だけ** に送る。居ない人は【送らずに名前を出す】。
//   ・「お休み」チェックを触らない（設計メモ §7）。
//
// ★★★ エステ魂は「1人 × 14日分の丸ごと上書き」。だから計画は **人ごと**:
//   1. 名簿と突き合わせて cast_id を決める（mediaMatch）
//   2. フクエスの出勤（窓の中）を 日付 → 範囲 / なし に直す（esutamaWork）
//   3. ★ 窓の中にフクエスの出勤行が **1件も無い人は送らない**（'no_fukues_rows'）。
//      ★ 店舗がエステ魂だけで管理している人の表を、こちらが空で上書きしないため。
//   4. 実際の書き換えは、その人のページを読んだあと applyEsutamaPerson が行う。

import { planRosterWrite, blockedMessage, type MediaRosterEntry } from './mediaMatch';
import { toEsutamaRange } from './esutamaWork';
import {
  applyEsutamaShift, replaceEsutamaDay, esutamaDayLabel, countEsutamaWorking,
  type EsutamaWorkPage, type EsutamaRange,
} from './esutamaWorkParse';

export type EsutamaShiftInput = {
  therapistId: number;
  /** 'YYYY-MM-DD'（営業日） */
  dateISO: string;
  active: boolean;
  /** 'HH:MM'。★ 素の時刻（03:00 のまま） */
  start: string | null;
  end: string | null;
};

export type EsutamaBlocked = {
  therapistId: number;
  name: string;
  reason: 'ambiguous' | 'unknown' | 'not_registered' | 'no_fukues_rows';
  message: string;
};

export type EsutamaPerson = {
  therapistId: number;
  castId: string;
  name: string;
  /** 日付 → 範囲（null は「出勤なし」）。★ 窓の中の日だけ。無い日は【触らない】 */
  days: Array<{ dateISO: string; range: EsutamaRange | null }>;
};

export type EsutamaPlan = {
  people: EsutamaPerson[];
  blocked: EsutamaBlocked[];
  /** 時刻を寄せた・送れなかった枠の理由。★ 必ず画面に出す */
  notes: string[];
  ok: boolean;
  summary: string;
};

/**
 * 誰に何を送るかを決める。
 * @param roster 媒体側の名簿。★ null は【読めていない】。空配列（0人）とは別物
 * @param windowDates 送る対象の日（エステ魂の表にある日。通常は今日〜13日後）
 */
export function planEsutamaWork(input: {
  roster: readonly MediaRosterEntry[] | null;
  therapists: ReadonlyArray<{ therapistId: number; name: string }>;
  shifts: readonly EsutamaShiftInput[];
  windowDates: readonly string[];
  /**
   * ★ 名簿画面で人が結んだ対応（therapist_media_ids）。★ あればこちらを優先し、名前では探さない。
   *   ★ 結ばれていない人だけ、名前で名簿を探す（同名2人なら止まる）。
   *   ★ 結んだ番号が名簿に無ければ送らない（古い番号のまま書き込まない）。
   */
  links?: ReadonlyArray<{ therapistId: number; castId: string }>;
}): EsutamaPlan {
  const blocked: EsutamaBlocked[] = [];
  const notes: string[] = [];
  const people: EsutamaPerson[] = [];

  if (input.roster === null) {
    return {
      people: [],
      blocked: input.therapists.map((t) => ({
        therapistId: t.therapistId, name: t.name, reason: 'unknown' as const,
        message: blockedMessage({ name: t.name, reason: 'unknown', castIds: [] }),
      })),
      notes: [],
      ok: false,
      summary: 'エステ魂の名簿を読み取れなかったため、1件も送っていません',
    };
  }

  // ★ 結ばれている人は名簿にその番号があるかだけ見る。名前では探さない
  const linkOf = new Map<number, string>();
  for (const l of input.links ?? []) if (l.castId) linkOf.set(l.therapistId, l.castId);
  const onMedia = new Set(input.roster.map((r) => r.castId));
  const toUse: Array<{ therapistId: number; name: string; castId: string }> = [];
  const unlinked: Array<{ therapistId: number; name: string }> = [];
  for (const t of input.therapists) {
    const cid = linkOf.get(t.therapistId);
    if (cid === undefined) { unlinked.push(t); continue; }
    if (onMedia.has(cid)) toUse.push({ therapistId: t.therapistId, name: t.name, castId: cid });
    else blocked.push({ therapistId: t.therapistId, name: t.name, reason: 'not_registered', message: t.name + 'さんに結ばれているエステ魂の番号（' + cid + '）が名簿に見当たらないため送っていません。名簿画面で結び直してください' });
  }

  const match = planRosterWrite(input.roster, unlinked.map((t) => ({ therapistId: t.therapistId, name: t.name })));
  for (const u of match.toUse) toUse.push({ therapistId: u.therapistId, name: u.name, castId: u.castId });
  for (const b of match.blocked) {
    blocked.push({ therapistId: b.therapistId, name: b.name, reason: b.reason, message: blockedMessage({ name: b.name, reason: b.reason, castIds: b.castIds }) });
  }
  for (const t of match.toRegister) {
    blocked.push({
      therapistId: t.therapistId, name: t.name, reason: 'not_registered',
      message: t.name + 'さんは、エステ魂にまだ登録されていないため送っていません。エステ魂の管理画面で登録してください（こちらからの自動登録はしていません）',
    });
  }

  const window = new Set(input.windowDates);
  const byPerson = new Map<number, Map<string, EsutamaShiftInput>>();
  for (const sh of input.shifts) {
    if (!window.has(sh.dateISO)) continue;
    let m = byPerson.get(sh.therapistId);
    if (!m) { m = new Map(); byPerson.set(sh.therapistId, m); }
    m.set(sh.dateISO, sh);        // ★ 同じ日が2行あれば後勝ち（フクエス側の重複は別問題）
  }

  for (const u of toUse) {
    const rows = byPerson.get(u.therapistId);
    if (!rows || rows.size === 0) {
      blocked.push({
        therapistId: u.therapistId, name: u.name, reason: 'no_fukues_rows',
        message: u.name + 'さんは、この期間のフクエスの出勤が未入力のため送っていません（エステ魂側の表はそのままです）',
      });
      continue;
    }
    const days: EsutamaPerson['days'] = [];
    for (const dateISO of input.windowDates) {
      const sh = rows.get(dateISO);
      if (!sh || !sh.active || !sh.start || !sh.end) { days.push({ dateISO, range: null }); continue; }
      const conv = toEsutamaRange({ start: sh.start, end: sh.end });
      if (!conv.ok) {
        notes.push(u.name + ' ' + dateISO + '（' + conv.reason + '）');
        // ★ 読めない時刻は「出勤なし」にしない。その日は触らない（days に入れない）
        continue;
      }
      if (conv.snappedNote) notes.push(u.name + ' ' + dateISO + '（' + conv.snappedNote + '）');
      days.push({ dateISO, range: conv.range });
    }
    people.push({ therapistId: u.therapistId, castId: u.castId, name: u.name, days });
  }

  return { people, blocked, notes, ok: people.length > 0, summary: buildSummary(people, blocked, notes) };
}

function buildSummary(people: EsutamaPerson[], blocked: EsutamaBlocked[], notes: string[]): string {
  if (people.length === 0) {
    if (blocked.length > 0) return 'エステ魂へ送れる出勤がありません（' + blocked.length + '人は送れません）';
    return 'エステ魂へ送る出勤がありません';
  }
  const shifts = people.reduce((n, p) => n + p.days.filter((d) => d.range !== null).length, 0);
  const parts = [people.length + '人 / 出勤' + shifts + '日ぶんをエステ魂へ送ります（1人ずつ、14日分の表を書き換えます）'];
  if (blocked.length > 0) parts.push('★ ' + blocked.length + '人は送りません');
  if (notes.length > 0) parts.push('★ ' + notes.length + '件は時刻を寄せた／送れませんでした');
  return parts.join(' / ');
}

// ────────────────────────────── 人ごとの適用 ──────────────────────────────

export type EsutamaPersonDiff = {
  castId: string;
  name: string;
  /** 変わる日。before/after は画面向けの文字（"20:00〜25:00" / "─"） */
  changes: Array<{ dateISO: string; before: string; after: string }>;
  /** 触らなかった日とその理由（お休み・軸の外・表に無い日） */
  skipped: Array<{ dateISO: string; reason: string; message: string }>;
  workingBefore: number;
  workingAfter: number;
  /** 送る意味があるか（1日でも変わる） */
  changed: boolean;
};

/** 読んだページに、その人の計画を当てる。★ 元のページは触らない。 */
export function applyEsutamaPerson(page: EsutamaWorkPage, person: EsutamaPerson): { page: EsutamaWorkPage; diff: EsutamaPersonDiff } {
  let cur = page;
  const changes: EsutamaPersonDiff['changes'] = [];
  const skipped: EsutamaPersonDiff['skipped'] = [];
  for (const d of person.days) {
    const before = page.days.find((x) => x.date === d.dateISO);
    const r = applyEsutamaShift(cur, d.dateISO, d.range);
    if (!r.ok) { skipped.push({ dateISO: d.dateISO, reason: r.reason, message: r.message }); continue; }
    if (r.changed && before) {
      changes.push({ dateISO: d.dateISO, before: esutamaDayLabel(before), after: esutamaDayLabel(r.day) });
      cur = replaceEsutamaDay(cur, r.day);
    }
  }
  return {
    page: cur,
    diff: {
      castId: person.castId,
      name: person.name,
      changes,
      skipped,
      workingBefore: countEsutamaWorking(page),
      workingAfter: countEsutamaWorking(cur),
      changed: changes.length > 0,
    },
  };
}
