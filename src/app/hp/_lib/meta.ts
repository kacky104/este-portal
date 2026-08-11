// 公式ホームページのメタ情報の組み立て（2026-08-11 マルチページ化）。
//
// index/noindex・canonical・ファビコンの判定はページが増えても1本のままにする。
// 元は /hp/[slug]/page.tsx に直書きだったものをここへ出した。
//
// ルール（従来どおり）:
//  - 独自ドメインで接続済み かつ そのドメインでアクセスされている時だけ index を許可。
//    暫定URL（fukues.com/hp/*）は常に noindex（本番URLと重複させないため）。
//  - canonical はドメイン接続済みなら必ずドメイン側へ向ける（両方から引けるため）。
//  - 店舗のファビコンは設定時のみ出す（未設定なら /favicon.ico にフォールバック）。

import type { Metadata } from 'next';
import { isHpDomainKey, normalizeHpSiteKey } from '@/app/lib/hpSite';
import type { HpPageData } from './data';

/**
 * このページを配信しているオリジン。
 * 独自ドメイン接続済みなら 'https://example-shop.com'、未接続なら null。
 * JSON-LD の絶対URLに使う（null のときは JSON-LD を出さない＝暫定URLは noindex なので不要）。
 */
export function hpSiteOrigin(data: HpPageData): string | null {
  const domain = data.site.domain;
  return domain ? `https://${normalizeHpSiteKey(domain)}` : null;
}

/** URLキーが「そのサイトの独自ドメイン」でのアクセスか（＝検索に載せてよいか）。 */
export function isHpIndexable(data: HpPageData, key: string): boolean {
  const k = normalizeHpSiteKey(key);
  const domain = data.site.domain;
  return !!domain && isHpDomainKey(k) && k === normalizeHpSiteKey(domain);
}

/**
 * 公開ページ共通のメタ情報。
 *
 * @param key   URLキー（[slug] の値。slug または独自ドメイン）
 * @param path  サイト内の絶対パス（トップ='' / セラピスト='/therapist'）。canonical に使う
 * @param noindex  常に noindex にしたいページ（利用規約など）は true。
 *                 このとき follow は許可する（サイト内のリンクは辿らせたいため）。
 *                 一方、暫定URL（fukues.com/hp/*）は従来どおり follow も禁止＝丸ごと隠す。
 */
export function buildHpMetadata(
  data: HpPageData,
  key: string,
  opts: { title: string; description: string; path: string; noindex?: boolean },
): Metadata {
  const alwaysNoindex = opts.noindex === true;
  const indexable = !alwaysNoindex && isHpIndexable(data, key);
  const origin = hpSiteOrigin(data);

  return {
    title: opts.title,
    description: opts.description,
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: alwaysNoindex },
    ...(origin ? { alternates: { canonical: `${origin}${opts.path === '' ? '/' : opts.path}` } } : {}),
    // 店舗のファビコン（設定時のみ）。独自ドメインで開いたときのタブアイコン。
    // 未設定の店は <link rel="icon"> を出さない → /favicon.ico にフォールバック
    // （店舗ドメインでは proxy.ts が /hp/[slug]/favicon.ico ルートへ回す）。
    ...(data.site.favicon_url ? { icons: { icon: data.site.favicon_url } } : {}),
  };
}

/** 公開前（draft/suspended）とサイト無しのときの共通メタ。契約状況を外に漏らさない。 */
export const HP_NOT_PUBLIC_METADATA: Metadata = {
  title: '準備中',
  robots: { index: false, follow: false },
};
