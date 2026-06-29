import { XNotifications } from '../XNotifications';

// 通知は本人依存・動的。データ取得・既読化はすべて XNotifications（クライアント）がマウント時に行うため、
// この server page は cookie を読まず（薄いラッパー）、認証ぶんはクライアント側で判定する。
export const metadata = { title: '通知｜fukuX' };

export default function XNotificationsPage() {
  return <XNotifications />;
}
