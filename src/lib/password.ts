// パスワードポリシー（Supabase 設定に合わせる：英字＋数字を含む8文字以上）。
// 新規登録（/login）とパスワード再設定（/reset-password）で共有する。
export const PASSWORD_HINT = '英字と数字を含む8文字以上';
export const PASSWORD_ERROR = 'パスワードは英字と数字を含む8文字以上で入力してください。';

/** 要件を満たさなければエラー文言、満たせば null。 */
export function validatePassword(pw: string): string | null {
  if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return PASSWORD_ERROR;
  return null;
}
