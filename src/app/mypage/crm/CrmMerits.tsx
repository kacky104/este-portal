'use client';

import type { ReactNode } from 'react';
import { useCrmLinks } from './CrmBase';
import { SET_PLAN_PRICE_LABEL } from '@/lib/setPlan';

// ★ 第1466便（2026-10-14・カッキーさん）: フクエスCRM の「契約すると付いてくるもの」のアピール。
//   ・置き場所はご案内（fukuescrm.com/about ・マイページの未契約の案内）のいちばん上。今の画像（crm-intro.webp）はこの下に残す。
//   ・中身: 顧客管理／コネックエフ（外部サービス）無料／同意書のペーパーレス化／QR コードスタンドの無料配布／
//     フクエスポイント加盟店に参加できる／はじめの3ヶ月無料・4ヶ月目の前に解約すれば費用ゼロ。
//   ・★ 店舗様に見える文に「セット」と書かない（lib/setPlan.ts の決まり）。料金は SET_PLAN_PRICE_LABEL。
// ★ 第1657便（2026-10-25・カッキーさん）: 「予約確認の自動電話」を足す（Twilio・11月初旬に実装予定と告知）。
//   ・まだ使えない機能なので、赤の札（無料など）とは別の色の札 soon で「11月初旬 実装予定」と出す。実装したら soon を外す。
//   ・7つになり2列だと右下が空くので、数が奇数のときは最後の1つを2列ぶんに広げる。
// ★ 第1658便（2026-10-25・カッキーさん）: 「セラピストページと連携」を足す（部屋番号・タイムラインの予約状況。お客様はお名前と時間だけ）。8つ＝偶数。

const NAVY = '#1e2a5a';
const BLUE = '#2c4a84';

// ★ 第1483便: more … 「くわしく」の行き先（フクエスのパス）。fukuescrm.com からも開けるように links.fukues で絶対URLにする
type Merit = { title: string; body: string; tag?: string; soon?: string; icon: ReactNode; more?: string };

const ic = (d: ReactNode) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

