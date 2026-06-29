import Link from 'next/link';
import { VerifiedBadge } from './VerifiedBadge';
import type { FollowUser } from './xFollows';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
};

// フォロワー／フォロー中の一覧表示（共通）。各行タップでそのユーザーのプロフィールへ。
// 行の作法は検索結果（XSearch のユーザー行）に揃える：アバター・名前・認証/種別/所属バッジ。
// 背景は /x レイアウトのテーマ（グラデ/白）。見出し・戻る・空文言は x-rescue-muted で両テーマ可読。
export function XFollowList({
  targetHandle,
  title,
  users,
  emptyText,
}: {
  targetHandle: string;
  title: string;
  users: FollowUser[];
  emptyText: string;
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

      {users.length === 0 ? (
        <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Link
              key={u.id}
              href={`/x/u/${u.handle}`}
              className="x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition"
            >
              <span className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt={u.displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-bold">{u.displayName.charAt(0) || '?'}</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-sm text-slate-900 truncate max-w-[50%]">{u.displayName}</span>
                  {(u.kind === 'shop' || u.kind === 'therapist') && u.isVerified && <VerifiedBadge kind={u.kind} />}
                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                    {KIND_LABEL[u.kind] ?? u.kind}
                  </span>
                  {u.affiliatedShop && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 truncate max-w-[45%]">
                      {u.affiliatedShop.displayName}所属
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 truncate">@{u.handle}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
