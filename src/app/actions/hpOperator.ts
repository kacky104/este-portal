'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import {
  HP_DEMO_SLUG,
  HP_RESERVED_SLUGS,
  hpSitePaths,
  isHpSiteStatus,
  normalizeHpSiteKey,
  sanitizeHpBlocks,
} from '@/app/lib/hpSite';

// 公式ホームページの【運営管理】（2026-08-09 段階4）。/admin「公式HP管理」タブから使う。
//
// できること:
//  - 契約サイトの一覧（契約状況・ドメイン・期限・HP管理者の状態まで一望）
//  - 新規発行（＝契約成立。salon を選んで slug を発行。従来はSQL手作業だった）
//  - 運営専用項目の編集: slug / domain / status(suspended含む) / design_locked /
//    multipage（ページ構成） / domain_registrar / domain_expires_at / contract_note
//  - 解約（行の削除）
//
// すべて ADMIN_UUID 限定・書き込みは service_role。
// 店舗側が編集できる項目（写真・文章・ブロック）はここでは触らない（/hp/{key}/admin へ）。

type Err = { ok: false; error: string };

export type OperatorSite = {
  salonId: number;
  salonName: string;
  isDemo: boolean;
  slug: string;
  domain: string | null;
  status: string;
  templateKey: string;
  themeKey: string;
  designLocked: boolean;
  /** マルチページ構成か（blocks.multipage）。デザインと同じく運営だけが切り替える */
  multipage: boolean;
  adminEmail: string | null;
  adminLinked: boolean;
  domainRegistrar: string;
  domainExpiresAt: string | null; // 'YYYY-MM-DD'
  contractNote: string;
  updatedAt: string;
};

export type OperatorSitePatch = {
  slug: string;
  domain: string;          // 空文字=未設定
  status: string;
  designLocked: boolean;
  multipage: boolean;
  domainRegistrar: string;
  domainExpiresAt: string; // 空文字=未設定
  contractNote: string;
};

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '運営のみ操作できます' };
  return { ok: true };
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

function validateSlug(slug: string): string | null {
  if (!SLUG_RE.test(slug)) return 'slug は半角英小文字・数字・ハイフン（3〜32文字・両端は英数字）で入力してください';
  if ((HP_RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return `「${slug}」はシステム予約語のため使えません（${HP_RESERVED_SLUGS.join(' / ')}）`;
  }
  return null;
}

// ── 一覧 ─────────────────────────────────────────────
export async function listHpSites(): Promise<{ ok: true; sites: OperatorSite[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const { data: rows, error } = await svc
    .from('salon_sites')
    .select('salon_id, slug, domain, status, template_key, theme_key, design_locked, blocks, admin_email, admin_user_id, domain_registrar, domain_expires_at, contract_note, updated_at')
    .order('salon_id');
  if (error) return { ok: false, error: `一覧の取得に失敗しました: ${error.message}` };

  const salonIds = (rows ?? []).map((r) => Number(r.salon_id));
  const nameMap = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: salons } = await svc.from('salons').select('id, name').in('id', salonIds);
    (salons ?? []).forEach((s) => nameMap.set(Number(s.id), (s.name as string) ?? ''));
  }

  const sites: OperatorSite[] = (rows ?? []).map((r) => ({
    salonId:         Number(r.salon_id),
    salonName:       nameMap.get(Number(r.salon_id)) ?? `salon_id: ${r.salon_id}`,
    isDemo:          (r.slug as string) === HP_DEMO_SLUG,
    slug:            (r.slug as string) ?? '',
    domain:          (r.domain as string | null) ?? null,
    status:          (r.status as string) ?? 'draft',
    templateKey:     (r.template_key as string) ?? 'a',
    themeKey:        (r.theme_key as string) ?? '',
    designLocked:    r.design_locked === true,
    multipage:       sanitizeHpBlocks(r.blocks).multipage,
    adminEmail:      (r.admin_email as string | null) ?? null,
    adminLinked:     r.admin_user_id !== null,
    domainRegistrar: (r.domain_registrar as string | null) ?? '',
    domainExpiresAt: (r.domain_expires_at as string | null) ?? null,
    contractNote:    (r.contract_note as string | null) ?? '',
    updatedAt:       (r.updated_at as string) ?? '',
  }));

  return { ok: true, sites };
}

