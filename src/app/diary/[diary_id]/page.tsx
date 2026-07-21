import { Suspense } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { truncatePlain } from '@/app/lib/truncatePlain';
import { toJsonLdString, buildBreadcrumbJsonLd } from '@/app/lib/jsonLd';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { DiaryFeed } from './DiaryFeed';
import { DiaryListCrumb } from './DiaryListCrumb';
import { fetchDiaryFeed } from './feedShared';

// ISR：10分ごとに再生成（保存時は /api/revalidate で /salon/[id] 配下を 'layout' 無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

// 写メ日記詳細のメタデータ。非公開サロンの日記・削除済み等（本体が404にするケース）は空を返す。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ diary_id: string }>;
}): Promise<Metadata> {
  const { diary_id } = await params;
  const supabase = createPublicClient();
  // salons!inner + is_hidden=false で非表示サロンの日記は対象外（該当なし→空メタ）。
  const { data } = await supabase
    .from('diary_posts')
    .select('title, content, images, therapists(name), salons!inner(name, is_hidden)')
    .eq('id', diary_id)
    .eq('salons.is_hidden', false)
    .maybeSingle();
  if (!data) return {};

  const t = Array.isArray(data.therapists) ? data.therapists[0] : data.therapists;
  const s = Array.isArray(data.salons) ? data.salons[0] : data.salons;
  const therapistName = (t?.name as string | null) ?? '';
  const salonName = (s?.name as string | null) ?? '';
  const diaryTitle = (data.title as string | null) || '写メ日記';
  const title = `${diaryTitle}｜${therapistName}（${salonName}）の写メ日記【フクエス】`;
  const description =
    truncatePlain(data.content as string | null, 90) ||
    `${salonName}のセラピスト${therapistName}の写メ日記。`;
  const images = (data.images as string[] | null) ?? [];
  const image = images[0] || '/ogp.png';

  return {
    title,
    description,
    alternates: { canonical: `/diary/${diary_id}` },
    openGraph: {
      title,
      description,
      url: `/diary/${diary_id}`,
      siteName: 'フクエス',
      type: 'article',
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function DiaryDetailPage({
  params,
}: {
  params: Promise<{ diary_id: string }>;
}) {
  const { diary_id } = await params;
  const supabase = createPublicClient();

  // 現在の日記から投稿者(セラピスト)と所属サロンを特定（id は UUID/bigint 両対応で文字列のまま照合）。
  const { data: current, error } = await supabase
    .from('diary_posts')
    .select('therapist_id, salon_id')
    .eq('id', diary_id)
    .single();
  if (error || !current) notFound();

  const therapistId = (current as { therapist_id: number | string }).therapist_id;
  const salonId = (current as { salon_id: number | string }).salon_id;

  // 既定（セラピスト）フィードと所属サロン情報は互いに独立なので並列取得。
  // ?from=salon のときはクライアント側（DiaryFeed）でサロン全体フィードへ差し替える。
  const [list, { data: salonRow }] = await Promise.all([
    fetchDiaryFeed(supabase, { fromSalon: false, salonId, therapistId }),
    supabase.from('salons').select('name, theme').eq('id', salonId).maybeSingle(),
  ]);

  if (list.length === 0) notFound();

  const theme = getTheme((salonRow?.theme as string | null) ?? null);

  // テーマ壁紙（theme に依存するので後段）。
  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      : {}),
  };

  // パンくず用：現在の日記のエントリ（題名）とサロン名。
  const currentEntry = list.find((d) => d.id === String(diary_id)) ?? list[0];
  const salonName = (salonRow?.name as string | null) || currentEntry.salonName || list[0].salonName;
  const currentTitle = currentEntry.title || '写メ日記';

  // 構造化データ（BreadcrumbList「トップ › サロン名 › 日記タイトル」）。
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'トップ', path: '/' },
    { name: salonName || '店舗', path: `/salon/${salonId}` },
    { name: currentTitle, path: `/diary/${diary_id}` },
  ]);

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* BreadcrumbList 構造化データ（トップ › サロン名 › 日記タイトル） */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLdString(breadcrumbJsonLd) }} />

      {/* 背景レイヤー（所属サロンのテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 写メ日記一覧 › 題名 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link
            href={`/salon/${salonId}`}
            className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle"
            style={{ color: '#ec4899' }}
          >
            {salonName || '店舗'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Suspense fallback={<span className="flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>写メ日記一覧</span>}>
            <DiaryListCrumb salonId={String(salonId)} therapistId={String(therapistId)} />
          </Suspense>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[30%] truncate align-middle" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>{currentTitle}</span>
        </nav>

        {/* ─── 写メ日記フィード（縦に連続表示。?from=salon はクライアントで差し替え） ─── */}
        <Suspense fallback={null}>
          <DiaryFeed
            initialList={list}
            currentId={String(diary_id)}
            salonId={String(salonId)}
            therapistId={String(therapistId)}
          />
        </Suspense>
      </main>
    </div>
  );
}
