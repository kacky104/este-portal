// エステ魂の写メNote を送れたあと、同じ方の「同じ題名・同じ本文」の前の写メNote を消す（第2036便・2026-11-19・カッキーさん）。
// ★ 純粋関数だけ（DB もネットワークも触らない）。relayFlow.ts の advanceFlow から呼ばれる。
//
// ★ きっかけ（オイルクエスト様のご要望）: 写メNote は並べた投稿内容を順に送り、一周すると同じ方に同じ内容がもう一度載る。
//   エステ魂の日記一覧に同じ文が何件も並ぶ（11/19 にゆゆさんで「初めましてユユです♡」が10件以上並んでいた）。
// ★ 決まり（カッキーさん 11/19）:
//   ・写メNote を送れた（verdict='sent'）あと、その方の写メNote の一覧を読み、同じ題名の日記を新しい順に集める。
//   ・1件ずつ編集画面を読んで本文を確かめ、題名も本文も同じものは【いちばん新しい1件だけ残して】消す。
//     ★ すでに並んでいる分（B）も、次にその内容を送ったときにまとめて片づく。
//   ・題名か本文が1文字でも違う日記は消さない（本人が書いた日記・写メ日記の転送で送った日記も、内容が違えば残る）。
//   ・店ごとの ON/OFF（conecf_esutama_notes.dedupe・既定 OFF）。
// ★★ 実物（2026-11-19・オイルクエスト様 ゆゆさん・代理ログインで読んだだけ）:
//   一覧     GET /tamathera/diary/ ・ 2ページ目から /tamathera/diary/p2/ … 1ページ10件・新しい順
//            1件ごとに <button data-diary-delete data-diary-id="650588" data-diary-title="初めましてユユです♡"> と 投稿日時「2026/11/18 23:50」
//            本文は一覧に出ない。削除の窓は <form id="delete-modal-form" method="post" data-base-url=".../diary/delete/"> ＋ hidden ctk
//   編集画面 GET /tamathera/diary/edit/<id>/ … input[name=title] と textarea[name=content]（本文そのまま・改行は \n）
//   削除     main.min.js: 削除ボタン → 窓の form の action を data-base-url + id + "/" にして送る
//            → POST /tamathera/diary/delete/<id>/  本文 ctk=<一覧の ctk>（x-www-form-urlencoded）
// ★★★ 段の並び（代理ログインの中）:
//   esutama_diary_post → esutama_note_list（p1〜）→ esutama_note_edit（1件ずつ）→ esutama_note_delete → … → esutama_note_verify（p1〜）→ esutama_diary_end
//   ★ 何があっても最後は esutama_diary_end（代理ログインを終える）。止めるときも end を通す。
//   ★ 消したかどうかは、消したあとに一覧を読み直して確かめる（削除の返事では決めつけない）。

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { encodePayload } from './ekichikaWorkParse';
import { buildEsutamaEndProxyRequest } from './esutamaRequests';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };

const ORIGIN = 'https://estama.jp';
const LIST_URL = ORIGIN + '/tamathera/diary/';
/** 一覧を何ページまで読むか（1ページ10件） */
export const NOTE_DEDUPE_MAX_PAGES = 5;
/** 1回の流れで編集画面を読むのは何件まで */
export const NOTE_DEDUPE_MAX_CHECKS = 40;

export type NoteDedupeState = {
  phase: 'scan' | 'check' | 'verify';
  /** いま読んでいる一覧のページ（1 はじまり） */
  page: number;
  /** 同じ題名の日記（新しい順）。{ id, at } */
  found: Array<{ id: string; at: string | null }>;
  /** これから編集画面で確かめる番号 */
  queue: string[];
  /** 残す1件（題名も本文も同じ、いちばん新しいもの） */
  keep: string | null;
  /** 消しに行った番号 */
  deleted: string[];
  /** 消しに行ったが、読み直すとまだ残っていた番号 */
  remained: string[];
  /** 読み直しで見えた番号（verify のあいだ集める） */
  seen: string[];
  /** 一覧で拾った ctk（削除に使う） */
  ctk: string | null;
  /** 読んだ一覧のページ数（verify も同じ数だけ読む） */
  pages: number;
  /** 最後に編集画面を読んだ番号 */
  current: string | null;
};

