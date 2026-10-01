import type { Metadata } from 'next';
import { createPublicClient } from '@/app/lib/supabase/public';

// ★ 第1082便: /therapist/[id]/diary と /therapist/[id]/diary/page/[n] の metadata（1か所）。
// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。
// ?page= 付きページも canonical はベース（/therapist/[id]/diary）に集約する。
export async function buildTherapistDiaryMetadata(id: string, page = 1): Promise<Metadata> {
  const supabase = createPublicClient();
  const { data: row } = await supabase
    .from('therapists')
    .select('name')
    .eq('id', id)
    .single();
  if (!row) return { robots: { index: false, follow: false } };
  const name = (row.name as string) ?? '';
  const suffix = page > 1 ? `（${page}ページ目）` : '';
  const title = `${name}の写メ日記${suffix}｜福岡メンズエステ【フクエス】`;
  // description（2026-08-05 追加）。未設定だと root のサイト説明文と完全重複になるため固有化。
  const description = `福岡メンズエステのセラピスト「${name}」の写メ日記一覧。日々の出勤情報や近況をフクエスでチェックできます。`;
  // ★ 第1082便: 2ページ目以降は /therapist/[id]/diary/page/[n] に自己参照 canonical（1ページ目の重複扱いにしない）
  const path = page > 1 ? `/therapist/${id}/diary/page/${page}` : `/therapist/${id}/diary`;
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
    twitter: { card: 'summary_large_image', title, description, images: ['/ogp.png'] },
  };
}
