'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { getSession, onAuthChange, signOut } from '@/lib/auth';
import { createClient } from '@/app/lib/supabase/client';
import { ADMIN_UUID } from '@/app/lib/admin';
import { VerifiedBadge } from './VerifiedBadge';
import { XThemeToggle } from './XThemeToggle';
import { XLogo } from './XLogo';
import { fetchShopMiniByIds } from './xAffiliation';
import { NOTIF_READ_EVENT } from './xNotificationsShared';
import { DM_READ_EVENT } from './xDmShared';

const supabase = createClient();

type MyProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  kind: 'user' | 'therapist' | 'shop';
  is_verified: boolean;
  status: string;
  affiliated_shop_id: string | null;
};

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };
// 種別バッジの基調色（オンボーディングと統一：ユーザー=青/セラピスト=赤/お店=黄）。
// 黄は薄色だと読みにくいので濃いめアンバー地＋濃色文字で可読性を確保。
const KIND_BADGE: Record<string, string> = {
  user: 'bg-blue-50 text-blue-700',
  therapist: 'bg-rose-50 text-rose-700',
  shop: 'bg-amber-100 text-amber-800',
};

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
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null); // ログイン中のメール（ドロワー本人確認用）
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [affiliatedShop, setAffiliatedShop] = useState<{ handle: string; displayName: string } | null>(null);
  const [unread, setUnread] = useState(0); // 通知の未読件数（ベルの赤バッジ用）
  const [dmUnread, setDmUnread] = useState(0); // DMの未読総数（封筒の赤バッジ用）

  // セッションの auth_user_id から自分の x_profiles を取得（ドロワーのメニュー出し分けに使用）。
  // email はセッションから受け取り、所属先（セラピストのみ）はバッジ表示用に解決する。
  const load = useCallback(async (uid: string | undefined, mail: string | null) => {
    if (!uid) {
      setUserId(null);
      setEmail(null);
      setProfile(null);
      setAffiliatedShop(null);
      setUnread(0);
      setDmUnread(0);
      return;
    }
    setUserId(uid);
    setEmail(mail);
    const { data } = await supabase
      .from('x_profiles')
      .select('id, handle, display_name, avatar_url, kind, is_verified, status, affiliated_shop_id')
      .eq('auth_user_id', uid)
      .maybeSingle();
    const p = (data as MyProfile | null) ?? null;
    setProfile(p);
    if (p && p.kind === 'therapist' && p.affiliated_shop_id) {
      const dict = await fetchShopMiniByIds(supabase, [p.affiliated_shop_id]);
      const s = dict.get(p.affiliated_shop_id);
      setAffiliatedShop(s ? { handle: s.handle, displayName: s.displayName } : null);
    } else {
      setAffiliatedShop(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    getSession().then((s) => {
      if (mounted) load(s?.user.id, s?.user.email ?? null);
    });
    const off = onAuthChange((s) => {
      if (mounted) load(s?.user.id, s?.user.email ?? null);
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

  // 未読件数の取得（recipient=自分・is_read=false の count）。時間/ログイン依存のためクライアントでマウント時に取得し、
  // 画面遷移（pathname 変化）のたびに再取得する。Realtime購読はしない（将来拡張）。
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) {
      setUnread(0);
      return;
    }
    let alive = true;
    (async () => {
      const { count } = await supabase
        .from('x_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_profile_id', profileId)
        .eq('is_read', false);
      if (alive) setUnread(count ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, [profileId, pathname]);

  // 通知一覧ページで一括既読化したら、即座にバッジを消す（遷移を待たずに 0 化）。
  useEffect(() => {
    const clear = () => setUnread(0);
    window.addEventListener(NOTIF_READ_EVENT, clear);
    return () => window.removeEventListener(NOTIF_READ_EVENT, clear);
  }, []);

  // DM未読総数（x_unread_dm_count RPC）。通知バッジと同方針でマウント時＋遷移時に取得。
  // 1会話の既読では全体が0とは限らないため、DM_READ_EVENT では set(0) ではなく再取得する。
  const fetchDmCount = useCallback(async () => {
    if (!profileId) {
      setDmUnread(0);
      return;
    }
    const { data } = await supabase.rpc('x_unread_dm_count');
    setDmUnread(typeof data === 'number' ? data : 0);
  }, [profileId]);
  useEffect(() => {
    fetchDmCount();
  }, [fetchDmCount, pathname]);
  useEffect(() => {
    const refetch = () => fetchDmCount();
    window.addEventListener(DM_READ_EVENT, refetch);
    return () => window.removeEventListener(DM_READ_EVENT, refetch);
  }, [fetchDmCount]);

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

          {/* 右：検索（誰でも）＋通知ベル（ログイン＋開設済みのみ）。grid 1fr/auto/1fr のため中央ロゴは保たれる。 */}
          <div className="justify-self-end flex items-center gap-0.5">
            {/* ユーザー検索（公開・要ログインなし） */}
            <Link
              href="/x/search"
              aria-label="ユーザーを検索"
              className="flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </Link>

            {/* DM（ログイン＋開設済みのみ）。未読総数>0で赤バッジ。 */}
            {profile && (
              <Link
                href="/x/messages"
                aria-label={dmUnread > 0 ? `メッセージ（未読${dmUnread}件）` : 'メッセージ'}
                className="relative flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
              >
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-10 5L2 7" />
                </svg>
                {dmUnread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-sm">
                    {dmUnread > 99 ? '99+' : dmUnread}
                  </span>
                )}
              </Link>
            )}

            {profile && (
              <Link
                href="/x/notifications"
                aria-label={unread > 0 ? `通知（未読${unread}件）` : '通知'}
                className="relative flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums shadow-sm">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
            )}
          </div>
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
          {/* 上部ヘッダー（ドロワーは常時白地）：①ロゴ＋キャッチ（常時）②@handle＋バッジ ③メール（ログイン時） */}
          <div className="p-4 border-b border-slate-100">
            {/* ①ロゴ＋キャッチ。ロゴタップで /x へ＝ドロワーを閉じる。 */}
            <div className="flex items-center gap-2 flex-wrap">
              <span onClick={() => setOpen(false)} className="inline-flex">
                <XLogo size="md" />
              </span>
              <span className="text-[11px] text-slate-400 font-medium">～メンズエステ専用SNS～</span>
            </div>

            {/* ②@handle＋種別/認証/所属バッジ（開設済みのみ） */}
            {loggedIn && profile && (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <span className="text-xs font-bold text-slate-500 truncate max-w-[45%]">@{profile.handle}</span>
                <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${KIND_BADGE[profile.kind] ?? 'bg-slate-100 text-slate-600'}`}>
                  {KIND_LABEL[profile.kind] ?? profile.kind}
                </span>
                {isVerifiedShop && <VerifiedBadge />}
                {affiliatedShop && (
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5 py-0.5 truncate max-w-[45%]">
                    {affiliatedShop.displayName}所属
                  </span>
                )}
              </div>
            )}

            {/* ③ログイン中メール（本人確認用・はみ出さないよう truncate） */}
            {loggedIn && email && <p className="text-[11px] text-slate-400 mt-1 truncate">{email}</p>}
          </div>

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
