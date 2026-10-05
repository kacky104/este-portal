// fukuX タイムライン（/x）のタブまわりの共有定数（ヘッダーとタイムラインの両方から参照）。
// ★ 第1196便（2026-10-05・カッキーさん）: タブに「新着」（投稿順）を足し、ヘッダーの中央のロゴを押すと新着タブへ。

export type XTimelineTab = 'new' | 'recommended' | 'following' | 'shops';

/** ヘッダーのロゴがほかのページから /x を開くときに付ける値（/x?tab=new）。★ 第1207便から、付けなくても最初は「新着」。 */
export const X_TAB_NEW_PARAM = 'new';

/**
 * ヘッダーのロゴを /x の上で押したとき、タイムラインに「新着タブへ切り替えて」と伝えるウィンドウイベント名。
 * ★ /x の上ではページを開き直さない（読み直しをしない）ので、URL ではなくイベントで伝える。
 */
export const X_SHOW_NEW_TAB_EVENT = 'fukux:show-new-tab';
