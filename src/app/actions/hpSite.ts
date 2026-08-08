'use server';

import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { SALON_THEMES } from '@/app/lib/themes';
import {
  type HpSite,
  type HpSiteFormInput,
  type HpSiteStatus,
  isHpTemplateKey,
  isHpSiteStatus,
  isSafeHttpUrl,
  isSafeImageUrl,
  sanitizeHpBlocks,
  sanitizeHpBanners,
  sanitizeHpHeroImages,
  MAX_HP_HERO_IMAGES,
  MAX_HP_BANNERS,
  MAX_HP_CATCH_LEN,
  MAX_HP_TITLE_LEN,
  MAX_HP_CONCEPT_LEN,
} from '@/app/lib/hpSite';

// 公式ホームページ（段階1）のサーバーアクション群。
//
// 方針（actions/jobs.ts の作法を踏襲）:
//  - エラーは握りつぶさず文言化して画面に返す。
//  - 読み書きはすべて認証ユーザークライアント（RLS経由）。owner本人 or ADMIN_UUID を
//    salons.owner_id 照合で二重チェックする（RLS 側にも同等のポリシーあり＝多重防御）。
//  - 行の作成（契約成立）は運営が行う（段階1では SQL、段階4で /admin にUI予定）。
//    店舗側は「既にある行の編集」だけができる。
//  - 公開ページ（/hp）は段階2で作るため、ここではまだ revalidatePath しない。
//    段階2で導入したら、保存成功時に該当ドメインの revalidate を必ず追加すること。

type Err = { ok: false; error: string };

const SITE_COLUMNS =
  'salon_id, slug, domain, status, template_key, theme_key, hero_images, hero_catch, concept_title, concept_text, concept_image_url, blocks, banners, updated_at';

// ── 認証・所有権 ───────────────────────────────────────
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  return { ok: true as const, user, supabase };
}

async function assertSalonOwner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  salonId: number,
): Promise<{ ok: true } | Err> {
  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== userId && userId !== ADMIN_UUID) {
    return { ok: false, error: 'この店舗の公式HPを操作する権限がありません' };
  }
  return { ok: true };
}

// ── 行→アプリ内の形 ───────────────────────────────────
function mapSiteRow(row: Record<string, unknown>): HpSite {
  const status = row.status;
  const template = row.template_key;
  return {
    salon_id:          Number(row.salon_id),
    slug:              (row.slug as string) ?? '',
    domain:            (row.domain as string | null) ?? null,
    status:            isHpSiteStatus(status) ? status : 'draft',
    template_key:      isHpTemplateKey(template) ? template : 'a',
    theme_key:         (row.theme_key as string) ?? 'white',
    hero_images:       sanitizeHpHeroImages(row.hero_images),
    hero_catch:        (row.hero_catch as string) ?? '',
    concept_title:     (row.concept_title as string) ?? '',
    concept_text:      (row.concept_text as string) ?? '',
    concept_image_url: (row.concept_image_url as string | null) ?? null,
    blocks:            sanitizeHpBlocks(row.blocks),
    banners:           sanitizeHpBanners(row.banners),
    updated_at:        (row.updated_at as string) ?? '',
  };
}

// ── 取得 ─────────────────────────────────────────────
/** 自店の公式HP設定を取得。行が無い（未契約）場合は site: null。 */
export async function getMyHpSite(
  salonId: number,
): Promise<{ ok: true; site: HpSite | null } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const { data, error } = await auth.supabase
    .from('salon_sites')
    .select(SITE_COLUMNS)
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: `取得に失敗しました: ${error.message}` };
  return { ok: true, site: data ? mapSiteRow(data as Record<string, unknown>) : null };
}

