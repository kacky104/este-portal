import type { Metadata } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';
import { areaLabel } from '@/app/lib/areaLabel';

// サロン配下サブページ共通の generateMetadata 組み立て（2026-07-12）。
// root layout の alternates.canonical('/') は下位ページに継承されるため、
// metadata 未定義のサブページは全て「トップページの重複」として検索エンジンに伝わっていた
// （/x で発見したのと同一クラスの問題の本体側残存分）。
// → 各サブページで自己参照 canonical＋固有 title を必ず明示する。
// フォーム系（ネット予約・口コミ投稿）は noindex（インデックス対象外なので canonical は付けない）。
//
// openGraph は Next の metadata 浅いマージ仕様により部分指定すると root の og が丸ごと消えるため、
// 必要項目（title/url/siteName/type/images）を全て明示する。
export async function buildSalonSubpageMetadata(
  id: string,
  sub: string,
  label: string,
  opts?: { noindex?: boolean },
): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data: row } = await supabase
    .from('salons')
    .select('name, area, is_hidden')
    .eq('id', Number(id))
    .single();

  // 非表示・不存在はページ本体側で notFound される。
  // メタを空で返すと root の canonical '/' が継承されるため、念のため noindex を返す。
  if (!row || row.is_hidden) return { robots: { index: false, follow: false } };

  const name = (row.name as string) ?? '';
  const areaText = areaLabel(row.area as string | null);
  const title = `${name}の${label}｜${areaText}のメンズエステ【フクエス】`;
  // description（2026-08-05 追加）。未設定だと root layout のサイト説明文を全店舗×9ページが
  // 継承し「メタディスクリプション完全重複」になっていた。店名＋ページ種別で固有化する。
  const description = `${areaText}のメンズエステ「${name}」の${label}ページ。フクエスでは${name}の料金・在籍セラピスト・出勤スケジュール・口コミ・写メ日記をまとめて確認できます。`;

  if (opts?.noindex) {
    return { title, description, robots: { index: false, follow: false } };
  }

  const path = `/salon/${id}/${sub}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: 'フクエス',
      type: 'website',
      images: [{ url: '/ogp.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/ogp.png'],
    },
  };
}
