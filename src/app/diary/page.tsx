import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createPublicClient } from '@/app/lib/supabase/public';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { formatDiaryDate } from '@/lib/diaryDate';
import { DiaryTherapistAvatar } from '@/components/DiaryTherapistAvatar';
import { DiaryNewBadge } from '@/components/DiaryNewBadge';
import { DiaryPagination } from '@/components/DiaryPagination';

const PAGE_SIZE = 32;

export const metadata = {
  title: '写メ日記 | フクエス ～福岡メンズエステポータル～',
  description: '福岡のメンズエステサロンに在籍するセラピストたちの写メ日記一覧です。',
  alternates: { canonical: '/diary' },
};

// ISR：1分ごとに再生成（新着日記の鮮度優先）。cookie を読まない createPublicClient を使うため動的化されない。
export const revalidate = 60;

type TherapistRef = { name: string | null; profile_image_url: string | null };
type DiaryRow = {
  id: number; images: string[] | null; title: string | null; created_at: string;
  therapists: TherapistRef | TherapistRef[] | null;
  salons: { name: string | null } | { name: string | null }[] | null;
};

export default async function DiaryListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const sp = await searchParams;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = createPublicClient();
  // range で1ページ32件取得＋count: 'exact' で総件数を同時取得（ページ数算出に使う）。
  const { data, count } = await supabase
    .from('diary_posts')
    // salons!inner＋is_hidden=false で、非表示サロンの投稿を公開一覧から除外する（多重防御）。
    .select('id, images, title, created_at, therapists(name, profile_image_url), salons!inner(name)', { count: 'exact' })
    .eq('salons.is_hidden', false)
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const diaries = ((data ?? []) as unknown as DiaryRow[]).map((r) => {
    const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
    const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
    return {
      id: r.id,
      image: (r.images ?? [])[0] ?? null,
      title: r.title ?? '',
      createdAt: r.created_at,
      therapistName: t?.name ?? '',
      therapistImage: t?.profile_image_url ?? null,
      salonName: s?.name ?? '',
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          トップへ戻る
        </Link>

        {/* Heading */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📸</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">写メ日記</h1>
          </div>
          <p className="text-sm text-slate-500">セラピストたちの日常やお知らせをチェックしよう</p>
        </div>

        {/* Diary grid */}
        {diaries.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm border border-dashed border-pink-100 rounded-3xl bg-pink-50/10">
            日記はまだありません ✿
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[3px] sm:gap-3">
            {diaries.map((diary) => (
              <Link key={diary.id} href={`/diary/${diary.id}`} className="group bg-white border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="aspect-square bg-slate-100 relative">
                  {diary.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={diary.image} alt={diary.title || diary.therapistName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-300 to-rose-400 text-white font-bold text-2xl">
                      {diary.therapistName.charAt(0)}
                    </div>
                  )}
                  {/* 店名バッジ（ピンク文字・白背景）。全店舗一覧なので所属店を出す。 */}
                  {diary.salonName && (
                    <span className="absolute top-1.5 left-1.5 z-10 max-w-[calc(100%-12px)] truncate text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-pink-600 shadow-sm">
                      {diary.salonName}
                    </span>
                  )}
                  {/* スマホのみ：画像内オーバーレイ（下部スクリム＋白文字）。sm以上は非表示。 */}
                  <div className="sm:hidden absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent">
                    <div className="flex items-start gap-1.5">
                      <DiaryTherapistAvatar src={diary.therapistImage} name={diary.therapistName} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-baseline gap-1 min-w-0" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                          <span className="text-[10px] font-bold text-white truncate">{diary.therapistName}</span>
                          <span className="flex-shrink-0 text-[10px] text-white/85">{formatDiaryDate(diary.createdAt)}</span>
                          <DiaryNewBadge iso={diary.createdAt} />
                        </p>
                        {diary.title && (
                          <h2 className="text-[11px] font-bold text-white line-clamp-2 mt-0.5 break-all" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
                            {diary.title}
                          </h2>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {/* sm以上：画像下にテキスト（スクリムなし）。スマホでは非表示。 */}
                <div className="p-2.5 hidden sm:block">
                  <div className="flex items-start gap-2">
                    <DiaryTherapistAvatar src={diary.therapistImage} name={diary.therapistName} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-baseline gap-1.5 min-w-0">
                        <span className="text-[11px] text-pink-600 font-bold truncate">{diary.therapistName}</span>
                        <span className="flex-shrink-0" style={{ fontSize: '11px', color: '#999' }}>{formatDiaryDate(diary.createdAt)}</span>
                        <DiaryNewBadge iso={diary.createdAt} />
                      </p>
                      {diary.title && (
                        <h2 className="text-sm font-bold line-clamp-2 mt-0.5 break-all" style={{ background: 'linear-gradient(to right, #ec4899, #f97316)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>
                          {diary.title}
                        </h2>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <DiaryPagination basePath="/diary" page={page} totalPages={totalPages} />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
