import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpScheduleView, isHpScheduleOpen } from '@/app/hp/_templates/subpages';

// 出勤スケジュールページ（2026-08-18 第23便）。
//
// - URL: 独自ドメインなら /schedule、暫定URLなら /hp/{slug}/schedule
// - 出る条件: blocks.multipage が true ＋ 7日間のどこかに出勤が1件以上（isHpScheduleOpen）。
//   ★ ブロックの ON/OFF は見ない。他の下層ページと同じで、マルチページ時の ON/OFF は
//     「トップに『本日の出勤』を出すか」だけの意味（2026-08-11 の設計判断を踏襲）。
//   ★ 本日だけで判定しない。「今日は全員休みだが明日から出勤がある」店を404にしないため。
//   中身が無ければ 404（空ページを検索に出さないため）。
// - セラピストの個別ページは公式HP側には作らない。カードのリンク先はフクエス本体の
//   /therapist/{id}（他の下層ページと同じ扱い）。
// - ★ ページの中身は _templates/subpages.tsx（デザインプレビューと共用）。
//
// ★ ISR は他ページと同じ600秒。
//   ここに載る出勤データが変わってから公式HPに出るまで【最大10分かかる】。
//   /api/revalidate は /salon/… と /therapist/… しか無効化しておらず、/hp/… は対象外のため
//   （トップの「本日の出勤」も同じ遅れ方をしている＝この便で増えた問題ではない）。
//   一方、店舗が公式HPの設定を保存したときは hpSitePaths() の全パスが無効化される。
//   そちらには HP_SUBPAGE_SEGMENTS に 'schedule' を足したので、このページも入っている。

export const revalidate = 600;
// ★ Next 16 では revalidate（ISR）を効かせるために空配列の generateStaticParams が要る。
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpScheduleOpen(data)) return HP_NOT_PUBLIC_METADATA;

  const { salon, todayLabel } = data;
  return buildHpMetadata(data, slug, {
    title: `出勤スケジュール｜${salon.name}`,
    description:
      `${salon.name}（${salon.area}）の出勤スケジュールです。` +
      `${todayLabel} から7日間の出勤予定を、日付ごとにご覧いただけます。`,
    path: '/schedule',
  });
}

export default async function HpSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpScheduleOpen(data)) notFound();
  return <HpScheduleView data={data} />;
}
