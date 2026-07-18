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
// 自サイトのホスト（www 有無どちらでも自サイト扱い）。
function isOwnHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, '');
  return h === 'fukues.com';
}

function resolveLink(b: Banner): { href: string; external: boolean } | null {
  const raw = (b.linkUrl ?? '').trim();
  if (raw) {
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
  // フォールバック：公開中セラピストの詳細ページ。
  if (b.therapistId != null && b.linkable) return { href: `/therapist/${b.therapistId}`, external: false };
  return null;
}

// バナー下に表示する1行キャプション（任意・最大27文字）。
// スマホ（幅360px以上＝現行のほぼ全機種）で全角27文字が1行に収まる固定サイズ(12.5px)。
// 文字数が少なくてもサイズは一定（自動縮小しない）。万一あふれても1行維持で末尾省略。
function BannerCaption({ text }: { text: string }) {
  return (
    <p className="mt-2 px-1 text-center whitespace-nowrap overflow-hidden text-ellipsis font-bold text-slate-600 leading-tight text-[12.5px]">
      {text}
    </p>
  );
}

export function TherapistPickupBanner({ banners }: { banners: Banner[] }) {
  // 初期は先頭(0)を即描画し（おすすめ/新人と同じく「常に画像を出す」作法。null プレースホルダで
  // ゲーティングしない）、マウント後に useEffect でランダムなインデックスへ差し替える。
  // 初期描画が banners[0] で server/client 一致するため hydration mismatch も起きない。
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length === 0) return;
    setIdx(Math.floor(Math.random() * banners.length));
  }, [banners]);

  if (banners.length === 0) return null;

  // おすすめサロンバナーの1件時と同じサイズ感・直角（SPは h-52 固定、PCは aspect-[31/12]）。
  // 画像ボックス（固定高・overflow-hidden）と外枠（リンク）を分離し、キャプションは画像の「下」に置く。
  const outerClass = 'block w-full';
  const imageClass = 'relative overflow-hidden shadow-lg h-[153px] sm:h-64 w-full';

  const picked = banners[idx] ?? banners[0];

  // スマホ用画像（mobile_image_url）が設定されていれば sm 未満はそれ・sm 以上はPC用を表示
  // （AreaBrowse の sp/pc 出し分けと同じ流儀）。未設定なら従来どおりPC用1枚を全幅で表示。
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

  const caption = picked.caption?.trim() ? picked.caption : null;
  const content = (
    <>
      <div className={imageClass}>{img}</div>
      {caption && <BannerCaption text={caption} />}
    </>
  );

  const link = resolveLink(picked);
  if (link) {
    // 外部URL（https://）は新規タブの通常アンカー、内部（/...）は next/link。
    return link.external ? (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={outerClass}>
        {content}
      </a>
    ) : (
      <Link href={link.href} className={outerClass}>
        {content}
      </Link>
    );
  }
  // リンク先なし：非リンク（画像のみ＋キャプション）。
  return <div className={outerClass}>{content}</div>;
}
