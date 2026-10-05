// ★★ 第1198便（2026-10-05・カッキーさん）: フクエックスのアカウントを消すときに【消してはいけない画像】の見分け。
//
// ★ 何が起きたか（2026-10-05）
//   アカウントを消すと、x-images の「その人のフォルダ（{ログインのID}/）」を丸ごと掃除する。
//   ところが、タイムラインのバナー（運営パネルで設定・x_banners）の画像も、運営のログインのフォルダに置いてある
//   （x-images は「自分のフォルダにしか置けない」決まりのため）。
//   → 運営のログインで試しにアカウントを作って消したら、バナーの画像ファイルまで消えて、バナーが出なくなった。
//
// ★ 直し方: フォルダを掃除するとき、バナーの画像（ファイル名が banner-slot で始まる）は残す。
//   ★ この名前で置くのは運営パネルのバナー設定だけ（x/admin/XAdmin.tsx の onBannerCropSave）。
//     ふつうの投稿・アイコン・ヘッダーは「数字-乱数」「header-…」で始まるので、巻き込まない。
//   ★★ バナーのファイル名の付け方を変えるときは、ここも一緒に直すこと。
//   ★ 差し替えで使わなくなった古いバナーの画像も残る（消し忘れより、消しすぎのほうが戻せないため）。
//
// ★ 使う場所: actions/xAccount.ts（本人の退会）・actions/xAdmin.ts（運営による削除）の、フォルダ掃除の2か所。

export const X_BANNER_FILE_PREFIX = 'banner-slot';

/** アカウントを消すときも残すファイル名か（＝タイムラインのバナーの画像） */
export function isKeptXImageName(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(X_BANNER_FILE_PREFIX);
}
