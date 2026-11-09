// 全国エステランキング（www.esthe-ranking.jp）の画面を読む・送る形を組む（第1769便・2026-11-07・純粋関数）。
//
// ★★★ 実物で確かめた形（設計メモ_全国エステランキング_下調べ_2026-11-07.md・オイルクエスト様の管理画面を読むだけで調べた）:
//   ログイン画面  GET  /login/        CakePHP。_csrfToken・_Token[fields]・_Token[unlocked] を拾って、loginname・password と一緒に POST
//   セラピスト    GET  /shop/image/girl/upload/all/   tr.girl-tr[data-girl-id]（非公開は class に gi-hide）・名前は delete_multi[] の data-name
//   出勤（1日）   GET  /shop/schedule/YYYY-MM-DD/     tr[data-girl-id] ごとに N[id]・N[delete_flag]・N[is_time_not_set]・N[start_work]・N[end_work]・N
//                 出勤なしの行は N[id]=0・start/end とも '0'。時刻は 'HH:MM'（30分刻み・06:00〜05:30。00:00 は 24:00 の意味）
//   出勤の保存    POST /shop/schedule/YYYY-MM-DD/     その日の【全員ぶん】をまとめて1回（_method=POST・user_id・各行）
//
// ★ このファイルは通信も DB も触らない（自己点検: scripts/zenkoku-selftest.js）。

import { toBusinessDayMinutes } from './workPlan';
import { snapInward, snapNote } from './timeSnap';

