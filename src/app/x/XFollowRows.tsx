import Link from 'next/link';
import { VerifiedBadge } from './VerifiedBadge';
import { XSukiButton } from './XSukiButton';
import type { FollowUser } from './xFollows';

const KIND_LABEL: Record<string, string> = {
  user: 'ユーザー',
  therapist: 'セラピスト',
  shop: 'お店',
};

// フォロー一覧の「行リスト」だけを描画する共通部品（見出し・戻る等は含まない）。
// フォロワー／フォロー中ページ（XFollowList）と、セラピストのタイムライン内タブの両方で流用。
// 行の作法は検索結果（XSearch のユーザー行）に揃える：アバター・名前・認証/種別/所属バッジ。
//
// sukiEnabled が true のとき（フォロワーページを本人＝セラピストが見たとき）だけ、各行の右に唇ボタンを出す。
// 既定（following ページ・タイムライン内タブ等）は false＝従来表示のまま。
// ボタンは <Link> の内側に置くと anchor>button のネストになり不正なので、行を相対配置にして上にかぶせる。
export function XFollowRows({
  users,
  emptyText,
  sukiEnabled = false,
  initialSukiIds = [],
}: {
  users: FollowUser[];
  emptyText: string;
  sukiEnabled?: boolean;
  initialSukiIds?: string[];
}) {
  if (users.length === 0) {
    return <p className="x-rescue-muted text-sm text-white/90 text-center py-10 drop-shadow-sm">{emptyText}</p>;
  }
  const sukiSet = new Set(initialSukiIds);
  return (
    <div className="space-y-2">
      {users.map((u) => {
        // フォロワーは元々 user/shop のみだが念のためガード（therapist へはスキ不可）。
        const showSuki = sukiEnabled && (u.kind === 'user' || u.kind === 'shop');
        const row = (
          <Link
            href={`/x/u/${u.handle}`}
            className={`x-card flex items-center gap-3 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-3 hover:brightness-[0.98] transition ${
              showSuki ? 'pr-20' : ''
            }`}
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
        );
        if (!showSuki) return <div key={u.id}>{row}</div>;
        return (
          <div key={u.id} className="relative">
            {row}
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <XSukiButton targetProfileId={u.id} initialSuki={sukiSet.has(u.id)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
