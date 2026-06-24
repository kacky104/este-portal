import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ReviewModeration, type PendingReviewView } from './ReviewModeration';

// 口コミ審査画面（管理者専用）。layout.tsx のサーバーガードと合わせた二層防御。
// 未承認（status='pending'）は RLS 上 admin 本人でも見えないため、取得は service_role で行う。
// pending 行の user_id → profiles.nickname、therapist_id → therapists.name を
// それぞれ別クエリで引いて JS 側でマッピングする（FK 埋め込みは使わない）。
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const svc = createServiceClient();

  const { data: rows } = await svc
    .from('therapist_reviews')
    .select('id, therapist_id, user_id, rating, body, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const pending = rows ?? [];

  // 投稿者 nickname を別クエリで解決（無ければ「ゲスト」）。
  const userIds = [...new Set(pending.map((r) => r.user_id as string))];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await svc.from('profiles').select('id, nickname').in('id', userIds);
    (profiles ?? []).forEach((p) => {
      const nn = (p.nickname as string | null)?.trim();
      if (nn) nameMap.set(p.id as string, nn);
    });
  }

  // 対象セラピスト名を別クエリで解決。
  const therapistIds = [...new Set(pending.map((r) => r.therapist_id as number))];
  const therapistMap = new Map<number, string>();
  if (therapistIds.length > 0) {
    const { data: ths } = await svc.from('therapists').select('id, name').in('id', therapistIds);
    (ths ?? []).forEach((t) => therapistMap.set(t.id as number, (t.name as string) ?? ''));
  }

  const views: PendingReviewView[] = pending.map((r) => ({
    reviewId: String(r.id),
    rating: Number(r.rating),
    body: (r.body as string) ?? '',
    nickname: nameMap.get(r.user_id as string) ?? 'ゲスト',
    therapistName: therapistMap.get(r.therapist_id as number) ?? `セラピスト#${r.therapist_id}`,
    createdAt: String(r.created_at),
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <Link href="/admin" className="text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors">
            管理トップ
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
          <h1 className="text-xl font-bold text-slate-900">口コミ審査</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          未承認の口コミ {views.length} 件。承認すると公開ページに表示されます。
        </p>

        {views.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">
            審査待ちの口コミはありません。
          </div>
        ) : (
          <div className="space-y-4">
            {views.map((v) => (
              <ReviewModeration key={v.reviewId} {...v} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
