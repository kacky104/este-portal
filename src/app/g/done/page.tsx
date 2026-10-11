import type { Metadata } from 'next';
import { acrylicStandSalonHref } from '@/lib/ga';

// 同意書の送信が終わったあとの画面（第560便）。★ 同意書の中身は出さない（戻るボタンで同意書に戻れないように、送信後はここへ置き換える）。
// ★ 第1404便（2026-10-11・カッキーさん）: 下に「フクエスでこのお店を見る」を1つ出す（部屋のアクリルスタンド → 同意書 → ここ → お店ページ）。
//    ・s = お店の番号（送信のときサーバーが返す。フクエスで非表示のお店は付かない＝案内を出さない）
//    ・リンクには印（acrylic_stand / qr）だけ付ける。お客様や予約が分かる値は付けない（lib/ga.ts）
//    ・★ <a rel="noreferrer"> のふつうのリンクにする（next/link にしない）。この画面の「前のページ」は同意書（合言葉入りのアドレス）なので、
//       それを移動先や Google へ渡さないため。

export const metadata: Metadata = {
  title: 'ご案内',
  description: '',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

export default async function GuideDonePage({ searchParams }: { searchParams: Promise<{ t?: string; s?: string }> }) {
  const { t, s } = await searchParams;
  const time = /^\d{2}:\d{2}$/.test(String(t ?? '')) ? String(t) : '';
  const salonHref = acrylicStandSalonHref(typeof s === 'string' ? s : '');
  return (
    <main className="mx-auto w-full max-w-md bg-white px-5 py-16 text-center">
      <p className="text-[40px] leading-none text-emerald-600">✓</p>
      <p className="mt-4 text-[18px] font-black text-slate-800">{time ? `${time}〜の予約で了承しました` : '了承しました'}</p>
      <p className="mt-3 text-[14px] text-slate-500">ありがとうございました。この画面は閉じてください。</p>
      {salonHref && (
        <div className="mt-12 border-t border-slate-200 pt-8">
          <p className="text-[13px] leading-relaxed text-slate-500">
            このお店の出勤・セラピスト・口コミは
            <br />
            「フクエス」でご覧いただけます。
          </p>
          <a
            href={salonHref}
            rel="noreferrer"
            className="mt-4 inline-block w-full px-4 py-3 text-[15px] font-bold text-white"
            style={{ background: 'linear-gradient(90deg, #FB923C, #DB2777)' }}
          >
            フクエスでこのお店を見る
          </a>
        </div>
      )}
    </main>
  );
}
