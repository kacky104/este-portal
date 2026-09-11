// テスト運用中の共通お知らせバナー。各サイトのヘッダー直下に sticky で表示していた。
// ★ 2026-09-11：サイトオープンに伴い、**全ページで出さない**ことにした（帯そのものを描かない）。
//   ★ 呼び出し側（jobs / column / x / 本体の各ページ）はそのまま残してある。
//     → 次に全サイト共通の告知を出すときは、この1ファイルに中身を戻せば全ページに効く。
//     → 呼び出しを消して回らない（60ページ以上・戻すときに書き漏らす）。
//   ★ 以前の中身（amber / emerald / fukuX の3配色・sticky top-14・data-site-notice）は git 履歴に残っている。
//   ★ data-site-notice を測っていた店舗詳細スマホの店名バー（SalonMobileNav・第219便）は
//     「帯が無いとき」を見ている（banner ? banner.offsetHeight : 0）ので、top は header の高さだけになる。

type Variant = 'default' | 'work' | 'x';

export function SiteNoticeBanner(props: { variant?: Variant }) {
  void props; // ★ variant は呼び出し側に残っている（上の注記）。使わないが受け取る。
  return null;
}
