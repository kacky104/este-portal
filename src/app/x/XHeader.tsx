'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { getSession, onAuthChange, signOut } from '@/lib/auth';
import { createClient } from '@/app/lib/supabase/client';
import { ADMIN_UUID } from '@/app/lib/admin';
import { VerifiedBadge } from './VerifiedBadge';
import { XThemeToggle } from './XThemeToggle';

const supabase = createClient();

type MyProfile = {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: 'user' | 'therapist' | 'shop';
  is_verified: boolean;
  status: string;
};

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };

// 既存タイムライン/プロフィールのアバター作法に合わせたフォールバック：
// avatar_url があれば画像、無ければ display_name 先頭文字＋インディゴ系グラデ背景。
// ゲスト（未ログイン/未開設）は人物アイコン。
function Avatar({ profile, size = 36 }: { profile: MyProfile | null; size?: number }) {
  const dim = { width: size, height: size };
  return (
    <span
      className="relative rounded-full overflow-hidden border border-slate-200 shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center"
      style={dim}
    >
      {profile?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
      ) : profile ? (
        <span className="text-white font-bold" style={{ fontSize: size * 0.42 }}>
          {profile.display_name.charAt(0) || '?'}
        </span>
      ) : (
        // ゲスト用の汎用人物アイコン
        <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  );
}

// fukuX ヘッダー（3カラム）＋左スライドインのドロワーメニュー。
// 左=自分のアバター（ドロワートリガー）／中央=肉球ロゴ（最上部へスムーズスクロール）／右=スペーサー。
export function XHeader() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);

  // セッションの auth_user_id から自分の x_profiles を取得（ドロワーのメニュー出し分けに使用）。
  const load = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setUserId(null);
      setProfile(null);
      return;
    }
    setUserId(uid);
    const { data } = await supabase
      .from('x_profiles')
      .select('handle, display_name, avatar_url, kind, is_verified, status')
      .eq('auth_user_id', uid)
      .maybeSingle();
    setProfile((data as MyProfile | null) ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (mounted) load(s?.user.id);
    });
    const off = onAuthChange((s) => {
      if (mounted) load(s?.user.id);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [load]);

  // ドロワー表示中は body スクロールロック＋Escで閉じる。
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isAdmin = !!userId && userId === ADMIN_UUID;
  const isVerifiedShop = profile?.kind === 'shop' && profile.is_verified;
  const loggedIn = !!userId;

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleLogout = async () => {
    setOpen(false);
    await signOut();
    router.push('/x');
    router.refresh();
  };

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-4 h-14 grid grid-cols-[1fr_auto_1fr] items-center">
          {/* 左：アバター（ドロワーを開く） */}
          <div className="justify-self-start">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="メニューを開く"
              className="rounded-full hover:opacity-90 active:scale-95 transition"
            >
              <Avatar profile={profile} />
            </button>
          </div>

          {/* 中央：肉球ロゴ（クリックで最上部へスムーズスクロール） */}
          <button
            type="button"
            onClick={scrollTop}
            aria-label="トップへスクロール"
            className="justify-self-center flex items-center active:scale-95 transition"
          >
            <Image src="/fukux-mark.png" alt="fukuX" width={36} height={36} priority className="object-contain" />
          </button>

          {/* 右：スペーサー（中央ロゴを視覚的に中央に保つ） */}
          <div className="justify-self-end" aria-hidden />
        </div>
      </header>

      {/* ─── ドロワー（左スライドイン） ─── */}
      <div className={`fixed inset-0 z-[60] ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        {/* オーバーレイ（タップで閉じる） */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 ${
            open ? 'opacity-100' : 'opacity-0'
          }`}
        />
        {/* パネル */}
        <aside
          className={`absolute left-0 top-0 h-full w-[80%] max-w-xs bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
          role="dialog"
          aria-modal="true"
        >
          {/* 上部：ログイン済みなら自分の情報 */}
          {loggedIn && profile ? (
            <Link
              href={`/x/u/${profile.handle}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors"
            >
              <Avatar profile={profile} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <p className="font-bold text-sm text-slate-900 truncate">{profile.display_name}</p>
                  {isVerifiedShop && <VerifiedBadge />}
                </div>
                <p className="text-xs text-slate-400 truncate">@{profile.handle}</p>
                <span className="inline-block mt-1 text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                  {KIND_LABEL[profile.kind] ?? profile.kind}
                </span>
              </div>
            </Link>
          ) : (
            <div className="p-4 border-b border-slate-100">
              <p className="font-black text-base text-slate-900">fukuX</p>
              <p className="text-xs text-slate-400 mt-0.5">メンズエステ専用SNS</p>
            </div>
          )}

          {/* メニュー */}
          <nav className="flex-1 overflow-y-auto p-2">
            {loggedIn && profile ? (
              <>
                <DrawerLink href={`/x/u/${profile.handle}`} onClick={() => setOpen(false)} label="マイプロフィール" />
                <DrawerLink href="/x/settings" onClick={() => setOpen(false)} label="プロフィール編集" />
                {isVerifiedShop && <DrawerLink href="/x/shop" onClick={() => setOpen(false)} label="店舗管理" accent="emerald" />}
                {isAdmin && <DrawerLink href="/x/admin" onClick={() => setOpen(false)} label="運営パネル" accent="indigo" />}
                <div className="my-2 border-t border-slate-100" />
                <DrawerLink href="/" onClick={() => setOpen(false)} label="フクエス本体へ" muted />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  ログアウト
                </button>
              </>
            ) : loggedIn && !profile ? (
              // ログイン済みだが未開設
              <>
                <DrawerLink href="/x/onboarding" onClick={() => setOpen(false)} label="アカウントを開設" accent="indigo" />
                <div className="my-2 border-t border-slate-100" />
                <DrawerLink href="/" onClick={() => setOpen(false)} label="フクエス本体へ" muted />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-3 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  ログアウト
                </button>
              </>
            ) : (
              // 未ログイン
              <>
                <DrawerLink href="/x/login" onClick={() => setOpen(false)} label="ログイン" />
                <DrawerLink href="/x/signup" onClick={() => setOpen(false)} label="新規登録" accent="indigo" />
                <div className="my-2 border-t border-slate-100" />
                <DrawerLink href="/" onClick={() => setOpen(false)} label="フクエス本体へ" muted />
              </>
            )}

            {/* 背景テーマ切替（グラデ⇄白）。未ログインでも操作可。localStorage 保存。 */}
            <div className="my-2 border-t border-slate-100" />
            <XThemeToggle />
          </nav>
        </aside>
      </div>
    </>
  );
}

function DrawerLink({
  href,
  label,
  onClick,
  accent,
  muted,
}: {
  href: string;
  label: string;
  onClick?: () => void;
  accent?: 'indigo' | 'emerald';
  muted?: boolean;
}) {
  const color =
    accent === 'emerald'
      ? 'text-emerald-600'
      : accent === 'indigo'
        ? 'text-indigo-600'
        : muted
          ? 'text-slate-400'
          : 'text-slate-700';
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`block px-3 py-3 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors ${color}`}
    >
      {label}
    </Link>
  );
}
