// コネックエフの左サイドバーの並び（第395便・1a）。★ 判断はこの1か所。
// ★ 並びは設計メモ「コネックエフ第1弾_テーブルと画面」§5。
// ★ href は画面内のパス（'/' '/sites' …）。★ 実際のリンクは conecfHref(base, href) で作る。

export type ConecfNavKey =
  | 'home' | 'sites'
  | 'girls' | 'girlsSync' | 'placeholder'
  | 'schedule' | 'scheduleSync' | 'shift'
  | 'now'
  | 'diary' | 'news' | 'bump' | 'esutamaOpt' | 'zenkokuOpt' | 'ekiMovie' | 'ekiMagazine' | 'announce' | 'cocoa'
  | 'log' | 'matrix' | 'analytics'
  | 'guide' | 'qa';

// ★★ 第462便（カッキーさん）: dense＝名前が長い項目（★ サイドバーで1行に収める。★ 折り返すと読みにくい）
export type ConecfNavItem = { key: ConecfNavKey; label: string; href: string; group?: string; dense?: boolean };

export const CONECF_NAV: readonly ConecfNavItem[] = [
  { key: 'home',         label: 'ホーム',               href: '/' },
  { key: 'sites',        label: 'ID・パスワード登録',          href: '/sites' },
  { key: 'girls',        label: 'セラピスト一覧（新規登録など）', href: '/girls',         group: 'セラピスト' },
  { key: 'girlsSync',    label: 'セラピスト登録状況一覧', href: '/girls/sync' },
  // ★ 第1722便（カッキーさん）: 写真が無いセラピストに使う画像（お店の既定画像）を独立した画面に。
  //   セラピスト一覧のいちばん下（第1550便）だと、人数が多い店は気づかず設定し忘れる。
  { key: 'placeholder',  label: 'セラピスト既定画像',     href: '/girls/placeholder' },
  { key: 'schedule',     label: '週間スケジュール',       href: '/schedule',      group: '出勤' },
  { key: 'scheduleSync', label: '出勤をサイトへ',         href: '/schedule/sync' },
  // ★ 2026-11-04: シフト管理表（セラピストの希望を確定）。SHIFT_SALON_IDS の店だけ出す（ConecfShell の shiftNav）
  { key: 'shift',        label: 'シフト希望管理表',       href: '/shift' },
  // ★★ 第462便: 「今すぐ」の見出しはやめて、出勤のまとまりに入れた（★ 1項目だけの見出しは、並びを長くするだけ）
  { key: 'now',          label: '今すぐ／即ヒメ／即セラ設定', href: '/now',           dense: true },
  // ★ 第1306便（カッキーさん）: フクエスと駅ちかの上位表示（手で押す・時間帯と間隔で自動で押す）をまとめた画面。今すぐの下
  { key: 'bump',         label: '上位表示設定',           href: '/bump' },
  // ★ 第1799便: エステ魂の有料オプション（集客ブースト・セラピストアピールなど）。運営が ON にした店だけ（ConecfShell の esutamaOptNav）
  { key: 'esutamaOpt',   label: 'エステ魂オプション',     href: '/esutama-options' },
  // ★ 第1831便: 全国エステランキングのニュース・おすすめセラピスト。運営が ON にした店だけ（ConecfShell の zenkokuOptNav）
  { key: 'zenkokuOpt',   label: '全国エステランキング設定', href: '/zenkoku-options', dense: true },
  { key: 'diary',        label: '写メ日記転送',           href: '/diary',         group: '写メ日記・新着' },
  // ★ 第1840便: 駅ちかの動画投稿。運営が ON にした店だけ（ConecfShell の ekiMovieNav）
  { key: 'ekiMovie',     label: '駅ちか動画投稿',         href: '/ekichika-movies' },
  // ★ 第1844便: 駅ちかのプラチナムマガジン。運営が ON にした店だけ（ConecfShell の ekiMagazineNav）
  { key: 'ekiMagazine',  label: '駅ちかマガジン',         href: '/ekichika-magazines' },
  { key: 'news',         label: '駅ちか新着情報',         href: '/news' },
  // ★ 第475便: フクエスのお知らせ（マイページのお知らせタブと同じことができる）
  { key: 'announce',     label: 'フクエスお知らせ',       href: '/announce' },
  { key: 'cocoa',        label: 'ココア店長ブログ',       href: '/cocoa' },
  { key: 'log',          label: '更新結果',               href: '/log',           group: '記録' },
  { key: 'matrix',       label: '反映の早見表',           href: '/matrix' },
  // ★ 第1792便（カッキーさん）: 公式ホームページ（フクエスサイト）のアクセス解析
  { key: 'analytics',    label: 'アクセス解析（公式HP）', href: '/analytics', dense: true },
  { key: 'guide',        label: 'はじめての方へ',         href: '/guide',         group: 'ご案内' },
  { key: 'qa',           label: 'よくあるご質問（Q&A）',   href: '/qa' },
];

export function conecfNavItem(key: ConecfNavKey): ConecfNavItem {
  return CONECF_NAV.find((n) => n.key === key) ?? CONECF_NAV[0];
}
