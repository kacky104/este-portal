import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { getTheme, breadcrumbCurrentColor } from '@/app/lib/themes';
import { formatDiaryDate } from '@/lib/diaryDate';
import { DiaryTherapistAvatar } from '@/components/DiaryTherapistAvatar';

// ISR：10分ごとに再生成（保存時は /api/revalidate で /salon/[id] 配下を 'layout' 無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

type DiaryRow = {
  id: number | string;
  images: string[] | null;
  title: string | null;
  created_at: string;
};

export default async function TherapistDiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // therapist 本体と写メ日記は id だけに依存するので並列取得。
  const [
    { data: tRow, error },
    { data: diaryRows },
  ] = await Promise.all([
    supabase.from('therapists').select('id, name, salon_id, profile_image_url').eq('id', id).single(),
    supabase
      .from('diary_posts')
      .select('id, images, title, created_at')
      .eq('therapist_id', Number(id))
      .order('created_at', { ascending: false }),
  ]);
  if (error || !tRow) notFound();

  const { data: salonRow } = await supabase
    .from('salons')
    .select('id, name, theme')
    .eq('id', tRow.salon_id as number)
    .single();

  const theme = getTheme((salonRow?.theme as string | null) ?? null);
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

  // 写メ日記（新しい順）は上の Promise.all で取得済み。
  const diaries = ((diaryRows ?? []) as unknown as DiaryRow[]).map((r) => ({
    id: r.id,
    image: (r.images ?? [])[0] ?? null,
    title: r.title ?? '',
    createdAt: r.created_at,
  }));

  const therapistName = (tRow.name as string) ?? '';
  const therapistImage = (tRow.profile_image_url as string | null) ?? null;
  const salonName = (salonRow?.name as string) ?? '';

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* パンくず：トップ › サロン名 › セラピスト名 › 写メ日記 */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>トップ</Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${tRow.salon_id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle" style={{ color: '#ec4899' }}>{salonName || 'サロン'}</Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/therapist/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[30%] truncate align-middle" style={{ color: '#ec4899' }}>{therapistName || 'セラピスト'}</Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>写メ日記</span>
        </nav>

        <div className="mb-6 text-center">
          <h1 className="font-bold" style={{ fontSize: 'clamp(16px, 4vw, 24px)', color: theme.heading }}>{therapistName}</h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>写メ日記一覧</p>
        </div>

        {diaries.length === 0 ? (
          <p className="text-center text-sm py-10 rounded-2xl border border-dashed" style={{ color: theme.body, borderColor: theme.cardBorder }}>
            写メ日記はまだありません
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[3px] sm:gap-3">
            {diaries.map((d) => (
              <Link key={d.id} href={`/diary/${d.id}`} className="group bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-slate-100 relative">
                  {d.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.image} alt={d.title || therapistName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-300 to-rose-400 text-white font-bold text-2xl">
                      {therapistName.charAt(0)}
                    </div>
                  )}
                  {/* スマホのみ：画像内オーバーレイ（下部スクリム＋白文字）。sm以上は非表示。 */}
                  <div className="sm:hidden absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent">
                    <div className="flex items-start gap-1.5">
                      <DiaryTherapistAvatar src={therapistImage} name={therapistName} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-white/85" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>{formatDiaryDate(d.createdAt)}</p>
                        {d.title && (
                          <h2 className="text-[11px] font-bold text-white line-clamp-2 mt-0.5 break-all" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                            {d.title}
                          </h2>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* sm以上：従来どおり画像下にテキスト（スクリムなし）。スマホでは非表示。 */}
                <div className="p-2.5 hidden sm:block">
                  <div className="flex items-start gap-2">
                    <DiaryTherapistAvatar src={therapistImage} name={therapistName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p style={{ fontSize: '11px', color: '#999' }}>{formatDiaryDate(d.createdAt)}</p>
                      {d.title && (
                        <h2
                          className="text-sm font-bold line-clamp-2 mt-0.5 break-all"
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
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
