import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';
import { CRM_TERMS_TEXT } from '@/app/lib/crm/termsText';
import { TermsView } from '../TermsView';

// フクエスCRM 利用規約（店舗向け特則）（第569便）。★ CRM_TERMS_VERSION が null のあいだは公開しない（404）。
export const metadata: Metadata = { title: 'フクエスCRM 利用規約｜フクエス', robots: { index: false, follow: false } };

export default function CrmTermsPage() {
  if (!CRM_TERMS_VERSION) notFound();
  return <TermsView title="フクエスCRM 利用規約（店舗向け）" text={CRM_TERMS_TEXT} />;
}
