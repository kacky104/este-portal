'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { GA_MEASUREMENT_ID, gaSafeReferrer, isGaExcludedPath, isGaHost, isValidGaId } from '@/lib/ga';

// Google アナリティクス（GA4）の読み込み（第1403便・2026-10-11・カッキーさん）。
// ★ どこで読み込むかの判断は lib/ga.ts（番人: npm run check:ga）。ここは置くだけ。
// ★ fukues.com のお客様向けページだけ。管理画面・同意書（/g/…）・店舗様の独自ドメイン・CRM・コネックエフでは読み込まない。
// ★ ページの移動（クリックでの画面の切り替え）は GA4 の「拡張計測機能」が自動で数える（こちらからは送らない＝二重に数えない）。
// ★ 測定ID は Vercel の NEXT_PUBLIC_GA_ID を優先、無ければ lib/ga.ts の GA_MEASUREMENT_ID。どちらも空なら何もしない。
// ★ 第1404便: 「どこから来たか」（document.referrer）がフクエスの中の読み込まないページ（同意書の合言葉入りアドレスなど）のときは、
//    アドレスを Google へ出さない（サイトの頭だけにする・gaSafeReferrer）。

const GA_ID = (process.env.NEXT_PUBLIC_GA_ID || GA_MEASUREMENT_ID).trim();

const subscribeNever = () => () => {};
const readHost = () => window.location.hostname;
const readReferrer = () => document.referrer;
const readEmptyOnServer = () => '';

export default function GoogleAnalytics() {
  const pathname = usePathname() || '';
  // ホスト名・どこから来たかはブラウザでしか分からない（サーバーでは空＝読み込まない）
  const host = useSyncExternalStore(subscribeNever, readHost, readEmptyOnServer);
  const referrer = useSyncExternalStore(subscribeNever, readReferrer, readEmptyOnServer);
  const enabled = isValidGaId(GA_ID) && isGaHost(host);
  const excluded = isGaExcludedPath(pathname);

  // ★ お客様向けページで読み込んだあと、クリックで管理画面などへ移ったときは GA4 を止める（公式の止め方）。戻ったら再開。
  useEffect(() => {
    if (!enabled) return;
    (window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`] = excluded;
  }, [enabled, excluded]);

  if (!enabled || excluded) return null;

  const safeReferrer = gaSafeReferrer(referrer);
  const config = safeReferrer === null ? '' : `,${JSON.stringify({ page_referrer: safeReferrer })}`;

  return (
    <>
      {/* ★ 第1523便: afterInteractive → lazyOnload（PageSpeed: gtag 176KB が TBT の長時間タスク 2 件・CPU 300ms）。
          ページの読み込みが終わってから読む。計測の中身は同じ（ページビューは gtag が読まれた時点で送られる）。 */}
      <Script id="ga4-init" strategy="lazyOnload">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}'${config});`}
      </Script>
      <Script
        id="ga4-src"
        strategy="lazyOnload"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
    </>
  );
}
