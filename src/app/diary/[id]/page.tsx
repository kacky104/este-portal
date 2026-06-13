import Link from "next/link";
import { notFound } from "next/navigation";
import { DIARIES } from "@/data/diaries";

const GRADIENTS = [
  'from-pink-300 to-rose-400',
  'from-fuchsia-300 to-pink-400',
  'from-rose-300 to-pink-500',
  'from-pink-400 to-fuchsia-400',
];

export async function generateStaticParams() {
  return DIARIES.map((d) => ({ id: d.id }));
}

export default async function DiaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const diary = DIARIES.find((d) => d.id === id);
  if (!diary) notFound();

  const index = DIARIES.findIndex((d) => d.id === id);
  const grad = GRADIENTS[index % GRADIENTS.length];

  // 同じセラピストの他の日記
  const related = DIARIES.filter((d) => d.therapistId === diary.therapistId && d.id !== diary.id);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
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

        {/* Back */}
        <Link href="/diary" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-pink-600 transition-colors mb-6">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          写メ日記一覧へ戻る
        </Link>

        {/* Card */}
        <article className="bg-white rounded-3xl border border-pink-100/60 shadow-sm overflow-hidden mb-6">

          {/* Avatar banner */}
          <div className={`h-40 bg-gradient-to-br ${grad} flex items-center justify-center relative`}>
            <div className="w-20 h-20 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-3xl">
              {diary.therapistName.charAt(0)}
            </div>
          </div>

          {/* Meta */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-base text-slate-900">{diary.therapistName}</p>
              <p className="text-xs text-pink-500 font-medium mt-0.5">{diary.salonName}</p>
            </div>
            <div className="text-right text-xs text-slate-400">
              <p>{diary.date}</p>
              <p>{diary.time}</p>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-5">
            <h1 className="text-lg font-black text-slate-900 mb-4">{diary.title}</h1>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{diary.content}</p>
          </div>
        </article>

        {/* Salon link */}
        <Link
          href={`/salon/${diary.salonId}`}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md mb-8"
        >
          {diary.salonName} のサロンページを見る →
        </Link>

        {/* Related diaries */}
        {related.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-slate-500 mb-3">{diary.therapistName} の他の日記</h2>
            <div className="space-y-3">
              {related.map((d, i) => (
                <Link key={d.id} href={`/diary/${d.id}`} className="flex items-start gap-3 bg-white rounded-2xl border border-pink-50 p-4 hover:border-pink-200 transition-colors">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]} flex items-center justify-center text-white font-bold text-base flex-shrink-0`}>
                    {d.therapistName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800 line-clamp-1">{d.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{d.date} {d.time}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
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
