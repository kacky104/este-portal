import { LISTING_MINCHO } from './listingStyle';

// /listing の「フクエスとは」＋「掲載店舗様でできること」（第1301便・2026-10-08 に画像から文字へ組み直した）。
//
// ★ これまでは全幅のデザイン画像（public/listing/about-pc.webp・about-sp.webp）で、文章は sr-only で持っていた。
//   料金・機能が変わったので、ページ全体をいったん文字（HTML）で組み直した（カッキーさんの決定）。文言は画像のときと同じ。
//   ★ このあと画像を用意したら、このブロックを画像に戻す。そのときは下の文を sr-only で残すこと（禁則85）。
// ★ 見出し「掲載店舗様でできること」は、ページ下の「無料掲載について」が名前で指している。文言を変えるならそちらも直す。
// ★ 帯は全幅。本文ラッパー（max-w-3xl px-4）の【外】に置く（page.tsx）。100vw ではみ出させない。

const AREAS = ['博多', '天神', '北九州', '久留米'] as const;

// 4つの札の色は、これまでの画像（タブレットの4枚の札）と同じ並び。暗い面の上で読める明るさにしてある
const CAN_DO: ReadonlyArray<{ name: string; color: string }> = [
  { name: '店舗情報', color: '#f08a7c' },
  { name: '写メ日記', color: '#6fcbd0' },
  { name: '出勤管理', color: '#7fb6e6' },
  { name: '求人・オファー', color: '#d9b46a' },
];

export function ListingAbout() {
  return (
    <section className="w-full">
      {/* ── フクエスとは（明るい帯）── */}
      <div className="bg-[#faf5ec]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <h2
            className="text-[26px] font-semibold leading-[1.5] text-[#2b211c] sm:text-[42px] sm:leading-[1.45]"
            style={{ fontFamily: LISTING_MINCHO }}
          >
            福岡のメンズエステを、
            <br />
            もっと見つけてもらえる場所へ。
          </h2>
          <p className="mt-6 max-w-2xl text-[14px] leading-[2] text-[#4a3f38] sm:text-[15px]">
            フクエスは、福岡県のメンズエステ専門ポータルサイトです。博多・天神・北九州・久留米など、福岡全域の店舗様の情報を掲載しています。
          </p>
          <p className="sr-only">対応エリア</p>
          <ul
            className="mt-8 flex flex-wrap items-center gap-y-3 text-[20px] font-semibold text-[#c8402f] sm:text-[26px]"
            style={{ fontFamily: LISTING_MINCHO }}
          >
            {AREAS.map((a, i) => (
              <li
                key={a}
                className={i === 0 ? '' : 'ml-5 border-l border-[#c9a55c] pl-5 sm:ml-8 sm:pl-8'}
              >
                {a}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── 掲載店舗様でできること（暗い帯）── */}
      <div className="bg-[#1f1f1e]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <h2 className="text-[13px] font-bold tracking-[0.12em] text-[#d9b46a] sm:text-[14px]">
            掲載店舗様でできること
          </h2>
          <p
            className="mt-4 text-[23px] font-semibold leading-[1.6] text-[#f7efe0] sm:text-[38px] sm:leading-[1.5]"
            style={{ fontFamily: LISTING_MINCHO }}
          >
            集客から求人、リピートづくりまで。
            <br />
            お店の運営に必要な機能を、ひとつに。
          </p>
          <p className="mt-6 max-w-2xl text-[14px] leading-[2] text-[#d8cdbb] sm:text-[15px]">
            掲載店舗様には、集客からリピートづくりまでに必要な機能をまとめてご用意しています。店舗情報の更新・写メ日記・出勤管理は、専用の管理画面からいつでも行えます。セラピストの求人掲載や、お仕事を探しているセラピストへのオファーにも対応しています。
          </p>
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
            {CAN_DO.map((c) => (
              <li
                key={c.name}
                className="border px-4 py-3 text-center text-[15px] font-semibold sm:min-w-[160px] sm:px-6 sm:text-[17px]"
                style={{ borderColor: c.color, color: c.color, fontFamily: LISTING_MINCHO }}
              >
                {c.name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