/** 新規発行の候補（salon_sites 行がまだ無いサロン）。 */
export async function listSalonsWithoutSite(): Promise<{ ok: true; salons: { id: number; name: string; hidden: boolean }[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const [salonsRes, sitesRes] = await Promise.all([
    svc.from('salons').select('id, name, is_hidden').order('name'),
    svc.from('salon_sites').select('salon_id'),
  ]);
  if (salonsRes.error) return { ok: false, error: salonsRes.error.message };
  const taken = new Set((sitesRes.data ?? []).map((r) => Number(r.salon_id)));
  const salons = (salonsRes.data ?? [])
    .filter((s) => !taken.has(Number(s.id)))
    .map((s) => ({ id: Number(s.id), name: (s.name as string) ?? '', hidden: s.is_hidden === true }));
  return { ok: true, salons };
}

// ── 新規発行（契約成立） ───────────────────────────────
export async function createHpSite(input: { salonId: number; slug: string }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const slug = normalizeHpSiteKey(input.slug);
  const slugErr = validateSlug(slug);
  if (slugErr) return { ok: false, error: slugErr };
  if (!Number.isFinite(input.salonId)) return { ok: false, error: '店舗の指定が正しくありません' };

  const svc = createServiceClient();
  const { error } = await svc.from('salon_sites').insert({ salon_id: input.salonId, slug });
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'その slug または店舗は既に使われています' };
    return { ok: false, error: `発行に失敗しました: ${error.message}` };
  }
  return { ok: true };
}

// ── 運営専用項目の更新 ─────────────────────────────────
export async function updateHpSiteOperator(
  salonId: number,
  patch: OperatorSitePatch,
): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const slug = normalizeHpSiteKey(patch.slug);
  const domain = normalizeHpSiteKey(patch.domain);
  if (domain !== '' && !DOMAIN_RE.test(domain)) {
    return { ok: false, error: 'ドメインの形式が正しくありません（例: example-shop.com・www は不要）' };
  }
  if (!isHpSiteStatus(patch.status)) return { ok: false, error: '公開状態の指定が正しくありません' };

  const expires = patch.domainExpiresAt.trim();
  if (expires !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    return { ok: false, error: 'ドメイン期限は YYYY-MM-DD 形式で入力してください' };
  }

  const svc = createServiceClient();

  // blocks は jsonb なので丸ごと差し替えになる。現在値を読んで multipage だけ入れ替える
  // （店舗が編集する他のキーを巻き戻さないため）。slug も現在値との比較に使う。
  const { data: cur, error: curErr } = await svc
    .from('salon_sites')
    .select('slug, blocks')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (curErr) return { ok: false, error: `取得に失敗しました: ${curErr.message}` };
  if (!cur) return { ok: false, error: '対象のサイトが見つかりません' };

  // ★ slug の検証は「変更するときだけ」（2026-08-11 修正）。
  //   デモ店は予約語 'demo' を slug として正規に持っているため、一律チェックだと
  //   デモ店の行は slug 以外の項目（マルチページ構成・契約メモ等）も保存できなかった。
  //   既存の値をそのまま維持するぶんには通し、新たに予約語へ変える操作だけを弾く。
  if (slug !== normalizeHpSiteKey(String(cur.slug ?? ''))) {
    const slugErr = validateSlug(slug);
    if (slugErr) return { ok: false, error: slugErr };
  }

  const blocks = { ...sanitizeHpBlocks(cur.blocks), multipage: patch.multipage };

  const { data, error } = await svc
    .from('salon_sites')
    .update({
      slug,
      domain:            domain === '' ? null : domain,
      status:            patch.status,
      design_locked:     patch.designLocked,
      blocks,
      domain_registrar:  patch.domainRegistrar.trim() || null,
      domain_expires_at: expires === '' ? null : expires,
      contract_note:     patch.contractNote.trim(),
      updated_at:        new Date().toISOString(),
    })
    .eq('salon_id', salonId)
    .select('salon_id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'その slug またはドメインは既に別の店舗で使われています' };
    return { ok: false, error: `保存に失敗しました: ${error.message}` };
  }
  if (!data) return { ok: false, error: '対象のサイトが見つかりません' };

  // slug / ドメインを変えた直後は旧キーのキャッシュも残るが、そちらは DB を引けなくなるため
  // 次のアクセスで自然に 404 になる。ここでは新しいキー側を作り直す。
  for (const path of hpSitePaths({ slug, domain: domain === '' ? null : domain })) revalidatePath(path);
  return { ok: true };
}

/**
 * 公開ページのISRキャッシュを手動で作り直す。
 * DBやSQLを直したのに公開ページが古いまま（404含む）のときの復旧ボタン。
 */
export async function revalidateHpSitePages(salonId: number): Promise<{ ok: true; paths: string[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_sites')
    .select('slug, domain')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: `取得に失敗しました: ${error.message}` };
  if (!data) return { ok: false, error: '対象のサイトが見つかりません' };

  // ★ トップだけでなく下層ページ（/therapist・/system）と利用規約も対象にする。
  //   マルチページ化以降、この復旧ボタンがトップしか直せないと
  //   「セラピスト一覧だけ404のまま」という状態から抜け出せなくなる。
  const paths = hpSitePaths({
    slug:   String(data.slug ?? ''),
    domain: data.domain ? String(data.domain) : null,
  });
  for (const path of paths) revalidatePath(path);
  return { ok: true, paths };
}

// ── 解約（行の削除） ───────────────────────────────────
export async function deleteHpSite(salonId: number): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const { error } = await svc.from('salon_sites').delete().eq('salon_id', salonId);
  if (error) return { ok: false, error: `削除に失敗しました: ${error.message}` };
  return { ok: true };
}
