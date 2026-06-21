import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';

export const metadata = {
  title: '写メ日記 | 福岡メンズエステポータル',
  description: '福岡のメンズエステサロンに在籍するセラピストたちの写メ日記一覧です。',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

type DiaryRow = {
  id: number; images: string[] | null; title: string | null; content: string | null; created_at: string;
  therapists: { name: string | null } | { name: string | null }[] | null;
  salons: { name: string | null } | { name: string | null }[] | null;
};

export default async function DiaryListPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('diary_posts')
    .select('id, images, title, content, created_at, therapists(name), salons(name)')
    .order('created_at', { ascending: false })
    .limit(60);

  const diaries = ((data ?? []) as unknown as DiaryRow[]).map((r) => {
    const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
    const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
    return {
      id: r.id,
      image: (r.images ?? [])[0] ?? null,
      title: r.title ?? '',
      content: r.content ?? '',
      createdAt: r.created_at,
      therapistName: t?.name ?? '',
      salonName: s?.name ?? '',
    };
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
          <SavedSalonsMenu />
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
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {diaries.map((diary) => (
              <Link key={diary.id} href={`/diary/${diary.id}`} className="group bg-white rounded-2xl border border-pink-50 shadow-sm hover:border-pink-200 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden flex flex-col">
                {/* 画像 */}
                <div className="h-40 bg-slate-100 relative">
                  {diary.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={diary.image} alt={diary.therapistName} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-pink-300 to-rose-400 text-white font-bold text-2xl">
                      {diary.therapistName.charAt(0)}
                    </div>
                  )}
                  {diary.salonName && (
                    <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/90 text-pink-600">
                      {diary.salonName}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-900">{diary.therapistName}</span>
                    <span className="text-[10px] text-slate-400">{formatDate(diary.createdAt)} 更新</span>
                  </div>
                  {diary.title && <h2 className="font-bold text-sm text-slate-800 line-clamp-1">{diary.title}</h2>}
                  {diary.content && <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3 flex-1">{diary.content}</p>}
                  <span className="text-[10px] text-pink-500 font-semibold group-hover:underline mt-1">続きを読む →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 福岡メンズエステポータル. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
