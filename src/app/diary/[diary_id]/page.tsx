import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getTheme } from '@/app/lib/themes';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export default async function DiaryDetailPage({
  params,
}: {
  params: Promise<{ diary_id: string }>;
}) {
  const { diary_id } = await params;
  const supabase = await createClient();

  // id は UUID / bigint どちらの可能性もあるため文字列のまま渡す（Number() 変換しない）
  const { data: row, error } = await supabase
    .from('diary_posts')
    .select('id, images, title, content, created_at, therapist_id, salon_id, therapists(name), salons(name, theme)')
    .eq('id', diary_id)
    .single();

  if (error || !row) notFound();

  const r = row as unknown as {
    id: number; images: string[] | null; title: string | null; content: string | null;
    created_at: string; therapist_id: number; salon_id: number;
    therapists: { name: string | null } | { name: string | null }[] | null;
    salons: { name: string | null; theme: string | null } | { name: string | null; theme: string | null }[] | null;
  };
  const therapist = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
  const salon = Array.isArray(r.salons) ? r.salons[0] : r.salons;
  const therapistName = therapist?.name ?? '';
  const salonName = salon?.name ?? '';
  const image = (r.images ?? [])[0] ?? null;

  // サロンのテーマ壁紙を背景に適用
  const theme = getTheme((salon?.theme as string | null) ?? null);
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

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: theme.text }}>

      {/* 背景レイヤー（所属サロンのテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › セラピスト名 › 日記タイトル ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${r.salon_id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[28%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || 'サロン'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/therapist/${r.therapist_id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[28%] truncate align-middle" style={{ color: '#ec4899' }}>
            {therapistName || 'セラピスト'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[32%] truncate align-middle" style={{ color: '#333', fontWeight: 600 }}>
            {r.title || '写メ日記'}
          </span>
        </nav>

        {/* ─── 本体カード ─────────────────────────────────── */}
        <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 space-y-4">

            {/* 投稿日時 */}
            <p style={{ fontSize: '13px', color: '#999' }}>📅 {formatDate(r.created_at)} 更新</p>

            {/* 画像（コンテナ幅いっぱい・cover。カードの左右paddingを相殺して全幅表示） */}
            {image && (
              <div className="-mx-5 sm:-mx-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={r.title ?? therapistName} className="block w-full max-h-[70vh] object-cover" />
              </div>
            )}

            {/* 題名 */}
            {r.title && (
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{r.title}</h1>
            )}

            {/* 本文 */}
            {r.content && (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-all">
                {r.content}
              </p>
            )}

            {/* セラピスト名・サロン名リンク */}
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <Link
                href={`/therapist/${r.therapist_id}`}
                className="flex items-center gap-2 text-sm font-bold text-pink-600 hover:underline"
              >
                <span>👤</span>{therapistName || 'セラピスト'}
              </Link>
              <Link
                href={`/salon/${r.salon_id}`}
                className="flex items-center gap-2 text-sm text-slate-500 hover:text-pink-600 transition-colors"
              >
                <span>📍</span>{salonName || 'サロン'}
              </Link>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
