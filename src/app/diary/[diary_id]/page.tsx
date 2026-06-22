import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/server';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { ScrollToCurrent } from './ScrollToCurrent';
import { ExpandableText } from './ExpandableText';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

export default async function DiaryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ diary_id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { diary_id } = await params;
  const { from } = await searchParams;
  const supabase = await createClient();

  // 現在の日記から投稿者(セラピスト)と所属サロンを特定（id は UUID/bigint 両対応で文字列のまま照合）
  const { data: current, error } = await supabase
    .from('diary_posts')
    .select('therapist_id, salon_id')
    .eq('id', diary_id)
    .single();
  if (error || !current) notFound();

  const therapistId = (current as { therapist_id: number | string }).therapist_id;
  const salonId = (current as { salon_id: number | string }).salon_id;

  // フィード対象を「どこから来たか」で切り替える。
  //   from=salon: 同じサロン(salon_id)の全セラピストの日記
  //   それ以外  : 従来どおり同じセラピスト(therapist_id)の日記（デフォルト挙動を維持）
  // 並び順はどちらも新しい順（上=新しい / 下=古い）で統一。
  const fromSalon = from === 'salon';
  const feedQuery = supabase
    .from('diary_posts')
    .select('id, images, title, content, created_at, salon_id, therapist_id, therapists(name, profile_image_url), salons(name, theme)')
    .order('created_at', { ascending: false });
  const { data: rows } = fromSalon
    ? await feedQuery.eq('salon_id', salonId)
    : await feedQuery.eq('therapist_id', therapistId);

  if (!rows || rows.length === 0) notFound();

  type TRel = { name: string | null; profile_image_url: string | null };
  type Row = {
    id: number | string; images: string[] | null; title: string | null; content: string | null;
    created_at: string; salon_id: number | string; therapist_id: number | string;
    therapists: TRel | TRel[] | null;
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
      // 各記事のヘッダー／リンクは「その記事自身」のセラピストを使う。
      // セラピストフィード時は全行同一なので従来挙動と変わらない。
      therapistId: String(r.therapist_id),
      therapistName: t?.name ?? '',
      therapistImage: t?.profile_image_url ?? null,
      salonName: s?.name ?? '',
      themeKey: s?.theme ?? null,
    };
  });

  // パンくず用：現在の日記のエントリ（サロン名・題名・セラピスト名を参照）
  const currentEntry = list.find((d) => d.id === String(diary_id)) ?? list[0];
  const salonName = currentEntry.salonName || list[0].salonName;
  const currentTitle = currentEntry.title || '写メ日記';

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
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide text-pink-500 leading-none">フクエス</span><span className="hidden min-[420px]:inline text-[12px] font-normal text-slate-400 leading-none">～福岡メンズエステポータル～</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 写メ日記一覧 › 題名 ─── */}
        {/* 「写メ日記一覧」のリンク先は来た経路で切替（フィード判定 fromSalon と整合）：
            from=salon → お店全体の一覧 /salon/[id]/diary、それ以外 → そのセラピストの一覧 /therapist/[id]/diary */}
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
          <Link
            href={fromSalon ? `/salon/${salonId}/diary` : `/therapist/${therapistId}/diary`}
            className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap"
            style={{ color: '#ec4899' }}
          >
            写メ日記一覧
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[30%] truncate align-middle" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>{currentTitle}</span>
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
                {/* セラピストアイコン + 名前（左） + 投稿日時（上下の余白を最小に） */}
                <div className="px-5 sm:px-6 pt-2 pb-1">
                  <div className="flex items-center gap-2 min-w-0 leading-none">
                    <Link href={`/therapist/${d.therapistId}`} className="w-14 h-14 rounded-full overflow-hidden border-2 border-pink-100 shadow-sm flex-shrink-0 bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center">
                      {d.therapistImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.therapistImage} alt={d.therapistName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-white text-xl font-bold">{(d.therapistName || '?').charAt(0)}</span>
                      )}
                    </Link>
                    <Link href={`/therapist/${d.therapistId}`} className="text-sm font-bold text-pink-600 hover:underline truncate min-w-0">
                      {d.therapistName || 'セラピスト'}
                    </Link>
                    <p className="flex-shrink-0" style={{ fontSize: '13px', color: '#999' }}>📅 {formatDate(d.createdAt)} 更新</p>
                  </div>
                </div>

                <div className="px-5 sm:px-6 pb-5 sm:pb-6 space-y-4">
                  {/* 画像（コンテナ幅いっぱい・cover） */}
                  {d.image && (
                    <div className="-mx-5 sm:-mx-6">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.image} alt={d.title ?? d.therapistName} className="block w-full max-h-[70vh] object-cover" />
                    </div>
                  )}

                  {/* 題名（ピックアップサロンと同じピンク→オレンジのグラデーション文字） */}
                  {d.title && (
                    <h2
                      className="text-xl sm:text-2xl font-bold w-fit"
                      style={{
                        background: 'linear-gradient(to right, #ec4899, #f97316)',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        color: 'transparent',
                      }}
                    >
                      {d.title}
                    </h2>
                  )}

                  {/* 本文（5行超は「続きを見る」で展開） */}
                  {d.content && <ExpandableText text={d.content} />}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
