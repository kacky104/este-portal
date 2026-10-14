import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { POINT_USE_UNIT, POINT_USE_YEN, POINT_VISIT } from '@/lib/points';

// フクエスポイントの店舗様向けのご案内（第1483便・2026-10-14・カッキーさん「簡単に、文字は少なく、とても分かりやすく」）。
// ★ お客様向けの /points と同じ青。中身は全店同じで、読み取りは無い（ログインも要らない）。検索には出さない。
// ★ 決まり（変えない）: 割引はフクエス負担・女子報酬から引かない・お店の売上も変えない・翌月発行の請求書で差し引く・
//   予約のキャンセル／削除で自動で戻る・参加できるのはフクエスCRM のご契約店（運営が加盟店を ON）。
export const metadata: Metadata = {
  title: 'フクエスポイント 加盟店さま向けのご案内｜フクエス',
  robots: { index: false, follow: false },
};

const BLUE = '#2563EB';
const GRAD = 'linear-gradient(95deg,#3B82F6,#1D4ED8)';
const yen = (n: number) => n.toLocaleString();

const MERITS = [
  { big: '0円', title: 'お店の負担', body: `割引の${yen(POINT_USE_YEN)}円は、フクエスが負担します。` },
  { big: '集客', title: '加盟店の印', body: 'お店のカードとページに、青い「加盟店」の印が付きます。' },
  { big: 'そのまま', title: '売上・女子報酬', body: '売上も女子報酬も、何も変わりません。' },
];

// ★ 第1484便（カッキーさん）: ご契約店さま向けの「はじめ方」。運営が QR コードスタンドを無料で用意 → お部屋に置く → それだけで使える
const START = [
  { title: 'QR コードスタンドが届きます', body: '運営が無料でご用意して、お届けします。' },
  { title: 'お部屋に置きます', body: 'お客様から見える場所に置いてください。' },
  { title: 'これで準備完了', body: 'お客様が QR コードを読むと、ポイントが貯まる・使えるようになります。' },
];

const STEPS = [
  { who: 'お客様', text: 'ご予約のときに「ポイントを使います」と伝える' },
  { who: 'お客様', text: 'お部屋の QR コードを読んで「ポイントを使う」を押す' },
  { who: 'セラピスト', text: `緑の「使用済み」の画面を見て、${yen(POINT_USE_YEN)}円引いて料金を受け取る`, hl: true },
];

export default function PointsShopGuidePage() {
  return (
    <div className="min-h-screen bg-blue-50/60 text-slate-900">
      <header className="border-b border-blue-100 bg-white/90">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-3"><Logo /></div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        {/* タイトル（お客様向けの /points と同じ青いリボン） */}
        <div className="text-center">
          <p className="text-[13px] font-bold text-blue-600">加盟店さま向けのご案内</p>
          <h1 className="mt-2">
            <span
              className="inline-flex h-11 items-center gap-2.5 whitespace-nowrap px-10 text-[22px] font-black tracking-wide text-white"
              style={{ background: BLUE, clipPath: 'polygon(0 0, 100% 0, calc(100% - 18px) 50%, 100% 100%, 0 100%, 18px 50%)' }}
            >
              <Image src="/points/coin.png" alt="" width={34} height={34} className="h-[34px] w-[34px]" priority />
              フクエスポイント
            </span>
          </h1>
          <p className="mt-4 text-[17px] font-black leading-snug text-slate-800">
            お客様の割引は、<br className="sm:hidden" />
            <span className="text-[22px]" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>ぜんぶフクエスが負担</span>します。
          </p>
          {/* ★ 第1485便（カッキーさん）: 上の方に「店舗様の作業はほぼ0」 */}
          <p className="mt-3 inline-block -rotate-1 rounded-lg border-2 border-white bg-gradient-to-r from-amber-300 to-yellow-300 px-4 py-1.5 text-[17px] font-black tracking-wide text-rose-700 shadow-md">
            店舗様の作業は、ほぼ0
          </p>
          <p className="mt-3 text-[13px] text-slate-500">
            お客様はご来店で {POINT_VISIT}pt 貯まり、{yen(POINT_USE_UNIT)}pt で {yen(POINT_USE_YEN)}円引きになります。
          </p>
        </div>

        {/* メリット3つ */}
        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          {MERITS.map((m) => (
            <div key={m.title} className="rounded-3xl border border-blue-100 bg-white p-5 text-center shadow-sm">
              <p className="text-xs font-bold text-slate-400">{m.title}</p>
              <p className="mt-1 text-[28px] font-black leading-tight" style={{ background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{m.big}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{m.body}</p>
            </div>
          ))}
        </section>

        {/* はじめ方（ご契約店さま向け） */}
        <section className="mt-8 rounded-3xl border-2 border-blue-300 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-center text-[17px] font-black text-slate-800">はじめ方は、置くだけ</h2>
          <p className="mt-1 text-center text-[12.5px] text-slate-500">フクエスCRM をご契約のお店さま</p>
          <ol className="mt-4 space-y-3">
            {START.map((s, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full text-[15px] font-black text-white" style={{ background: GRAD }}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-black leading-snug text-slate-800">{s.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-600">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-center text-[12.5px] font-bold text-blue-700">
            すでに同意書の QR コードを置いているお店は、そのままで大丈夫です
          </p>
        </section>

        {/* 使われたときの流れ */}
        <section className="mt-8">
          <h2 className="mb-3 text-center text-[17px] font-black text-slate-800">ポイントが使われたとき</h2>
          <ol className="space-y-2.5">
            {STEPS.map((s, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-sm ${s.hl ? 'border-blue-400 ring-2 ring-blue-200' : 'border-blue-100'}`}
              >
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[16px] font-black text-white" style={{ background: BLUE }}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-bold text-blue-600">{s.who}</span>
                  <span className="block text-[14px] font-bold leading-snug text-slate-800">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-center text-[15px] font-black text-slate-800">
            お店がやることは、<span className="text-blue-700">③だけ</span>です。
          </p>
        </section>

        {/* あとは自動 */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-[15px] font-black text-slate-800">あとは自動です</h2>
          <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-600">
            <li>・{yen(POINT_USE_YEN)}円は、翌月の請求書でフクエスが差し引きます</li>
            <li>・フクエスCRM の予約に「Pt−{yen(POINT_USE_YEN)}」と出ます</li>
            <li>・ご予約をキャンセル・削除すると、ポイントは自動で戻ります</li>
          </ul>
        </section>

        {/* 参加のしかた（まだご契約でないお店） */}
        <section className="mt-8 rounded-3xl border border-blue-100 bg-white p-6 text-center shadow-sm">
          <p className="text-[13px] font-bold text-slate-400">まだフクエスCRM をご契約でないお店</p>
          <p className="mt-1 text-[17px] font-black text-slate-800">ご契約で、加盟店になれます</p>
          <p className="mt-1 text-[13px] text-slate-500">はじめの3ヶ月は無料です</p>
          <Link
            href="/mypage?tab=support"
            className="mt-4 block rounded-xl py-3.5 text-[16px] font-black text-white shadow-md hover:opacity-95"
            style={{ background: GRAD }}
          >
            運営に問い合わせる
          </Link>
          <Link href="/points" className="mt-3 inline-block text-[13px] font-bold text-blue-600 hover:underline">お客様向けのご案内を見る →</Link>
        </section>
      </main>
    </div>
  );
}
