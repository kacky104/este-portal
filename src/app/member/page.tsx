import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { PawGlyph, SakuraGlyph } from '@/app/components/SaveButton';

// 会員個別の内容（ログイン必須・保存状況に依存）のため ISR はかけず動的のままにする。
// cookie を読む createClient() の時点で動的になるが、意図を明示しておく。
export const dynamic = 'force-dynamic';

// 表示用の軽量型（このページで使う列だけ）。
type SalonPreview = { id: number; name: string; area: string; imageUrl: string | null };
type TherapistPreview = { id: number; name: string; imageUrl: string | null };

const RECENT_LIMIT = 4; // 最近保存プレビューの表示件数

export default async function MemberPage() {
  const supabase = await createClient();

  // ── ログインガード（サーバー側） ──
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirectTo=/member');

  // ── 保存アイテムを一括取得（新しい順）。実体は既存の saved_items（saveStore と同一スキーマ）。 ──
  const { data: savedRows } = await supabase
    .from('saved_items')
    .select('item_type, item_id, created_at')
    .order('created_at', { ascending: false });

  const rows = (savedRows ?? []) as { item_type: string; item_id: number | string }[];
  const salonIds = rows.filter(r => r.item_type === 'salon').map(r => Number(r.item_id));
  const therapistIds = rows.filter(r => r.item_type === 'therapist').map(r => Number(r.item_id));

  const salonCount = salonIds.length;
  const therapistCount = therapistIds.length;
  const recentSalonIds = salonIds.slice(0, RECENT_LIMIT);
  const recentTherapistIds = therapistIds.slice(0, RECENT_LIMIT);

  // ── 表示用情報を並列取得（互いに独立なので Promise.all でまとめる） ──
  const [salonRes, salonImgRes, therapistRes] = await Promise.all([
    recentSalonIds.length
      ? supabase.from('salons').select('id, name, area').in('id', recentSalonIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    recentSalonIds.length
      ? supabase
          .from('salon_images')
          .select('salon_id, image_url, display_order')
          .in('salon_id', recentSalonIds)
          .order('display_order', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    recentTherapistIds.length
      ? supabase.from('therapists').select('id, name, profile_image_url').in('id', recentTherapistIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // サロン本体（id→{name, area}）と先頭画像（display_order 昇順の最初）をマップ化。
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

  // 保存順（新しい順）を保ったまま、取得できたものだけ表示用に整形。
  const recentSalons: SalonPreview[] = recentSalonIds
    .map(id => {
      const s = salonById.get(id);
      return s ? { id, name: s.name, area: s.area, imageUrl: salonImageById.get(id) ?? null } : null;
    })
    .filter((s): s is SalonPreview => s !== null);

  const recentTherapists: TherapistPreview[] = recentTherapistIds
    .map(id => {
      const t = therapistById.get(id);
      return t ? { id, name: t.name, imageUrl: t.imageUrl } : null;
    })
    .filter((t): t is TherapistPreview => t !== null);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header（トップ／保存ページと同一の共通ヘッダーを流用） ─── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">

        {/* ─── 挨拶エリア ─── */}
        <section className="mb-8">
          <p className="text-[13px] text-slate-400">ようこそ</p>
          <h1
            className="text-2xl sm:text-3xl font-bold leading-tight inline-block"
            style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}
          >
            マイページ
          </h1>
          {user.email && (
            <p className="text-xs text-slate-400 mt-1.5 truncate">{user.email}</p>
          )}
        </section>

        {/* ─── 保存サマリー（2カード横並び） ─── */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4 mb-10">
          {/* サロン */}
          <Link
            href="/saved#salons"
            className="group flex flex-col justify-center gap-3 rounded-2xl border border-pink-100 bg-white p-4 sm:p-5 shadow-sm hover:border-pink-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-pink-50 flex items-center justify-center flex-shrink-0" style={{ color: '#EC4899' }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><PawGlyph /></svg>
              </span>
              <span className="text-xs sm:text-sm font-medium text-slate-500">保存サロン</span>
            </div>
            <div className="flex items-baseline justify-center gap-3">
              <p className="font-bold leading-none">
                <span className="text-4xl sm:text-5xl" style={{ color: '#DB2777' }}>{salonCount}</span>
                <span className="text-sm text-slate-400 ml-1">件</span>
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-pink-600 group-hover:gap-1.5 transition-all">
                見る <span aria-hidden>→</span>
              </span>
            </div>
          </Link>

          {/* セラピスト */}
          <Link
            href="/saved#therapists"
            className="group flex flex-col justify-center gap-3 rounded-2xl border border-purple-100 bg-white p-4 sm:p-5 shadow-sm hover:border-purple-300 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-purple-50 flex items-center justify-center flex-shrink-0" style={{ color: '#A855F7' }}>
                <svg width="16" height="16" viewBox="0 0 24 24"><SakuraGlyph /></svg>
              </span>
              <span className="text-xs sm:text-sm font-medium text-slate-500">保存セラピスト</span>
            </div>
            <div className="flex items-baseline justify-center gap-3">
              <p className="font-bold leading-none">
                <span className="text-4xl sm:text-5xl" style={{ color: '#9333EA' }}>{therapistCount}</span>
                <span className="text-sm text-slate-400 ml-1">人</span>
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-600 group-hover:gap-1.5 transition-all">
                見る <span aria-hidden>→</span>
              </span>
            </div>
          </Link>
        </section>

        {/* ─── 最近保存したサロン ─── */}
        {recentSalons.length > 0 && (
          <section className="mb-10">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
              <span className="w-1 h-5 rounded-full" style={{ background: '#EC4899' }} />
              最近保存したサロン
            </h2>
            <div
              className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
              style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
              {recentSalons.map(salon => (
                <Link
                  key={salon.id}
                  href={`/salon/${salon.id}`}
                  className="group flex-shrink-0 w-40 rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden hover:border-pink-200 hover:shadow-md transition-all"
                >
                  <div className="relative w-full h-24 bg-gradient-to-br from-pink-100 to-rose-200">
                    {salon.imageUrl && (
                      <Image src={salon.imageUrl} alt={salon.name} fill className="object-cover" sizes="160px" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-sm font-bold text-slate-700 line-clamp-1 group-hover:text-pink-600 transition-colors">{salon.name}</p>
                    {salon.area && <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{salon.area}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ─── 最近保存したセラピスト ─── */}
        {recentTherapists.length > 0 && (
          <section className="mb-10">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
              <span className="w-1 h-5 rounded-full" style={{ background: '#A855F7' }} />
              最近保存したセラピスト
            </h2>
            <div
              className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
              style={{ scrollbarWidth: 'none' } as React.CSSProperties}
            >
              {recentTherapists.map(t => (
                <Link
                  key={t.id}
                  href={`/therapist/${t.id}`}
                  className="group flex-shrink-0 w-20 text-center"
                >
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

        {/* ─── これからの機能（準備中プレースホルダー） ─── */}
        <section className="mb-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-700 mb-4">
            <span className="w-1 h-5 rounded-full bg-slate-300" />
            これからの機能
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { title: 'プロフィール編集', desc: 'ニックネーム・アイコンを設定' },
              { title: '閲覧履歴', desc: '最近見たサロン・セラピスト' },
              { title: '通知・新着フォロー', desc: '保存サロンの新着・出勤を通知' },
            ].map(f => (
              <div
                key={f.title}
                aria-disabled="true"
                className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4 opacity-70 cursor-not-allowed select-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-slate-500">{f.title}</p>
                  <span className="flex-shrink-0 text-[10px] font-bold text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">準備中</span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>
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
