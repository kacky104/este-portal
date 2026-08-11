'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
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
  hpSitePaths,
  normalizeHpSiteKey,
  mapHpSiteRow,
  isHpTemplateKey,
  isValidHpColor,
  isSafeHttpUrl,
  isSafeImageUrl,
  sanitizeHpBlocks,
  sanitizeHpLinkBanners,
  MAX_HP_HERO_IMAGES,
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
//   owner     … salons.owner_id 本人。編集＋HP管理者の招待ができる
//   siteAdmin … salon_sites.admin_user_id（HP管理者アカウント）。編集のみ
//
// 列単位の制限は RLS では表現できないため、ここが最後の砦になる:
//   - slug / domain / status(suspended) / design_locked / admin_* は payload に載せない
//   - ひな形・カラーは confirmHpDesign（design_locked=false のとき1回だけ）でしか書かない

type Err = { ok: false; error: string };

export type HpAdminRole = 'operator' | 'owner' | 'siteAdmin';

export type HpAdminContext = {
  site:       HpSite;
  salonName:  string;
  role:       HpAdminRole;
  /** HP管理者アカウントの招待先メール（未招待なら null）。owner/operator にだけ返す */
  adminEmail: string | null;
  /** HP管理者が本人ログイン済みか */
  adminLinked: boolean;
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
  adminEmail:  string | null;
  adminLinked: boolean;
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

  // admin_email / admin_user_id は anon/authenticated から SELECT 権限を剥がしてあるので
  // （20260809 マイグレーション）、service_role でのみ読める。
  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from('salon_sites')
    .select(`${HP_SITE_COLUMNS}, admin_email, admin_user_id`)
    .eq(hpSiteKeyColumn(key), key)
    .maybeSingle();
  if (error) return { ok: false, error: `サイト情報の取得に失敗しました: ${error.message}` };
  if (!row) return { ok: false, error: 'このサイトの契約情報が見つかりません' };

  const site = mapHpSiteRow(row as Record<string, unknown>);
  const adminUserId = ((row as Record<string, unknown>).admin_user_id as string | null) ?? null;
  const adminEmail = ((row as Record<string, unknown>).admin_email as string | null) ?? null;

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
  else if (adminUserId && adminUserId === user.id) role = 'siteAdmin';
  if (!role) return { ok: false, error: 'このサイトを操作する権限がありません' };

  return {
    svc,
    userId: user.id,
    site,
    salonName,
    role,
    adminEmail,
    adminLinked: adminUserId !== null,
  };
}

/** 招待・失効はオーナー（と運営）だけ。HP管理者が自分で別アカウントを増やせないようにする。 */
function canManageAdmins(role: HpAdminRole): boolean {
  return role === 'operator' || role === 'owner';
}

/**
 * 保存後に公開ページのISRを飛ばす。暫定URLと独自ドメインの両方のキャッシュを消す。
 *
 * ★ 対象は hpSitePaths()（トップ＋下層ページ＋利用規約）。表示条件で絞らないのが肝で、
 *   絞ると「マルチページを止めた」「セラピスト一覧をOFFにした」ときに旧ページの
 *   キャッシュが対象から外れ、消えるべきページが最大600秒残り続ける。
 */
