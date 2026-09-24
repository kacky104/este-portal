import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMyInvoice } from '@/app/actions/billingOwner';
import { InvoiceSheet } from '@/app/components/billing/InvoiceSheet';
import { PrintButton } from '@/app/components/billing/PrintButton';

// 店舗マイページ「ご請求書」1通（第816便）。★ 印刷・PDFで保存はブラウザの印刷から（A4 1枚）。
export const dynamic = 'force-dynamic';

export default async function MyInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const r = await getMyInvoice(n);
  // ★ 第820便: 見られないときは 404 ではなく理由を出す（★ 別のアカウントでログインしていると見えない）
  if (!r.ok) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-xl mx-auto px-4 py-10 text-sm">
          <p className="bg-white border border-slate-200 p-5 text-slate-700">{r.error}</p>
          <Link href="/mypage/invoices" className="inline-block mt-4 text-pink-600 underline">ご請求書の一覧へ</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <style>{`@page { size: A4; margin: 14mm; }`}</style>
      <div className="max-w-[860px] mx-auto px-4 py-6 print:p-0">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Link href="/mypage/invoices" className="text-sm text-pink-600 underline">ご請求書の一覧へ</Link>
          <PrintButton />
        </div>
        <InvoiceSheet invoice={r.invoice} issuer={r.issuer} />
        <p className="text-xs text-slate-500 mt-3 print:hidden">※「印刷・PDFで保存」を押し、送信先で「PDFに保存」を選ぶとPDFにできます。</p>
      </div>
    </div>
  );
}
