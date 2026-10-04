'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getListingAgreementAdmin, type AgreementRecord } from '@/app/actions/listingAgreement';
import { AgreementCopy } from '@/app/components/agreement/AgreementCopy';

// 管理画面: 申込書・誓約書の控え1件（第1174便）。★ 認可は /admin/layout.tsx ＋ action の requireAdmin。★ 印刷できる。

export default function AgreementAdminViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [record, setRecord] = useState<AgreementRecord | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    void getListingAgreementAdmin(Number(id)).then((res) => {
      if (!alive) return;
      if (!res.ok) setErr(res.error); else setRecord(res.record);
    });
    return () => { alive = false; };
  }, [id]);

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-3 sm:px-4 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto">
        <div className="mb-3 flex items-center gap-3 print:hidden">
          <Link href="/admin/agreements" className="text-[13px] font-bold text-pink-600 underline">← 一覧へ</Link>
          <button type="button" onClick={() => window.print()} className="ml-auto bg-pink-600 px-5 py-2 text-[13.5px] font-bold text-white hover:opacity-95">印刷する</button>
        </div>
        {err && <p className="bg-white border border-slate-200 p-6 text-center text-[14px] font-bold text-rose-600">{err}</p>}
        {!err && !record && <p className="py-16 text-center text-[14px] text-slate-400">読み込み中…</p>}
        {record && <AgreementCopy record={record} />}
      </div>
    </main>
  );
}
