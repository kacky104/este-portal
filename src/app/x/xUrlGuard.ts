// ★ 第1647便（2026-10-24・カッキーさん）: ユーザーアカウントはコメント（リプライ）・メッセージ（DM）に URL を書けない。
//   ・http:// / https:// / www. で始まるもの、と「英数字.com」のようなドメインの形を URL とみなす。
//   ・止めるのはサーバー（xPost.ts の投稿・編集、xDmActions.ts の DM 送信）。画面はその文言をそのまま出す。
const URL_RE =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|jp|info|biz|io|me|co|xyz|link|ly|to|app|site|online|top|cc|tv|page|club|shop|store|blog|tokyo|fukuoka)\b/i;

export function containsUrl(text: string | null | undefined): boolean {
  return URL_RE.test(String(text ?? ''));
}

export const USER_URL_BLOCKED_MESSAGE = 'ユーザーアカウントは、URL（リンク）を書き込めません。URL を消してから送ってください。';
