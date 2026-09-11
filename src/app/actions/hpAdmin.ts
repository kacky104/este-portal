'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import {
  type HpSite,
  type HpContentInput,
  type HpSiteStatus,
  type HpTemplateKey,
  HP_SITE_COLUMNS,
  hpSiteKeyColumn,
  normalizeHpSiteKey,
  mapHpSiteRow,
  isHpTemplateKey,
  isValidHpColor,
  isSafeHttpUrl,
  isSafeImageUrl,
  sanitizeHpBlocks,
  sanitizeHpLinkBanners,
  sanitizeHpHeroSlides,
  hpHeroSlidesToImages,
  MAX_HP_HERO_SLIDES,
  MAX_HP_BANNERS,
  MAX_HP_CATCH_LEN,
  MAX_HP_TITLE_LEN,
  MAX_HP_CONCEPT_LEN,
} from '@/app/lib/hpSite';

// 公式ホームページ 段階3（2026-08-09）のサーバーアクション群。
//
// 入り口は /mypage ではなく【店舗ドメイン/admin】（proxy.ts が /hp/{ドメイン}/admin へ rewrite）。
// 呼び出し側は URLキー（slug または独自ドメイン）を渡すだけでよく、salon_id はここで解決する。
//
// 権限は3種類:
//   operator  … 運営（ADMIN_UUID）。何でもできる
//   owner     … salons.owner_id 本人。写真・文章の編集ができる
//
// ★★★ 2026-09-12（第280便・カッキーさんの指示）: 「HP管理者アカウント（siteAdmin）」を
//   【完全に閉じた】。★ 誰も発行していないうちに畳む、というカッキーさんの判断。
//   ★ 外したもの: 役割 siteAdmin ／ 招待・再送・解除 ／ 本人化（claimHpAdmin）。
//   ★ これで、この画面に入れるのは【運営とオーナー様だけ】。
//   ★ salon_sites.admin_email / admin_user_id の【列は残してある】（SQLは触っていない）。
//     ★ 読みにも書きにも行かなくなっただけ。★ 戻すときは列がそのまま使える。
//
// 列単位の制限は RLS では表現できないため、ここが最後の砦になる:
//   - slug / domain / status(suspended) / design_locked は payload に載せない
//   - ひな形・カラーは confirmHpDesign（design_locked=false のとき1回だけ）でしか書かない

type Err = { ok: false; error: string };

export type HpAdminRole = 'operator' | 'owner';

export type HpAdminContext = {
  site:       HpSite;
  salonName:  string;
  role:       HpAdminRole;
};

// ── 認証・権限 ─────────────────────────────────────────
type Svc = ReturnType<typeof createServiceClient>;

type Resolved = {
  /** 更新用クライアント。権限判定はここ（resolveAccess）で済ませ、書き込みは service_role で
   *  列を限定して行う（RLS に HP管理者を足さずに済ませるため。castInvite と同じ作法）。 */
  svc:      Svc;
  userId:   string;
  site:     HpSite;
  salonName: string;
  role:     HpAdminRole;
};

/**
 * URLキー → サイト行を引き、ログイン中ユーザーの権限を判定する。
 * 行が無い場合と権限が無い場合で文言を分ける（存在の有無は公開ページで分かるため隠さない）。
 */
async function resolveAccess(siteKey: string): Promise<Resolved | Err> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const key = normalizeHpSiteKey(siteKey);
  if (!key) return { ok: false, error: 'サイトの指定が正しくありません' };

  // ★ service_role で読む（★ 非表示のデモ店も引けるようにするため。公開ページの data.ts と同じ理由）。
  //   ★ admin_email / admin_user_id は【もう読まない】（第280便で担当者アカウントを閉じたため）。
  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from('salon_sites')
    .select(HP_SITE_COLUMNS)
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();
  if (error) return { ok: false, error: `サイト情報の取得に失敗しました: ${error.message}` };
  if (!row) return { ok: false, error: 'このサイトの契約情報が見つかりません' };

  const site = mapHpSiteRow(row as Record<string, unknown>);

  const { data: salon } = await svc
    .from('salons')
    .select('name, owner_id')
    .eq('id', site.salon_id)
    .maybeSingle();
  const ownerId = (salon?.owner_id as string | null) ?? null;
  const salonName = (salon?.name as string | null) ?? '';

  let role: HpAdminRole | null = null;
  if (user.id === ADMIN_UUID) role = 'operator';
  else if (ownerId && ownerId === user.id) role = 'owner';
  if (!role) return { ok: false, error: 'このサイトを操作する権限がありません' };

  return {
    svc,
    userId: user.id,
    site,
    salonName,
    role,
  };
}