// ─────────────── 読み取り（純粋） ───────────────

function decodeEntities(s: string): string {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i').exec(tag);
  if (!m) return null;
  return decodeEntities(m[2] ?? m[3] ?? '');
}

/** 写メNote の一覧（本人側）を読む。cards は新しい順 */
export function parseNoteListPage(html: string, page: number): {
  cards: Array<{ id: string; title: string; at: string | null }>;
  ctk: string | null;
  hasNext: boolean;
  isList: boolean;
} {
  const src = String(html ?? '');
  const cards: Array<{ id: string; title: string; at: string | null }> = [];
  // ★ 1件ずつの箱（p-diary-list__item）で区切り、その中の投稿日時と削除ボタンを読む
  const chunks = src.split(/class="[^"]*\bp-diary-list__item\b/);
  for (const chunk of chunks.slice(1)) {
    const btn = /<button[^>]*\bdata-diary-delete\b[^>]*>/i.exec(chunk);
    if (!btn) continue;
    const id = attrOf(btn[0], 'data-diary-id');
    if (!id || !/^\d{1,12}$/.test(id)) continue;
    const title = attrOf(btn[0], 'data-diary-title') ?? '';
    const d = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(chunk.slice(0, btn.index));
    const at = d ? d[1] + '/' + d[2].padStart(2, '0') + '/' + d[3].padStart(2, '0') + ' ' + d[4].padStart(2, '0') + ':' + d[5] : null;
    if (!cards.some((c) => c.id === id)) cards.push({ id, title, at });
  }
  // ★ 削除の窓の ctk（属性の並び順に依存しない）
  let ctk: string | null = null;
  const form = /<form[^>]*id="delete-modal-form"[^>]*>([\s\S]*?)<\/form>/i.exec(src);
  if (form) {
    for (const m of form[1].matchAll(/<input[^>]*>/gi)) {
      if (attrOf(m[0], 'name') === 'ctk') { const v = attrOf(m[0], 'value'); if (v && /^[A-Za-z0-9]{16,64}$/.test(v)) ctk = v; }
    }
  }
  const hasNext = src.includes('/tamathera/diary/p' + (page + 1) + '/');
  const isList = form !== null || /写メNote/.test(src);
  return { cards, ctk, hasNext, isList };
}

/** 編集画面から題名と本文を読む。読めなければ null */
export function parseNoteEditPage(html: string): { title: string; content: string } | null {
  const src = String(html ?? '');
  let title: string | null = null;
  for (const m of src.matchAll(/<input[^>]*>/gi)) {
    if (attrOf(m[0], 'name') === 'title') { title = attrOf(m[0], 'value') ?? ''; break; }
  }
  const ta = /<textarea[^>]*name\s*=\s*["']content["'][^>]*>([\s\S]*?)<\/textarea>/i.exec(src);
  if (title === null || !ta) return null;
  // ★ textarea の中身の先頭の改行1つは HTML の決まりで無視される
  return { title, content: decodeEntities(ta[1].replace(/^\r?\n/, '')) };
}

/** 比べるための形（改行をそろえ、行末と前後の空白を落とし、NFC に） */
export function normalizeNoteText(s: string): string {
  return String(s ?? '').normalize('NFC').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[ \t\u3000]+$/, '')).join('\n').trim();
}

/** こちらが送った形（半角の「<」は全角にして送っている・relayFlow の planEsutamaNote と同じ） */
export function sentNoteTitle(title: string): string { return String(title ?? '').replace(/</g, '＜'); }
export function sentNoteBody(body: string): string { return String(body ?? '').replace(/</g, '＜'); }

export function isSameNote(a: { title: string; content: string }, b: { title: string; body: string }): boolean {
  return normalizeNoteText(a.title) === normalizeNoteText(sentNoteTitle(b.title))
    && normalizeNoteText(a.content) === normalizeNoteText(sentNoteBody(b.body));
}

// ─────────────── 段を組む ───────────────

