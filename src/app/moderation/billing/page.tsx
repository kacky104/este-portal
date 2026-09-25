import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { BillingAdmin } from '@/app/admin/billing/BillingAdmin';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { billingMonthForIssueDay } from '@/lib/billing';

// /moderation の「請求書」（第867便・2026-09-26・カッキーさんの OK）。
// ★ 中身は /admin/billing と同じ画面（BillingAdmin）。★ 入れるのは /moderation/layout.tsx の MODERATOR_UUIDS。
// ★ 操作の許可は billingAdmin.ts の requireStaff。★「⚙ 設定」（発行者・振込先・品目）は管理者だけ（画面でも出さない・action でも断る）。
export const dynamic = 'force-dynamic';

export default async function ModerationBillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <BillingAdmin
      initialMonth={billingMonthForIssueDay(jstTodayYmd())}
      canEditSettings={user?.id === ADMIN_UUID}
      backHref="/moderation"
      backLabel="審査画面へ戻る"
    />
  );
}
