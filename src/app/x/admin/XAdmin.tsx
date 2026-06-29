'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { XTimeAgo } from '../XTimeAgo';
import { VerifiedBadge } from '../VerifiedBadge';

const supabase = createClient();

export type ShopRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  status: string;
  created_at: string;
};
export type ModPost = {
  id: string;
  body: string | null;
  images: string[];
  createdAt: string;
  authorHandle: string;
  authorName: string;
};
export type ModProfile = {
  id: string;
  handle: string;
  display_name: string;
  kind: string;
  status: string;
  is_verified: boolean;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };

export function XAdmin({
  shops: initialShops,
  posts: initialPosts,
  profiles: initialProfiles,
  emails,
}: {
  shops: ShopRow[];
  posts: ModPost[];
  profiles: ModProfile[];
  emails: Record<string, string>; // profile.id → ログインメール（運営のみ・/x/admin 限定で表示）
}) {
  const [tab, setTab] = useState<'verify' | 'accounts' | 'posts'>('verify');
  const [shops, setShops] = useState(initialShops);
  const [posts, setPosts] = useState(initialPosts);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  };

  // 認証バッジ付与/解除：x_profiles.is_verified を更新（運営は通常クライアントで RLS/ガードトリガを通過）。
  const setVerified = async (id: string, value: boolean) => {
    if (busy) return;
    setBusy(id);
    const { error } = await supabase.from('x_profiles').update({ is_verified: value }).eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`更新に失敗しました：${error.message}`);
      return;
    }
    setShops((list) => list.map((s) => (s.id === id ? { ...s, is_verified: value } : s)));
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, is_verified: value } : p)));
    showToast(value ? '認証バッジを付与しました' : '認証バッジを解除しました');
  };

  // BAN(凍結)/解除：status を 'rejected' / 'approved' に。全 kind 対象。
  const setBanned = async (id: string, name: string, ban: boolean) => {
    if (busy) return;
    if (ban && !window.confirm(`「${name}」を凍結（BAN）しますか？\n投稿・フォロー不可になり、他ユーザーから見えなくなります。`)) return;
    setBusy(id);
    const { error } = await supabase
      .from('x_profiles')
      .update({ status: ban ? 'rejected' : 'approved' })
      .eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`更新に失敗しました：${error.message}`);
      return;
    }
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, status: ban ? 'rejected' : 'approved' } : p)));
    setShops((list) => list.map((s) => (s.id === id ? { ...s, status: ban ? 'rejected' : 'approved' } : s)));
    showToast(ban ? '凍結しました' : '凍結を解除しました');
  };

  const deletePost = async (id: string) => {
    if (busy) return;
    if (!window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。')) return;
    setBusy(id);
    const { error } = await supabase.from('x_posts').delete().eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`削除に失敗しました：${error.message}`);
      return;
    }
    setPosts((list) => list.filter((p) => p.id !== id));
    showToast('投稿を削除しました');
  };

  const deleteProfile = async (id: string, name: string) => {
    if (busy) return;
    if (!window.confirm(`プロフィール「${name}」を削除しますか？\nこの操作は取り消せません（投稿等も連動して消える場合があります）。`)) return;
    setBusy(id);
    const { error } = await supabase.from('x_profiles').delete().eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`削除に失敗しました：${error.message}`);
      return;
    }
    setProfiles((list) => list.filter((p) => p.id !== id));
    setShops((list) => list.filter((s) => s.id !== id));
    showToast('プロフィールを削除しました');
  };

  const shownShops = onlyUnverified ? shops.filter((s) => !s.is_verified) : shops;

  return (
    <div className="x-card my-6 p-5 rounded-2xl bg-white/[0.94] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-black tracking-tight mb-1">運営パネル</h1>
      <p className="text-xs text-slate-400 mb-4">fukuX の認証バッジ・凍結・モデレーション</p>

      {/* タブ */}
      <div className="flex gap-1 p-1 mb-5 rounded-xl bg-slate-100">
        {(
          [
            ['verify', '認証'],
            ['accounts', 'アカウント'],
            ['posts', '投稿'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 認証バッジ管理（店舗） ── */}
      {tab === 'verify' && (
        <div>
          <label className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-500 select-none">
            <input type="checkbox" checked={onlyUnverified} onChange={(e) => setOnlyUnverified(e.target.checked)} />
            未認証の店舗だけ表示
          </label>
          <div className="space-y-2">
            {shownShops.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-12">該当する店舗はありません</p>
            ) : (
              shownShops.map((s) => (
                <div key={s.id} className="border border-slate-200 rounded-2xl p-3 flex items-center gap-3">
                  <span className="relative w-11 h-11 rounded-full overflow-hidden border border-slate-100 bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatar_url} alt={s.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{s.display_name.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/x/u/${s.handle}`} className="font-bold text-sm text-slate-900 hover:underline truncate">
                        {s.display_name}
                      </Link>
                      {s.is_verified && <VerifiedBadge />}
                      {s.status === 'rejected' && (
                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 rounded-full px-1.5 py-0.5">凍結中</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">@{s.handle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerified(s.id, !s.is_verified)}
                    disabled={busy === s.id}
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      s.is_verified
                        ? 'border border-slate-200 text-slate-500 hover:border-rose-200 hover:text-rose-500'
                        : 'text-white'
                    }`}
                    style={s.is_verified ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                  >
                    {s.is_verified ? '認証解除' : '認証付与'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── アカウント（BAN/凍結・削除） ── */}
      {tab === 'accounts' && (
        <div className="divide-y divide-slate-100">
          {profiles.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">プロフィールはありません</p>
          ) : (
            profiles.map((p) => {
              const banned = p.status === 'rejected';
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/x/u/${p.handle}`} className="font-bold text-sm text-slate-900 hover:underline truncate">
                        {p.display_name}
                      </Link>
                      {(p.kind === 'shop' || p.kind === 'therapist') && p.is_verified && <VerifiedBadge kind={p.kind} />}
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                        {KIND_LABEL[p.kind] ?? p.kind}
                      </span>
                      {banned && (
                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 rounded-full px-1.5 py-0.5">凍結中</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">@{p.handle}</p>
                    {/* ログインメール（運営パネル限定表示）。未取得時は — */}
                    <p className="text-[11px] text-slate-400 break-all mt-0.5">
                      ✉ {emails[p.id] ?? '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBanned(p.id, p.display_name, !banned)}
                    disabled={busy === p.id}
                    className={`flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
                      banned
                        ? 'border border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100'
                    }`}
                  >
                    {banned ? '凍結解除' : '凍結'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProfile(p.id, p.display_name)}
                    disabled={busy === p.id}
                    className="flex-shrink-0 px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── 投稿モデレーション ── */}
      {tab === 'posts' && (
        <div className="divide-y divide-slate-100">
          {posts.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">投稿はありません</p>
          ) : (
            posts.map((p) => (
              <div key={p.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-400">
                    <span className="font-bold text-slate-600">{p.authorName}</span> @{p.authorHandle} ·{' '}
                    <XTimeAgo iso={p.createdAt} />
                  </p>
                  {p.body && <p className="text-sm text-slate-800 mt-0.5 break-words line-clamp-3">{p.body}</p>}
                  {p.images.length > 0 && <p className="text-[11px] text-slate-400 mt-0.5">🖼 画像{p.images.length}枚</p>}
                </div>
                <button
                  type="button"
                  onClick={() => deletePost(p.id)}
                  disabled={busy === p.id}
                  className="flex-shrink-0 px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
