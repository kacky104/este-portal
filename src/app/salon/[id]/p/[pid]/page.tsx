import Link from "next/link";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import type { Metadata } from "next";

// フリーページ（オーナーが /mypage 店舗装飾で作成。タイトル＋本文＋画像）。1店舗最大3。
export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

async function fetchFreePage(id: string, pid: string) {
  const supabase = createPublicClient();
  const { data: page } = await supabase
    .from('salon_free_pages')
    .select('id, salon_id, title, body, images')
    .eq('id', Number(pid))
    .maybeSingle();
  if (!page || Number(page.salon_id) !== Number(id)) return null;
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, theme, is_hidden')
    .eq('id', Number(id))
    .maybeSingle();
  if (!salon || salon.is_hidden) return null;
  return { page, salon };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}): Promise<Metadata> {
  const { id, pid } = await params;
  const res = await fetchFreePage(id, pid);
  if (!res) return {};
  const title = (res.page.title as string) || 'ページ';
  const salonName = (res.salon.name as string) ?? '';
  const t = `${title}｜${salonName}｜福岡メンズエステ【フクエス】`;
  return {
    title: t,
    alternates: { canonical: `/salon/${id}/p/${pid}` },
    openGraph: { title: t, url: `/salon/${id}/p/${pid}`, siteName: 'フクエス', type: 'article' },
  };
}

export default async function SalonFreePage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id, pid } = await params;
  const res = await fetchFreePage(id, pid);
  if (!res) notFound();
  const { page, salon } = res;

  const theme = getTheme(salon.theme as string | null);
  const supabase = createPublicClient();
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

  const salonName = (salon.name as string) ?? '';
  const title = (page.title as string) || '';
  const body = (page.body as string) || '';
  const images = Array.isArray(page.images) ? (page.images as string[]) : [];

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* パンくず：トップ › サロン名 › ページ名 */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: '13px' }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: '#ec4899' }}>トップ</Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: '#ec4899' }}>{salonName || '店舗'}</Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: '#999' }}>›</span>
          <span aria-current="page" className="inline-block max-w-[45%] truncate align-middle" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>{title || 'ページ'}</span>
        </nav>

        <article className="rounded-2xl border shadow-sm p-6" style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}>
          {title && (
            <h1 className="text-xl sm:text-2xl font-bold mb-4 break-words" style={{ color: theme.heading }}>{title}</h1>
          )}
          {body && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words mb-4" style={{ color: theme.body }}>{body}</p>
          )}
          {images.length > 0 && (
            <div className="space-y-3">
              {images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="block w-full h-auto rounded-xl" />
              ))}
            </div>
          )}
          {!title && !body && images.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: theme.body }}>このページにはまだ内容がありません。</p>
          )}
        </article>

        <div className="mt-6 text-center">
          <Link href={`/salon/${id}`} className="inline-flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity" style={{ color: '#ec4899' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
            店舗ページへ戻る
          </Link>
        </div>
      </main>
    </div>
  );
}
