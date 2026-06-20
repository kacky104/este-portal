import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";

export default async function SalonPricePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // データ源は salons.courses(JSON)。既存「コースメニュー・料金表」ブロックと同じ読み方・フィールド対応。
  const { data: salonRow, error } = await supabase
    .from('salons')
    .select('id, name, theme, courses')
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

  // 既存ブロックと同一の JSON 読み方（name / duration / price。description は任意）。
  const courses = ((salonRow.courses as { name: string; duration: string; price: string; description?: string }[] | null) ?? []).map(c => ({
    name:        c.name ?? '',
    duration:    c.duration ?? '',
    price:       c.price ?? '',
    description: c.description ?? '',
  }));

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
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              福岡メンズエステポータル
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 料金 ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>
            {salonName || 'サロン'}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>料金</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: 'clamp(16px, 4vw, 24px)', textOverflow: 'ellipsis', color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>コースメニュー・料金表</p>
        </div>

        {/* コース・料金表 */}
        <section className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
            <h2 className="font-bold" style={{ color: theme.heading }}>コースメニュー・料金表</h2>
          </div>

          {courses.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: theme.body }}>準備中</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b" style={{ borderColor: theme.cardBorder }}>
                    <th className="text-left font-bold py-2 pr-3 whitespace-nowrap" style={{ color: theme.heading }}>コース名</th>
                    <th className="text-left font-bold py-2 px-3 whitespace-nowrap" style={{ color: theme.heading }}>時間</th>
                    <th className="text-right font-bold py-2 px-3 whitespace-nowrap" style={{ color: theme.heading }}>料金</th>
                    <th className="text-left font-bold py-2 pl-3" style={{ color: theme.heading }}>説明</th>
                  </tr>
                </thead>
                <tbody>
                  {courses.map((c, i) => (
                    <tr key={i} className="border-b last:border-0 align-top" style={{ borderColor: theme.cardBorder }}>
                      <td className="py-2.5 pr-3 font-bold break-words" style={{ color: theme.heading }}>{c.name}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap" style={{ color: theme.body }}>{c.duration}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-pink-600 whitespace-nowrap">{c.price}</td>
                      <td className="py-2.5 pl-3 leading-relaxed break-words whitespace-pre-wrap" style={{ color: theme.body }}>{c.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] mt-5 opacity-70" style={{ color: theme.body }}>※ 表示料金はすべて税込み価格です。</p>
        </section>
      </main>
    </div>
  );
}
