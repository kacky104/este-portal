// リンクバナーの種類（banner_reports.sites の格納値と表示名）。
// フォーム（XBannerReportForm）と運営パネル（XAdmin「報告」タブ）で共用。
export const BANNER_SITES = ['fukux', 'fukues', 'work'] as const;

export const BANNER_SITE_LABEL: Record<string, string> = {
  fukux: 'fukuX（メンズエステ専用SNS）',
  fukues: 'フクエス（ポータル本体）',
  work: 'フクエスワーク（求人）',
};

// 運営パネルの一覧用の短い表示名。
export const BANNER_SITE_SHORT: Record<string, string> = {
  fukux: 'fukuX',
  fukues: 'フクエス',
  work: 'ワーク',
};