function revalidateSite(site: HpSite) {
  for (const path of hpSitePaths(site)) revalidatePath(path);
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
      site:        r.site,
      salonName:   r.salonName,
      role:        r.role,
      adminEmail:  canManageAdmins(r.role) ? r.adminEmail : null,
      adminLinked: r.adminLinked,
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
 * 確定後の変更は運営の有償作業（運営が SQL で design_locked=false に戻して再選択させる）。
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
  revalidateSite(site);
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
  if (input.favicon_url !== null && !isSafeImageUrl(input.favicon_url)) {
    return { ok: false, error: 'ファビコンのURLが正しくありません' };
  }

  if (input.logo_url !== null && !isSafeImageUrl(input.logo_url)) {
    return { ok: false, error: 'ロゴ画像のURLが正しくありません' };
  }

  const payload = {
    logo_url:          input.logo_url,
    hero_images:       input.hero_images,
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
  revalidateSite(site);
  return { ok: true, site };
}

// ── 公開／非公開の切替 ─────────────────────────────────
/** draft ⇔ live の切替のみ。suspended（運営による停止）は店舗側から変更できない。 */
export async function setHpSiteLive(
  siteKey: string,
  live: boolean,
): Promise<{ ok: true; status: HpSiteStatus } | Err> {
  const r = await resolveAccess(siteKey);
  if ('ok' in r) return r;
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

  revalidateSite(r.site);
  return { ok: true, status: next };
}

// ── HP管理者アカウント（招待・本人化） ────────────────────
// キャスト招待（actions/castInvite.ts）と同型。オーナー本人は自分のアカウントで入れるので、
// ここで発行するのは「オーナー以外の担当者に渡す1アカウント」。

type InviteResult = { ok: true; email?: string; warning?: string } | Err;

const HP_INVITE_NEXT = '/hp/welcome';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 招待メールの戻り先オリジン。招待は必ずフクエス本体（fukues.com）へ着地させる。
// 店舗の独自ドメインを Supabase の Redirect URLs 許可リストに1件ずつ足す運用を避けるため
// （ドメインが増えるたびに設定作業が発生してしまう）。
async function getInviteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const bare = host.toLowerCase().split(':')[0];
  const isLocal = bare === 'localhost' || bare === '127.0.0.1';
  if (isLocal) return `http://${host}`;
  return 'https://fukues.com';
}