function htmlHeaders(cookie: string, referer?: string): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    ...(referer ? { referer } : {}),
    ...(cookie ? { cookie } : {}),
  };
}

export function noteListUrl(page: number): string {
  const p = Math.max(1, Math.floor(Number(page) || 1));
  return p === 1 ? LIST_URL : LIST_URL + 'p' + p + '/';
}
export function noteEditUrl(id: string): string {
  if (!/^\d{1,12}$/.test(id)) throw new Error('写メNote の番号の形が違います');
  return LIST_URL + 'edit/' + id + '/';
}
export function noteDeleteUrl(id: string): string {
  if (!/^\d{1,12}$/.test(id)) throw new Error('写メNote の番号の形が違います');
  return LIST_URL + 'delete/' + id + '/';
}

type Next = Extract<FlowOutcome, { kind: 'next' }>['next'];

function listStep(purpose: 'esutama_note_list' | 'esutama_note_verify', page: number, ctx: RelayFlowContext): Next {
  return { purpose, method: 'GET', url: noteListUrl(page), headers: htmlHeaders(ctx.cookie, LIST_URL), body: '', context: ctx };
}
function editStep(id: string, ctx: RelayFlowContext): Next {
  return { purpose: 'esutama_note_edit', method: 'GET', url: noteEditUrl(id), headers: htmlHeaders(ctx.cookie, LIST_URL), body: '', context: ctx };
}
function deleteStep(id: string, ctk: string, ctx: RelayFlowContext): Next {
  return {
    purpose: 'esutama_note_delete', method: 'POST', url: noteDeleteUrl(id),
    headers: { ...htmlHeaders(ctx.cookie, LIST_URL), 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
    body: encodePayload([['ctk', ctk]]),
    context: ctx,
  };
}
function endStep(ctx: RelayFlowContext): Next {
  const r = buildEsutamaEndProxyRequest(ctx.cookie);
  return { purpose: 'esutama_diary_end', method: r.method, url: r.url, headers: r.headers, body: '', context: ctx };
}

const who = (ctx: RelayFlowContext) => (ctx.esutamaDiaryCastName ? ctx.esutamaDiaryCastName + 'さんの' : '');

/** 終わり（または止める）。★ 必ず代理ログインを終える段へ */
function finish(ctx: RelayFlowContext, audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'next', next: endStep(ctx), audits, note: note + '。代理ログインを終えます' };
}

/**
 * ★ 写メNote を送れたあと（afterEsutamaDiaryPost から呼ぶ）。消す段に入るなら一覧の1ページ目を積む。入らないなら null。
 */
export function startNoteDedupe(ctx: RelayFlowContext): Next | null {
  if (!ctx.esutamaNote || ctx.esutamaNoteDedupe !== true || ctx.esutamaProxyOpen !== true) return null;
  if (ctx.esutamaDiaryVerdict !== 'sent') return null;   // ★ 送れたと言い切れる回だけ（判定できない回は消さない）
  const st: NoteDedupeState = { phase: 'scan', page: 1, found: [], queue: [], keep: null, deleted: [], remained: [], seen: [], ctk: null, pages: 0, current: null };
  return listStep('esutama_note_list', 1, { ...ctx, esutamaNoteDd: st });
}

