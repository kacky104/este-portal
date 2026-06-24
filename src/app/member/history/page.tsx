import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import Image from 'next/image';
import { areaLabel } from '@/app/lib/areaLabel';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';

// 会員個別の内容（ログイン必須）のため ISR はかけず動的のままにする。
export const dynamic = 'force-dynamic';

type SalonView = { id: number; name: string; area: string; imageUrl: string | null };
type TherapistView = { id: number; name: string; imageUrl: string | null };

export default async function HistoryPage() {
  const supabase = await createClient();

  // ── ログインガード（サーバー側） ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member/history');

  // ── 本人の閲覧履歴を「最近見た順」で取得（RLS が効いた認証済みクライアントで）。 ──
  const { data: historyRows } = await supabase
    .from('view_history')
    .select('item_type, item_id, viewed_at')
    .order('viewed_at', { ascending: false });

  const rows = (historyRows ?? []) as { item_type: string; item_id: number | string }[];
  const salonIds = rows.filter(r => r.item_type === 'salon').map(r => Number(r.item_id));
  const therapistIds = rows.filter(r => r.item_type === 'therapist').map(r => Number(r.item_id));

  // ── 表示用情報を並列取得（サロン本体＋画像、セラピスト本体）。互いに独立なので Promise.all。 ──
  const [salonRes, salonImgRes, therapistRes] = await Promise.all([
    salonIds.length
      ? supabase.from('salons').select('id, name, area').in('id', salonIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    salonIds.length
      ? supabase
          .from('salon_images')
          .select('salon_id, image_url, display_order')
          .in('salon_id', salonIds)
          .order('display_order', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    therapistIds.length
      ? supabase.from('therapists').select('id, name, profile_image_url').in('id', therapistIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const salonById = new Map<number, { name: string; area: string }>();
  for (const s of (salonRes.data ?? []) as Record<string, unknown>[]) {
    salonById.set(Number(s.id), { name: (s.name as string) ?? '', area: (s.area as string) ?? '' });
  }
  const salonImageById = new Map<number, string>();
  for (const img of (salonImgRes.data ?? []) as Record<string, unknown>[]) {
    const sid = Number(img.salon_id);
    if (!salonImageById.has(sid) && img.image_url) salonImageById.set(sid, img.image_url as string);
  }
  const therapistById = new Map<number, { name: string; imageUrl: string | null }>();
  for (const t of (therapistRes.data ?? []) as Record<string, unknown>[]) {
    therapistById.set(Number(t.id), {
      name: (t.name as string) ?? '',
      imageUrl: (t.profile_image_url as string | null) ?? null,
    });
  }

  // 閲覧順（最近見た順）を保ったまま、取得できたものだけ表示（削除済みはスキップ）。
  const salons: SalonView[] = salonIds
    .map(id => {
      const s = salonById.get(id);
      return s ? { id, name: s.name, area: s.area, imageUrl: salonImageById.get(id) ?? null } : null;
    })
    .filter((s): s is SalonView => s !== null);

  const therapists: TherapistView[] = therapistIds
    .map(id => {
      const t = therapistById.get(id);
      return t ? { id, name: t.name, imageUrl: t.imageUrl } : null;
    })
    .filter((t): t is TherapistView => t !== null);

  const isEmpty = salons.length === 0 && therapists.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header（共通ヘッダーを流用） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">

        {/* パンくず */}
        <nav className="flex items-center gap-1.5 text-[13px] text-slate-400 mb-6" aria-label="パンくずリスト">
          <Link href="/member" className="hover:text-pink-600 transition-colors">マイページ</Link>
          <span className="text-slate-300">›</span>
          <span className="text-slate-600 font-medium">閲覧履歴</span>
        </nav>

        {/* 見出し */}
        <h1
          className="text-2xl font-bold leading-tight inline-block mb-8"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
        >
          閲覧履歴
        </h1>

        {isEmpty ? (
          <p className="text-sm text-slate-400 py-16 text-center border border-dashed border-slate-200 rounded-2xl bg-white/40">
            まだ閲覧履歴がありません
          </p>
        ) : (
          <>
            {/* ─── 閲覧したサロン ─── */}
            {salons.length > 0 && (
              <section className="mb-10">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
                  <span className="w-1 h-5 rounded-full" style={{ background: '#EC4899' }} />
                  閲覧したサロン
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {salons.map(salon => (
                    <Link
                      key={salon.id}
                      href={`/salon/${salon.id}`}
                      className="group rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden hover:border-pink-200 hover:shadow-md transition-all"
                    >
                      <div className="relative w-full h-24 bg-gradient-to-br from-pink-100 to-rose-200">
                        {salon.imageUrl && (
                          <Image src={salon.imageUrl} alt={salon.name} fill className="object-cover" sizes="(max-width:640px) 50vw, 200px" />
                        )}
                      </div>
                      <div className="p-2.5">
                        <p className="text-sm font-bold text-slate-700 line-clamp-1 group-hover:text-pink-600 transition-colors">{salon.name}</p>
                        {salon.area && <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{areaLabel(salon.area)}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ─── 閲覧したセラピスト ─── */}
            {therapists.length > 0 && (
              <section className="mb-10">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
                  <span className="w-1 h-5 rounded-full" style={{ background: '#A855F7' }} />
                  閲覧したセラピスト
                </h2>
                <div className="flex flex-wrap gap-4 sm:gap-5">
                  {therapists.map(t => (
                    <Link key={t.id} href={`/therapist/${t.id}`} className="group w-20 text-center">
                      <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-purple-100 to-fuchsia-200 ring-2 ring-white shadow-sm group-hover:ring-purple-200 transition-all">
                        {t.imageUrl ? (
                          <Image src={t.imageUrl} alt={t.name} fill className="object-cover" sizes="80px" />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-white/60">
                            {t.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-slate-600 line-clamp-1 mt-1.5 group-hover:text-purple-600 transition-colors">{t.name}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
