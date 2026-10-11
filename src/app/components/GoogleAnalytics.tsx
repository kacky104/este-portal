'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { GA_MEASUREMENT_ID, isGaExcludedPath, isGaHost, isValidGaId } from '@/lib/ga';

// Google アナリティクス（GA4）の読み込み（第1403便・2026-10-11・カッキーさん）。
// ★ どこで読み込むかの判断は lib/ga.ts（番人: npm run check:ga）。ここは置くだけ。
// ★ fukues.com のお客様向けページだけ。管理画面・同意書（/g/…）・店舗様の独自ドメイン・CRM・コネックエフでは読み込まない。
// ★ ページの移動（クリックでの画面の切り替え）は GA4 の「拡張計測機能」が自動で数える（こちらからは送らない＝二重に数えない）。
// ★ 測定ID は Vercel の NEXT_PUBLIC_GA_ID を優先、無ければ lib/ga.ts の GA_MEASUREMENT_ID。どちらも空なら何もしない。

const GA_ID = (process.env.NEXT_PUBLIC_GA_ID || GA_MEASUREMENT_ID).trim();

const subscribeNever = () => () => {};
const readHost = () => window.location.hostname;
const readHostOnServer = () => '';

export default function GoogleAnalytics() {
  const pathname = usePathname() || '';
  // ホスト名はブラウザでしか分からない（サーバーでは空＝読み込まない）
  const host = useSyncExternalStore(subscribeNever, readHost, readHostOnServer);
  const enabled = isValidGaId(GA_ID) && isGaHost(host);
  const excluded = isGaExcludedPath(pathname);

  // ★ お客様向けページで読み込んだあと、クリックで管理画面などへ移ったときは GA4 を止める（公式の止め方）。戻ったら再開。
  useEffect(() => {
    if (!enabled) return;
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = excluded;
  }, [enabled, excluded]);

  if (!enabled || excluded) return null;

  return (
    <>
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
      <Script
        id="ga4-src"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
    </>
  );
}
