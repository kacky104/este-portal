import { AgreementsAdmin } from './AgreementsAdmin';

// 管理画面「申込書・誓約書」（第1174便）。★ 認可は /admin/layout.tsx（ADMIN_UUID）＋ 各 action の requireAdmin。
export const dynamic = 'force-dynamic';

export default function AgreementsAdminPage() {
  return <AgreementsAdmin />;
}
