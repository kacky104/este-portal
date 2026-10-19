import { redirect } from 'next/navigation';

// ★ 第1581便（2026-10-20・カッキーさん）: お知らせ・新着は VIPレターのページにまとめた。
//   古いリンク・ブックマークはそちらのお知らせの位置へ送る（既読化もそちらで行う）。
export const dynamic = 'force-dynamic';

export default function NotificationsPage() {
  redirect('/member/vip-letters#notifications');
}
