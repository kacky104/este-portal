import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';
import { CRM_DATA_TEXT } from '@/app/lib/crm/termsText';
import { TermsView } from '../TermsView';

// フクエスCRM 顧客データの取り扱い（第569便）。★ CRM_TERMS_VERSION が null のあいだは公開しない（404）。
export const metadata: Metadata = { title: 'フクエスCRM 顧客データの取り扱い｜フクエス', robots: { index: false, follow: false } };

export default function CrmDataPage() {
  if (!CRM_TERMS_VERSION) notFound();
  return <TermsView title="フクエスCRM 顧客データの取り扱い" text={CRM_DATA_TEXT} />;
}
