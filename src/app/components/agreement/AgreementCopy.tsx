'use client';

import { AGREEMENT_VERSION } from '@/lib/listingAgreement';
import type { AgreementRecord } from '@/app/actions/listingAgreement';

// 広告掲載 申込書 兼 誓約書の【控え】（第1174便）。★ サインした時点の文面の写し（body_text）＋記入欄＋サインを1枚に出す。
// ★ 店舗のマイページ（/mypage/agreement）と運営の管理画面（/admin/agreements/[id]）で同じものを使う。
// ★ 印刷はブラウザの印刷（A4）。ボタンなど印刷に要らないものは print:hidden。

function fmtJst(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function AgreementCopy({ record }: { record: AgreementRecord }) {
  const rows: [string, string][] = [
    ['ご記入日', fmtJst(record.signedAt)],
    ['店舗名', record.salonName],
    ['所在地', record.address],
    ['連絡先（電話番号）', record.phone],
    ['メールアドレス', record.email],
    ...(record.companyName ? ([['法人名', record.companyName]] as [string, string][]) : []),
    ['代表者名', record.representative],
  ];
  const [title, ...rest] = record.bodyText.split('\n');
  return (
    <div className="bg-white border border-slate-200 p-4 sm:p-7 text-slate-800 print:border-0 print:p-0">
      {/* 写しの1行目は題名（太字で出す）。残りはそのまま */}
      <h1 className="text-[20px] font-black tracking-tight">{title}</h1>
      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed">{rest.join('\n')}</p>

      <h2 className="mt-6 mb-2 text-[15px] font-black border-l-4 border-pink-500 pl-2.5">誓約者（お申込者）ご記入欄</h2>
      <table className="w-full border-collapse text-[13.5px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border border-slate-300">
              <th className="w-[38%] sm:w-[30%] bg-slate-50 px-3 py-2 text-left font-bold text-slate-600 border-r border-slate-300">{k}</th>
              <td className="px-3 py-2 break-all">{v}</td>
            </tr>
          ))}
          <tr className="border border-slate-300">
            <th className="bg-slate-50 px-3 py-2 text-left font-bold text-slate-600 border-r border-slate-300">サイン</th>
            <td className="px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={record.signaturePng} alt="手書きのサイン" className="block h-auto w-full max-w-[320px]" />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-[11.5px] text-slate-400">
        受付番号 {record.id}・文面の版 {record.version}{record.version !== AGREEMENT_VERSION ? '（いまの版より前のものです）' : ''}・店舗アカウントでログインのうえ電子的にサイン
      </p>
    </div>
  );
}