async function sendHpInvite(svc: Svc, email: string): Promise<InviteResult> {
  const origin = await getInviteOrigin();
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(HP_INVITE_NEXT)}`;
  const { error } = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (error) {
    const m = (error.message ?? '').toLowerCase();
    const code = (error as { code?: string }).code;
    if (code === 'email_exists' || m.includes('already been registered') || m.includes('already registered')) {
      return {
        ok: true,
        email,
        warning:
          'このメールアドレスは既にアカウント登録済みのため、招待メールは送信されませんでした。そのアカウントのパスワードで管理画面にログインしてもらってください。',
      };
    }
    return { ok: false, error: `招待メールの送信に失敗しました: ${error.message}` };
  }
  return { ok: true, email };
}

/** HP管理者を招待する（1サイト1アカウント。既存の招待は上書き）。 */
export async function inviteHpAdmin(input: { siteKey: string; email: string }): Promise<InviteResult> {
  const r = await resolveAccess(input.siteKey);
  if ('ok' in r) return r;
  if (!canManageAdmins(r.role)) return { ok: false, error: '招待できるのはオーナーのみです' };
  if (r.adminLinked) {
    return { ok: false, error: '既にHP管理者がログイン済みです。入れ替える場合は先に「解除」してください' };
  }

  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'メールアドレスの形式が正しくありません' };

  const svc = createServiceClient();

  // 他店のHP管理者として既に使われているメールは弾く（admin_user_id の UNIQUE と整合）。
  const { data: dup, error: dupErr } = await svc
    .from('salon_sites')
    .select('salon_id')
    .eq('admin_email', email)
    .neq('salon_id', r.site.salon_id)
    .limit(1);
  if (dupErr) return { ok: false, error: `重複確認に失敗しました: ${dupErr.message}` };
  if (dup && dup.length > 0) {
    return { ok: false, error: 'このメールアドレスは既に別店舗のHP管理者に使われています' };
  }

  const { error: upErr } = await svc
    .from('salon_sites')
    .update({ admin_email: email })
    .eq('salon_id', r.site.salon_id);
  if (upErr) return { ok: false, error: `招待先の保存に失敗しました: ${upErr.message}` };

  return sendHpInvite(svc, email);
}

/** 招待を再送する。 */
export async function resendHpAdminInvite(input: { siteKey: string }): Promise<InviteResult> {
  const r = await resolveAccess(input.siteKey);
  if ('ok' in r) return r;
  if (!canManageAdmins(r.role)) return { ok: false, error: '操作できるのはオーナーのみです' };
  if (r.adminLinked) return { ok: false, error: '既に本人ログイン済みです' };
  const email = (r.adminEmail ?? '').trim();
  if (!email) return { ok: false, error: '招待先メールアドレスがありません。先に招待してください' };

  return sendHpInvite(createServiceClient(), email);
}

/**
 * HP管理者を解除する（招待中／ログイン済みのどちらでも使える）。
 *
 * admin_email も必ず消す：claimHpAdmin は「admin_email 一致 かつ admin_user_id=null」の行に
 * 自動で紐付けるため、メールを残すと解除したアカウントが再ログインした瞬間に復活してしまう。
 * Auth ユーザー自体は削除しない（会員・fukuX 等で同じアカウントを使っている可能性があるため）。
 */
export async function unlinkHpAdmin(input: { siteKey: string }): Promise<InviteResult> {
  const r = await resolveAccess(input.siteKey);
  if ('ok' in r) return r;
  if (!canManageAdmins(r.role)) return { ok: false, error: '操作できるのはオーナーのみです' };

  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_sites')
    .update({ admin_user_id: null, admin_email: null })
    .eq('salon_id', r.site.salon_id);
  if (error) return { ok: false, error: `解除に失敗しました: ${error.message}` };
  return { ok: true };
}

type ClaimResult =
  | { ok: true; salonName: string; adminUrl: string }
  | { ok: false; error: string; code?: 'no_session' | 'not_found' };

/**
 * 本人化：ログイン中ユーザーのメールと admin_email が一致し かつ admin_user_id=null の
 * サイト行に、本人の user_id を紐付ける。冪等（既に本人化済みなら ok）。
 */
export async function claimHpAdmin(): Promise<ClaimResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です', code: 'no_session' };

  const email = (user.email ?? '').trim().toLowerCase();
  if (!email) return { ok: false, error: 'メールアドレスが取得できません' };

  const svc = createServiceClient();

  const describe = async (row: { salon_id: number; slug: string; domain: string | null }) => {
    const { data: salon } = await svc.from('salons').select('name').eq('id', row.salon_id).maybeSingle();
    const adminUrl = row.domain
      ? `https://${normalizeHpSiteKey(row.domain)}/admin`
      : `https://fukues.com/hp/${row.slug}/admin`;
    return { salonName: (salon?.name as string | null) ?? '', adminUrl };
  };

  // 既に紐付いていれば冪等にOK。
  const { data: existing } = await svc
    .from('salon_sites')
    .select('salon_id, slug, domain')
    .eq('admin_user_id', user.id)
    .maybeSingle();
  if (existing) {
    const d = await describe(existing as { salon_id: number; slug: string; domain: string | null });
    return { ok: true, ...d };
  }

  const { data: match } = await svc
    .from('salon_sites')
    .select('salon_id, slug, domain')
    .eq('admin_email', email)
    .is('admin_user_id', null)
    .maybeSingle();
  if (!match) {
    return {
      ok: false,
      code: 'not_found',
      error:
        'この招待に対応するホームページが見つかりません。オーナーに招待先メールアドレスをご確認ください。',
    };
  }

  const { error: upErr } = await svc
    .from('salon_sites')
    .update({ admin_user_id: user.id })
    .eq('salon_id', (match as { salon_id: number }).salon_id)
    .is('admin_user_id', null);
  if (upErr) return { ok: false, error: `登録に失敗しました: ${upErr.message}` };

  const d = await describe(match as { salon_id: number; slug: string; domain: string | null });
  return { ok: true, ...d };
}
