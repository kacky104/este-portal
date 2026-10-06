'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { seededShuffle } from '@/lib/shuffle';

// ★★ 第1238便（2026-10-06・カッキーさん）: お店カードの画像の並び（4列）。「お店」タブと /x-shops の両方で使う。
//   ・pool が空＝手で入れた画像の店 → images をそのまま出す（今までどおり）。
//   ・pool がある＝認証店（自動）→ フクエスのランキング（RankingTopShowcase）と同じく、開くたびに pool からランダムで選ぶ。
//     サーバーの HTML とハイドレーション中は images（決まった並び）、ブラウザで組み上がったあとにランダムへ（不一致なし）。
//     ★ 乱数は「この部品が画面に出たときに1つ」（salt）。出ているあいだは描き直しても写真が入れ替わらない。
//       タブを切り替えて戻る・ページを開き直す・再読み込みで変わる。
//     ★ 並びは seed から決まる（seededShuffle）＝effect の中で setState しない（eslint の set-state-in-effect に当たらない）。
//   ・枚数は images の枚数（＝サーバーで決めた上限 4／8。候補が少なければその数）。
//   ・自動の写真はフクエスの元写真（縦長・大きい）なので、ランキングと同じ next/image で小さくして出す。
//     マスは今までどおり正方形。縦長の写真を真ん中で切ると顔が欠けるので、上に寄せる（object-top）。
//     ★ next/image は next.config の remotePatterns にあるホストだけ（それ以外の URL が来たら今までの <img>）。

const OPTIMIZABLE_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/`;

// 「ブラウザで組み上がったか」。サーバーとハイドレーション中は false＝まだ選ばない（useHydrated と同じ作り）。
const subscribe = () => () => {};
const getReady = () => true;
const getServerReady = () => false;

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function XShopCardImages({
  images,
  pool,
  name,
  gridClassName,
  tileClassName,
}: {
  images: string[];
  pool: string[];
  name: string;
  gridClassName: string;
  /** 1マスの大きさ・角（例: aspect-square w-full）。object-cover はこちらで付ける */
  tileClassName: string;
}) {
  const ready = useSyncExternalStore(subscribe, getReady, getServerReady);
  // 出たときに1回だけ決める種。ハイドレーション中は使わない（ready=false）ので、サーバーと違う値でも不一致にならない
  const [salt] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const count = images.length;
  const auto = pool.length > 0;
  const shown = useMemo(
    // 店ごとに並びが変わるよう、店名を種に混ぜる
    () => (auto && ready ? seededShuffle(pool, (salt + hashStr(name)) >>> 0).slice(0, count) : images),
    [auto, ready, salt, pool, name, count, images],
  );
  if (shown.length === 0) return null;
  return (
    <div className={gridClassName}>
      {shown.map((url, i) =>
        auto && OPTIMIZABLE_PREFIX.length > 30 && url.startsWith(OPTIMIZABLE_PREFIX) ? (
          <span key={`${i}-${url}`} className={`relative block overflow-hidden ${tileClassName}`}>
            <Image src={url} alt={`${name}-${i + 1}`} fill className="object-cover object-top" sizes="(max-width:640px) 25vw, 190px" />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${i}-${url}`}
            src={url}
            alt={`${name}-${i + 1}`}
            className={`${tileClassName} object-cover${auto ? ' object-top' : ''}`}
            loading="lazy"
          />
        ),
      )}
    </div>
  );
}
