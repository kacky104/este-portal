import { Suspense } from 'react';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createServiceClient } from '@/app/lib/supabase/service';
import {
  ReviewModeration,
  type PendingReviewView,
  type ApprovedReviewView,
} from './ReviewModeration';
import { ApprovedReviewsPaginated } from './ApprovedReviewsPaginated';
import { ModerationTabs } from './ModerationTabs';
import { ModerationDocuments } from './ModerationDocuments';

// 口コミ審査画面（管理者専用）。layout.tsx のサーバーガードと合わせた二層防御。
// 未承認（status='pending'）は RLS 上 admin 本人でも見えないため、取得は service_role で行う。
// pending 行の user_id → profiles.nickname、therapist_id → therapists.name を
// それぞれ別クエリで引いて JS 側でマッピングする（FK 埋め込みは使わない）。
export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const svc = createServiceClient();

  const { data: rows } = await svc
    .from('therapist_reviews')
    .select('id, therapist_id, user_id, rating_service, rating_technique, rating_reception, visited_on, body, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  const pending = rows ?? [];

  // 承認済み（公開中）も取得（誤承認の削除導線用）。
  // 承認済みは削除されない限り増え続けるため、サーバー取得は直近200件に限定する（2026-07-12）。
  // それより古い口コミの削除が必要になったら DB 直接操作 or 検索機能の追加で対応。
  const { data: approvedRows } = await svc
    .from('therapist_reviews')
    .select('id, therapist_id, user_id, rating_service, rating_technique, rating_reception, visited_on, body, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(200);
  const approved = approvedRows ?? [];

  // nickname / therapist 名は pending・approved 両方の id をまとめて1回ずつ引く（クエリ回数は増やさない）。
  const allRows = [...pending, ...approved];

  // 投稿者 nickname を別クエリで解決（無ければ「ゲスト」）。
  const userIds = [...new Set(allRows.map((r) => r.user_id as string))];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await svc.from('profiles').select('id, nickname').in('id', userIds);
    (profiles ?? []).forEach((p) => {
      const nn = (p.nickname as string | null)?.trim();
      if (nn) nameMap.set(p.id as string, nn);
    });
  }

  // 対象セラピスト名・所属サロンを別クエリで解決（therapists は1回で名前＋salon_idを取得）。
  const therapistIds = [...new Set(allRows.map((r) => r.therapist_id as number))];
  const therapistMap = new Map<number, string>();
  const therapistSalonMap = new Map<number, number>(); // therapist_id → salon_id
  if (therapistIds.length > 0) {
    const { data: ths } = await svc.from('therapists').select('id, name, salon_id').in('id', therapistIds);
    (ths ?? []).forEach((t) => {
      therapistMap.set(t.id as number, (t.name as string) ?? '');
      const sid = t.salon_id as number | null;
      if (sid != null) therapistSalonMap.set(t.id as number, sid);
    });
  }

  // 対象サロン名を別クエリで解決（salon_id 群をまとめて1回引く）。
  const salonIds = [...new Set([...therapistSalonMap.values()])];
  const salonNameMap = new Map<number, string>();
  if (salonIds.length > 0) {
    const { data: salons } = await svc.from('salons').select('id, name').in('id', salonIds);
    (salons ?? []).forEach((s) => salonNameMap.set(s.id as number, (s.name as string) ?? ''));
  }

  // pending / approved を共通の表示用形（PendingReviewView と同形）に変換。
  // 総合（overall）は保存せず3軸から計算（小数1位）。
  const toView = (r: (typeof allRows)[number]): PendingReviewView => {
    const s = Number(r.rating_service);
    const t = Number(r.rating_technique);
    const rc = Number(r.rating_reception);
    return {
      reviewId: String(r.id),
      ratingService: s,
      ratingTechnique: t,
      ratingReception: rc,
      overall: Math.round(((s + t + rc) / 3) * 10) / 10,
      visitedOn: String(r.visited_on),
      body: (r.body as string) ?? '',
      nickname: nameMap.get(r.user_id as string) ?? 'ゲスト',
      therapistName: therapistMap.get(r.therapist_id as number) ?? `セラピスト#${r.therapist_id}`,
      salonName: salonNameMap.get(therapistSalonMap.get(r.therapist_id as number) ?? -1) ?? '',
      createdAt: String(r.created_at),
    };
  };

  const views: PendingReviewView[] = pending.map(toView);
  const approvedViews: ApprovedReviewView[] = approved.map(toView);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-3xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-4">
            <Link href="/" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors">
              サイトを見る
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* タブ（口コミ審査／書類）。書類は /admin と同じ書類置き場（RLS: 管理者＋審査スタッフ） */}
        <ModerationTabs
          documents={<ModerationDocuments />}
          reviewsPending={
            <>
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
            </>
          }
          reviewsApproved={
            <>
              {/* ─── 承認済み（公開中）一覧：誤承認を削除する導線 ─── */}
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-orange-400 to-pink-600" />
                <h2 className="text-xl font-bold text-slate-900">承認済みの口コミ</h2>
              </div>
              <p className="text-sm text-slate-500 mb-6">
                公開中 {approvedViews.length} 件。削除すると公開ページから消えます（元に戻せません）。
              </p>

              {approvedViews.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">
                  公開中の口コミはありません。
                </div>
              ) : (
                // 承認済みは溜まり続けるため 50件ずつページング（URL同期）。useSearchParams のため Suspense でラップ。
                <Suspense fallback={null}>
                  <ApprovedReviewsPaginated reviews={approvedViews} pageSize={50} />
                </Suspense>
              )}
            </>
          }
        />
      </main>
    </div>
  );
}
