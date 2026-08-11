import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpTerms } from '@/app/hp/_lib/terms';
import { HpShell } from '@/app/hp/_templates/HpShell';

// 公式ホームページの利用規約ページ（2026-08-10 → 2026-08-11 外枠を HpShell に統一）。
//
// - URL: 独自ドメインなら /terms（proxy.ts が /hp/{host}/terms へ rewrite）
//        暫定URLなら /hp/{slug}/terms
// - 文面は全店共通（_lib/terms.ts）。店名だけ差し込む。
// - ★ 常に noindex。全店で同じ文面になるため、検索に載せると重複コンテンツになる。
//   ドロワーからのリンクで人が読めれば目的は果たせる（follow は許可してリンクは辿らせる）。
// - 見た目はひな形のCSSをそのまま使う。トップバーとフッターだけの簡素な作りで、
//   ドロワーは置かない（代わりに「ホームへ戻る」を上下に置く）＝ HpShell の chrome="doc"。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
//   これが無いと revalidate が無視される（2026-08-11 追加。他のページには元から入っていた）。
export async function generateStaticParams() {
  return [];
}

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

  const { salon, basePath } = data;
  const sections = buildHpTerms(salon.name);

  return (
    <HpShell data={data} page="terms" chrome="doc">
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
    </HpShell>
  );
}
