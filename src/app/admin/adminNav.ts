// /admin のサイドバーの並び（第1539便・2026-10-17・カッキーさん「/mypage みたいにサイドバー方式に」）。
// ★ 項目の id は page.tsx の <AccordionSection id> と同じ。★ tab は中身の入れ物（page.tsx の activeTab）。
// ★ 並び順はできあがってからカッキーさんと相談する（いまは前のタブ・アコーディオンの順のまま）。
// ★ URL は /admin?s=<id>。前の /admin?tab=<tab> も読む（そのタブの最初の項目・店舗管理は掲載店舗一覧）。

export type AdminTab = 'main' | 'jobs' | 'salon' | 'data' | 'hp' | 'docs';

export type AdminNavItem = {
  id: string;
  /** サイドバーの文字（短め）。★ 右側の見出しは page.tsx の title（長くてよい）。 */
  label: string;
};

export type AdminNavGroup = {
  tab: AdminTab;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    tab: 'salon',
    label: '店舗管理',
    items: [
      { id: 'listing-inquiries', label: '掲載お問い合わせ' },
      { id: 'salon-intakes', label: '新規店舗 入力フォーム発行' },
      { id: 'free-salon-listings', label: '無料掲載' },
      { id: 'add-salon', label: '新規店舗追加' },
      { id: 'import-sources', label: 'フクエスリンク：駅ちか店舗ページ' },
      { id: 'crm-groups', label: 'CRM：グループ・提携店' },
      { id: 'salon-list', label: '掲載店舗一覧' },
    ],
  },
  {
    tab: 'data',
    label: '店舗データ',
    items: [
      { id: 'email-events', label: 'メール配信トラブル' },
      { id: 'salon-stats', label: '店舗別アクセス・送客数' },
      { id: 'salon-monthly-report', label: '月次レポート' },
      { id: 'owner-contact', label: 'オーナー連絡' },
      { id: 'card-boost', label: '店舗カード優先表示' },
      { id: 'ranking-handicap', label: '週間ランキング下駄' },
      { id: 'page-heroes', label: 'ページ別ヒーロー画像' },
      { id: 'review-campaign', label: '口コミ投稿者へVIPレター' },
    ],
  },
  {
    tab: 'hp',
    label: '公式HP',
    items: [
      { id: 'hp-inquiries', label: 'HP制作のお申し込み' },
      { id: 'hp-sites', label: '公式HP管理（契約サイト）' },
      { id: 'hp-demo', label: 'サンプル店舗（デモ）' },
    ],
  },
  {
    tab: 'main',
    label: 'オプション',
    items: [
      { id: 'option-banners', label: 'オプションバナー' },
      { id: 'header-slider', label: 'TOP最上部画像' },
      { id: 'featured-salons', label: 'ピックアップ店舗' },
      { id: 'recommended-salon-banners', label: 'おすすめ店舗' },
      { id: 'therapist-pickup-banners', label: 'セラピストピックアップ枠' },
      { id: 'ad-banners', label: 'ルックバナー' },
      { id: 'theme-wallpaper', label: 'テーマ壁紙' },
      { id: 'therapist-placeholder', label: 'セラピスト共通画像' },
    ],
  },
  {
    tab: 'jobs',
    label: '求人',
    items: [
      { id: 'work-match-entries', label: '求職マッチング エントリー' },
      { id: 'featured-jobs', label: 'おすすめ求人' },
      { id: 'job-boost', label: '求人カード優先表示' },
      { id: 'area-banners', label: 'エリアバナー' },
      { id: 'area-icons', label: 'エリアアイコン' },
      { id: 'feature-icons', label: '特徴アイコン' },
      { id: 'jobs-page-heroes', label: '求人ページ別ヒーロー画像' },
      { id: 'jobs-manage', label: '求人管理' },
      { id: 'work-app-stats', label: '応募状況（店舗別）' },
    ],
  },
  {
    tab: 'docs',
    label: '書類',
    items: [
      { id: 'admin-documents', label: '書類置き場（PDF・Word）' },
      { id: 'admin-images', label: '画像フォルダ' },
    ],
  },
];

/** 別ページ（/admin の外の画面）。★ サイドバーのいちばん下に並べる。 */
export const ADMIN_LINKS: { href: string; label: string }[] = [
  { href: '/admin/notices', label: 'お知らせ' },
  { href: '/admin/billing', label: '請求書' },
  { href: '/admin/points', label: 'ポイント' },
  { href: '/admin/agreements', label: '誓約書' },
  { href: '/x/admin', label: 'fukuX管理' },
  { href: '/moderation', label: 'モデレーション' },
];

export const ADMIN_DEFAULT_SECTION = 'salon-list';

export function adminTabOf(id: string): AdminTab | null {
  return ADMIN_NAV.find((g) => g.items.some((i) => i.id === id))?.tab ?? null;
}

/** URL から開く項目を決める。?s= が正しければそれ、無ければ ?tab=（前の形）、どちらも無ければ掲載店舗一覧。 */
export function adminSectionFromSearch(search: string): string {
  const p = new URLSearchParams(search);
  const s = p.get('s');
  if (s && adminTabOf(s)) return s;
  const t = p.get('tab');
  if (t === 'salon') return ADMIN_DEFAULT_SECTION;
  const g = ADMIN_NAV.find((x) => x.tab === t);
  if (g) return g.items[0].id;
  return ADMIN_DEFAULT_SECTION;
}
