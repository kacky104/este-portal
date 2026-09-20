'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { agreeCrmTerms, getCrmAccess } from '@/app/actions/crm';
import type { CrmAccess } from '@/app/lib/crm/types';

// フクエスCRM の外枠（2026-09-19）。★ 画面が増えても、入口の判定と上の帯はここ1か所。
//   ・未ログイン → オーナーログインへ
//   ・未契約 → 「有料機能です」のご案内だけ（★ 中身はサーバーも返さない）
//   ・契約中 → 上の帯（スケジュール／顧客台帳）＋中身
// ★ 運営（ADMIN）は ?salon=店舗ID で、その店を確認できる（タブを移っても ?salon を引き継ぐ）。

export type CrmNavKey = 'schedule' | 'customers' | 'bookings' | 'reports' | 'money' | 'stats' | 'prices' | 'settings';

const NAV: Array<{ key: CrmNavKey; label: string; href: string }> = [
  { key: 'schedule', label: 'スケジュール', href: '/mypage/crm' },
  { key: 'customers', label: '顧客台帳', href: '/mypage/crm/customers' },
  { key: 'bookings', label: '予約一覧', href: '/mypage/crm/bookings' },
  { key: 'reports', label: '日報', href: '/mypage/crm/reports' },
  { key: 'money', label: '金銭授受', href: '/mypage/crm/money' },
  { key: 'stats', label: 'レポート', href: '/mypage/crm/stats' },
  { key: 'prices', label: '料金設定', href: '/mypage/crm/prices' },
  { key: 'settings', label: '設定', href: '/mypage/crm/settings' },
];

/** 入口の判定（契約・店舗）。★ ページごとに書かない */
export function useCrmAccess(): { access: CrmAccess | null; adminSalonQuery: string } {
  const [access, setAccess] = useState<CrmAccess | null>(null);
  const [adminSalonQuery, setAdminSalonQuery] = useState('');
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const adminSalon = Number(sp.get('salon') ?? '') || undefined;
    getCrmAccess(adminSalon).then((a) => {
      if (!a.ok && a.needLogin) {
        window.location.href = '/owner/login?redirectTo=' + encodeURIComponent(window.location.pathname);
        return;
      }
      if (a.ok && a.isAdmin && adminSalon) setAdminSalonQuery(`?salon=${adminSalon}`);
      setAccess(a);
    });
  }, []);
  return { access, adminSalonQuery };
}

function Upsell({ salonName }: { salonName: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="border border-indigo-200 bg-white p-6 shadow-sm">
        <p className="text-[12px] font-bold text-indigo-500">{salonName}</p>
        <h2 className="mt-1 text-[20px] font-black text-slate-800">フクエスCRMは有料機能です</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
          予約ボードは今までどおり無料でお使いいただけます。フクエスCRMをお申し込みいただくと、
          次のことができるようになります。
        </p>
        <ul className="mt-3 space-y-1.5 text-[14px] text-slate-700">
          <li>・その日の出勤と予約を、お客様の情報（分類・要注意・女子NG・利用回数）つきで一覧する</li>
          <li>・電話番号で同じお客様をまとめ、利用回数・キャンセル回数・最終利用日を見る</li>
          <li>・分類（一般／会員／常連／VIP／NG）・女子NG・要注意メモを残す</li>
          <li>・悪質キャンセル（無断キャンセルなど）を記録する</li>
          <li>・お客様ごとの予約の履歴を見る</li>
        </ul>
        <p className="mt-4 border-l-4 border-indigo-300 bg-indigo-50 px-3 py-2 text-[13px] leading-relaxed text-indigo-900">
          予約ボード・ネット予約に入ったお客様は、今も自動で記録されています。
          お申し込みいただくと、これまでの記録もすぐにご覧いただけます。
        </p>
        <p className="mt-4 text-[13px] text-slate-500">お申し込み・料金は運営事務局までお問い合わせください。</p>
        <Link href="/mypage" className="mt-5 inline-block bg-slate-800 px-4 py-2 text-[13px] font-bold text-white">
          マイページへ戻る
        </Link>
      </div>
    </div>
  );
}

