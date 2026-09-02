// エステ魂の出勤表（/admin/schedule/<cast_id>/）の読み取り・書き換え・送る形（第109便・純粋関数）。
//
// ★★★ 一番大事な違い（設計メモ_エステ魂の出勤書き込み §3, §7）
//   保存は **1人 × 14日分の丸ごと上書き**。日ごとの保存ではない。
//   → 必ず「ページを読む → 全部持つ → フクエスの担当日だけ書き換える → 全部送る」。
//   → 1日でも読めなかったら送らない（checkEsutamaWorkPage が止める）。
//   → 読んだページに無い日は作らない（勝手に日を増やさない）。
//
// ★★★ 30分ごとの状態（period）が本体。select_start / select_end は画面の入力補助だが一緒に送る。
//   0=─（未定） 1=○（出勤） 2=×（予約済み） 3=TEL（要TEL） 99=お休み
//
// ★★ 書き換えの決め（案。§8 でカッキーさんに確認中）:
//   範囲の中: 0 → 1。**2 / 3 は残す**（店舗が手で付けた予約済み・要TEL）
//   範囲の外: 1 / 2 / 3 → 0
//   出勤の無い日: 全部 0、select は空
//   お休み（work_status）: **フクエスからは触らない**。付いている日は書き換えず、理由を返す
//
// ★ 時刻の表記は "9:00" "27:00" "30:00"（前ゼロ無し・24時超えあり）。★ 前ゼロを足さない（option の value と一致させる）。

import { attrsOf } from './esutamaParse';
import { assertWithinInputVars } from './ekichikaWorkParse';

export const ESUTAMA_PERIOD_VALUES = ['0', '1', '2', '3', '99'] as const;
export type EsutamaPeriodValue = (typeof ESUTAMA_PERIOD_VALUES)[number];
/** 実測で見た日数（今日〜13日後）。★ 検査では「これと違う」を止めず warnings に残す（画面の都合で変わりうる） */
export const ESUTAMA_EXPECT_DAYS = 14;
/** 「未定(LASTまで)」の value。★ こちらからは使わない。読んだままなら残す */
export const ESUTAMA_END_UNDECIDED = '99:99';

export type EsutamaDay = {
  /** 'YYYY-MM-DD' */
  date: string;
  /** select_start の選択値。'' は未選択 */
  start: string;
  /** select_end の選択値。'' は未選択、'99:99' は未定(LASTまで) */
  end: string;
  /** お休み checkbox。★ 触らない */
  off: boolean;
  /** 30分ごとの状態。★ 画面の並び順のまま */
  period: Array<{ label: string; value: string }>;
  /** select_start の選べる値（'' を除く） */
  startOptions: string[];
  /** select_end の選べる値（'' を除く。'99:99' を含む） */
  endOptions: string[];
};

export type EsutamaWorkPage = {
  csrf: string | null;
  shopId: string | null;
  castId: string | null;
  week: string;
  check: string;
  days: EsutamaDay[];
  /** 30分ごとの軸（1日目の period のラベル）。例 ['9:00', '9:30', …, '30:00'] */
  axis: string[];
  warnings: string[];
};

// ────────────────────────────── 時刻 ──────────────────────────────

/** "9:00" → 540、"27:00" → 1620。読めなければ null */
export function esutamaLabelToMinutes(label: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(label).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 47 || mi > 59) return null;
  return h * 60 + mi;
}

/** 1620 → "27:00"（前ゼロ無し。option の value と同じ形） */
export function esutamaMinutesToLabel(min: number): string {
  if (!Number.isInteger(min) || min < 0 || min > 47 * 60 + 59) throw new Error('エステ魂の時刻に直せない分: ' + min);
  return String(Math.floor(min / 60)) + ':' + String(min % 60).padStart(2, '0');
}

// ────────────────────────────── パース ──────────────────────────────

type SelectRead = { name: string; value: string; options: string[] };

