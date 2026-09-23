// コネックエフの左サイドバーの並び（第395便・1a）。★ 判断はこの1か所。
// ★ 並びは設計メモ「コネックエフ第1弾_テーブルと画面」§5。
// ★ href は画面内のパス（'/' '/sites' …）。★ 実際のリンクは conecfHref(base, href) で作る。

export type ConecfNavKey =
  | 'home' | 'sites'
  | 'girls' | 'girlsSync'
  | 'schedule' | 'scheduleSync'
  | 'now'
  | 'diary' | 'news' | 'announce' | 'cocoa'
  | 'log' | 'matrix'
  | 'guide' | 'qa';

// ★★ 第462便（カッキーさん）: dense＝名前が長い項目（★ サイドバーで1行に収める。★ 折り返すと読みにくい）
export type ConecfNavItem = { key: ConecfNavKey; label: string; href: string; group?: string; dense?: boolean };

export const CONECF_NAV: readonly ConecfNavItem[] = [
  { key: 'home',         label: 'ホーム',               href: '/' },
  { key: 'sites',        label: 'ID・パスワード登録',          href: '/sites' },
  { key: 'girls',        label: 'セラピスト一覧（新規登録など）', href: '/girls',         group: 'セラピスト' },
  { key: 'girlsSync',    label: 'セラピスト登録状況一覧', href: '/girls/sync' },
  { key: 'schedule',     label: '週間スケジュール',       href: '/schedule',      group: '出勤' },
  { key: 'scheduleSync', label: '出勤をサイトへ',         href: '/schedule/sync' },
  // ★★ 第462便: 「今すぐ」の見出しはやめて、出勤のまとまりに入れた（★ 1項目だけの見出しは、並びを長くするだけ）
  { key: 'now',          label: '今すぐ／即ヒメ／即セラ設定', href: '/now',           dense: true },
  { key: 'diary',        label: '写メ日記転送',           href: '/diary',         group: '写メ日記・新着' },
  { key: 'news',         label: '駅ちか新着情報',         href: '/news' },
  // ★ 第475便: フクエスのお知らせ（マイページのお知らせタブと同じことができる）
  { key: 'announce',     label: 'フクエスお知らせ',       href: '/announce' },
  { key: 'cocoa',        label: 'ココア店長ブログ',       href: '/cocoa' },
  { key: 'log',          label: '更新結果',               href: '/log',           group: '記録' },
  { key: 'matrix',       label: '反映の早見表',           href: '/matrix' },
  { key: 'guide',        label: 'はじめての方へ',         href: '/guide',         group: 'ご案内' },
  { key: 'qa',           label: 'よくあるご質問（Q&A）',   href: '/qa' },
];

export function conecfNavItem(key: ConecfNavKey): ConecfNavItem {
  return CONECF_NAV.find((n) => n.key === key) ?? CONECF_NAV[0];
}
