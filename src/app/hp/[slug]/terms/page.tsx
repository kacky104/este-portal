import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpTerms } from '@/app/hp/_lib/terms';
import { hpColorCssVars } from '@/app/lib/hpSite';
import { TEMPLATE_CSS } from '@/app/hp/_templates/styles';

// 公式ホームページの利用規約ページ（2026-08-10）。
//
// - URL: 独自ドメインなら /terms（proxy.ts が /hp/{host}/terms へ rewrite）
//        暫定URLなら /hp/{slug}/terms
// - 文面は全店共通（_lib/terms.ts）。店名だけ差し込む。
// - ★ 常に noindex。全店で同じ文面になるため、検索に載せると重複コンテンツになる。
//   ドロワーからのリンクで人が読めれば目的は果たせる（follow は許可してリンクは辿らせる）。
// - 見た目はひな形のCSSをそのまま使う。トップバーとフッターだけの簡素な作りで、
//   ドロワーは置かない（代わりに「ホームへ戻る」を上下に置く）。

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || data.site.status !== 'live') {
    return { title: '準備中', robots: { index: false, follow: false } };
  }
  return {
    title: `利用規約｜${data.salon.name}`,
    description: `${data.salon.name}のご利用にあたってのお願いと禁止事項です。当店は風俗店ではありません。`,
    robots: { index: false, follow: true },
  };
}

export default async function HpTermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || data.site.status !== 'live') notFound();

  const { site, salon, basePath } = data;
  const cssVars = hpColorCssVars(site.template_key, site.theme_key) as React.CSSProperties;
  const sections = buildHpTerms(salon.name);

  return (
    <div
      className={`hp-root hp-${site.template_key}${data.wallpaperUrl ? ' hp-has-wallpaper' : ''} hp-ordered`}
      style={cssVars}
    >
      <style dangerouslySetInnerHTML={{ __html: TEMPLATE_CSS[site.template_key] }} />

      {data.wallpaperUrl && (
        <div className="hp-wallpaper" style={{ backgroundImage: `url(${data.wallpaperUrl})` }} />
      )}

      <div className="hp-topbar" style={{ order: -2 }}>
        <a className="hp-topbar-home" href={basePath || '/'}>
          {site.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hp-topbar-logo" src={site.logo_url} alt={salon.name} />
          ) : (
            <span className="hp-topbar-name">{salon.name}</span>
          )}
        </a>
        <a className="hp-doc-back" href={basePath || '/'}>← ホームへ</a>
      </div>

      <section className="hp-sec hp-sec-doc" style={{ order: 1 }}>
        <div className="hp-en">Terms</div>
        <h1 className="hp-h2">利用規約</h1>
        <div className="hp-rule" />

        <div className="hp-doc">
          {sections.map((sec) => (
            <section key={sec.heading} className="hp-doc-sec">
              <h2 className="hp-doc-h">{sec.heading}</h2>
              {sec.paragraphs?.map((t, i) => (
                <p key={i} className="hp-doc-p">{t}</p>
              ))}
              {sec.items && (
                <ul className="hp-doc-list">
                  {sec.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <a className="hp-more" href={basePath || '/'}>← ホームへ戻る</a>
      </section>

      <footer className="hp-footer" style={{ order: 100 }}>
        <div className="hp-footer-name">{salon.name}</div>
        <div className="hp-footer-sub">© {salon.name} all rights reserved.</div>
      </footer>

      {(salon.phone || salon.lineUrl) && (
        <div className="hp-cta">
          {salon.phone && <a className="hp-cta-tel" href={`tel:${salon.phone}`}>電話予約</a>}
          {salon.lineUrl && (
            <a className="hp-cta-line" href={salon.lineUrl} target="_blank" rel="noopener noreferrer">LINE予約</a>
          )}
        </div>
      )}
    </div>
  );
}
