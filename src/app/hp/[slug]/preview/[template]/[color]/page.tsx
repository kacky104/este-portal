import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HpTemplate } from '@/app/hp/_templates/HpTemplate';
import { HP_DEMO_SLUG, isHpTemplateKey, isValidHpColor, normalizeHpSiteKey } from '@/app/lib/hpSite';
import { getHpAdminContext } from '@/app/actions/hpAdmin';

// デザインの【実物プレビュー】（2026-08-09）。
//
// /hp/{key}/preview/{template}/{color} で、その店の実データ（セラピスト・出勤・料金 …）が
// 入った公開ページを、指定のひな形×カラーでそのまま描画する。DBには何も書かない。
// 掲載データから中身が自動で埋まるうちの方式だからできる芸当で、ここが vootec との差。
//
// 用途は2つ:
//  1. デモ（key = HP_DEMO_SLUG）… デザイン一覧（/hp/templates）から誰でも見られる。
//     運営が用意したサンプル店舗で全パターンを見せ、契約店舗と会話でデザインを決める。
//  2. 契約店舗の実データでの確認 … 管理画面と同じ認可（運営/オーナー/HP管理者）。
//     運営が設定を確定する前の最終確認に使う。第三者には 404。
//     draft の店でも本人はプレビューできる（公開ページの status ゲートは通らない）。
//
// - force-dynamic: ログイン判定に cookie を読むため。ISR には乗せない（公開ページ側は従来どおり）。
// - 店舗ドメイン経由でも proxy.ts の rewrite でそのまま届く（/preview/... → /hp/{ドメイン}/preview/...）。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'デザインプレビュー',
  robots: { index: false, follow: false },
};

export default async function HpPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; template: string; color: string }>;
}) {
  const { slug, template, color } = await params;
  if (!isHpTemplateKey(template) || !isValidHpColor(template, color)) notFound();

  const isDemo = normalizeHpSiteKey(slug) === HP_DEMO_SLUG;
  if (!isDemo) {
    // 管理画面に入れる人だけ（未ログイン・部外者は 404。存在も知らせない）
    const access = await getHpAdminContext(slug);
    if (!access.ok) notFound();
  }

  const data = await fetchHpPageData(slug, { template_key: template, theme_key: color });
  if (!data) notFound();

  // 「戻る」の行き先。デモはデザイン一覧へ。契約店舗の確認は管理画面へ
  // （店舗ドメイン経由なら /admin。/hp/… を書くと二重 rewrite で 404。admin/page.tsx と同じ判定）。
  const h = await headers();
  const host = normalizeHpSiteKey((h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0]);
  const backHref = isDemo
    ? '/hp/templates'
    : host !== '' && host === normalizeHpSiteKey(slug) ? '/admin' : `/hp/${slug}/admin`;
  const bannerText = isDemo
    ? 'デザインの表示例です（サンプル店舗のデータで表示しています）'
    : 'プレビュー表示です（まだ確定されていません）';
  const backLabel = isDemo ? 'デザイン一覧に戻る' : '選択画面に戻る';

  return (
    // --hp-topbar-top は「バナーの高さぶん、ひな形のトップバーを下げる」ための変数。
    // スマホではバナーが2行に折り返して高くなるので、下のスクリプトが実測値で上書きする。
    <div style={{ '--hp-topbar-top': '42px' } as React.CSSProperties}>
      {/* プレビュー中バナー（固定・最前面）。公開ページのCTA（下部固定）と被らないよう上に置く */}
      <div
        id="hp-preview-bar"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '9px 12px',
          background: '#be185d',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.05em',
        }}
      >
        <span>{bannerText}</span>
        <a
          href={backHref}
          style={{
            color: '#fff',
            background: 'rgba(255,255,255,.18)',
            border: '1px solid rgba(255,255,255,.5)',
            borderRadius: 999,
            padding: '4px 14px',
            textDecoration: 'none',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          {backLabel}
        </a>
      </div>
      {/* バナーの高さぶん下げる（実際の高さはスクリプトが合わせる） */}
      <div id="hp-preview-spacer" style={{ height: 42 }} />
      <HpTemplate data={data} />
      {/* バナーは position:fixed なので、そのままだと sticky のトップバーが下に潜り込む。
          バナーの実測の高さを余白とトップバーの吸着位置（--hp-topbar-top）に反映して、
          スマホでバナーが2行になっても重ならないようにする。 */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var b=document.getElementById('hp-preview-bar'),s=document.getElementById('hp-preview-spacer');if(!b||!s)return;var w=s.parentElement;function u(){var h=b.offsetHeight;s.style.height=h+'px';if(w)w.style.setProperty('--hp-topbar-top',h+'px')}u();window.addEventListener('resize',u,{passive:true});window.addEventListener('load',u);if(window.ResizeObserver)new ResizeObserver(u).observe(b)})();`,
        }}
      />
    </div>
  );
}