/** 一覧を読んだ（同じ題名を集める） */
export function afterEsutamaNoteList(input: Input, ctx0: RelayFlowContext): FlowOutcome {
  const ctx: RelayFlowContext = { ...ctx0, cookie: mergeCookies(ctx0.cookie, input.headers['set-cookie'] as string | string[] | undefined) };
  const st = ctx.esutamaNoteDd;
  const n = ctx.esutamaNote;
  if (!st || !n) return finish(ctx, [], '写メNote の片づけ: 状態が文脈にありません');
  const fail = (reason: string, summary: string) => finish(ctx, [{
    event: 'delete_diary', outcome: 'failed', summary: '写メNote: ' + summary + '（同じ内容の前の写メNote は消していません）',
    detail: { kind: 'esutama_note', reason, page: st.page, status: input.status, flowId: ctx.flowId },
  }], summary);
  if (input.status < 200 || input.status >= 400) return fail('list_http', who(ctx) + '写メNote の一覧を読めませんでした（' + input.status + '）');
  const p = parseNoteListPage(input.body, st.page);
  if (!p.isList) return fail('not_list', who(ctx) + '写メNote の一覧を読めませんでした');
  const title = normalizeNoteText(sentNoteTitle(n.title));
  const found = [...st.found];
  for (const c of p.cards) if (normalizeNoteText(c.title) === title && !found.some((f) => f.id === c.id)) found.push({ id: c.id, at: c.at });
  const next: NoteDedupeState = { ...st, found, ctk: st.ctk ?? p.ctk, pages: st.page };
  if (p.hasNext && st.page < NOTE_DEDUPE_MAX_PAGES) {
    return { kind: 'next', next: listStep('esutama_note_list', st.page + 1, { ...ctx, esutamaNoteDd: { ...next, page: st.page + 1 } }), audits: [], note: '写メNote の一覧 ' + st.page + 'ページ目を読みました' };
  }
  // ★ 1件だけ（いま送った分だけ）なら何もしない
  if (found.length <= 1) {
    return finish({ ...ctx, esutamaNoteDd: next }, [], '同じ内容の前の写メNote はありません');
  }
  if (!next.ctk) return fail('no_ctk', '写メNote の一覧で削除に要る値（ctk）を拾えませんでした');
  const queue = found.slice(0, NOTE_DEDUPE_MAX_CHECKS).map((f) => f.id);
  const st2: NoteDedupeState = { ...next, phase: 'check', queue: queue.slice(1), current: queue[0] };
  return { kind: 'next', next: editStep(queue[0], { ...ctx, esutamaNoteDd: st2 }), audits: [], note: '同じ題名の写メNote が ' + found.length + '件。本文を確かめます' };
}

/** 次の1件の編集画面へ。無ければ読み直しへ */
function nextCheck(ctx: RelayFlowContext, st: NoteDedupeState, audits: FlowAudit[], note: string): FlowOutcome {
  if (st.queue.length > 0) {
    const [id, ...rest] = st.queue;
    return { kind: 'next', next: editStep(id, { ...ctx, esutamaNoteDd: { ...st, queue: rest, current: id } }), audits, note };
  }
  if (st.deleted.length === 0) return finish({ ...ctx, esutamaNoteDd: st }, audits, note + '（消すものはありませんでした）');
  const st2: NoteDedupeState = { ...st, phase: 'verify', page: 1, seen: [], current: null };
  return { kind: 'next', next: listStep('esutama_note_verify', 1, { ...ctx, esutamaNoteDd: st2 }), audits, note: note + '。消えたかを一覧で確かめます' };
}

/** 編集画面を読んだ（題名と本文が同じか） */
export function afterEsutamaNoteEdit(input: Input, ctx0: RelayFlowContext): FlowOutcome {
  const ctx: RelayFlowContext = { ...ctx0, cookie: mergeCookies(ctx0.cookie, input.headers['set-cookie'] as string | string[] | undefined) };
  const st = ctx.esutamaNoteDd;
  const n = ctx.esutamaNote;
  if (!st || !n || !st.current) return finish(ctx, [], '写メNote の片づけ: 状態が文脈にありません');
  const id = st.current;
  const page = input.status >= 200 && input.status < 400 ? parseNoteEditPage(input.body) : null;
  // ★ 読めなかった1件は消さない（次へ）
  if (!page) return nextCheck(ctx, st, [], id + ' の中身を読めなかったので残します');
  if (!isSameNote(page, { title: n.title, body: n.body })) return nextCheck(ctx, st, [], id + ' は本文が違うので残します');
  // ★ 題名も本文も同じ。いちばん新しい1件は残す
  if (st.keep === null) return nextCheck(ctx, { ...st, keep: id }, [], id + ' を残します（いちばん新しい1件）');
  if (!st.ctk) return finish(ctx, [], '削除に要る値（ctk）がありません');
  return { kind: 'next', next: deleteStep(id, st.ctk, { ...ctx, esutamaNoteDd: { ...st, deleted: [...st.deleted, id] } }), audits: [], note: id + ' を消します' };
}

