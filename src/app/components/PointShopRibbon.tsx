import Image from 'next/image';
import Link from 'next/link';

// ★ 第1456便（2026-10-14・カッキーさん）: 店舗カードの「フクエスポイント加盟店」のリボン。
//   ・置き場所は店名の帯の下・白い枠のいちばん上（ShuffledSalons の SalonCard）。カードの左端から出る。
//   ・形はサンプルの E（大きいコインを左にのせる）＋ C（右端が切り込んだリボン）。青の背景・白い文字。
//   ・コインの画像は public/points/coin.png（いただいた画像の白い背景を抜いたもの）。
// ★ 第1457便: 右の空白に「来店で貯まる・使える ›」（青い小さな文字・押すと /points）。カード全体の onClick とは stopPropagation で分ける。
export function PointShopRibbon() {
  return (
    <div className="relative mt-2 -mb-0.5 flex h-[34px] items-center pr-5">
      <span
        className="relative inline-flex h-6 items-center pl-[44px] pr-[26px] text-[12.5px] font-bold tracking-wide text-white whitespace-nowrap"
        style={{ background: '#2563EB', clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 50%, 100% 100%, 0 100%)' }}
      >
        フクエスポイント加盟店
      </span>
      <Image
        src="/points/coin.png"
        alt=""
        width={34}
        height={34}
        className="absolute left-[6px] top-0 h-[34px] w-[34px]"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.25))' }}
      />
      <Link
        href="/points"
        onClick={(e) => e.stopPropagation()}
        className="ml-auto pl-2 text-[11.5px] font-bold text-[#2563EB] whitespace-nowrap hover:underline"
      >
        来店で貯まる・使える ›
      </Link>
    </div>
  );
}
