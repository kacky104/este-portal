// コネックエフの左サイドバーの並び（第395便・1a）。★ 判断はこの1か所。
// ★ 並びは設計メモ「コネックエフ第1弾_テーブルと画面」§5。
// ★ href は画面内のパス（'/' '/sites' …）。★ 実際のリンクは conecfHref(base, href) で作る。

export type ConecfNavKey =
  | 'home' | 'sites'
  | 'girls' | 'girlsSync'
  | 'schedule' | 'scheduleSync'
  | 'now'
  | 'diary' | 'news' | 'cocoa'
  | 'log' | 'matrix'
  | 'guide' | 'qa';

export type ConecfNavItem = { key: ConecfNavKey; label: string; href: string; group?: string };

export const CONECF_NAV: readonly ConecfNavItem[] = [
  { key: 'home',         label: 'ホーム',               href: '/' },
  { key: 'sites',        label: 'ID・PASS登録',          href: '/sites' },
  { key: 'girls',        label: '女性一覧',              href: '/girls',         group: '女性' },
  { key: 'girlsSync',    label: '女性をサイトへ登録',     href: '/girls/sync' },
  { key: 'schedule',     label: '週間スケジュール',       href: '/schedule',      group: '出勤' },
  { key: 'scheduleSync', label: '出勤をサイトへ',         href: '/schedule/sync' },
  { key: 'now',          label: '今すぐ・即ヒメ・即セラ自動設定', href: '/now',           group: '今すぐ' },
  { key: 'diary',        label: '写メ日記転送',           href: '/diary',         group: '写メ日記・新着' },
  { key: 'news',         label: '駅ちか新着情報',         href: '/news' },
  { key: 'cocoa',        label: 'ココア店長ブログ',       href: '/cocoa' },
  { key: 'log',          label: '更新結果',               href: '/log',           group: '記録' },
  { key: 'matrix',       label: '反映の早見表',           href: '/matrix' },
  { key: 'guide',        label: 'はじめての方へ',         href: '/guide',         group: 'ご案内' },
  { key: 'qa',           label: 'よくあるご質問（Q&A）',   href: '/qa' },
];

export function conecfNavItem(key: ConecfNavKey): ConecfNavItem {
  return CONECF_NAV.find((n) => n.key === key) ?? CONECF_NAV[0];
}
