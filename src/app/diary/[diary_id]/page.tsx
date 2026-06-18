import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getTheme } from '@/app/lib/themes';
import { ScrollToCurrent } from './ScrollToCurrent';

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

  // 現在の日記から投稿者(セラピスト)を特定（id は UUID/bigint 両対応で文字列のまま照合）
  const { data: current, error } = await supabase
    .from('diary_posts')
    .select('therapist_id')
    .eq('id', diary_id)
    .single();
  if (error || !current) notFound();

  const therapistId = (current as { therapist_id: number | string }).therapist_id;

  // 同じセラピストの全日記を新しい順（上=新しい / 下=古い）で取得
  const { data: rows } = await supabase
    .from('diary_posts')
    .select('id, images, title, content, created_at, salon_id, therapists(name), salons(name, theme)')
    .eq('therapist_id', therapistId)
    .order('created_at', { ascending: false });

  if (!rows || rows.length === 0) notFound();

  type Row = {
    id: number | string; images: string[] | null; title: string | null; content: string | null;
    created_at: string; salon_id: number | string;
    therapists: { name: string | null } | { name: string | null }[] | null;
    salons: { name: string | null; theme: string | null } | { name: string | null; theme: string | null }[] | null;
  };
  const list = (rows as unknown as Row[]).map((r) => {
    const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
    const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
    return {
      id: String(r.id),
      image: (r.images ?? [])[0] ?? null,
      title: r.title ?? null,
      content: r.content ?? null,
      createdAt: r.created_at,
      salonId: String(r.salon_id),
      therapistName: t?.name ?? '',
      salonName: s?.name ?? '',
      themeKey: s?.theme ?? null,
    };
  });

  const therapistName = list[0].therapistName;
  const salonName = list[0].salonName;
  const salonId = list[0].salonId;

  // サロンのテーマ壁紙を背景に適用
  const theme = getTheme(list[0].themeKey);
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

      {/* 現在の日記まで自動スクロール */}
      <ScrollToCurrent targetId={`diary-${diary_id}`} />

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

        {/* ─── パンくずリスト：トップ › セラピスト名 › 写メ日記 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/therapist/${therapistId}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {therapistName || 'セラピスト'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: '#333', fontWeight: 600 }}>写メ日記</span>
        </nav>

        {/* ─── 同じセラピストの全日記（縦に連続表示） ─── */}
        <div className="space-y-6">
          {list.map((d) => {
            const isCurrent = d.id === String(diary_id);
            return (
              <article
                key={d.id}
                id={`diary-${d.id}`}
                className={`scroll-mt-20 bg-white rounded-2xl shadow-sm overflow-hidden border ${
                  isCurrent ? 'border-pink-400 ring-2 ring-pink-300' : 'border-slate-200'
                }`}
              >
                <div className="p-5 sm:p-6 space-y-4">

                  {/* 投稿日時 */}
                  <div className="flex items-center justify-between gap-2">
                    <p style={{ fontSize: '13px', color: '#999' }}>📅 {formatDate(d.createdAt)} 更新</p>
                    {isCurrent && (
                      <span className="flex-shrink-0 text-[10px] font-bold text-pink-600 bg-pink-50 border border-pink-200 px-2 py-0.5 rounded-full">
                        表示中
                      </span>
                    )}
                  </div>

                  {/* 画像（コンテナ幅いっぱい・cover） */}
                  {d.image && (
                    <div className="-mx-5 sm:-mx-6">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.image} alt={d.title ?? therapistName} className="block w-full max-h-[70vh] object-cover" />
                    </div>
                  )}

                  {/* 題名 */}
                  {d.title && <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{d.title}</h2>}

                  {/* 本文 */}
                  {d.content && (
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-all">{d.content}</p>
                  )}

                  {/* セラピスト名・サロン名リンク */}
                  <div className="border-t border-slate-100 pt-4 space-y-2">
                    <Link href={`/therapist/${therapistId}`} className="flex items-center gap-2 text-sm font-bold text-pink-600 hover:underline">
                      <span>👤</span>{therapistName || 'セラピスト'}
                    </Link>
                    <Link href={`/salon/${salonId}`} className="flex items-center gap-2 text-sm text-slate-500 hover:text-pink-600 transition-colors">
                      <span>📍</span>{salonName || 'サロン'}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
