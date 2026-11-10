import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { EMBED_SITE_URL, EmbedFooter } from '../embedShared';
import { createServiceClient } from '@/app/lib/supabase/service';
import { hpEkichikaShopUrl, hpEkichikaGirlUrl } from '@/app/lib/hpSite';

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

// ★ 第1902便: showMore=false で中の「写メ日記をもっと見る」を出さない（公式HP向け。HP側に「もっと見る」があり2つ並んでいたため）
// ★ 第1908便: ekSlot を渡すと、画像のリンク先を駅ちかにする（公式HPの「駅ちか対策・もっと見る」が ON の店）。
//   その方の駅ちかの写メ日記（お店ページ／番号／maildiary／）。番号が結びついていない方はお店の写メ日記一覧（maildiary／）。
//   駅ちかのお店ページが読めなければ、今までどおりフクエスへ
export async function DiaryEmbed({ id, max, showMore = true, ekSlot }: { id: string; max: number; showMore?: boolean; ekSlot?: number }) {
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
    .select('id, images, title, therapist_id, therapists!inner(name, is_active)')
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
        therapistId: String((r as { therapist_id?: unknown }).therapist_id ?? ''),
      };
    })
    .filter((e) => e.image)
    .slice(0, max);

  // ★ 第1908便: 駅ちかのリンク先（ekSlot があるときだけ読む）
  let ekShop: string | null = null;
  const ekGirl = new Map<string, string>();
  if (ekSlot && entries.length > 0) {
    try {
      const svc = createServiceClient();
      const { data: src } = await svc.from('salon_import_sources').select('shop_url').eq('salon_id', salonId).eq('provider', 'ekichika').eq('slot', ekSlot).maybeSingle();
      ekShop = hpEkichikaShopUrl(src?.shop_url);
      if (ekShop) {
        const { data: ids } = await svc.from('therapist_media_ids').select('therapist_id, external_cast_id')
          .eq('provider', 'ekichika').eq('slot', ekSlot).in('therapist_id', [...new Set(entries.map((e) => e.therapistId).filter(Boolean))]);
        for (const r of ids ?? []) { const u = hpEkichikaGirlUrl(ekShop, r.external_cast_id); if (u) ekGirl.set(String(r.therapist_id), u + 'maildiary/'); }
      }
    } catch { ekShop = null; }
  }
  const hrefOf = (e: { id: string; therapistId: string }) =>
    ekShop ? (ekGirl.get(e.therapistId) ?? ekShop + 'maildiary/') : `${EMBED_SITE_URL}/diary/${e.id}?from=salon`;

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
              href={hrefOf(e)}
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

      {showMore && (
        <EmbedFooter
          moreHref={`${EMBED_SITE_URL}/salon/${salonId}/diary`}
          moreLabel="写メ日記をもっと見る"
        />
      )}
    </div>
  );
}
