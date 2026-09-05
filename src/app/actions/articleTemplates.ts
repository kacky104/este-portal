'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { listMediaAudit } from '@/app/lib/media/mediaAudit';
import {
  articleSlotAdviceAll,
  articleSlotSummary,
  type ArticleSlotAdvice,
  type ArticleSlotRow,
} from '@/lib/articleSlotAdvice';
import {
  isArticleSlot,
  articleSlotLabel,
  checkArticleTitle,
  checkArticleBody,
} from '@/lib/ekichikaArticle';
import {
  ARTICLE_POSTS_PER_DAY_DEFAULT,
  ARTICLE_POSTS_PER_DAY_MAX,
  articlePostTimeLabels,
} from '@/lib/articleRotation';
import { dayKeyJST } from '@/lib/announceAuto';
import { readImageSize } from '@/lib/imageSize';
import { checkArticleImage } from '@/lib/ekichikaArticleImage';

// 駅ちかの新着情報：枠の状態とテンプレート（第158便・2026-09-05）。
//
// ★★★ この画面が守ること
//   ① **店舗様が選んだ枠しか触らない。** ★ 枠に既定値を作らない（選ばせる）
//   ② **送る前に枠の状態を見せる。** ★ 非表示・カラを、登録の前に言う
//      ★ 2026-09-05 の実弾で、送ってから「公開ページに出ていない」と分かった。★ 順番を逆にする
//   ③ **作っただけでは何も起きない。** ★ is_active / auto_enabled の既定は false（第43便の作法）
//
// ★★ 秘密は扱わない。★ ログイン情報には触れない（それは mediaCredentials.ts の仕事）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVIDER = 'ekichika';
/** 店舗様がフクエスに上げた写真の置き場。★ 中継役が取りに来られるのはここだけ（第106便） */
const PHOTO_BUCKET = 'therapist-photos';
const SAFE_PATH = /^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/;

async function assertSalonOwner(salonId: number): Promise<Result<{ userId: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };

  const isOwner = (salon.owner_id as string | null) === user.id;
  if (!isOwner && user.id !== ADMIN_UUID) return { ok: false, error: 'この店舗の操作権限がありません' };
  return { ok: true, data: { userId: user.id } };
}

/**
 * ★ 「いまの写真のまま」を null に寄せる。
 *   ★★ '' と null を分けない——どちらも【触らない】という同じ意味なので、DBでは null に統一する。
 *   ★ 数字以外は受け取らない（★ 駅ちかの girl_id は数字）
 */
function girlIdOrNull(v: unknown): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return /^\d{1,12}$/.test(t) ? t : null;
}

/** ★ 数字でなければ null。★ 「送らない」に寄せる（★ 0 や NaN で送らない） */
function therapistIdOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

export type ArticleTemplateRow = {
  id: number;
  articleSlot: number;
  slotLabel: string;
  title: string;
  body: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  /**
   * ★ 誰の紹介か（駅ちかの番号）。★ null なら【いまの写真のまま】。
   *   ★ 0や空文字と混ぜない（作法3-5）
   */
  girlId: string | null;
  /** ★ その人の名前（写しから引く）。★ 写しに無ければ空 */
  girlName: string;
  /**
   * ★★★ フクエスの写真を送るとき、その写真の持ち主（第162便）。
   *   ★ null なら送らない。★ girlId（駅ちか側の写真）とは別の道
   */
  therapistId: number | null;
  therapistName: string;
};

export type ArticleBoard = {
  /** ★ 必ず5枠ぶん。★ 読めていない枠は「分からない」 */
  slots: ArticleSlotAdvice[];
  /** ★ 画面の上に出す1行 */
  summary: string;
  /** 枠の状態をいつ読んだか。★ 一度も読んでいなければ null（★ 0と混ぜない） */
  readAt: string | null;
  templates: ArticleTemplateRow[];
  postsPerDay: number;
  autoEnabled: boolean;
  /**
   * ★ 何時ごろに出るか（店舗様に見せる）。★ 選ばせない（第67便と同じ作法）。
   * ★★★ null は【出さない】（1日0回）。★ 空配列に潰さない（0と不明を混ぜない・作法3-5）。
   */
  postTimes: string[] | null;
  /** ★ 自動で回している本数。★ 0なら回らない */
  activeCount: number;
  /**
   * ★★★ 駅ちかで選べる人（第160便）。★ 相手の編集ページが出している選択肢そのまま。
   *   ★ null は【まだ読めていない】。★ [] は【読めたが0人】。★ 混ぜない
   */
  girls: Array<{ id: string; name: string }> | null;
  /**
   * ★★★ フクエスの写真を送れる方（第162便）。
   *   ★ プロフィール写真が therapist-photos に入っている方だけ。★ 無い方は出さない
   *     （★ 選べるように見せてから断らない・設計メモ §32）
   */
  therapists: Array<{ id: number; name: string }>;
  /**
   * ★★★ 今日この枠へ出した本数（第159便）。★ 手で出したぶんも数える。
   *   ★ 区切りは営業日（朝6時）。★ 暦の0時ではない
   */
  postedToday: number;
  /**
   * 直近の送信の記録（新しい順）。★ 押したあと「どうなったか」を同じ画面で見せるため。
   * ★ 中継役が引き取るまで1〜2分かかるので、届くまではここが空のことがある。
   */
  runs: Array<{ id: number; event: string; outcome: string; summary: string; createdAt: string }>;
};

