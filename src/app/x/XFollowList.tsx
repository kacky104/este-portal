import Link from 'next/link';
import { XFollowRows } from './XFollowRows';
import type { FollowUser } from './xFollows';

// フォロワー／フォロー中の一覧ページ（共通）。各行タップでそのユーザーのプロフィールへ。
// 行リストの描画は XFollowRows に共通化（セラピストのタイムライン内タブと流用）。
// 背景は /x レイアウトのテーマ（グラデ/白）。見出し・戻る・空文言は x-rescue-muted で両テーマ可読。
export function XFollowList({
  targetHandle,
  title,
  users,
  emptyText,
  sukiEnabled = false,
  initialSukiIds = [],
}: {
  targetHandle: string;
  title: string;
  users: FollowUser[];
  emptyText: string;
  sukiEnabled?: boolean;
  initialSukiIds?: string[];
}) {
  return (
    <div className="py-3">
      <Link
        href={`/x/u/${targetHandle}`}
        className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2"
      >
        ← もどる
      </Link>
      <h1 className="x-rescue-muted text-base font-black text-white drop-shadow-sm mb-3">{title}</h1>

      <XFollowRows users={users} emptyText={emptyText} sukiEnabled={sukiEnabled} initialSukiIds={initialSukiIds} />
    </div>
  );
}
