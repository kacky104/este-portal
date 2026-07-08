'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { TherapistPickupBanner as Banner } from '@/app/lib/therapistPickupBanners';

// トップ＋全エリアページのサロン一覧中（20枚目直下）に表示する「セラピストピックアップ枠」。
// - 横長バナー画像1枚のみ（タイトル・見出し・オーバーレイなし）。カルーセル機構は持たない。
// - 公開中の枠から「ページを開くたびにランダム1枚」を表示する。hydration mismatch を避けるため
//   抽選はクライアントの useEffect 内で行い、サーバー描画時は画像なし（プレースホルダ）にする。
// - レイアウトシフト防止のため外枠は常に描画し、抽選前は淡いプレースホルダを見せる。
// - リンク解決：link_url があればそれ、無ければ linkable な therapist_id から /therapist/{id}、
//   どちらも無ければ非リンク（画像のみ）。link_url は相対パス（/...）と https:// 絶対URLのみ許容。
// - 0件はブロックごと非表示。

// リンク先を解決する。相対（/で始まる）は内部リンク、https:// は外部リンク、それ以外は非リンク（null）。
function resolveLink(b: Banner): { href: string; external: boolean } | null {
  const raw = (b.linkUrl ?? '').trim();
  if (raw) {
    if (raw.startsWith('/')) return { href: raw, external: false };
    if (/^https?:\/\//i.test(raw)) return { href: raw, external: true };
    return null; // 想定外の形式は非リンク扱い
  }
  // フォールバック：公開中セラピストの詳細ページ。
  if (b.therapistId != null && b.linkable) return { href: `/therapist/${b.therapistId}`, external: false };
  return null;
}
export function TherapistPickupBanner({ banners }: { banners: Banner[] }) {
  // サーバー描画時は null（＝プレースホルダ）。マウント後にランダム1枚を選ぶ。
  const [picked, setPicked] = useState<Banner | null>(null);

  useEffect(() => {
    if (banners.length === 0) return;
    setPicked(banners[Math.floor(Math.random() * banners.length)]);
  }, [banners]);

  if (banners.length === 0) return null;

  // おすすめサロンバナーの1件時と同じサイズ感・直角（SPは h-52 固定、PCは aspect-[31/12]）。
  const frameClass = 'relative overflow-hidden shadow-lg h-52 sm:h-auto sm:aspect-[31/12] w-full';

  // 抽選前（サーバー描画・マウント直後）は淡いプレースホルダだけを見せる（レイアウトシフト防止）。
  if (!picked) {
    return <div className={`${frameClass} bg-pink-50`} />;
  }

  const img = (
    <Image
      src={picked.imageUrl}
      alt={picked.altText}
      fill
      className="object-cover"
      sizes="(max-width: 640px) 100vw, 1024px"
    />
  );

  const link = resolveLink(picked);
  if (link) {
    // 外部URL（https://）は新規タブの通常アンカー、内部（/...）は next/link。
    return link.external ? (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={frameClass}>
        {img}
      </a>
    ) : (
      <Link href={link.href} className={frameClass}>
        {img}
      </Link>
    );
  }
  // リンク先なし：非リンク（画像のみ）。
  return <div className={frameClass}>{img}</div>;
}
