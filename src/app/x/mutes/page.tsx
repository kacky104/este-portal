import Link from 'next/link';
import { getXContext } from '../xProfile';
import { fetchMyModeratedUsers } from '../xModerationData';
import { XModerationList } from '../XModerationList';

// 自分のミュート一覧（プライベート）を読むため動的レンダリング。
export const dynamic = 'force-dynamic';

// 本人専用ページのため検索インデックス対象外。
export const metadata = { robots: { index: false, follow: false } };

export default async function XMutesPage() {
  const { userId, profile } = await getXContext();

  if (!userId || !profile) {
    return (
      <div className="py-3">
        <Link href="/x" className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2">
          ← もどる
        </Link>
        <h1 className="x-rescue-muted text-base font-black text-white drop-shadow-sm mb-3">ミュートしたアカウント</h1>
        <div className="x-card rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)] p-5 text-center">
          <p className="text-sm font-bold text-[color:var(--x-text-primary)]">ミュートはアカウント機能です。ログインしてご利用ください。</p>
        </div>
      </div>
    );
  }

  const users = await fetchMyModeratedUsers(profile.id, 'mute');

  return (
    <div className="py-3">
      <Link href="/x" className="x-rescue-muted inline-flex items-center gap-1 text-sm font-bold text-white/90 drop-shadow-sm mb-2">
        ← もどる
      </Link>
      <h1 className="x-rescue-muted text-base font-black text-white drop-shadow-sm mb-1">ミュートしたアカウント</h1>
      <p className="x-rescue-muted text-[11px] text-white/80 drop-shadow-sm mb-3">ミュートは相手との関係はそのまま・自分にだけ見えなくする機能です。アカウントをタップすると解除できます。</p>
      <XModerationList mode="mute" users={users} />
    </div>
  );
}