// ────────────────────────── 小道具 ──────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** タグの属性を読む（順番に左右されない）。値は実体参照を戻す */
export function tagAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const inner = tag.replace(/^<\s*[a-zA-Z0-9]+/, '').replace(/\/?>$/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const name = m[1].toLowerCase();
    if (name in out) continue;
    out[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}

function inputsOf(html: string): Array<Record<string, string>> {
  return (html.match(/<input\b[^>]*>/gi) ?? []).map(tagAttrs);
}

/** 未ログインのときに出るログイン画面か */
export function looksLikeZenkokuLoginPage(html: string): boolean {
  return /name=["']loginname["']/.test(html ?? '') && /name=["']password["']/.test(html ?? '');
}

// ────────────────────────── ログイン ──────────────────────────

export type ZenkokuLoginForm = { csrfToken: string; tokenFields: string; tokenUnlocked: string };

/** ログイン画面から、POST に要る3つの隠し値を拾う。★ 1つでも欠けたら null（画面の作りが変わった） */
export function readZenkokuLoginForm(html: string): ZenkokuLoginForm | null {
  const forms = (html ?? '').match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  const form = forms.find((f) => /name=["']loginname["']/.test(f));
  if (!form) return null;
  const ins = inputsOf(form);
  const val = (n: string): string | null => {
    const i = ins.find((x) => x.name === n);
    return i ? (i.value ?? '') : null;
  };
  const csrfToken = val('_csrfToken');
  const tokenFields = val('_Token[fields]');
  const tokenUnlocked = val('_Token[unlocked]');
  if (!csrfToken || tokenFields === null || tokenUnlocked === null) return null;
  return { csrfToken, tokenFields, tokenUnlocked };
}

// ────────────────────────── セラピスト一覧 ──────────────────────────

export type ZenkokuGirl = { gid: string; name: string; hidden: boolean };

function trSegments(html: string): Array<{ open: string; body: string }> {
  const out: Array<{ open: string; body: string }> = [];
  const re = /<tr\b[^>]*data-girl-id=["']?\d+["']?[^>]*>/gi;
  const starts: Array<{ idx: number; open: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) starts.push({ idx: m.index, open: m[0] });
  for (let i = 0; i < starts.length; i += 1) {
    const from = starts[i].idx + starts[i].open.length;
    const nextTr = starts[i + 1]?.idx ?? html.length;
    const close = html.indexOf('</tr>', from);
    const to = close >= 0 && close < nextTr ? close : nextTr;
    out.push({ open: starts[i].open, body: html.slice(from, to) });
  }
  return out;
}

export function parseZenkokuGirlList(html: string): { rows: ZenkokuGirl[]; warnings: string[] } {
  const rows: ZenkokuGirl[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const seg of trSegments(html ?? '')) {
    const a = tagAttrs(seg.open);
    const gid = String(a['data-girl-id'] ?? '');
    if (!/^\d{1,12}$/.test(gid) || seen.has(gid)) continue;
    seen.add(gid);
    const del = inputsOf(seg.body).find((i) => i.name === 'delete_multi[]');
    let name = (del?.['data-name'] ?? '').trim();
    if (!name) {
      const cells = seg.body.match(/<td\b[^>]*>([^<]*)<\/td>/gi) ?? [];
      const texts = cells.map((c) => decodeEntities(c.replace(/<[^>]+>/g, '')).trim()).filter((t) => t && !/^\d+$/.test(t));
      name = texts[0] ?? '';
    }
    if (!name) { warnings.push('名前を読めない行（' + gid + '）'); continue; }
    rows.push({ gid, name, hidden: /\bgi-hide\b/.test(a['class'] ?? '') });
  }
  return { rows, warnings };
}

// ────────────────────────── 出勤（1日） ──────────────────────────

export type ZenkokuDayRow = {
  gid: string;
  name: string;
  /** その日の出勤の行の番号。出勤なしは '0' */
  rowId: string;
  /** 'HH:MM'・出勤なしは '0' */
  start: string;
  end: string;
  /** 出勤時間未定にチェックが入っているか */
  notSet: boolean;
  /** 出勤解除にチェックが入っているか（ふつうは false） */
  deleteChecked: boolean;
};

export type ZenkokuDayPage = { dateISO: string; userId: string; rows: ZenkokuDayRow[] };

function selectedOption(selectHtml: string): string | null {
  const opts = selectHtml.match(/<option\b[^>]*>/gi) ?? [];
  for (const o of opts) {
    const a = tagAttrs(o);
    if ('selected' in a) return a.value ?? '';
  }
  return null;
}

function selectBody(html: string, name: string): string | null {
  const re = new RegExp('<select\\b[^>]*name=["\']' + name.replace(/[[\]]/g, '\\$&') + '["\'][^>]*>([\\s\\S]*?)</select>', 'i');
  const m = re.exec(html);
  return m ? m[1] : null;
}

export function parseZenkokuDayPage(html: string, dateISO: string): { page: ZenkokuDayPage } | { error: string } {
  if (looksLikeZenkokuLoginPage(html)) return { error: 'login_page' };
  const forms = (html ?? '').match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  const path = '/shop/schedule/' + dateISO + '/';
  const form = forms.find((f) => {
    const a = tagAttrs((/<form\b[^>]*>/i.exec(f) ?? [''])[0]);
    return (a.action ?? '').endsWith(path) && /\[start_work\]/.test(f);
  });
  if (!form) return { error: 'form_missing' };
  const ins = inputsOf(form);
  const userId = ins.find((i) => i.name === 'user_id')?.value ?? '';
  if (!userId) return { error: 'user_id_missing' };
  const rows: ZenkokuDayRow[] = [];
  for (const seg of trSegments(form)) {
    const gid = String(tagAttrs(seg.open)['data-girl-id'] ?? '');
    if (!/^\d{1,12}$/.test(gid)) continue;
    const rin = inputsOf(seg.body);
    const rowId = rin.find((i) => i.name === gid + '[id]')?.value ?? '';
    const startSel = selectBody(seg.body, gid + '[start_work]');
    const endSel = selectBody(seg.body, gid + '[end_work]');
    if (rowId === '' || startSel === null || endSel === null) return { error: 'row_broken:' + gid };
    const nameM = /<span\b[^>]*>([^<]+)<\/span>/i.exec(seg.body);
    const box = (n: string) => rin.find((i) => i.name === gid + '[' + n + ']' && (i.type ?? '').toLowerCase() === 'checkbox');
    rows.push({
      gid,
      name: nameM ? decodeEntities(nameM[1]).trim() : '',
      rowId,
      start: selectedOption(startSel) ?? '0',
      end: selectedOption(endSel) ?? '0',
      notSet: box('is_time_not_set') ? 'checked' in (box('is_time_not_set') as Record<string, string>) : false,
      deleteChecked: box('delete_flag') ? 'checked' in (box('delete_flag') as Record<string, string>) : false,
    });
  }
  if (rows.length === 0) return { error: 'no_rows' };
  return { page: { dateISO, userId, rows } };
}

/** 1行の今の見え方（記録・照合に使う）。'10:00-15:30' ／ '未定' ／ '─' */
export function zenkokuCellLabel(r: Pick<ZenkokuDayRow, 'rowId' | 'start' | 'end' | 'notSet'>): string {
  if (r.rowId === '0' || r.rowId === '') return '─';
  if (r.notSet) return '未定';
  if (r.start === '0' || r.end === '0') return '─';
  return r.start + '-' + r.end;
}

export type ZenkokuChange = { gid: string; after: string };

/** 送る項目の数の上限（PHP の max_input_vars は既定 1000）。★ 超えると後ろの人が黙って落ちる */
export const ZENKOKU_MAX_FIELDS = 950;

/**
 * ★★★ その日の保存の中身を組む。★ 第1866便から【変える人の行だけ】を送る（相手の画面と同じ）。
 *   ・after が 'HH:MM-HH:MM' … その時刻で出勤（未定・解除のチェックは外す）
 *   ・after が '─'           … 出勤解除にチェック（画面で人が解除するのと同じ。時刻はそのまま）
 *   ★ 変えない人の行は、読んだとおり（未定のチェックも残す）。★ フクエスに居ない人を消さない。
 */
export function buildZenkokuDayPayload(page: ZenkokuDayPage, changes: ReadonlyArray<ZenkokuChange>): { body: string; fields: number } {
  const want = new Map<string, string>();
  for (const c of changes) want.set(c.gid, c.after);
  const parts: Array<[string, string]> = [['_method', 'POST'], ['user_id', page.userId]];
  // ★★★ 第1866便（カッキーさん・11/10 0:4x に相手の画面のスクリプト script_schedule.js を読んで分かった）:
  //   相手の画面は「保存する」を押した瞬間に、【変えていない行】の select・input をすべて disabled にしてから送る
  //   （行の印 <input type=hidden name="<番号>" id="dis-key-<番号>"> が変えた行で disabled になり、残った行をまとめて止める）。
  //   ＝ 送られるのは【変えた行だけ】。しかも変えた行の印（"<番号>"=''）も送られない。
  //   第1804便から 55名全員の行を送っていたため、相手のサーバーが「An Internal Error Has Occurred」（500）になっていた。
  for (const r of page.rows) {
    const after = want.get(r.gid);
    if (after === undefined) continue;   // ★ 変えない行は送らない（画面と同じ）
    let start = r.start, end = r.end, notSet = r.notSet, del = r.deleteChecked;
    if (after !== undefined) {
      if (after === '─') {
        del = r.rowId !== '0';
      } else {
        const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(after);
        if (!m) throw new Error('送る時刻の形が違う: ' + after);
        start = m[1]; end = m[2]; notSet = false; del = false;
      }
    }
    parts.push([r.gid + '[id]', r.rowId]);
    parts.push([r.gid + '[delete_flag]', '0']);
    if (del) parts.push([r.gid + '[delete_flag]', '1']);
    parts.push([r.gid + '[is_time_not_set]', '0']);
    if (notSet) parts.push([r.gid + '[is_time_not_set]', '1']);
    parts.push([r.gid + '[start_work]', start]);
    parts.push([r.gid + '[end_work]', end]);
    // ★ 第1866便: 行の印（"<番号>"）は送らない（変えた行では disabled になって送られない）
  }
  return {
    body: parts.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&'),
    fields: parts.length,
  };
}

// ────────────────────────── フクエスの出勤 → 全国の形 ──────────────────────────

/** 全国エステランキングで選べる範囲（営業日の分）。開始 06:00〜29:30・終了 06:30〜29:30 */
const AXIS_START = 6 * 60;
const AXIS_END = 29 * 60 + 30;

function hm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * フクエスの1人1日（素の時刻 'HH:MM'）→ 全国の 'HH:MM-HH:MM'。
 * ★ 30分刻みへは内側へ寄せる（駅ちか・エステ魂と同じ timeSnap.snapInward）。★ 選べる範囲の外は送らない（理由を返す）
 */
export function toZenkokuRange(start: string, end: string): { ok: true; label: string; note: string | null } | { ok: false; reason: string } {
  const conv = toBusinessDayMinutes(start, end);
  if (!conv.ok) return { ok: false, reason: conv.reason };
  const s = snapInward(conv.startMin, conv.endMin);
  if (!s.ok) return { ok: false, reason: s.reason };
  if (s.startMin < AXIS_START || s.endMin > AXIS_END) {
    return { ok: false, reason: '全国エステランキングで選べる時間（6:00〜翌5:30）の外です（' + start + '〜' + end + '）' };
  }
  return { ok: true, label: hm(s.startMin) + '-' + hm(s.endMin), note: snapNote(conv.startMin, conv.endMin, s) };
}

/**
 * ★ その日の変更を決める。★ 見るのは【結びついていて、計画に入っている人】（want にある gid）だけ。
 *   ・want に無い人（フクエスに居ない・送らない設定）… 触らない
 *   ・want にあるが画面に居ない（向こうで消えた）… missing に入れる（送らない）
 *   ・holdClears … 自動で「出勤を消すだけ」の変更を止める（フクエス側が全員空のときの守り）
 */
export function planZenkokuDay(
  page: ZenkokuDayPage,
  want: Readonly<Record<string, string>>,
  opts?: { holdClears?: boolean },
): { changes: Array<ZenkokuChange & { name: string; before: string }>; missing: string[]; held: number } {
  const byGid = new Map(page.rows.map((r) => [r.gid, r] as const));
  const changes: Array<ZenkokuChange & { name: string; before: string }> = [];
  const missing: string[] = [];
  let held = 0;
  for (const [gid, after] of Object.entries(want)) {
    const r = byGid.get(gid);
    if (!r) { missing.push(gid); continue; }
    const before = zenkokuCellLabel(r);
    if (before === after) continue;
    if (after === '─' && opts?.holdClears) { held += 1; continue; }
    changes.push({ gid, after, name: r.name, before });
  }
  return { changes, missing, held };
}
