import { notFound } from 'next/navigation';
import { createPublicClient } from '@/app/lib/supabase/public';
import { EMBED_SITE_URL, EmbedFooter } from '../embedShared';
import type { Metadata } from 'next';

// 契約店舗の公式サイトに iframe で貼る「写メ日記」埋め込みウィジェット（2026-08-06 新設）。
//
// - 3列×6段＝最大18件のサムネイルグリッド。クリックでフクエスの日記詳細
//   （/diary/[id]?from=salon）を新しいタブで開く。
// - 埋め込み先のデザインがバラバラなため白基調ニュートラル（サイトのピンクはリンク程度）。
// - ヘッダー/フッターなどサイト共通UIは載せない軽量ページ。リンクは必ず絶対URL＋
//   target="_blank"（iframe 内で相対リンクを踏むと枠の中でフクエスが開いてしまうため）。
// - 画像なし日記（テキストのみ）はサムネイルにできないため除外（多めに取得して間引く）。
// - 退店セラピスト（is_active=false）の日記は出さない（店舗の公式サイトに載る前提のため。
//   本体の /salon/[id]/diary は退店分も出す仕様なので、あえて非対称にしている）。
// - 埋め込みタグの発行は mypage の店舗タブ（EmbedCodePanel）。
// - iframe 許可（frame-ancestors）は next.config.ts の headers() で /embed/ 配下のみ全ドメイン許可。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

// 検索結果に断片ページが出ないよう noindex（本体の /salon/[id]/diary が正規ページ）。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const COLS = 3;
const ROWS = 6;
const MAX_ITEMS = COLS * ROWS; // 18
// 画像なし日記を間引いても18件埋まるよう多めに取得する。
const FETCH_LIMIT = MAX_ITEMS * 3;

type Row = {
  id: number | string;
  images: string[] | null;
  title: string | null;
  therapists: { name: string | null } | { name: string | null }[] | null;
};

export default async function EmbedSalonDiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
    .limit(FETCH_LIMIT);

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
    .slice(0, MAX_ITEMS);

  return (
    <div className="bg-white p-4 font-sans">
      <p className="text-[13px] font-bold text-slate-700 mb-3">
        写メ日記
        <span className="ml-2 text-[11px] font-normal text-slate-400">タップでフクエスの日記が開きます</span>
      </p>

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
