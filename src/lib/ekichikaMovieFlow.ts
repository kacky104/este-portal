// 駅ちかの動画投稿の段（第1840便・2026-11-09）。★ 判断と要求は lib/ekichikaMovie.ts（純粋関数）
//
//   login →（ctx.ekichikaMovie があると）
//     ekimovie_form   GET  /admin/movies/edit   … 投稿の鍵（csrf）と 女の子の名前→番号（読めた＝ログインできた）
//     ekimovie_list   GET  /admin/movies/       …（同じ記事を消すときだけ）同じ女の子・同じタイトルの記事を探す
//     ekimovie_delete POST /admin/movies/       …（あれば）消す
//     ekimovie_post   POST /admin/movies/edit/  … multipart（動画は Supabase の署名付き URL から VPS が取る）
//     ekimovie_verify GET  /admin/movies/       … 新しい記事が一覧に出たか
//   ★ 相手を書き換えるのは ekimovie_delete / ekimovie_post だけ（送り直さない・lib/relayRetry.ts）
//   ★ 結果は outcome.ekichikaMovie に入れて返す。表（conecf_ekichika_movies）に書くのは呼び出し側（app/lib/media/relayFlow.ts）

import type { FlowAudit, FlowOutcome, RelayFlowContext } from './relayFlow';
import { mergeCookies } from './relayJob';
import {
  EKICHIKA_MOVIE_EDIT_URL, EKICHIKA_MOVIE_LIST_URL, buildMovieGet, buildMovieDelete, buildMoviePost,
  parseEkichikaMovieForm, parseEkichikaMovieList, sameMovieRows, normMovieName,
} from './ekichikaMovie';

type Input = { status: number; headers: Record<string, string | string[]>; body: string };
const cookieOf = (input: Input, ctx: RelayFlowContext) => mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
const locationOf = (input: Input) => { const v = input.headers['location']; return Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''); };
/** ★ relayFlow.ts の looksLikeEkichikaLoginPage と同じ判定（循環 import を避けて写した） */
function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  if (/<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i.test(h)) return true;
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
}
const loggedOut = (input: Input) => (input.status >= 300 && input.status < 400 && /\/admin\/login/.test(locationOf(input))) || (input.status === 200 && looksLikeEkichikaLoginPage(input.body));

function loginStop(ctx: RelayFlowContext, input: Input, stage: string): FlowOutcome {
  return { kind: 'stop', audits: [{ event: 'login', outcome: 'failed', summary: '駅ちかにログインできませんでした。ログインID・パスワードをご確認ください', detail: { httpStatus: input.status, reason: 'rejected', stage, flowId: ctx.flowId } }], note: stage + ' でログイン画面に戻された' };
}
function finish(ctx: RelayFlowContext, r: { done: boolean; outcome: string }, audits: FlowAudit[], note: string): FlowOutcome {
  const m = ctx.ekichikaMovie;
  return {
    kind: 'done', audits, note,
    ekichikaMovie: { index: m?.index ?? 0, done: r.done, outcome: r.outcome, lastAt: r.done ? new Date().toISOString() : null, deleted: m?.deleted ?? 0 },
  };
}