function readSelects(html: string): SelectRead[] {
  const out: SelectRead[] = [];
  const re = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const a = attrsOf('<select' + m[1] + '>');
    const name = a['name'] ?? '';
    if (!name) continue;
    const options: string[] = [];
    let selected: string | null = null;
    let first: string | null = null;
    const ore = /<option\b([^>]*)>/gi;
    let o: RegExpExecArray | null;
    while ((o = ore.exec(m[2])) !== null) {
      const oa = attrsOf('<option' + o[1] + '>');
      const v = oa['value'] ?? '';
      options.push(v);
      if (first === null) first = v;
      if ('selected' in oa && selected === null) selected = v;
    }
    out.push({ name, value: selected ?? first ?? '', options });
  }
  return out;
}

function readInputs(html: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(attrsOf(m[0]));
  return out;
}

/**
 * 出勤表を読む。★ 読めない所は null / warnings。★ 例外を投げない（判断は checkEsutamaWorkPage）。
 */
export function parseEsutamaWorkPage(html: string): EsutamaWorkPage {
  const warnings: string[] = [];
  const page: EsutamaWorkPage = { csrf: null, shopId: null, castId: null, week: '', check: '', days: [], axis: [], warnings };
  if (typeof html !== 'string' || html.length === 0) {
    warnings.push('本文が空');
    return page;
  }
  // ★ フォームの中だけを見る（ページの他の select を拾わない）
  const fm = /<form\b[^>]*id\s*=\s*["']WorkScheduleForm["'][^>]*>([\s\S]*?)<\/form>/i.exec(html);
  if (!fm) {
    warnings.push('WorkScheduleForm が無い');
    // ★ csrf はフォームの外（フッタ）にあるので、ここだけは全体から読む
    page.csrf = readCsrfLoose(html);
    return page;
  }
  const form = fm[1];
  page.csrf = readCsrfLoose(html);

  const inputs = readInputs(form);
  const hidden = (n: string): string | null => {
    const hit = inputs.filter((a) => a['name'] === n);
    if (hit.length !== 1) return null;
    return hit[0]['value'] ?? '';
  };
  page.shopId = hidden('brws_shop_id');
  page.castId = hidden('cast_id');
  page.week = hidden('week') ?? '';
  page.check = hidden('_check') ?? '';
  if (page.shopId === null) warnings.push('brws_shop_id が読めない');
  if (page.castId === null) warnings.push('cast_id が読めない');

  const selects = readSelects(form);
  const byDate = new Map<string, EsutamaDay>();
  const order: string[] = [];
  const dayOf = (date: string): EsutamaDay => {
    let d = byDate.get(date);
    if (!d) {
      d = { date, start: '', end: '', off: false, period: [], startOptions: [], endOptions: [] };
      byDate.set(date, d);
      order.push(date);
    }
    return d;
  };
  for (const s of selects) {
    const m = /^column\[(\d{4}-\d{2}-\d{2})\]\[(select|period)\]\[([^\]]+)\]$/.exec(s.name);
    if (!m) continue;
    const d = dayOf(m[1]);
    if (m[2] === 'select') {
      if (m[3] === 'select_start') { d.start = s.value; d.startOptions = s.options.filter((v) => v !== ''); }
      else if (m[3] === 'select_end') { d.end = s.value; d.endOptions = s.options.filter((v) => v !== ''); }
    } else {
      d.period.push({ label: m[3], value: s.value });
    }
  }
  for (const a of inputs) {
    const m = /^column\[(\d{4}-\d{2}-\d{2})\]\[work_status\]$/.exec(a['name'] ?? '');
    if (!m) continue;
    dayOf(m[1]).off = 'checked' in a;
  }
  page.days = order.map((d) => byDate.get(d)!);
  page.axis = page.days[0]?.period.map((p) => p.label) ?? [];
  return page;
}

function readCsrfLoose(html: string): string | null {
  const found = new Set<string>();
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const a = attrsOf(m[0]);
    if (a['id'] !== 'csrf_footer') continue;
    const v = a['value'] ?? '';
    if (/^[A-Za-z0-9]{16,64}$/.test(v)) found.add(v);
  }
  return found.size === 1 ? Array.from(found)[0] : null;
}

// ────────────────────────────── 検査 ──────────────────────────────