/** 消した（返事では決めつけない。最後に一覧を読み直して確かめる） */
export function afterEsutamaNoteDelete(input: Input, ctx0: RelayFlowContext): FlowOutcome {
  const ctx: RelayFlowContext = { ...ctx0, cookie: mergeCookies(ctx0.cookie, input.headers['set-cookie'] as string | string[] | undefined) };
  const st = ctx.esutamaNoteDd;
  if (!st) return finish(ctx, [], '写メNote の片づけ: 状態が文脈にありません');
  // ★ 断られた（4xx/5xx）ら、ここでやめて読み直しへ（続けて押し続けない）
  if (input.status >= 400) return nextCheck(ctx, { ...st, queue: [] }, [], (st.current ?? '') + ' の削除を断られました（' + input.status + '）');
  return nextCheck(ctx, st, [], (st.current ?? '') + ' の削除を送りました');
}

/** 読み直した（消した番号が一覧から消えたか） */
export function afterEsutamaNoteVerify(input: Input, ctx0: RelayFlowContext): FlowOutcome {
  const ctx: RelayFlowContext = { ...ctx0, cookie: mergeCookies(ctx0.cookie, input.headers['set-cookie'] as string | string[] | undefined) };
  const st = ctx.esutamaNoteDd;
  if (!st) return finish(ctx, [], '写メNote の片づけ: 状態が文脈にありません');
  const ok = input.status >= 200 && input.status < 400;
  const p = ok ? parseNoteListPage(input.body, st.page) : null;
  if (!p || !p.isList) {
    return finish(ctx, [{
      event: 'delete_diary', outcome: 'stopped',
      summary: '写メNote: ' + who(ctx) + '同じ内容の前の写メNote を ' + st.deleted.length + '件消しに行きましたが、一覧を読み直せず消えたかを確かめられませんでした',
      detail: { kind: 'esutama_note', ids: st.deleted.join(','), keep: st.keep, status: input.status, flowId: ctx.flowId },
    }], '読み直せませんでした');
  }
  const seen = [...st.seen, ...p.cards.map((c) => c.id)];
  if (p.hasNext && st.page < Math.max(1, st.pages)) {
    return { kind: 'next', next: listStep('esutama_note_verify', st.page + 1, { ...ctx, esutamaNoteDd: { ...st, seen, page: st.page + 1 } }), audits: [], note: '読み直し ' + st.page + 'ページ目' };
  }
  const remained = st.deleted.filter((id) => seen.includes(id));
  const gone = st.deleted.filter((id) => !seen.includes(id));
  const atOf = (id: string) => st.found.find((f) => f.id === id)?.at ?? null;
  const audits: FlowAudit[] = [];
  if (gone.length > 0) {
    audits.push({
      event: 'delete_diary', outcome: 'ok',
      summary: '写メNote: ' + who(ctx) + '同じ内容の前の写メNote を ' + gone.length + '件消しました（「' + sentNoteTitle(ctx.esutamaNote?.title ?? '').slice(0, 30) + '」・新しい1件は残しています）',
      detail: { kind: 'esutama_note', ids: gone.join(','), ats: gone.map((id) => atOf(id) ?? '').join(','), keep: st.keep, castId: ctx.esutamaDiaryCastId ?? null, flowId: ctx.flowId },
    });
  }
  if (remained.length > 0) {
    audits.push({
      event: 'delete_diary', outcome: 'failed',
      summary: '写メNote: ' + who(ctx) + '前の写メNote ' + remained.length + '件を消しに行きましたが、読み直すとまだ残っていました',
      detail: { kind: 'esutama_note', ids: remained.join(','), keep: st.keep, castId: ctx.esutamaDiaryCastId ?? null, flowId: ctx.flowId },
    });
  }
  return finish({ ...ctx, esutamaNoteDd: { ...st, seen, remained } }, audits, '前の同じ写メNote を ' + gone.length + '件消しました' + (remained.length > 0 ? '（' + remained.length + '件は残っています）' : ''));
}
