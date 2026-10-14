import Image from 'next/image';
import Link from 'next/link';

// ★ 第1458便（2026-10-14・カッキーさん）: 店舗詳細ページの「フクエスポイント加盟店」のバッジ（サンプル C）。
//   ・置き場所はトップスライダーと店名の間・まん中ぞろえ。両端が切り込んだ青いリボン・白い文字・左にコイン。
//   ・押すと /points（ポイントの説明と加盟店一覧）。サーバーで描く（onClick なし）。
export function PointShopBadgeCenter() {
  return (
    <div className="mb-2 text-center">
      <Link
        href="/points"
        className="inline-flex h-[26px] items-center gap-1.5 px-[26px] text-[13px] font-bold tracking-wide text-white whitespace-nowrap hover:opacity-90"
        style={{ background: '#2563EB', clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%, 12px 50%)' }}
        aria-label="フクエスポイント加盟店（くわしく）"
      >
        <Image src="/points/coin.png" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
        フクエスポイント加盟店
      </Link>
    </div>
  );
}
