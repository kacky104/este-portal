import { OpsNoticesAdmin } from './OpsNoticesAdmin';

// 管理画面「運営からのお知らせ」（第862便）。★ 認可は /admin/layout.tsx（ADMIN_UUID）＋ 各 action の requireAdmin。
export const dynamic = 'force-dynamic';

export default function OpsNoticesAdminPage() {
  return <OpsNoticesAdmin />;
}