/** 送ってよい形か。★ 1つでも引っかかったら【送らない】（丸ごと上書きなので、欠けは消える意味になる） */
export function checkEsutamaWorkPage(page: EsutamaWorkPage): string[] {
  const problems: string[] = [];
  if (page.csrf === null) problems.push('CSRF（csrf_footer）が読めない');
  if (page.shopId === null || !/^\d+$/.test(page.shopId)) problems.push('brws_shop_id が読めない');
  if (page.castId === null || !/^\d+$/.test(page.castId)) problems.push('cast_id が読めない');
  if (page.days.length === 0) problems.push('日が1つも読めない');
  if (page.axis.length === 0) problems.push('30分ごとの軸が読めない');
  // ★ 軸は 30分刻みで単調増加
  for (let i = 0; i < page.axis.length; i++) {
    const a = esutamaLabelToMinutes(page.axis[i]);
    if (a === null) { problems.push('軸の時刻が読めない（' + page.axis[i] + '）'); break; }
    if (i > 0) {
      const b = esutamaLabelToMinutes(page.axis[i - 1]);
      if (b === null || a - b !== 30) { problems.push('軸が30分刻みで並んでいない（' + page.axis[i - 1] + '→' + page.axis[i] + '）'); break; }
    }
  }
  for (let i = 0; i < page.days.length; i++) {
    const d = page.days[i];
    if (i > 0 && addDays(page.days[i - 1].date, 1) !== d.date) problems.push('日付が連続していない（' + page.days[i - 1].date + '→' + d.date + '）');
    const labels = d.period.map((p) => p.label);
    if (labels.join('|') !== page.axis.join('|')) problems.push(d.date + ' の軸が1日目と違う');
    for (const p of d.period) {
      if (!(ESUTAMA_PERIOD_VALUES as readonly string[]).includes(p.value)) problems.push(d.date + ' ' + p.label + ' の値が知らない形（' + p.value + '）');
    }
    if (d.startOptions.length === 0 || d.endOptions.length === 0) problems.push(d.date + ' の出勤／退勤の選択肢が読めない');
  }
  return problems;
}

export function assertEsutamaWorkPage(page: EsutamaWorkPage): void {
  const p = checkEsutamaWorkPage(page);
  if (p.length) throw new Error('エステ魂の出勤表が送れる形でない: ' + p.join(' / '));
}

/** 1日目が「こちらの今日」か。★ ずれていたら日が丸ごとずれるので止める */
export function assertEsutamaTodayIsIndex0(page: EsutamaWorkPage, todayISO: string): void {
  const first = page.days[0]?.date ?? '';
  if (first !== todayISO) throw new Error('出勤表の1日目（' + first + '）がこちらの今日（' + todayISO + '）と違う');
}

export function addDays(iso: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n);
  return new Date(t).toISOString().slice(0, 10);
}

// ────────────────────────────── 書き換え ──────────────────────────────

export type EsutamaRange = { startMin: number; endMin: number };

export type ApplyResult =
  | { ok: true; day: EsutamaDay; changed: boolean }
  | { ok: false; reason: 'no_such_day' | 'day_off_on_media' | 'outside_axis'; message: string };

/**
 * 1日ぶんを書き換える（元は触らず、新しい day を返す）。
 * @param range null なら「出勤なし」（全部 0・select は空）
 */
