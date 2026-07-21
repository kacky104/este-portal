'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { AdBanner as Banner } from '@/app/lib/adBanners';

// 各ページに差し込む「細い広告バナー」枠。
// - 公開中（is_active=true）の枠から、ページを開くたびにクライアント側でランダム1枚を表示する。
//   抽選は useEffect 内（マウント後）に行い、初期描画は banners[0] で server/client 一致させる
//   （hydration mismatch 回避）。ページ遷移＝再マウントのたびに別の1枚に入れ替わる。
// - スマホで高さ約64px・PCで約96pxの細い帯。1枚のみ（カルーセルなし）。
// - リンク解決：link_url が相対(/...)なら内部 next/link、https:// 絶対なら別タブ。
//   自サイト（fukues.com・www 有無どちらでも）URLはパス＋クエリ＋ハッシュに正規化して同一タブ遷移。
// - スマホ用画像(mobile_image_url)があれば sm 未満はそれ・sm 以上はPC用を表示。未設定は全幅でPC用。
// - 0件はブロックごと非表示。

// 自サイトのホスト（www 有無どちらでも自サイト扱い）。
function isOwnHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === 'fukues.com';
}

// リンク先を解決する。相対（/で始まる）は内部リンク、https:// は外部リンク、それ以外は非リンク（null）。
function resolveLink(b: Banner): { href: string; external: boolean } | null {
  const raw = (b.linkUrl ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return { href: raw, external: false };
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      // 自サイトのURLはパス＋クエリ＋ハッシュに変換し、next/link で同一タブ遷移
      // （ブラウザ/スマホの「戻る」で元ページに戻れる）。他ドメインのみ新規タブ。
      if (isOwnHost(u.hostname)) {
        return { href: `${u.pathname}${u.search}${u.hash}`, external: false };
      }
    } catch {
      return null; // パース不能なURLは非リンク扱い
    }
    return { href: raw, external: true };
  }
  return null; // 想定外の形式は非リンク扱い
}

export function AdBanner({ banners }: { banners: Banner[] }) {
  // 初期は先頭(0)を即描画し、マウント後に useEffect でランダムなインデックスへ差し替える
  // （初期描画が banners[0] で server/client 一致するため hydration mismatch は起きない）。
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length === 0) return;
    setIdx(Math.floor(Math.random() * banners.length));
  }, [banners]);

  if (banners.length === 0) return null;

  const picked = banners[idx] ?? banners[0];

  // 細い帯：スマホ h-16(64px)・PC h-24(96px) の固定高・全幅・角丸。object-cover は中央基準。
  const boxClass = 'relative block w-full overflow-hidden rounded-2xl shadow-sm bg-slate-100 h-16 sm:h-24 my-6 sm:my-8';

  // スマホ用画像があれば sm 未満はそれ・sm 以上はPC用を出し分け。未設定なら全幅でPC用1枚。
  const img = picked.mobileImageUrl ? (
    <>
      <Image
        src={picked.mobileImageUrl}
        alt={picked.altText}
        fill
        className="object-cover sm:hidden"
        sizes="100vw"
      />
      <Image
        src={picked.imageUrl}
        alt={picked.altText}
        fill
        className="object-cover hidden sm:block"
        sizes="1024px"
      />
    </>
  ) : (
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
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={boxClass}>
        {img}
      </a>
    ) : (
      <Link href={link.href} className={boxClass}>
        {img}
      </Link>
    );
  }
  // リンク先なし：非リンク（画像のみ）。
  return <div className={boxClass}>{img}</div>;
}
