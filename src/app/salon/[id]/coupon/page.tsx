import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { getCouponColor } from "@/app/lib/couponColors";

// 有効期限の表示整形（"2026-07-31" → "2026年7月31日"）。
function formatValidUntil(d: string): string {
  const dt = new Date(`${d}T00:00:00+09:00`);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(dt);
}

export default async function SalonCouponPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme')
    .eq('id', Number(id))
    .single();

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  const { data: wallpaperRow } = await supabase
    .from('theme_wallpapers')
    .select('image_url')
    .eq('theme_key', theme.key)
    .maybeSingle();
  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

  // 個別サロンページと同じ背景レイヤー（壁紙＋テーマ色オーバーレイ、モバイル対応の固定配置）
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

  const salonName = (salonRow.name as string) ?? '';

  // 公開クーポンを sort_order 昇順で取得（RLS でも is_published=true のみ）
  const { data: rows } = await supabase
    .from('coupons')
    .select('id, title, discount, conditions, valid_until, sort_order, color')
    .eq('salon_id', Number(id))
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  // 今日（JST）の日付文字列。valid_until が過去のものは非表示（NULL は常に表示）。
  const todayJST = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());

  const coupons = (rows ?? [])
    .map(r => ({
      id:         String(r.id),
      title:      (r.title as string) ?? '',
      discount:   (r.discount as string) ?? '',
      conditions: (r.conditions as string | null) ?? '',
      validUntil: (r.valid_until as string | null) ?? null,
      color:      (r.color as string | null) ?? null,
    }))
    .filter(c => c.validUntil == null || c.validUntil >= todayJST);

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ color: theme.text }}>

      {/* 背景レイヤー（個別サロンページと同じテーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › クーポン ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || 'サロン'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>クーポン</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>クーポン</p>
        </div>

        {/* クーポン一覧（縦型クーポン券） */}
        {coupons.length === 0 ? (
          <div className="text-center py-12 text-sm rounded-2xl border" style={{ color: theme.body, backgroundColor: theme.card, borderColor: theme.cardBorder }}>
            現在ご利用いただけるクーポンはありません
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl mx-auto">
            {coupons.map(c => {
              // 券の背景色プリセット（未設定/不明値は pink デフォルトにフォールバック）
              const cc = getCouponColor(c.color);
              return (
              <div
                key={c.id}
                className="rounded-2xl border-2 shadow-sm p-5 flex flex-col"
                style={{ background: cc.background, color: cc.text, borderColor: cc.border ?? 'transparent' }}
              >
                {/* 上部タグ「クーポン」（文字色を薄めて使う） */}
                <div className="flex items-center gap-1.5 mb-3" style={{ opacity: 0.85 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d="M15 5l0 2" />
                    <path d="M15 11l0 2" />
                    <path d="M15 17l0 2" />
                    <path d="M5 5h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-3a2 2 0 0 0 0 -4v-3a2 2 0 0 1 2 -2" />
                  </svg>
                  <span className="text-xs font-bold tracking-wide">クーポン</span>
                </div>

                {/* 割引内容（大きく強調・券の文字色） */}
                <p className="text-2xl font-extrabold leading-tight break-words mb-1">{c.discount}</p>

                {/* タイトル */}
                <p className="text-base font-bold break-words">{c.title}</p>

                {/* 破線の区切り（文字色を薄めて使う） */}
                <div className="my-3 border-t border-dashed" style={{ borderColor: 'currentColor', opacity: 0.3 }} />

                {/* 条件（あれば） */}
                {c.conditions && (
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{c.conditions}</p>
                )}

                {/* 有効期限（あれば。文字色を薄めて使う） */}
                {c.validUntil && (
                  <p className="text-xs mt-2" style={{ opacity: 0.8 }}>有効期限：{formatValidUntil(c.validUntil)}まで</p>
                )}
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
