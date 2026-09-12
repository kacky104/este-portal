// 公式HP管理（/hp/{slug}/admin）の【画面わけ】（第278便・2026-09-12・カッキーさんの指示）。
//
// ★★★ フクエスワークと同じ「1画面1機能」にする。★ 左サイドバーで選んだものだけを出す。
//   ★ 縦に9枚のカードが積み上がっていて、下のほうが見つけられなかったため。
// ★★ 並び・名前の【正はここ1か所】。★ サイドバー（PC）・ドロワー（スマホ）・見出しの字が
//   全部ここを見る。★ 画面を足すときも、ここに1行足すだけで3か所に出る。

export type HpAdminSection =
  | 'home'      // 公開の状態・ドメイン・公式サイトを見る・ひな形とカラー
  | 'hero'      // トップ画像・キャッチコピー（＋デモ店だけの配色別画像）
  | 'blocks'    // 表示するブロックと並び順
  | 'banner'    // バナー
  | 'links'     // リンク（相互リンク）
  | 'brand';    // ヘッダーのロゴ・ファビコン
// ★ 'account'（ホームページ担当者のアカウント）は第279便（2026-09-12・カッキーさんの指示）で
//   画面ごと撤去した。★ 戻すときは、この型・NAV・TITLE・HpAdminApp の4か所を揃えて足すこと。
// ★★ 'concept'（コンセプト）は第282便（2026-09-12・カッキーさんの指示）で画面をやめ、
//   【ホームの中】へ移した。★ 文章は1つしかないので、わざわざ1画面を立てる必要がなかった。
//   ★ 実体は HpEditor の同じブロックのまま。★ 出す条件を show('concept') → show('home') に変えただけ。
// ★★ 'design'（デザイン）は第285便（2026-09-12・カッキーさんの指示）で画面をやめ、
//   ひな形とカラーの表示を【ホームの「ホームページ管理」の枠】に入れた。
//   ★ 選ぶのは運営が /admin でやるので、店舗様の側は1行読めれば足りる。
//   ★ デモ店だけの「配色ごとの画像」は【トップ画像】の画面へ移した。

// ★ HpEditor（写真と文章の編集）が受け持つ画面。★ この中の画面には【保存の枠】が出る。
//   ★ 'home' が入っているのは、第282便でコンセプトをホームへ移したため（★ ホームでも保存する）。
//   ★ ここに無い画面では HpEditor は何も描かない（★ ただし外さない＝入力中の内容を持ったまま控える）。
export const HP_EDITOR_SECTIONS: HpAdminSection[] = [
  'home', 'hero', 'blocks', 'banner', 'links', 'brand',
];

export function isHpEditorSection(k: HpAdminSection): boolean {
  return HP_EDITOR_SECTIONS.includes(k);
}

// ★ サイドバーの並び。★ 上から「状態 → 見た目 → 中身 → まわりの部品 → 人」の順。
export const HP_ADMIN_NAV: Array<{ key: HpAdminSection; label: string }> = [
  { key: 'home',    label: 'ホーム' },
  { key: 'hero',    label: 'トップ画像' },
  { key: 'blocks',  label: '表示ブロック' },
  { key: 'banner',  label: 'バナー' },
  { key: 'links',   label: 'リンク' },
  { key: 'brand',   label: 'ロゴ・アイコン' },
];

// ★ 画面の頭に出す名前（★ サイドバーの字より少し詳しくてよい）。
export const HP_ADMIN_TITLE: Record<HpAdminSection, string> = {
  home:    'ホーム',
  hero:    'トップ画像・キャッチコピー',
  blocks:  '表示するブロックと並び順',
  banner:  'バナー',
  links:   'リンク',
  brand:   'ロゴ・ファビコン',
};