// ── 保存 ─────────────────────────────────────────────
/** 店舗が編集できる項目のみ保存する（slug / domain / status は対象外）。 */
export async function saveMyHpSite(
  salonId: number,
  input: HpSiteFormInput,
): Promise<{ ok: true; site: HpSite } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  // ── バリデーション（不正はエラーで返す。黙って丸めるのはブロック設定のみ） ──
  if (!isHpTemplateKey(input.template_key)) {
    return { ok: false, error: 'ひな形の指定が正しくありません' };
  }
  if (!SALON_THEMES.some((t) => t.key === input.theme_key)) {
    return { ok: false, error: 'テーマカラーの指定が正しくありません' };
  }
  if (!Array.isArray(input.hero_images) || input.hero_images.length > MAX_HP_HERO_IMAGES) {
    return { ok: false, error: `トップ画像は最大${MAX_HP_HERO_IMAGES}枚です` };
  }
  if (input.hero_images.some((u) => !isSafeImageUrl(u))) {
    return { ok: false, error: 'トップ画像のURLが正しくありません' };
  }
  if (input.hero_catch.length > MAX_HP_CATCH_LEN) {
    return { ok: false, error: `キャッチコピーは${MAX_HP_CATCH_LEN}文字以内です` };
  }
  if (input.concept_title.length > MAX_HP_TITLE_LEN) {
    return { ok: false, error: `コンセプトの見出しは${MAX_HP_TITLE_LEN}文字以内です` };
  }
  if (input.concept_text.length > MAX_HP_CONCEPT_LEN) {
    return { ok: false, error: `コンセプト本文は${MAX_HP_CONCEPT_LEN}文字以内です` };
  }
  if (input.concept_image_url !== null && !isSafeImageUrl(input.concept_image_url)) {
    return { ok: false, error: 'コンセプト画像のURLが正しくありません' };
  }
  if (!Array.isArray(input.banners) || input.banners.length > MAX_HP_BANNERS) {
    return { ok: false, error: `バナーは最大${MAX_HP_BANNERS}枠です` };
  }
  for (const b of input.banners) {
    if (!isSafeImageUrl(b.image_url)) return { ok: false, error: 'バナー画像のURLが正しくありません' };
    if (!isSafeHttpUrl(b.link)) return { ok: false, error: 'バナーのリンクは http(s) のURLで入力してください' };
  }

  const payload = {
    template_key:      input.template_key,
    theme_key:         input.theme_key,
    hero_images:       input.hero_images,
    hero_catch:        input.hero_catch.trim(),
    concept_title:     input.concept_title.trim(),
    concept_text:      input.concept_text.trim(),
    concept_image_url: input.concept_image_url,
    blocks:            sanitizeHpBlocks(input.blocks),
    banners:           input.banners,
    updated_at:        new Date().toISOString(),
  };

  const { data, error } = await auth.supabase
    .from('salon_sites')
    .update(payload)
    .eq('salon_id', salonId)
    .select(SITE_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  if (!data) {
    // 行が無い＝未契約（または解約済み）。店舗側から行は作らせない。
    return { ok: false, error: '公式HPの契約情報が見つかりません。運営事務局までお問い合わせください' };
  }
  return { ok: true, site: mapSiteRow(data as Record<string, unknown>) };
}

// ── 公開／非公開の切替 ─────────────────────────────────
/** draft ⇔ live の切替のみ。suspended（運営による停止）は店舗側から変更できない。 */
export async function setMyHpSiteLive(
  salonId: number,
  live: boolean,
): Promise<{ ok: true; status: HpSiteStatus } | Err> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const own = await assertSalonOwner(auth.supabase, auth.user.id, salonId);
  if (!own.ok) return own;

  const { data: current, error: readError } = await auth.supabase
    .from('salon_sites')
    .select('status')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (readError || !current) {
    return { ok: false, error: '公式HPの契約情報が見つかりません' };
  }
  if (current.status === 'suspended') {
    return { ok: false, error: '現在このHPは運営により停止中です。運営事務局までお問い合わせください' };
  }

  const next: HpSiteStatus = live ? 'live' : 'draft';
  const { error } = await auth.supabase
    .from('salon_sites')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('salon_id', salonId);
  if (error) return { ok: false, error: `切替に失敗しました: ${error.message}` };
  return { ok: true, status: next };
}