/** ★ 画面に出す新着情報の記録だけ。★ ほかの連携の記録（出勤・日記）は混ぜない */
const ARTICLE_EVENTS = new Set([
  'read_article_list', 'read_article', 'plan_article', 'push_article', 'verify_article', 'flow_stalled',
]);

/**
 * 画面ぜんぶを1回で返す。
 * ★★ 3つの箱（写し／テンプレート／設定）を読むだけ。★ 駅ちかへは触らない。
 */
export async function getArticleBoard(input: { salonId: string | number; slot?: number }): Promise<Result<ArticleBoard>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const svc = createServiceClient();

  const { data: snap, error: snapErr } = await svc
    .from('media_article_slots')
    .select('read_at, rows, girls')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  // ★★ 読めなかったときは【分からない】として返す。★ 「まだ読んでいない」と混ぜない
  if (snapErr) return { ok: false, error: '枠の状態を読み出せませんでした。時間をおいてお試しください' };

  const rows = Array.isArray(snap?.rows) ? (snap!.rows as ArticleSlotRow[]) : null;

  const { data: temps, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, article_slot, title, body, is_active, sort_order, updated_at, ekichika_girl_id, therapist_id, therapists(id, name)')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (tErr) return { ok: false, error: '登録した文章を読み出せませんでした。時間をおいてお試しください' };

  const { data: st, error: sErr } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled, last_day, last_count')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  if (sErr) return { ok: false, error: '設定を読み出せませんでした。時間をおいてお試しください' };

  // ★ 選べる人。★ 列がまだ無い／読めていないときは null（★ 空配列に潰さない）
  const girls = Array.isArray(snap?.girls) ? (snap!.girls as Array<{ id: string; name: string }>) : null;

  const templates: ArticleTemplateRow[] = (temps ?? []).map((r) => {
    const gid = r.ekichika_girl_id === null || r.ekichika_girl_id === undefined ? null : String(r.ekichika_girl_id);
    return {
      id: Number(r.id),
      articleSlot: Number(r.article_slot),
      slotLabel: articleSlotLabel(Number(r.article_slot)),
      title: String(r.title ?? ''),
      body: String(r.body ?? ''),
      isActive: r.is_active === true,
      sortOrder: Number(r.sort_order ?? 0),
      updatedAt: String(r.updated_at ?? ''),
      girlId: gid,
      // ★ 名前は写しから引く。★ 引けなければ空（★ 番号を名前の代わりに出さない）
      girlName: gid === null ? '' : (girls?.find((g) => g.id === gid)?.name ?? ''),
      therapistId: r.therapist_id === null || r.therapist_id === undefined ? null : Number(r.therapist_id),
      therapistName: String((r as { therapists?: { name?: string } | null }).therapists?.name ?? ''),
    };
  });

  // ★ 行が無い＝まだ決めていない＝既定。★ 0（送らない）と混ぜない
  const postsPerDay = st ? Number(st.posts_per_day) : ARTICLE_POSTS_PER_DAY_DEFAULT;

  // ★ 直近の記録。★ 読めなくても画面は出す（★ 記録が無いのと読めないのを画面で混ぜないよう空で返す）
  let runs: ArticleBoard['runs'] = [];
  try {
    const all = await listMediaAudit({ salonId, limit: 120, provider: PROVIDER, slot: mediaSlot });
    runs = all
      .filter((r) => ARTICLE_EVENTS.has(r.event))
      .slice(0, 12)
      .map((r) => ({ id: r.id, event: r.event, outcome: r.outcome, summary: r.summary, createdAt: r.createdAt }));
  } catch {
    runs = [];
  }

  // ★★ フクエスの写真を送れる方。★ 写真が入っている方だけを出す
  let therapists: ArticleBoard['therapists'] = [];
  {
    const { data: ths } = await svc
      .from('therapists').select('id, name, profile_image_url')
      .eq('salon_id', salonId)
      .order('name', { ascending: true });
    therapists = (ths ?? [])
      .filter((r) => String(r.profile_image_url ?? '').includes('/' + PHOTO_BUCKET + '/'))
      .map((r) => ({ id: Number(r.id), name: String(r.name ?? '') }));
  }

  // ★★ 今日ぶんは「区切りの日」が今日と同じときだけ数える。★ 昨日の数を持ち越さない
  const today = dayKeyJST(new Date());
  const postedToday = st && today !== null && String(st.last_day ?? '') === today ? Number(st.last_count ?? 0) : 0;

  return {
    ok: true,
    data: {
      slots: articleSlotAdviceAll(rows),
      summary: articleSlotSummary(rows),
      readAt: snap?.read_at ? String(snap.read_at) : null,
      templates,
      postsPerDay,
      autoEnabled: st?.auto_enabled === true,
      postTimes: articlePostTimeLabels(salonId, postsPerDay),
      activeCount: templates.filter((t) => t.isActive).length,
      girls,
      therapists,
      postedToday,
      runs,
    },
  };
}

