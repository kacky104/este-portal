// リンクバナーの種類（banner_reports.sites の格納値と表示名）。
// フォーム（XBannerReportForm）は fukuX専用化で sites:['fukux'] 固定となりここを参照しなくなった。
// 現在の利用は運営パネル（XAdmin「報告」タブ）の一覧表示のみ。DBには3値が残るため辞書は3値のまま維持。
export const BANNER_SITE_SHORT: Record<string, string> = {
  fukux: 'fukuX',
  fukues: 'フクエス',
  work: 'ワーク',
};
