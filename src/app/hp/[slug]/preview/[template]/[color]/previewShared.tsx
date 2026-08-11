import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getHpAdminContext } from '@/app/actions/hpAdmin';
import { fetchHpPageData, type HpPageData } from '@/app/hp/_lib/data';
import { HP_DEMO_SLUG, isHpTemplateKey, isValidHpColor, normalizeHpSiteKey, type HpTemplateKey } from '@/app/lib/hpSite';

// デザインの実物プレビューの共通部分（2026-08-11 下層ページ対応で切り出し）。
//
// トップ（/preview/{ひな形}/{カラー}）と下層ページ（同 /therapist など）で、
// 認可・データ組み立て・プレビュー中バナーをそろえるためのファイル。
//
// ★ 肝は basePath の差し替え。公開ページのリンクはすべて data.basePath を前置きして
//   作られる（_lib/sections.ts）ので、ここでプレビューのURLに差し替えるだけで、
//   ヘッダー・ドロワー・フッター・パンくずの行き先が丸ごとプレビュー内に閉じる
//   ＝ ワインレッドを見ている途中で下層ページだけシャンパンゴールドに戻る、が起きない。

export type HpPreviewContext = {
  data:       HpPageData;
  isDemo:     boolean;
  backHref:   string;
  backLabel:  string;
  bannerText: string;
};

/**
 * プレビュー用のデータ一式を組み立てる。権限が無い・データが無いときは notFound()。
 *
 * 認可はトップと同じ:
 *   デモ（HP_DEMO_SLUG）… 誰でも見られる（デザイン一覧から開くため）
 *   それ以外           … 管理画面に入れる人だけ（未ログイン・部外者は404）
 */
export async function buildHpPreview(
  slug: string,
  template: string,
  color: string,
): Promise<HpPreviewContext> {
  if (!isHpTemplateKey(template) || !isValidHpColor(template, color)) notFound();

  const isDemo = normalizeHpSiteKey(slug) === HP_DEMO_SLUG;
  if (!isDemo) {
    const access = await getHpAdminContext(slug);
    if (!access.ok) notFound();
  }

  const data = await fetchHpPageData(slug, { template_key: template as HpTemplateKey, theme_key: color });
  if (!data) notFound();

  // ★ ページ内リンクの前置きをプレビューのURLへ。
  //   独自ドメイン経由なら basePath='' なので '/preview/s/wine'（proxy.ts が rewrite する）、
  //   暫定URLなら '/hp/{slug}/preview/s/wine' になる。
  data.basePath = `${data.basePath}/preview/${template}/${color}`;

  // 「戻る」の行き先。デモはデザイン一覧へ。契約店舗の確認は管理画面へ
  // （店舗ドメイン経由なら /admin。/hp/… を書くと二重 rewrite で 404。admin/page.tsx と同じ判定）。
  const h = await headers();
  const host = normalizeHpSiteKey((h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0]);
  const backHref = isDemo
    ? '/hp/templates'
    : host !== '' && host === normalizeHpSiteKey(slug) ? '/admin' : `/hp/${slug}/admin`;

  return {
    data,
    isDemo,
    backHref,
    backLabel: isDemo ? 'デザイン一覧に戻る' : '選択画面に戻る',
    bannerText: isDemo
      ? 'デザインの表示例です（サンプル店舗のデータで表示しています）'
      : 'プレビュー表示です（まだ確定されていません）',
  };
}

/**
 * プレビュー中バナー＋中身の額縁。
 * バナーは position:fixed なので、その高さぶんの余白と、ひな形のトップバーの
 * 吸着位置（--hp-topbar-top）を下のスクリプトが実測値で合わせる。
 */
export function HpPreviewFrame({
  bannerText,
  backHref,
  backLabel,
  children,
}: {
  bannerText: string;
  backHref:   string;
  backLabel:  string;
  children:   React.ReactNode;
}) {
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
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var b=document.getElementById('hp-preview-bar'),s=document.getElementById('hp-preview-spacer');if(!b||!s)return;var w=s.parentElement;function u(){var h=b.offsetHeight;s.style.height=h+'px';if(w)w.style.setProperty('--hp-topbar-top',h+'px')}u();window.addEventListener('resize',u,{passive:true});window.addEventListener('load',u);if(window.ResizeObserver)new ResizeObserver(u).observe(b)})();`,
        }}
      />
    </div>
  );
}