/**
 * ★★★ いま1本出す（第159便）。★ **駅ちかの記事を書き換える。前の記事は消える。**
 *
 * ★★ 守っていること
 *   ① 送るのは【店舗様が選んだテンプレート1本】だけ。★ 内容はDBから読み直す（画面から受け取らない）
 *   ② 記事が無い枠へは送らない。★ 写しで弾き、★ 一覧の段（第156便）でもう一度弾く（二重）
 *   ③ 非表示の枠へは【送れる】。★ ただし記録に「公開ページには出ていません」と残る（第156便）
 */
export async function startArticlePost(input: {
  salonId: string | number;
  slot?: number;
  templateId: number;
}): Promise<Result<{ note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const svc = createServiceClient();

  // ★★★ 内容は【DBから読み直す】。★ 画面から送られてきた文字をそのまま駅ちかへ流さない
  const { data: t, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, article_slot, title, body, ekichika_girl_id, therapist_id')
    .eq('id', Number(input.templateId)).eq('salon_id', salonId).eq('provider', PROVIDER)
    .maybeSingle();
  if (tErr) return { ok: false, error: '文章を読み出せませんでした。時間をおいてお試しください' };
  if (!t) return { ok: false, error: 'その文章が見つかりません（画面を開き直してください）' };

  const articleSlot = Number(t.article_slot);
  if (!isArticleSlot(articleSlot)) return { ok: false, error: 'この文章には出す枠が入っていません' };

  const title = String(t.title ?? '');
  const body = String(t.body ?? '');
  const tc = checkArticleTitle(title);
  if (!tc.ok) return { ok: false, error: tc.message };
  const bc = checkArticleBody(body);
  if (!bc.ok) return { ok: false, error: bc.message };
  const girlId = girlIdOrNull(t.ekichika_girl_id);

  // ★★ 写しで先に弾く。★ 「まだ読んでいない」と「記事が無い」を分ける
  const { data: snap } = await svc
    .from('media_article_slots').select('rows')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  const rows = Array.isArray(snap?.rows) ? (snap!.rows as ArticleSlotRow[]) : null;
  if (rows === null) {
    return { ok: false, error: 'まず「いまの状態を読む」を押して、枠の状態を確かめてください' };
  }
  // ★★★ 第163便: 記事が無い枠でも【新しく作れる】。★ ここで弾かない。
  //   ★ 一覧に見当たらない枠だけ止める（★ 相手が枠を減らした等）
  const hit = rows.find((r) => r.slot === articleSlot) ?? null;
  if (hit === null) {
    return {
      ok: false,
      error: articleSlotLabel(articleSlot) + ' が駅ちかの一覧に見当たりません。「いまの状態を読む」を押してお確かめください',
    };
  }

  // ────────── ★★★ フクエスの写真を送るとき（第162便）──────────
  //   ★ 画像そのものはここを通さない。★ 在処と【実寸】だけを渡す（第106便・案B）。
  //   ★★ 実寸が要るのは切り抜きの物差しになるから。★ 決め打ちしない
  let file: { bucket: string; path: string; filename: string; contentType: string; width: number; height: number } | null = null;
  const therapistId = Number(t.therapist_id ?? 0);
  if (Number.isFinite(therapistId) && therapistId > 0) {
    const { data: th } = await svc
      .from('therapists').select('id, salon_id, name, profile_image_url')
      .eq('id', therapistId).maybeSingle();
    // ★★ 他店の子を指せないこと。★ id だけで引かない
    if (!th || Number(th.salon_id) !== salonId) {
      return { ok: false, error: 'この文章に設定された方が見つかりません（画面を開き直してください）' };
    }
    const url = String(th.profile_image_url ?? '');
    const i = url.indexOf('/' + PHOTO_BUCKET + '/');
    if (i < 0) return { ok: false, error: String(th.name ?? 'この方') + 'のプロフィール写真がフクエスに登録されていません' };
    const path = url.slice(i + PHOTO_BUCKET.length + 2).split('?')[0];
    if (!SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) {
      return { ok: false, error: '写真の在処が読めません' };
    }

    const { data: blob, error: dlErr } = await svc.storage.from(PHOTO_BUCKET).download(path);
    if (dlErr || !blob) return { ok: false, error: '写真を読み出せませんでした。時間をおいてお試しください' };
    const buf = new Uint8Array(await blob.arrayBuffer());
    const size = readImageSize(buf);
    // ★ 寸法が読めない＝jpg/png ではない。★ 送ってから断られない
    if (!size) return { ok: false, error: '写真を JPEG か PNG として読めませんでした' };
    const c = checkArticleImage({ bytes: buf.byteLength, contentType: size.type });
    if (!c.ok) return { ok: false, error: c.message };

    file = {
      bucket: PHOTO_BUCKET,
      path,
      // ★ 相手に見せる名前。★ 英数字と _ - . だけ（relayMultipart の決まり）
      filename: 'fukues_news_' + therapistId + '.' + (size.type === 'image/png' ? 'png' : 'jpg'),
      contentType: size.type,
      width: size.width,
      height: size.height,
    };
  }

  try {
    const r = await startRelayFlow({
      salonId, provider: PROVIDER, slot: mediaSlot,
      intent: 'article_push',
      article: {
        slot: articleSlot, title, body,
        // ★★★ フクエスの写真を送るなら、それが最優先（img_flg=0）
        ...(file !== null
          ? { image: 'upload' as const, file }
          // ★★ 駅ちかに登録済みの人の写真を使う（img_flg=1）
          : girlId !== null
            ? { girlId, image: 'girl' as const }
            // ★ どちらでもなければ何も渡さない＝【いまの写真のまま】。★ 駅ちかの画像に触らない
            : {}),
      },
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { note: r.note } };
  } catch (e) {
    console.error('[article] 送信を始められなかった', (e as Error).message);
    return { ok: false, error: '送信を開始できませんでした。時間をおいてお試しください' };
  }
}

/**
 * ★★★ 枠の状態を読みにいく。★ 一覧を読むだけ。★ **1文字も書かない。**
 *   login → article_list → 写して終わり。★ 編集ページも読まない。
 */
export async function readArticleSlots(input: { salonId: string | number; slot?: number }): Promise<Result<{ note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  try {
    const r = await startRelayFlow({
      salonId,
      provider: PROVIDER,
      slot: mediaSlot,
      intent: 'article_slots',
      actor: 'shop:' + guard.data.userId,
    });
    // ★ 断られた（別の手順が走っている）も、そのまま店舗様の言葉で返す。★ 握りつぶさない
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { note: r.note } };
  } catch (e) {
    console.error('[article] 枠の状態を読みにいけなかった', (e as Error).message);
    return { ok: false, error: '駅ちかの状態を読みにいけませんでした。時間をおいてお試しください' };
  }
}

/**
 * テンプレートを1本保存する（新規／上書き）。
 * ★★★ 枠は必ず選ばせる。★ 既定値を作らない（★ うっかり速報NEWSを上書きする道を残さない）。
 * ★★ タイトル・本文はここで弾く。★ 駅ちかへ送ってから断られるのは無駄。
 */
export async function saveArticleTemplate(input: {
  salonId: string | number;
  slot?: number;
  id?: number | null;
  articleSlot: number;
  title: string;
  body: string;
  isActive?: boolean;
  /**
   * ★ 誰の紹介か（駅ちかの番号）。★ null / '' なら【いまの写真のまま】。
   *   ★★ 送らなければ（undefined）いまの設定を変えない
   */
  girlId?: string | null;
  /**
   * ★ フクエスの写真を送るときの持ち主（第162便）。★ null なら送らない。
   *   ★★ girlId（駅ちか側の写真）とは【別の道】。★ 両方入れたら girlId を優先しない——
   *     ★ 送るのは1枚なので、画面で1つしか選べない形にしてある
   */
  therapistId?: number | null;
}): Promise<Result<{ id: number }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const articleSlot = Number(input.articleSlot);
  if (!isArticleSlot(articleSlot)) return { ok: false, error: 'どの枠へ出すかを選んでください' };

  const title = String(input.title ?? '');
  const body = String(input.body ?? '');
  const t = checkArticleTitle(title);
  if (!t.ok) return { ok: false, error: t.message };
  const b = checkArticleBody(body);
  if (!b.ok) return { ok: false, error: b.message };

  const svc = createServiceClient();
  const id = Number(input.id);

  if (Number.isFinite(id) && id > 0) {
    // ★★ 必ず salon_id で絞る。★ id だけで更新すると他店の行を書き換えられる
    const { data, error } = await svc
      .from('salon_article_templates')
      .update({
        article_slot: articleSlot,
        title: title.trim(),
        body,
        ...(input.isActive === undefined ? {} : { is_active: input.isActive === true }),
        ...(input.girlId === undefined ? {} : { ekichika_girl_id: girlIdOrNull(input.girlId) }),
        ...(input.therapistId === undefined ? {} : { therapist_id: therapistIdOrNull(input.therapistId) }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('salon_id', salonId).eq('provider', PROVIDER)
      .select('id').maybeSingle();
    if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
    if (!data) return { ok: false, error: 'その文章が見つかりません（画面を開き直してください）' };
    return { ok: true, data: { id: Number(data.id) } };
  }

  const { data, error } = await svc
    .from('salon_article_templates')
    .insert({
      salon_id: salonId,
      provider: PROVIDER,
      slot: mediaSlot,
      article_slot: articleSlot,
      title: title.trim(),
      body,
      // ★★★ 既定は「回さない」。★ 作っただけでは何も起きない
      is_active: input.isActive === true,
      // ★ 既定は null＝いまの写真のまま。★ 駅ちかの画像に触らない
      ekichika_girl_id: girlIdOrNull(input.girlId),
      therapist_id: therapistIdOrNull(input.therapistId),
    })
    .select('id').maybeSingle();
  if (error || !data) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { id: Number(data.id) } };
}

/** テンプレートを1本消す。★ 消すのは店舗様が書いた文章だけ。★ 駅ちかの記事は消えない */
export async function deleteArticleTemplate(input: { salonId: string | number; id: number }): Promise<Result<{ id: number }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const id = Number(input.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: '指定が不正です' };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_article_templates')
    .delete()
    .eq('id', id).eq('salon_id', salonId).eq('provider', PROVIDER)
    .select('id').maybeSingle();
  if (error) return { ok: false, error: '消せませんでした。時間をおいてお試しください' };
  if (!data) return { ok: false, error: 'その文章が見つかりません（画面を開き直してください）' };
  return { ok: true, data: { id: Number(data.id) } };
}

/** 1日の本数と、自動の元栓。★ どちらも既定は「回さない」側 */
export async function saveArticleSettings(input: {
  salonId: string | number;
  slot?: number;
  postsPerDay?: number;
  autoEnabled?: boolean;
}): Promise<Result<{ postsPerDay: number; autoEnabled: boolean }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const svc = createServiceClient();
  const { data: cur } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();

  const n = Number(input.postsPerDay);
  const postsPerDay = Number.isFinite(n)
    ? Math.min(Math.max(Math.trunc(n), 0), ARTICLE_POSTS_PER_DAY_MAX)
    : (cur ? Number(cur.posts_per_day) : ARTICLE_POSTS_PER_DAY_DEFAULT);
  const autoEnabled = input.autoEnabled === undefined ? cur?.auto_enabled === true : input.autoEnabled === true;

  const { error } = await svc.from('salon_article_settings').upsert(
    {
      salon_id: salonId, provider: PROVIDER, slot: mediaSlot,
      posts_per_day: postsPerDay,
      auto_enabled: autoEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) return { ok: false, error: '設定を保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { postsPerDay, autoEnabled } };
}
