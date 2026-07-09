// fukuX 通知UIの共有定数・型（クライアント専用ロジックから参照）。
// DB側（x_notifications テーブル / RLS / トリガー / 既読化RPC）は適用済み。ここはUIの取得・既読化のみ。

// 通知一覧ページで一括既読化したとき、ヘッダーのベル未読バッジを即時クリアするためのウィンドウイベント名。
// （Realtime購読はしない方針。ページ遷移時の再取得＋このイベントで十分。）
export const NOTIF_READ_EVENT = 'fukux:notifications-read';

export type XNotificationType = 'like' | 'reply' | 'follow' | 'suki' | 'post';

export type XNotificationActor = {
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  kind: 'user' | 'therapist' | 'shop' | 'official';
  isVerified: boolean;
};

export type XNotification = {
  id: string;
  type: XNotificationType;
  postId: string | null; // like=対象投稿 / reply=親投稿 / post=投稿 / follow・suki=null
  replyPostId: string | null; // reply のときのリプライ投稿ID
  isRead: boolean; // 表示ハイライト用のスナップショット（取得時点の値）
  createdAt: string;
  actor: XNotificationActor;
};

// type 別の遷移先。like/reply は対象（親）投稿の詳細、follow/suki は actor プロフィール。
export function notificationHref(n: XNotification): string {
  if (n.type === 'follow' || n.type === 'suki') return `/x/u/${n.actor.handle}`;
  if (n.postId) return `/x/post/${n.postId}`;
  return `/x/u/${n.actor.handle}`; // 念のためのフォールバック
}

// 通知文言の「名前より後ろ」の部分（名前は UI 側で太字＋認証バッジ付きで描画するため分離）。
export function notificationSuffix(type: XNotificationType): string {
  switch (type) {
    case 'like':
      return ' さんがあなたの投稿にいいねしました';
    case 'reply':
      return ' さんがあなたの投稿に返信しました';
    case 'follow':
      return ' さんがあなたをフォローしました';
    case 'suki':
      return ' さんからスキされました';
    case 'post':
      return ' さんが投稿しました';
    default:
      return '';
  }
}

// 通知文言（プレーン文字列が要るとき用。UI 一覧は名前分離のため notificationSuffix を使う）。
export function notificationText(n: XNotification): string {
  const name = n.actor.displayName || `@${n.actor.handle}`;
  return `${name}${notificationSuffix(n.type)}`;
}
