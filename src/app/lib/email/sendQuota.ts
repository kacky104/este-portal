// ★ 第898便（2026-09-26・カッキーさん）: Resend の1日の送信数の見張り。
// ★ 'use server' ではない普通のモジュール（Webhook と管理画面の両方から読む）。
// ★ PRO プランに上げたら、この見張りは不要になる（★ 上げたら数字を変えるか、管理画面の表示を外す）。

/** 無料プランの1日の上限 */
export const EMAIL_DAILY_LIMIT = 100;
/** ここを超えたら運営へ知らせる */
export const EMAIL_DAILY_WARN = 80;
