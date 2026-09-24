import { BillingAdmin } from './BillingAdmin';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { billingMonthForIssueDay } from '@/lib/billing';

// 管理画面「請求書」（第816便）。★ 認可は /admin/layout.tsx（ADMIN_UUID）＋ 各 action の requireAdmin。
export const dynamic = 'force-dynamic';

export default function BillingAdminPage() {
  return <BillingAdmin initialMonth={billingMonthForIssueDay(jstTodayYmd())} />;
}