export function applyEsutamaShift(page: EsutamaWorkPage, dateISO: string, range: EsutamaRange | null): ApplyResult {
  const day = page.days.find((d) => d.date === dateISO);
  if (!day) return { ok: false, reason: 'no_such_day', message: dateISO + ' はエステ魂の出勤表に無い日' };
  if (day.off) {
    return { ok: false, reason: 'day_off_on_media', message: dateISO + ' はエステ魂側で「お休み」が付いているので触らない' };
  }
  let start = '';
  let end = '';
  if (range !== null) {
    if (!Number.isInteger(range.startMin) || !Number.isInteger(range.endMin) || range.endMin <= range.startMin) {
      return { ok: false, reason: 'outside_axis', message: dateISO + ' の範囲が不正' };
    }
    start = esutamaMinutesToLabel(range.startMin);
    end = esutamaMinutesToLabel(range.endMin);
    if (!day.startOptions.includes(start) || !day.endOptions.includes(end)) {
      return {
        ok: false,
        reason: 'outside_axis',
        message: dateISO + ' の ' + start + '〜' + end + ' はエステ魂で選べない（この店の軸は ' + (page.axis[0] ?? '?') + '〜' + (page.axis[page.axis.length - 1] ?? '?') + '）',
      };
    }
  }
  const period = day.period.map((p) => {
    const t = esutamaLabelToMinutes(p.label);
    const inside = range !== null && t !== null && t >= range.startMin && t < range.endMin;
    let value = p.value;
    if (inside) {
      if (value === '0') value = '1';            // ★ 2 / 3 は残す
    } else if (value === '1' || value === '2' || value === '3') {
      value = '0';                               // ★ 範囲の外は戻す
    }
    return { label: p.label, value };
  });
  const next: EsutamaDay = { ...day, start, end, period };
  const changed = next.start !== day.start || next.end !== day.end || period.some((p, i) => p.value !== day.period[i].value);
  return { ok: true, day: next, changed };
}

/** day を差し替えた新しいページ */
export function replaceEsutamaDay(page: EsutamaWorkPage, day: EsutamaDay): EsutamaWorkPage {
  return { ...page, days: page.days.map((d) => (d.date === day.date ? day : d)) };
}

// ────────────────────────────── 送る形 ──────────────────────────────

/**
 * POST の項目（画面の serializeArray → parseJson と同じ並び・同じ中身）。
 * ★ checkbox は付いているときだけ。★ お休みの日は period を送らない（画面では disabled になり送られない・§3-3）。
 * ★ ctk は最後。★ 件数が PHP の上限を超えたら例外（丸ごと上書きなので黙って欠けると消える）。
 */
export function buildEsutamaPayload(page: EsutamaWorkPage): Array<[string, string]> {
  assertEsutamaWorkPage(page);
  const fields: Array<[string, string]> = [];
  for (const d of page.days) {
    const p = 'column[' + d.date + ']';
    fields.push([p + '[select][select_start]', d.start]);
    fields.push([p + '[select][select_end]', d.end]);
    if (d.off) fields.push([p + '[work_status]', '2']);
    if (!d.off) for (const c of d.period) fields.push([p + '[period][' + c.label + ']', c.value]);
  }
  fields.push(['brws_shop_id', page.shopId ?? '']);
  fields.push(['cast_id', page.castId ?? '']);
  fields.push(['week', page.week]);
  fields.push(['_check', page.check]);
  fields.push(['ctk', page.csrf ?? '']);
  assertWithinInputVars(fields);
  return fields;
}

// ────────────────────────────── 見せる形 ──────────────────────────────

/** 1日の ○ の範囲を "20:00〜25:00" に。○ が無ければ '─'。飛び飛びなら区間を '、' で並べる */
export function esutamaDayLabel(day: EsutamaDay): string {
  if (day.off) return 'お休み';
  const parts: string[] = [];
  let runStart: number | null = null;
  let prev: number | null = null;
  const flush = () => {
    if (runStart !== null && prev !== null) parts.push(esutamaMinutesToLabel(runStart) + '〜' + esutamaMinutesToLabel(prev + 30));
    runStart = null; prev = null;
  };
  for (const p of day.period) {
    const t = esutamaLabelToMinutes(p.label);
    if (t === null) continue;
    if (p.value === '1' || p.value === '2' || p.value === '3') {
      if (runStart === null) runStart = t;
      else if (prev !== null && t - prev !== 30) { flush(); runStart = t; }
      prev = t;
    } else flush();
  }
  flush();
  return parts.length ? parts.join('、') : '─';
}

/** ○（1）の枠の数。★ 送る前後で比べる材料 */
export function countEsutamaWorking(page: EsutamaWorkPage): number {
  let n = 0;
  for (const d of page.days) for (const p of d.period) if (p.value === '1') n++;
  return n;
}
