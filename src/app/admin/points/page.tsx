import { PointsAdmin } from './PointsAdmin';

// 管理画面「フクエスポイント」（第1444便）。★ 認可は /admin/layout.tsx（ADMIN_UUID）＋ 各 action の requireAdmin。
export const dynamic = 'force-dynamic';

export default function PointsAdminPage() {
  return <PointsAdmin />;
}
