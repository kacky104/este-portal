import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { EMBED_SITE_URL, EmbedFooter } from '../embedShared';

// 写メ日記の埋め込みの中身（第1897便で page.tsx から切り出し）。
//   ・/embed/salon/[id]/diary            … 外部サイト向け（今までどおり12件）
//   ・/embed/salon/[id]/diary/n/[count]  … 公式HP（フクエスサイト）向け。管理画面「表示ブロック」の件数（1〜12）で出す
//   ★ 件数を URL の段にしたのは、?count= にすると ISR が効かず毎回動的になるため（Vercel の費用）。

const COLS = 3;
const ROWS = 4;
export const MAX_ITEMS = COLS * ROWS; // 12

type Row = {
  id: number | string;
  images: string[] | null;
  title: string | null;
  therapists: { name: string | null } | { name: string | null }[] | null;
};

export async function DiaryEmbed({ id, max }: { id: string; max: number }) {
  const salonId = Number(id);
  if (!Number.isFinite(salonId)) notFound();

  const supabase = createPublicClient();

  // 非表示店舗は埋め込みも出さない。
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, is_hidden')
    .eq('id', salonId)
    .maybeSingle();
  if (!salon || salon.is_hidden) notFound();

  // therapists!inner + is_active=true で退店セラピストの日記を除外（上のコメント参照）。
  const { data } = await supabase
    .from('diary_posts')
    .select('id, images, title, therapists!inner(name, is_active)')
    .eq('salon_id', salonId)
    .eq('therapists.is_active', true)
    .order('created_at', { ascending: false })
    .limit(max * 3); // 画像なし日記を間引いても埋まるよう多めに取得する

  const entries = ((data ?? []) as Row[])
    .map((r) => {
      const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
      return {
        id: String(r.id),
        image: (r.images ?? [])[0] ?? null,
        title: r.title ?? '',
        therapistName: t?.name ?? '',
      };
    })
    .filter((e) => e.image)
    .slice(0, max);

  return (
    <div className="bg-white p-4 font-sans">
      <p className="text-[13px] font-bold text-slate-700 mb-3">写メ日記一覧</p>

      {entries.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-400">写メ日記はまだありません</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {entries.map((e) => (
            <a
              key={e.id}
              href={`${EMBED_SITE_URL}/diary/${e.id}?from=salon`}
              target="_blank"
              rel="noopener noreferrer"
              className="block relative aspect-square overflow-hidden rounded-lg bg-slate-100"
              title={e.title || `${e.therapistName}の写メ日記`}
            >
              {/* iframe 埋め込みの軽量ページのため next/image は使わず素の img（外部サイト側の表示を最優先）。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.image!}
                alt={e.title || `${e.therapistName}の写メ日記`}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </a>
          ))}
        </div>
      )}

      <EmbedFooter
        moreHref={`${EMBED_SITE_URL}/salon/${salonId}/diary`}
        moreLabel="写メ日記をもっと見る"
      />
    </div>
  );
}
