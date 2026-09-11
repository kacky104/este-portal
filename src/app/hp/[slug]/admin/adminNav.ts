// 公式HP管理（/hp/{slug}/admin）の【画面わけ】（第278便・2026-09-12・カッキーさんの指示）。
//
// ★★★ フクエスワークと同じ「1画面1機能」にする。★ 左サイドバーで選んだものだけを出す。
//   ★ 縦に9枚のカードが積み上がっていて、下のほうが見つけられなかったため。
// ★★ 並び・名前の【正はここ1か所】。★ サイドバー（PC）・ドロワー（スマホ）・見出しの字が
//   全部ここを見る。★ 画面を足すときも、ここに1行足すだけで3か所に出る。

export type HpAdminSection =
  | 'home'      // 公開の状態・ドメイン・ページを見る
  | 'design'    // 確定したひな形とカラー（＋デモ店だけの配色別画像）
  | 'hero'      // トップ画像・キャッチコピー
  | 'concept'   // コンセプト
  | 'blocks'    // 表示するブロックと並び順
  | 'banner'    // バナー
  | 'links'     // リンク（相互リンク）
  | 'brand'     // ヘッダーのロゴ・ファビコン
  | 'account';  // ホームページ担当者のアカウント

// ★ HpEditor（写真と文章の編集）が受け持つ画面。★ ここに無いもの（home・account）は
//   HpEditor は何も描かない（★ ただし外さない＝入力中の内容を持ったまま控えている）。
export const HP_EDITOR_SECTIONS: HpAdminSection[] = [
  'design', 'hero', 'concept', 'blocks', 'banner', 'links', 'brand',
];

export function isHpEditorSection(k: HpAdminSection): boolean {
  return HP_EDITOR_SECTIONS.includes(k);
}

// ★ サイドバーの並び。★ 上から「状態 → 見た目 → 中身 → まわりの部品 → 人」の順。
export const HP_ADMIN_NAV: Array<{ key: HpAdminSection; label: string }> = [
  { key: 'home',    label: 'ホーム' },
  { key: 'design',  label: 'デザイン' },
  { key: 'hero',    label: 'トップ画像' },
  { key: 'concept', label: 'コンセプト' },
  { key: 'blocks',  label: '表示ブロック' },
  { key: 'banner',  label: 'バナー' },
  { key: 'links',   label: 'リンク' },
  { key: 'brand',   label: 'ロゴ・アイコン' },
  { key: 'account', label: '担当者アカウント' },
];

// ★ 画面の頭に出す名前（★ サイドバーの字より少し詳しくてよい）。
export const HP_ADMIN_TITLE: Record<HpAdminSection, string> = {
  home:    'ホーム',
  design:  'デザイン',
  hero:    'トップ画像・キャッチコピー',
  concept: 'コンセプト',
  blocks:  '表示するブロックと並び順',
  banner:  'バナー',
  links:   'リンク',
  brand:   'ロゴ・ファビコン',
  account: 'ホームページ担当者のアカウント',
};
