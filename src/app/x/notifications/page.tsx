import { XNotifications } from '../XNotifications';

// 通知は本人依存・動的。データ取得・既読化はすべて XNotifications（クライアント）がマウント時に行うため、
// この server page は cookie を読まず（薄いラッパー）、認証ぶんはクライアント側で判定する。
// 本人専用の通知（非公開）のため検索インデックス対象外（noindex,nofollow）。
export const metadata = { title: '通知｜fukuX', robots: { index: false, follow: false } };

export default function XNotificationsPage() {
  return <XNotifications />;
}