export function CrmShell({
  access, adminSalonQuery, current, children,
}: {
  access: CrmAccess | null;
  adminSalonQuery: string;
  current: CrmNavKey;
  children: (a: Extract<CrmAccess, { ok: true }>) => React.ReactNode;
}) {
  if (!access) return <p className="p-10 text-center text-[14px] text-slate-400">読み込み中です…</p>;
  if (!access.ok) return <p className="whitespace-pre-line p-10 text-center text-[14px] text-slate-500">{access.error}</p>;

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#1e2a5a] text-white shadow">
        <div className="flex items-center gap-2 px-3 pt-1.5 md:gap-3 md:px-4 md:pt-3">
          <span className="text-[14px] font-black tracking-wide md:text-[17px]">フクエスCRM</span>
          <span className="truncate text-[11px] text-indigo-200 md:text-[12px]">{access.salonName}</span>
          {access.isAdmin && <span className="bg-amber-400 px-1.5 py-0.5 text-[11px] font-bold text-slate-900">運営で表示中</span>}
          <span className="ml-auto hidden text-[12px] text-indigo-200 sm:inline">
            {/* ★ ON/OFF 運用（9999-12-31＝期限なし）では何も出さない。期限つきのときだけ出す。 */}
            {access.crmUntil && !access.crmUntil.startsWith('9999') ? `ご契約：${access.crmUntil.replaceAll('-', '/')} まで` : ''}
          </span>
        </div>
        {access.active ? (
          <nav className="mt-1 flex gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] md:mt-2 md:gap-1 md:px-3">
            {/* ★ スマホでタブが収まらないときは横にすべらせる（第541便） */}
            {NAV.map((n) => (
              <Link
                key={n.key}
                href={n.href + adminSalonQuery}
                className={`flex-none whitespace-nowrap px-2.5 py-1.5 text-[12px] font-bold md:px-4 md:py-2 md:text-[14px] ${
                  current === n.key ? 'bg-[#eef1f8] text-[#1e2a5a]' : 'text-indigo-200 hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="h-3" />
        )}
      </header>
      {!access.active ? <Upsell salonName={access.salonName} />
        : !access.termsOk ? <TermsGate salonId={access.salonId} />
        : children(access)}
    </>
  );
}

// 規約への同意（第569便）。★ 版（lib/crm/terms.ts）が決まっていて、まだ同意していない店だけに出る。
function TermsGate({ salonId }: { salonId: number }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const agree = async () => {
    setBusy(true); setErr('');
    const r = await agreeCrmTerms(salonId);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    window.location.reload();
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="border border-indigo-200 bg-white p-6 shadow-sm">
        <h2 className="text-[20px] font-black text-slate-800">フクエスCRMのご利用にあたって</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
          お使いいただく前に、利用規約と顧客データの取り扱いをお読みいただき、同意をお願いします（規約が新しくなったときも、もう一度お願いしています）。
        </p>
        <ul className="mt-3 space-y-1 text-[14px]">
          <li>・<a href="/crm/terms" target="_blank" rel="noopener" className="font-bold text-indigo-600 underline">フクエスCRM 利用規約</a></li>
          <li>・<a href="/crm/data" target="_blank" rel="noopener" className="font-bold text-indigo-600 underline">顧客データの取り扱い</a></li>
        </ul>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-[15px] font-bold">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          利用規約と顧客データの取り扱いに同意します
        </label>
        {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
        <button type="button" disabled={!checked || busy} onClick={agree} className="mt-4 w-full bg-indigo-600 py-3 text-[15px] font-bold text-white disabled:bg-slate-300">
          {busy ? '記録しています…' : '同意して使い始める'}
        </button>
      </div>
    </div>
  );
}
