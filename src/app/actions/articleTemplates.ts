'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
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

export type ArticleTemplateRow = {
  id: number;
  articleSlot: number;
  slotLabel: string;
  title: string;
  body: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
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
};

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
    .select('read_at, rows')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  // ★★ 読めなかったときは【分からない】として返す。★ 「まだ読んでいない」と混ぜない
  if (snapErr) return { ok: false, error: '枠の状態を読み出せませんでした。時間をおいてお試しください' };

  const rows = Array.isArray(snap?.rows) ? (snap!.rows as ArticleSlotRow[]) : null;

  const { data: temps, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, article_slot, title, body, is_active, sort_order, updated_at')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (tErr) return { ok: false, error: '登録した文章を読み出せませんでした。時間をおいてお試しください' };

  const { data: st, error: sErr } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  if (sErr) return { ok: false, error: '設定を読み出せませんでした。時間をおいてお試しください' };

  const templates: ArticleTemplateRow[] = (temps ?? []).map((r) => ({
    id: Number(r.id),
    articleSlot: Number(r.article_slot),
    slotLabel: articleSlotLabel(Number(r.article_slot)),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    isActive: r.is_active === true,
    sortOrder: Number(r.sort_order ?? 0),
    updatedAt: String(r.updated_at ?? ''),
  }));

  // ★ 行が無い＝まだ決めていない＝既定。★ 0（送らない）と混ぜない
  const postsPerDay = st ? Number(st.posts_per_day) : ARTICLE_POSTS_PER_DAY_DEFAULT;

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
    },
  };
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
