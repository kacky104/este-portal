// ★ 第1996便（2026-11-12・カッキーさん）: 公式HP の Google アナリティクス（GA4 プロパティ「フクエス公式HP」）。
//   ・全店の公式HP を1つのプロパティに入れる（フクエス本体の GA4 とは混ぜない）。店ごとの数は、ホスト名（独自ドメイン）と
//     ページ（/hp/〇〇）で絞って読む（actions/hpDemographics.ts）。
//   ・測定ID は Vercel の環境変数 NEXT_PUBLIC_HP_GA_ID（G- から始まる）。空・形が違えば何も読み込まない。
//   ・プレビュー（/preview/）と管理画面（HpShell を通らない）では読み込まない。
//   ・規約に「アクセス解析ツールについて」を足した（_lib/terms.ts）。

export const HP_GA_ID = (process.env.NEXT_PUBLIC_HP_GA_ID ?? '').trim();
/** GA4 の数を読むプロパティ（フクエス公式HP）。Vercel の HP_GA_PROPERTY_ID で上書きできる */
export const HP_GA_PROPERTY_ID = (process.env.HP_GA_PROPERTY_ID ?? '563974213').trim();

export function isValidHpGaId(id: string): boolean {
  return /^G-[A-Z0-9]{6,14}$/.test(id);
}

/** HpShell が置く読み込みのスクリプト（プレビューでは何もしない） */
export function hpGaScript(id: string): string {
  const k = JSON.stringify(id);
  return `(function(){try{
if(/\\/preview\\//.test(location.pathname))return;
var I=${k};window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag('js',new Date());gtag('config',I);
var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(I);document.head.appendChild(s);
}catch(e){}})();`;
}