const MERITS: Merit[] = [
  {
    title: '顧客管理',
    body: '予約・お客様・出勤・売上を、ひとつの画面でまとめて管理。',
    icon: ic(<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5.4 6-5.4s5.4 2 6 5.4" /><path d="M16 4.5a3 3 0 0 1 0 6M18 14.8c1.7.7 2.8 2.4 3 5.2" /></>),
  },
  {
    title: 'コネックエフ',
    tag: '無料',
    body: '他サイトへ出勤・写メ日記を一括で更新できる外部サービスが、無料で使えます。',
    icon: ic(<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  },
  {
    title: '同意書のペーパーレス化',
    body: 'お部屋の QR コードをお客様のスマホで読んでサイン。紙の保管はもう不要。',
    icon: ic(<><rect x="5" y="3" width="14" height="18" rx="1.5" /><path d="M8.5 8h7M8.5 11.5h7M8.5 17c1-1.6 2-1.6 2.6 0 .5 1.2 1.3 1.2 2.2-.4" /></>),
  },
  {
    title: '予約確認の自動電話',
    soon: '11月初旬 実装予定',
    body: 'フクエスからネット予約が入ると、ご登録の電話番号に予約確認の電話が自動でかかってきます。予約の見落としを防げます。',
    icon: ic(<><path d="M5 4h3.2l1.6 4.2-2 1.3a11 11 0 0 0 5.7 5.7l1.3-2L19 14.8V18a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 3 6.2 2 2 0 0 1 5 4z" /><path d="M15 3.5a5.5 5.5 0 0 1 5.5 5.5M15 7a2 2 0 0 1 2 2" /></>),
  },
  {
    title: 'セラピストページと連携',
    body: 'セラピストのページに、出勤するお部屋の番号と、予約状況をタイムラインで表示します。お客様の情報はお名前と時間だけ。お店の顧客情報やお客様の電話番号は表示されません。',
    icon: ic(<><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" /><circle cx="9" cy="10.5" r="2.3" /><path d="M5.8 16.5c.5-1.8 1.7-2.8 3.2-2.8s2.7 1 3.2 2.8M14.5 9.5h3.5M14.5 12.5h3.5M14.5 15.5h2" /></>),
  },
  {
    title: 'QR コードスタンド',
    tag: '無料配布',
    body: 'お部屋に置く QR コードのスタンドを、無料でお届けします。',
    icon: ic(<><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" /></>),
  },
  {
    title: 'フクエスポイント加盟店',
    tag: '参加資格',
    body: '来店で貯まる・使えるポイントで集客。お客様の割引分はフクエスが負担します。',
    more: '/points/shop',
    icon: ic(<><circle cx="12" cy="12" r="8.5" /><path d="M9.5 16V8h3.2a2.4 2.4 0 0 1 0 4.8H9.5" /></>),
  },
  {
    title: 'はじめの3ヶ月無料',
    tag: '解約OK',
    body: '4ヶ月目の前に解約すれば、費用はかかりません。まずはお試しください。',
    icon: ic(<><rect x="3.5" y="5" width="17" height="15" rx="1.5" /><path d="M3.5 9.5h17M8 3v4M16 3v4M9 14.5l2 2 4-4" /></>),
  },
];

export function CrmMerits() {
  const links = useCrmLinks();
  return (
    <section className="mb-6 overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* 見出し */}
      <div className="relative px-4 pb-5 pt-6 text-center text-white sm:px-6" style={{ background: `linear-gradient(135deg, ${NAVY}, ${BLUE})` }}>
        <p className="text-[13px] font-bold tracking-wider text-indigo-200">フクエスCRM を契約すると</p>
        <p className="mt-1 text-[24px] font-black leading-tight sm:text-[28px]">これだけ付いてきます</p>
        <p className="mt-3 inline-block -rotate-2 border-2 border-white bg-gradient-to-r from-amber-300 to-yellow-300 px-4 py-1 text-[18px] font-black tracking-wide text-rose-700 shadow-md">
          はじめの3ヶ月無料
        </p>
      </div>

      {/* 付いてくるもの */}
      <ul className="grid gap-px bg-slate-200 sm:grid-cols-2">
        {MERITS.map((m, i) => (
          <li key={m.title} className={`flex gap-3 bg-white px-4 py-4${MERITS.length % 2 === 1 && i === MERITS.length - 1 ? ' sm:col-span-2' : ''}`}>
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-white" style={{ background: BLUE }}>{m.icon}</span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-[15.5px] font-black" style={{ color: NAVY }}>{m.title}</span>
                {m.tag && <span className="bg-rose-600 px-1.5 py-0.5 text-[11px] font-black text-white">{m.tag}</span>}
                {m.soon && <span className="bg-amber-400 px-1.5 py-0.5 text-[11px] font-black text-slate-900">{m.soon}</span>}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-600">{m.body}</span>
              {m.more && (
                <a href={links.fukues(m.more)} className="mt-1 inline-block text-[12.5px] font-bold hover:underline" style={{ color: BLUE }}>くわしく →</a>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* 料金とお申し込み */}
      <div className="px-4 py-5 text-center sm:px-6">
        <p className="text-[13px] text-slate-500">4ヶ月目から</p>
        <p className="text-[18px] font-black sm:text-[20px]" style={{ color: NAVY }}>フクエスCRM <span className="whitespace-nowrap">{SET_PLAN_PRICE_LABEL}</span></p>
        <p className="mt-1 text-[12px] text-slate-500">コネックエフ・QR コードスタンド・フクエスポイント加盟店への参加は、この中に含まれます。</p>
        <a
          href={links.fukues('/mypage?tab=support&apply=crm')}
          className="mt-4 block py-3.5 text-[17px] font-black text-white shadow-md hover:opacity-95"
          style={{ background: `linear-gradient(to right, ${NAVY}, ${BLUE})` }}
        >
          3ヶ月無料で始める（運営に申し込む）
        </a>
      </div>
    </section>
  );
}
