// セラピストページとは（第1666便・2026-10-26・カッキーさんの指示）。
// ★ 店舗オーナー様向け。「作り方」（/mypage/cast-guide・画像1枚）の前に読む「そもそも何か」のページ。
// ★ マイページの「セラピストページ連携」（今すぐの画面・CastLinkProgress）の見出しの横「セラピストページとは」から開く。
// ★ ログインだけで開ける（中身は全店同じ）。読み取りは無い。色は作り方ページにそろえる（ピンク）。
// ★ 書いてある中身の正本：
//   - 今すぐの受付時間 … src/lib/imasugu.ts IMASUGU_WINDOW_MIN（45分）
//   - ランキングの加点 … src/lib/rankingPoints.ts（セラピスト +5／お店のおすすめランキングは連携率÷2）
//   - スケジュールのタブ … src/app/actions/castSchedule.ts isCastScheduleEnabled（CRM でお店が出しているときだけ）
//   - 記録帳はお店・運営に見えない … src/app/cast/CastCustomers.tsx
//   どれかを変えたら、ここの文言も直すこと。

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'セラピストページとは｜フクエス マイページ' };

const CAN_DO: { title: string; body: string; note?: string }[] = [
  { title: '写メ日記', body: '自分のスマホから写真と文章を投稿できます。フクエスのお店のページにそのまま載ります。', note: 'fukuX を開設していれば、fukuX にも同時に投稿できます。' },
  { title: '今すぐ', body: '「今すぐご案内できます」を本人が ON にできます。ON にすると45分間表示され、時間が来たら自動で消えます。', note: 'お店が ON にしているあいだは、本人は操作できません。' },
  { title: '記録帳', body: '接客の記録や今日の報酬を、自分だけの手帳としてつけられます。', note: 'お店・運営からは見えません。' },
  { title: 'スケジュール', body: '自分の出勤と予約を、スマホのタイムラインで確認できます。料金やお客様の電話番号は出ません。', note: 'フクエスCRM をお使いで、お店がこの表示を出している場合だけです。' },
  { title: '着せ替え', body: 'セラピストページの色を、好きなテーマに変えられます。' },
];

const SHOP_MERIT: { title: string; body: string }[] = [
  { title: '写メ日記が増える', body: 'お店が代わりに投稿しなくても、セラピストさんが空き時間に投稿できます。日記の多いお店・女の子は、ページを見てもらいやすくなります。' },
  { title: '「今すぐ」がすぐ出せる', body: '手が空いたその場で本人が ON にできるので、お店への連絡を待たずに表示できます。' },
  { title: 'ランキングで有利に', body: '連携したセラピストさんは、人気セラピストランキングで毎週 +5 点。お店の「おすすめランキング」にも、連携率の半分の点が毎週つきます。' },
];

export default function CastAboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <article className="bg-[#fffafc] border border-slate-200 border-t-4 border-t-[#c8477d] px-5 py-7 sm:px-10 sm:py-9 mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
            <h1 className="text-[24px] sm:text-[28px] font-black text-slate-800 tracking-wide">セラピストページとは</h1>
            <span className="text-[12px] font-bold text-[#b83a6f] bg-pink-50 border border-pink-100 rounded-full px-4 py-1">店舗オーナー様へ</span>
          </div>

          <p className="text-[26px] sm:text-[34px] font-black leading-snug text-[#c8477d] mb-4">
            セラピストさん<br className="sm:hidden" />専用のページです。
          </p>
          <p className="text-[16px] sm:text-[17px] font-bold text-slate-700 leading-relaxed mb-6">
            写メ日記や「今すぐ」を、<br />
            セラピストさんが自分のスマホから更新できます。
          </p>
          <div className="bg-pink-50 border border-pink-100 px-5 py-4 text-[14px] text-slate-600 leading-relaxed mb-10">
            プロフィール・写真・出勤は、これまで通り<b className="text-[#b83a6f]">お店のマイページで管理</b>します。<br />
            セラピストページは、それに「本人が自分で更新できること」を足すものです。
          </div>

          {/* 01 お店のメリット */}
          <section className="mb-10">
            <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
              <span className="text-[14px] font-black text-[#c8477d]">01</span>お店にとってのよいところ
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {SHOP_MERIT.map((m) => (
                <div key={m.title} className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-[15px] font-black text-[#b83a6f] mb-2">{m.title}</p>
                  <p className="text-[13px] text-slate-600 leading-relaxed">{m.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 02 セラピストさんができること */}
          <section className="mb-10">
            <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
              <span className="text-[14px] font-black text-[#c8477d]">02</span>セラピストさんができること
            </h2>
            <div className="space-y-3">
              {CAN_DO.map((c) => (
                <div key={c.title} className="bg-white border border-slate-200 rounded-xl p-4 sm:flex sm:gap-5">
                  <p className="sm:w-28 flex-none text-[15px] font-black text-[#b83a6f] mb-1 sm:mb-0">{c.title}</p>
                  <div>
                    <p className="text-[14px] text-slate-700 leading-relaxed">{c.body}</p>
                    {c.note && <p className="text-[12px] text-slate-500 leading-relaxed mt-1">※ {c.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 03 始め方 */}
          <section>
            <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
              <span className="text-[14px] font-black text-[#c8477d]">03</span>始め方
            </h2>
            <div className="bg-white border border-slate-200 rounded-xl p-5 text-[14px] text-slate-700 leading-relaxed">
              お店がマイページの「セラピスト」で <b className="text-[#b83a6f]">QR</b> を出し、セラピストさんがスマホで読み取って登録するだけです。<br />
              費用はかかりません。くわしい手順は「作り方」をご覧ください。
            </div>
          </section>
        </article>

        {/* ★ PC は横並び・スマホは縦並び（作り方ページと同じ並び） */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Link href="/mypage/cast-guide" className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
            作り方を見る →
          </Link>
          <Link href="/mypage" className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
