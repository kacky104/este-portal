import {
  HP_LIST_SETUP_YEN,
  HP_LIST_MONTHLY_YEN,
  HP_LIST_DOMAIN_YEN,
  HP_MEMBER_YEARLY_YEN,
  HP_TAX_LABEL,
  hpYen,
} from '@/lib/hpPlan';

// /hp/templates の「料金プラン」（第1302便・2026-10-08 に画像から文字へ組み直した）。
//
// ★ これまでは見出し＋料金3つ＋特別優待が焼き込まれた1枚画像（public/hp-lp/price-pc.webp・price-sp.webp）だった。
//   掲載店さまの条件が変わった（「フクエスワークにも掲載なら」が無くなった）ので、文字で組み直した。値は lib/hpPlan.ts。
//   ★ このあと画像を用意したら、画像に戻してよい。そのときは料金と条件を sr-only で残すこと（禁則85）。
// ★ 定価（掲載していないお店）は残す。掲載店さまの「0円」が、何に対する0円なのかが分かるように（カッキーさん）。
// ★ 色はこのページの色（地 #fdf5f5・金 #c9a06a（文字は #8a6a42）・薔薇 #b05a6b）。文字色は地とのコントラスト比 4.5 以上。

// 明朝は端末に入っている書体だけ（Web フォントは読み込まない）
const MINCHO = '"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif';

const LIST: ReadonlyArray<{ name: string; price: string; unit: string; note: string }> = [
  { name: '制作料', price: hpYen(HP_LIST_SETUP_YEN), unit: '円（初回のみ）', note: 'デザイン設定・キービジュアル制作・写真や文章の設定まで込み' },
  { name: '月額利用料', price: hpYen(HP_LIST_MONTHLY_YEN), unit: '円/月', note: 'サーバー・システム利用・掲載データとの自動連動' },
  { name: 'ドメイン更新料', price: hpYen(HP_LIST_DOMAIN_YEN), unit: '円/年', note: 'お店の独自ドメインの維持費。取得・管理・更新は運営が代行' },
];

const FREE: ReadonlyArray<{ name: string; from: string; unit: string }> = [
  { name: '制作料', from: hpYen(HP_LIST_SETUP_YEN), unit: '円' },
  { name: '月額利用料', from: hpYen(HP_LIST_MONTHLY_YEN), unit: '円/月' },
];

function GoldRule() {
  return (
    <span className="flex items-center justify-center gap-2" aria-hidden="true">
      <span className="block h-px w-10 bg-gradient-to-r from-transparent to-[#d5a86b] sm:w-16" />
      <span className="block h-1.5 w-1.5 rotate-45 bg-[#d5a86b]" />
      <span className="block h-px w-10 bg-gradient-to-l from-transparent to-[#d5a86b] sm:w-16" />
    </span>
  );
}

export function HpPrice() {
  return (
    <div className="mx-auto max-w-5xl px-5">
      <p className="text-center text-[11px] font-bold tracking-[0.3em] text-[#8a6a42]">PRICE</p>
      <h2
        className="mt-2 text-center text-[24px] font-semibold tracking-[0.06em] text-[#4a3f3a] sm:text-[32px]"
        style={{ fontFamily: MINCHO }}
      >
        料金プラン
      </h2>
      <div className="mt-3">
        <GoldRule />
      </div>
      <p className="mt-4 text-center">
        <span className="inline-block rounded-full border border-[#d9bf98] bg-white px-4 py-1 text-[12px] text-[#6b5a50]">
          表示はすべて{HP_TAX_LABEL}です
        </span>
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:mt-10 md:grid-cols-[1fr_1.2fr] md:items-stretch">
        {/* ── 通常の料金（掲載していないお店）── */}
        <div className="rounded-2xl border border-[#ead9cf] bg-white px-5 py-6 sm:px-7 sm:py-8">
          <h3 className="text-[15px] font-bold text-[#4a3f3a] sm:text-[16px]">通常の料金</h3>
          <dl className="mt-3">
            {LIST.map((x) => (
              <div key={x.name} className="border-b border-dashed border-[#e3cdb8] py-4 last:border-0">
                <dt className="text-[14px] font-bold text-[#6b5a50]">{x.name}</dt>
                <dd className="mt-1">
                  <span className="text-[30px] font-semibold leading-none text-[#4a3f3a] sm:text-[34px]" style={{ fontFamily: MINCHO }}>
                    {x.price}
                  </span>
                  <span className="ml-1 text-[13px] text-[#4a3f3a]">{x.unit}</span>
                  <span className="mt-1.5 block text-[12.5px] leading-[1.8] text-[#6b5a50]">{x.note}</span>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── フクエス掲載店さま限定 ── */}
        <div className="relative rounded-2xl border-2 border-[#d9a3ad] bg-white px-5 pb-6 pt-9 sm:px-8 sm:pb-8 sm:pt-11">
          <h3 className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#b05a6b] px-5 py-1.5 text-[14px] font-bold text-white sm:text-[15px]">
            フクエス掲載店さま限定
          </h3>
          <dl>
            {FREE.map((x) => (
              <div key={x.name} className="flex flex-wrap items-end justify-between gap-x-4 border-b border-dashed border-[#e3cdb8] py-4">
                <dt>
                  <span className="block text-[14px] font-bold text-[#6b5a50]">{x.name}</span>
                  <s className="mt-1 block text-[17px] text-[#6b5a50] decoration-[#b05a6b]" style={{ fontFamily: MINCHO }}>
                    {x.from}
                    {x.unit}
                  </s>
                </dt>
                <dd className="text-[#b05a6b]" style={{ fontFamily: MINCHO }}>
                  <span className="sr-only">が</span>
                  <span className="text-[60px] font-semibold leading-none sm:text-[72px]">0</span>
                  <span className="ml-1 text-[22px] font-semibold">円</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 rounded-xl bg-[#fbeef0] px-4 py-4 text-center text-[14px] leading-[1.9] text-[#4a3f3a] sm:text-[15px]">
            かかるのは、年間
            <span className="mx-1 text-[24px] font-semibold text-[#b05a6b] sm:text-[28px]" style={{ fontFamily: MINCHO }}>
              {hpYen(HP_MEMBER_YEARLY_YEN)}
            </span>
            円の
            <br className="sm:hidden" />
            <span className="whitespace-nowrap">ドメイン・サーバー維持費のみ</span>
          </p>
        </div>
      </div>
    </div>
  );
}
