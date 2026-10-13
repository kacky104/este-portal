import type { Metadata } from 'next';
import Image from 'next/image';
import { acrylicStandSalonHref } from '@/lib/ga';
import CloseX from './CloseX';

// 同意書の送信が終わったあとの画面（第560便）。★ 同意書の中身は出さない（戻るボタンで同意書に戻れないように、送信後はここへ置き換える）。
// ★ 第1404便（2026-10-11・カッキーさん）: 「フクエスでこのお店を見る」を出す（部屋のアクリルスタンド → 同意書 → ここ → お店ページ）。
//    ・s = お店の番号（送信のときサーバーが返す。フクエスで非表示のお店は付かない＝案内を出さない）
//    ・リンクには印（acrylic_stand / qr）だけ付ける。お客様や予約が分かる値は付けない（lib/ga.ts）
//    ・★ <a rel="noreferrer"> のふつうのリンクにする（next/link にしない）。この画面の「前のページ」は同意書（合言葉入りのアドレス）なので、
//       それを移動先や Google へ渡さないため。
// ★ 第1405便（2026-10-12・カッキーさん）: 予約の時刻は出さない（「12:30〜の予約で了承しました」→「了承しました」）。
//    お店の都合で開始が遅れたとき（13:00 の予約が 13:15 開始）に「13:00〜」と出ると、お客様が勘違いしてセラピストが責められるため。
// ★ 第1406便（2026-10-12・カッキーさん「もっと興味をそそる画像に」）: 画像1枚（public/consent-done/hero.webp・1080×1350・下は真っ白）に文字を重ねる形。
//    ・右上の空き ＝「了承しました」（同意が済んだことを最初に見せる）／下の白い余白 ＝ 案内とボタン。画像ぜんたいが押せる
//    ・★ 文字は画像に入れない（にじまない・文言だけ直せる）。画像を差し替えるときも「文字なし・左上に人物・下4割は真っ白」で作る
//    ・「この画面は閉じてください」は、リンクを出すときは出さない（押してほしいのに逆の案内になるため）。リンクを出さないお店では今までどおり出す

export const metadata: Metadata = {
  title: 'ご案内',
  description: '',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

// 部屋のアクリルスタンド（明朝体）と同じ印象にそろえる。端末に入っている明朝体を使う（フォントは読み込まない）
const SERIF = { fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif' } as const;
const BRAND = 'linear-gradient(90deg, #FB923C, #DB2777)';

export default async function GuideDonePage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  const { s } = await searchParams;
  const salonHref = acrylicStandSalonHref(typeof s === 'string' ? s : '');

  const picture = (
    <>
      <Image
        src="/consent-done/hero.webp"
        alt=""
        width={1080}
        height={1350}
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        className="block h-auto w-full"
      />
      {/* 右上の空き: 同意が済んだこと */}
      <div className="absolute left-[46%] right-[2%] top-[7%] text-center">
        <p className="text-[30px] leading-none text-emerald-600">✓</p>
        <p className="mt-2 text-[20px] font-black tracking-[0.04em] text-slate-800" style={SERIF}>了承しました</p>
        <p className="mt-1.5 text-[13px] leading-normal text-slate-600">
          ありがとう
          <br />
          ございました。
        </p>
      </div>
    </>
  );

  if (!salonHref) {
    return (
      <main className="mx-auto w-full max-w-md bg-white">
        <div className="relative text-slate-800">
          {picture}
          <div className="absolute inset-x-0 bottom-[4%] top-[56%] flex flex-col justify-center px-5 text-center">
            <p className="text-[14px] text-slate-500">この画面は閉じてください。</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full max-w-md bg-white">
      {/* ★ 第1428便: お店のページへ行かずに終わる ✕（画像のリンクの外に置く＝押してもお店へ飛ばない） */}
      <CloseX />
      <a href={salonHref} rel="noreferrer" className="relative block text-slate-800">
        {picture}
        {/* 下の白い余白: 案内とボタン */}
        <div className="absolute inset-x-0 bottom-[4%] top-[56%] flex flex-col justify-center px-5 text-center">
          <p className="text-[14px] tracking-[0.04em] text-slate-600" style={SERIF}>このお店の出勤・写メ日記・口コミは</p>
          <p className="mt-0.5 text-[17px] leading-[1.2] text-slate-700" style={SERIF}>
            <span className="mr-1 bg-clip-text text-[40px] font-bold text-transparent" style={{ backgroundImage: BRAND }}>フクエス</span>
            で
          </p>
          <span className="mt-3.5 block w-full px-4 py-[13px] text-[15px] font-bold text-white" style={{ backgroundImage: BRAND }}>
            このお店のページを見る　›
          </span>
        </div>
      </a>
    </main>
  );
}