/**
 * 保存後に公開ページのISRを飛ばす。暫定URLと独自ドメインの両方のキャッシュを消す。
 *
 * ★★ 2026-08-25（第35便・禁則227の残り）: 実URLの revalidatePath ループを外した。
 *   Next 16.2.9 では generateStaticParams に無い動的ページへの実URL指定が効かない（第25便で実測）。
 *   第25便では「効く環境もあり得るので」併記のまま残していたが、効かないことは確定しており、
 *   残しておくと「実URLでも消えている」と誤読される。ルート雛形指定の1本だけにする。
 *
 * ★ 雛形指定は全サイトぶんの無効化になる（1店には絞れない）。ランタイムISRなので
 *   次のアクセス時にその場で作り直されるだけ＝ビルドは走らず害は無い。
 *   暫定URL（/hp/{slug}）も独自ドメイン（/hp/{domain}）も同じ /hp/[slug] ルートなので、
 *   この1本で両系統とも消える。表示条件で絞る余地がそもそも無いのも利点。
 */
function revalidateSite() {
  revalidatePath('/hp/[slug]', 'layout');
}

// ── 取得 ─────────────────────────────────────────────
/** 管理画面の初期表示に必要な一式。権限が無ければエラー文言を返す。 */
export async function getHpAdminContext(
  siteKey: string,
): Promise<{ ok: true; ctx: HpAdminContext } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;
  return {
    ok: true,
    ctx: {
      site:      r.site,
      salonName: r.salonName,
      role:      r.role,
    },
  };
}

/**
 * 配色ごとのセラピスト写真を設定するための一覧（2026-08-11・デモ店の管理画面専用）。
 * 掲載データのセラピスト（ID・名前・いまの写真）だけを返す。
 *
 * ★ service_role で読むのは公開ページ（data.ts）と同じ理由。デモ用サロンは is_hidden=true で
 *   作るため anon では引けない。権限は resolveAccess が先に確認している。
 */
export async function listHpTherapists(
  siteKey: string,
): Promise<{ ok: true; therapists: { id: string; name: string; imageUrl: string | null }[] } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;

  const { data, error } = await r.svc
    .from('therapists')
    .select('id, name, profile_image_url')
    .eq('salon_id', r.site.salon_id)
    .order('name');
  if (error) return { ok: false, error: `セラピストの取得に失敗しました: ${error.message}` };

  return {
    ok: true,
    therapists: (data ?? []).map((t) => ({
      id:       String(t.id),
      name:     (t.name as string | null) ?? '',
      imageUrl: (t.profile_image_url as string | null) ?? null,
    })),
  };
}

// ── デザイン確定（ギャラリー） ───────────────────────────
/**
 * ひな形とカラーを確定してロックする。design_locked=false のときだけ通る。
 *
 * 確定後の変更は運営の有償作業。手順は3ステップ（2026-08-17 / 第20便に更新）:
 *   ① /admin →「公式HP管理（契約サイト）」→ その店の「編集」→ デザイン確定ロックを外して保存
 *   ② その店の /hp/{slug}/admin を運営として開く → デザイン選択が出るので選び直して確定
 *   ③ この関数が design_locked=true を書くので、手でロックを戻す必要はない
 *
 * ★ 以前ここには「運営が SQL で design_locked=false に戻して」と書いてあったが、
 *   段階4（2026-08-09）で /admin の編集パネルから切り替えられるようになっている。
 *   SQL を直接叩く必要はもう無い。
 *
 * ★ ロックを外しても公開ページは止まらない。公開判定は status==='live' だけで、
 *   design_locked は見ていない（②で確定するまで旧デザインのまま表示され続ける）。
 */
export async function confirmHpDesign(
  siteKey: string,
  templateKey: string,
  colorKey: string,
): Promise<{ ok: true; site: HpSite } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;
  if (r.site.design_locked) {
    return { ok: false, error: 'デザインは確定済みです。変更をご希望の場合は運営事務局までご連絡ください' };
  }
  if (!isHpTemplateKey(templateKey)) return { ok: false, error: 'ひな形の指定が正しくありません' };
  if (!isValidHpColor(templateKey as HpTemplateKey, colorKey)) {
    return { ok: false, error: 'カラーの指定が正しくありません' };
  }

  const { data, error } = await r.svc
    .from('salon_sites')
    .update({
      template_key:  templateKey,
      theme_key:     colorKey,
      design_locked: true,
      updated_at:    new Date().toISOString(),
    })
    .eq('salon_id', r.site.salon_id)
    .eq('design_locked', false) // 二重確定の競合防止
    .select(HP_SITE_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: `確定に失敗しました: ${error.message}` };
  if (!data) return { ok: false, error: 'デザインは確定済みです。運営事務局までご連絡ください' };

  const site = mapHpSiteRow(data as Record<string, unknown>);
  revalidateSite();
  return { ok: true, site };
}

