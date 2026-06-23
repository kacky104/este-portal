import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
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

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（所属サロンのテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 写メ日記一覧 › 題名 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link
            href={`/salon/${salonId}`}
            className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle"
            style={{ color: '#ec4899' }}
          >
            {salonName || 'サロン'}
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
