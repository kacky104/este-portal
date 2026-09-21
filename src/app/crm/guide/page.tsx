import type { Metadata } from 'next';
import { CRM_FAQ_TEXT, CRM_GUIDE_TEXT } from '@/app/lib/crm/guideText';
import { GuideView } from './GuideView';

// フクエスCRM 使い方（取扱説明書）とよくある質問（第648便・2026-09-22）。★ fukuescrm.com/guide。ログイン不要（お店のスタッフが読む）。
export const metadata: Metadata = { title: 'フクエスCRM 使い方・よくある質問', robots: { index: false, follow: false } };

export default function CrmGuidePage() {
  return <GuideView guide={CRM_GUIDE_TEXT} faq={CRM_FAQ_TEXT} />;
}
