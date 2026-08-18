import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  HpDiaryView,
  HpInfoView,
  HpNewsView,
  HpScheduleView,
  HpSystemView,
  HpTermsView,
  HpTherapistView,
  HpVoiceView,
  isHpDiaryOpen,
  isHpInfoOpen,
  isHpNewsOpen,
  isHpScheduleOpen,
  isHpSystemOpen,
  isHpTermsOpen,
  isHpTherapistOpen,
  isHpVoiceOpen,
} from '@/app/hp/_templates/subpages';
import type { HpPageData } from '@/app/hp/_lib/data';
import { buildHpPreview, HpPreviewFrame } from '../previewShared';

// デザインプレビューの【下層ページ】（2026-08-11）。
//
// /hp/{key}/preview/{ひな形}/{カラー}/{ページ} で、マルチページの下層ページを
// 指定の配色のまま見せる。これが無いと、ワインレッドのプレビューからメニューを開いた
// 瞬間に実ページ（＝店のDB上の配色＝シャンパンゴールド）へ飛んでしまう。
//
// ★ 中身は実ページとまったく同じ View（_templates/subpages.tsx）を使う。
//   ここでJSXを書き写すと、実ページを直したときにプレビューだけ古くなる。
// ★ 表示条件（isHpXxxOpen）も実ページと同じものを通す＝存在しないページは404。
// - force-dynamic・noindex はトップのプレビューと同じ（previewShared 参照）。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'デザインプレビュー',
  robots: { index: false, follow: false },
};

/** URLの {ページ} → 表示条件と中身。ここに無いセグメントは404。 */
const PREVIEW_PAGES: Record<
  string,
  { isOpen: (data: HpPageData) => boolean; View: (props: { data: HpPageData; preview?: boolean }) => React.ReactNode }
> = {
  therapist: { isOpen: isHpTherapistOpen, View: HpTherapistView },
  system:    { isOpen: isHpSystemOpen,    View: HpSystemView },
  news:      { isOpen: isHpNewsOpen,      View: HpNewsView },
  // 出勤スケジュール（2026-08-18 第23便）
  schedule:  { isOpen: isHpScheduleOpen,  View: HpScheduleView },
  diary:     { isOpen: isHpDiaryOpen,     View: HpDiaryView },
  voice:     { isOpen: isHpVoiceOpen,     View: HpVoiceView },
  info:      { isOpen: isHpInfoOpen,      View: HpInfoView },
  terms:     { isOpen: isHpTermsOpen,     View: HpTermsView },
};

export default async function HpPreviewSubPage({
  params,
}: {
  params: Promise<{ slug: string; template: string; color: string; page: string }>;
}) {
  const { slug, template, color, page } = await params;
  const entry = PREVIEW_PAGES[page];
  if (!entry) notFound();

  const { data, backHref, backLabel, bannerText } = await buildHpPreview(slug, template, color);
  if (!entry.isOpen(data)) notFound();

  const { View } = entry;
  return (
    <HpPreviewFrame bannerText={bannerText} backHref={backHref} backLabel={backLabel}>
      <View data={data} preview />
    </HpPreviewFrame>
  );
}
