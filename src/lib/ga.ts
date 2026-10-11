// Google アナリティクス（GA4）を「どこで読み込むか」の判断（第1403便・2026-10-11・カッキーさん）。
// ★ 純粋関数だけ。★ 画面（app/components/GoogleAnalytics.tsx）から使う。番人: npm run check:ga
//
// ★★ 形
//   読み込むのは fukues.com（www も）のお客様向けページだけ。
//   読み込まない:
//     ・ほかのホスト … fukuescrm.com・conecf.com・店舗様の独自ドメイン（公式HP）・localhost・*.vercel.app
//     ・管理やログインの画面 … /admin /mypage /cast /owner /moderation /crm /conecf など
//     ・★ アドレスに合言葉（トークン）が入るページ … /g/…（来店時の同意書）・/salon-intake/…・/reset-password・/auth
//         → GA4 はページのアドレスをそのまま Google へ送るので、合言葉を外へ出さないため。
//     ・会員ひとりの画面 … /member /saved、fukuX の DM・設定・通知 など
//     ・よそのサイトに貼る部品 /embed、店舗様の公式HP /hp
//
// ★ 新しく「人に見せない画面」を足したら、下の GA_EXCLUDED_PREFIXES にも足すこと。

/** ★★ GA4 の測定ID（G- から始まる）。プロパティ「フクエス」・ストリーム https://fukues.com（2026-10-11 にカッキーさんが作成）。空にすると何も読み込まない。
 *  Vercel の環境変数 NEXT_PUBLIC_GA_ID があればそちらを優先する（画面側で見る）。 */
export const GA_MEASUREMENT_ID = 'G-1JKQJ8X5XP';

/** GA4 を読み込むホスト（www は normalizeGaHost で落としてから比べる） */
export const GA_HOSTS: readonly string[] = ['fukues.com'];

/** GA4 を読み込まないパス（★ 区切りで見る: /g は /g と /g/… に当たり、/glossary には当たらない） */
export const GA_EXCLUDED_PREFIXES: readonly string[] = [
  // 管理・店舗様・セラピストの画面
  '/admin', '/mypage', '/cast', '/owner', '/moderation', '/crm', '/conecf',
  // ログインまわり（アドレスに合言葉が付くことがある）
  '/login', '/forgot-password', '/reset-password', '/auth',
  // ★ アドレスに合言葉が入るページ（来店時の同意書・店舗情報の入力）
  '/g', '/salon-intake',
  // 会員ひとりの画面
  '/member', '/saved',
  // fukuX のひとりの画面・管理
  '/x/admin', '/x/login', '/x/signup', '/x/onboarding', '/x/messages', '/x/notifications', '/x/settings', '/x/saved',
  // フクエスワークのひとりの画面
  '/jobs/saved',
  // よそに貼る部品・店舗様の公式HP・API
  '/embed', '/hp', '/api',
];

/** ホスト名をそろえる（小文字・ポートを落とす・末尾の . を落とす・www. を落とす） */
export function normalizeGaHost(host: string | null | undefined): string {
  let h = (host ?? '').trim().toLowerCase();
  const colon = h.indexOf(':');
  if (colon >= 0) h = h.slice(0, colon);
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h.startsWith('www.')) h = h.slice(4);
  return h;
}

/** GA4 を読み込んでよいホストか */
export function isGaHost(host: string | null | undefined): boolean {
  return GA_HOSTS.includes(normalizeGaHost(host));
}

/** GA4 を読み込まないパスか（★ 読めないパスは「読み込まない」側へ倒す） */
export function isGaExcludedPath(pathname: string | null | undefined): boolean {
  const p = (pathname ?? '').trim();
  if (p === '' || !p.startsWith('/')) return true;
  const lower = p.toLowerCase();
  return GA_EXCLUDED_PREFIXES.some((pre) => lower === pre || lower.startsWith(pre + '/'));
}

/** 測定ID の形（G- ＋ 英数字）。打ち間違いをそのまま読み込まないため */
export function isValidGaId(id: string | null | undefined): boolean {
  return /^G-[A-Z0-9]{6,14}$/.test((id ?? '').trim());
}

/** ★ まとめ: このホスト・このパスで GA4 を動かすか */
export function shouldRunGa(id: string | null | undefined, host: string | null | undefined, pathname: string | null | undefined): boolean {
  return isValidGaId(id) && isGaHost(host) && !isGaExcludedPath(pathname);
}
