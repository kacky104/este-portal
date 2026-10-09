// フクエスCRM の server action の入口の判定（2026-10-09 点検#9）。
// ★ それまで actions/crm.ts の assertCrm と、crmGroupShare.ts・crmGroupJoin.ts の assertOwner に【同じ判定の写し】が3つあり、
//   条件を足したとき片方だけ古くなる（規約同意がまさにそれ）。ここ1か所にまとめ、3ファイルから呼ぶ。
// ★ 判定は必ずサーバーで: ログイン → 店が存在 → オーナー本人（か運営）→ 契約期間内 → 【今の版の規約に同意済み】（運営は除外）。
//   規約の同意は、それまで getCrmAccess が termsOk を返して画面が同意画面を出すだけだった（＝未同意でも action を直接呼べば動いた）。
// ★ 'use server' は付けない（下請け。action からだけ呼ぶ）。
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';

export type CrmSvc = ReturnType<typeof createServiceClient>;

export type CrmOwnerAuth = {
  ok: true;
  svc: CrmSvc;
  userId: string;
  isAdmin: boolean;
  /** salons の行（assertCrm が bookingCoursesRaw・defaultIntervalMin に使う） */
  salon: { booking_courses: unknown; default_interval_min: unknown };
};
export type CrmAuthErr = { ok: false; error: string };

export const CRM_TERMS_REQUIRED = 'フクエスCRMの利用規約への同意が必要です。画面を更新して、同意の画面から進めてください';

/** crm_until（YYYY-MM-DD）が今日（JST暦日）以降なら有料で使える */
export function isCrmActive(crmUntil: string | null): boolean {
  if (!crmUntil) return false;
  return String(crmUntil).slice(0, 10) >= getCalendarDateJST();
}

/**
 * オーナー本人（か運営）で、CRM が契約中で、今の版の規約に同意済みか。
 * @param opts.skipTerms 規約の同意そのもの（agreeCrmTerms）だけ true
 */
export async function assertCrmOwner(salonId: number, opts?: { skipTerms?: boolean }): Promise<CrmOwnerAuth | CrmAuthErr> {
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const { data: salon, error } = await svc
    .from('salons')
    .select('owner_id, crm_until, booking_courses, default_interval_min')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { ok: false, error: '店舗が見つかりません' };
  const isAdmin = user.id === ADMIN_UUID;
  if (!isAdmin && (salon.owner_id as string | null) !== user.id) {
    return { ok: false, error: 'このお店のフクエスCRMを見る権限がありません' };
  }
  if (!isAdmin && !isCrmActive((salon.crm_until as string | null) ?? null)) {
    return { ok: false, error: 'フクエスCRMのご契約期間外です' };
  }
  // ★ 規約の同意（getCrmAccess の termsOk と同じ読み方）。読めなかったときは通さない（空のふりをしない）
  if (CRM_TERMS_VERSION && !isAdmin && !opts?.skipTerms) {
    const { data: ag, error: agErr } = await svc.from('crm_terms_agreements').select('id')
      .eq('salon_id', salonId).eq('version', CRM_TERMS_VERSION).maybeSingle();
    if (agErr) return { ok: false, error: `読み込めませんでした（${agErr.message}）。もう一度お試しください` };
    if (!ag) return { ok: false, error: CRM_TERMS_REQUIRED };
  }
  return {
    ok: true,
    svc,
    userId: user.id,
    isAdmin,
    salon: { booking_courses: salon.booking_courses, default_interval_min: salon.default_interval_min },
  };
}