/** ログインできたら、投稿の画面を読む */
export function ekichikaMovieFirstStep(ctx: RelayFlowContext, cookie: string): FlowOutcome {
  const r = buildMovieGet(cookie, EKICHIKA_MOVIE_EDIT_URL);
  return { kind: 'next', next: { purpose: 'ekimovie_form', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: 'ログインの応答を受け取った → 動画投稿の画面を読む（読めた＝ログインできた）' };
}

function postStep(ctx: RelayFlowContext, cookie: string, note: string): FlowOutcome {
  const m = ctx.ekichikaMovie!;
  let r;
  try {
    r = buildMoviePost(cookie, { csrf: m.csrf ?? '', girls: [] }, m.girlId ?? '', { title: m.title, body: m.body }, { url: m.videoUrl, contentType: m.videoType });
  } catch (e) {
    return finish(ctx, { done: false, outcome: 'error: ' + (e as Error).message }, [], '投稿を組めなかった: ' + (e as Error).message);
  }
  return { kind: 'next', next: { purpose: 'ekimovie_post', method: r.method, url: r.url, headers: r.headers, body: '', multipart: r.multipart, context: { ...ctx, cookie } }, audits: [], note: note + ' → ' + m.girlName + 'さんの動画を投稿する' };
}

export function afterEkimovieForm(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'movie_form');
  const m = ctx.ekichikaMovie;
  if (!m) return finish(ctx, { done: false, outcome: 'error: 中身が無い' }, [], '文脈に動画投稿が無い');
  const form = input.status < 300 ? parseEkichikaMovieForm(input.body) : null;
  if (!form || !form.csrf) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の画面を読めなかった' }, [{ event: 'read_bump', outcome: 'failed', summary: '駅ちかの動画投稿の画面を読み取れませんでした（画面の作りが変わった可能性があります）', detail: { opt: 'ekichika_movie', httpStatus: input.status, flowId: ctx.flowId } }], '動画投稿のフォームが無い');
  }
  const girl = form.girls.find((g) => normMovieName(g.name) === normMovieName(m.girlName));
  if (!girl) {
    return finish(ctx, { done: false, outcome: 'no_girl' }, [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかの動画投稿: ' + m.girlName + ' さんが駅ちかの女の子一覧にいませんでした', detail: { opt: 'ekichika_movie', reason: 'no_girl', flowId: ctx.flowId } }], m.girlName + 'さんが駅ちかにいない');
  }
  const next: RelayFlowContext = { ...ctx, cookie, ekichikaMovie: { ...m, csrf: form.csrf, girlId: girl.id } };
  if (m.deleteSame) {
    const r = buildMovieGet(cookie, EKICHIKA_MOVIE_LIST_URL, EKICHIKA_MOVIE_EDIT_URL);
    return { kind: 'next', next: { purpose: 'ekimovie_list', method: r.method, url: r.url, headers: r.headers, body: '', context: next }, audits: [], note: '動画投稿の画面を読めた → 消す記事を探しに一覧を読む' };
  }
  return postStep(next, cookie, '動画投稿の画面を読めた');
}

export function afterEkimovieList(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'movie_list');
  const m = ctx.ekichikaMovie!;
  const list = parseEkichikaMovieList(input.body);
  const same = sameMovieRows(list.rows, m.girlName, m.title);
  if (same.length === 0 || !list.shopId) return postStep({ ...ctx, cookie }, cookie, '消す記事は無かった');
  let r;
  try { r = buildMovieDelete(cookie, list.shopId, same.map((x) => x.id)); } catch { return postStep({ ...ctx, cookie }, cookie, '消す要求を組めなかった（消さずに進む）'); }
  return {
    kind: 'next',
    next: { purpose: 'ekimovie_delete', method: r.method, url: r.url, headers: r.headers, body: r.body, context: { ...ctx, cookie, ekichikaMovie: { ...m, deleted: same.length } } },
    audits: [], note: '同じ女の子・同じタイトルの記事 ' + same.length + '件を消す',
  };
}

export function afterEkimovieDelete(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'movie_delete');
  // ★ 消せなくても投稿は進める（駅ちかの決まり「5分以内に同じタイトル」は前の記事が古ければかからない）
  return postStep({ ...ctx, cookie }, cookie, '前の記事を消した（' + input.status + '）');
}

export function afterEkimoviePost(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const cookie = cookieOf(input, ctx);
  if (loggedOut(input)) return loginStop(ctx, input, 'movie_post');
  const m = ctx.ekichikaMovie!;
  if (input.status >= 400) {
    return finish(ctx, { done: false, outcome: 'error: 投稿の応答 ' + input.status }, [{ event: 'push_bump', outcome: 'failed', summary: '駅ちかへ動画を投稿できませんでした（応答 ' + input.status + '）', detail: { opt: 'ekichika_movie', httpStatus: input.status, flowId: ctx.flowId } }], '投稿の応答が ' + input.status);
  }
  const r = buildMovieGet(cookie, EKICHIKA_MOVIE_LIST_URL, EKICHIKA_MOVIE_EDIT_URL);
  return { kind: 'next', next: { purpose: 'ekimovie_verify', method: r.method, url: r.url, headers: r.headers, body: '', context: { ...ctx, cookie } }, audits: [], note: m.girlName + 'さんの動画を投稿した（' + input.status + '）→ 一覧で確かめる' };
}

export function afterEkimovieVerify(input: Input, ctx: RelayFlowContext): FlowOutcome {
  const m = ctx.ekichikaMovie!;
  const list = parseEkichikaMovieList(input.body);
  const found = sameMovieRows(list.rows, m.girlName, m.title).length > 0;
  // ★ 確かめられなくても「送れた」扱い（投稿の応答はエラーではなかった。もう一度送ると2件載る）
  return finish(ctx, { done: true, outcome: (found ? 'ok: ' : 'ok_unverified: ') + m.girlName },
    [{ event: 'push_bump', outcome: 'ok', summary: '駅ちかに ' + m.girlName + ' さんの動画「' + m.title.slice(0, 20) + '」を投稿しました' + (m.deleted ? '（前の同じ記事 ' + m.deleted + '件を消しました）' : '') + (found ? '' : '（一覧ではまだ確かめられていません）'), detail: { opt: 'ekichika_movie', verified: found, deleted: m.deleted ?? 0, flowId: ctx.flowId } }],
    found ? '動画を投稿できた（一覧で確かめた）' : '動画を投稿した（一覧では確かめられなかった）');
}