// ── 保存（本文・画像・ブロック設定） ──────────────────────
/** ひな形・カラー以外の項目を保存する。デザインはこの経路では絶対に変わらない。 */
export async function saveHpSiteContent(
  siteKey: string,
  input: HpContentInput,
): Promise<{ ok: true; site: HpSite } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;

  // ── バリデーション（不正はエラーで返す。黙って丸めるのはブロック設定のみ） ──
  if (!Array.isArray(input.hero_slides) || input.hero_slides.length > MAX_HP_HERO_SLIDES) {
    return { ok: false, error: `トップ画像は最大${MAX_HP_HERO_SLIDES}枚です` };
  }
  // 形は sanitize に丸めさせ、丸めた結果が送られてきたものと枚数で食い違ったときだけ
  // エラーにする（＝黙って画像を1枚捨てたまま「保存しました」と出さないため）。
  const heroSlides = sanitizeHpHeroSlides(input.hero_slides);
  if (heroSlides.length !== input.hero_slides.length) {
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
  if (input.favicon_url !== null && !isSafeImageUrl(input.favicon_url)) {
    return { ok: false, error: 'ファビコンのURLが正しくありません' };
  }

  if (input.logo_url !== null && !isSafeImageUrl(input.logo_url)) {
    return { ok: false, error: 'ロゴ画像のURLが正しくありません' };
  }

  const payload = {
    logo_url:          input.logo_url,
    hero_slides:       heroSlides,
    // ★ 旧列にも1枚目だけ書き続ける（2026-08-18 第21便）。
    //   万が一コードを前の版に戻しても、全店のトップ画像が空になって崩れることを防ぐ保険。
    //   画面からは hero_images を送れない形にしてあるので、両者がズレることはない。
    hero_images:       hpHeroSlidesToImages(heroSlides),
    hero_catch:        input.hero_catch.trim(),
    concept_title:     input.concept_title.trim(),
    concept_text:      input.concept_text.trim(),
    concept_image_url: input.concept_image_url,
    // ★ multipage（マルチページ構成にするか）は運営だけが決める設定なので、
    //   店舗から送られてきた値は捨てて DB の現在値で上書きする。
    //   デザイン（template_key / theme_key）をこの経路に載せないのと同じ考え方。
    //   （古いタブから multipage の無い blocks が送られても構成が勝手に戻らない）
    blocks:            { ...sanitizeHpBlocks(input.blocks), multipage: r.site.blocks.multipage },
    banners:           input.banners,
    // リンク欄は件数・URLの妥当性をここで丸める（画像/文字のどちらも無い行は捨てられる）
    link_banners:      sanitizeHpLinkBanners(input.link_banners),
    favicon_url:       input.favicon_url,
    updated_at:        new Date().toISOString(),
  };

  const { data, error } = await r.svc
    .from('salon_sites')
    .update(payload)
    .eq('salon_id', r.site.salon_id)
    .select(HP_SITE_COLUMNS)
    .maybeSingle();
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  if (!data) return { ok: false, error: '保存できませんでした。運営事務局までお問い合わせください' };

  const site = mapHpSiteRow(data as Record<string, unknown>);
  revalidateSite();
  return { ok: true, site };
}

// ── 公開／非公開の切替 ─────────────────────────────────
/** draft ⇔ live の切替のみ。suspended（運営による停止）は店舗側から変更できない。
 *  ★★★ 第279便（2026-09-12・カッキーさんの指示）から【運営だけ】が使える口。 */
export async function setHpSiteLive(
  siteKey: string,
  live: boolean,
): Promise<{ ok: true; status: HpSiteStatus } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;
  // ★★★ 公開・非公開の切替は【運営だけ】（第279便）。
  //   ★ 店舗様の画面（/hp/{slug}/admin のホーム）からはボタンごと外したが、
  //     画面に出さないだけでは止まらないので、ここでも弾く
  //     （★ 二重に止める。★ 第273便のセラピスト削除と同じ作法）。
  //   ★ 運営がふだん切り替える場所は管理者ダッシュボード（/admin → 公式HP → その店の「編集」→ 公開状態）。
  //     ★ あちらは別の口なので、この制限では止まらない。
  if (r.role !== 'operator') {
    return { ok: false, error: '公開・非公開の切り替えは運営事務局で行います' };
  }
  if (r.site.status === 'suspended') {
    return { ok: false, error: '現在このHPは運営により停止中です。運営事務局までお問い合わせください' };
  }
  if (live && !r.site.design_locked) {
    return { ok: false, error: '先にデザイン（ひな形とカラー）を確定してください' };
  }

  const next: HpSiteStatus = live ? 'live' : 'draft';
  const { error } = await r.svc
    .from('salon_sites')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('salon_id', r.site.salon_id)
    .neq('status', 'suspended'); // 競合で suspended になっていたら書き換えない
  if (error) return { ok: false, error: `切替に失敗しました: ${error.message}` };

  revalidateSite();
  return { ok: true, status: next };
}
