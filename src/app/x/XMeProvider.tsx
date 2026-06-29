'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { getSession, onAuthChange } from '@/lib/auth';
import { fetchShopMiniByIds } from './xAffiliation';
import type { XProfile } from './xProfile';

// fukuX の「自分（me）」をクライアントで一元管理する Context。
// /x レイアウト直下に置き（レイアウト常駐＝遷移で再マウントされない）、セッション中 1 回だけ
// getSession() ＋ x_profiles を取得して全 client ページ／ヘッダーに配布する。
// これにより、各ページが遷移のたびに自分プロフィールを取り直していた重複往復を排除する。
//
// ⚠ ISR凍結回避：me（ログイン依存）はこの「クライアント Context」だけで保持し、
//    サーバーコンポーネント／ISRキャッシュには一切焼かない。公開読み取りや時間依存の方針も不変。

const supabase = createClient();
const PROFILE_COLS =
  'id, auth_user_id, kind, status, handle, display_name, bio, avatar_url, header_url, is_verified, affiliated_shop_id';

export type MeContextValue = {
  me: XProfile | null; // 開設済みプロフィール（未開設は null）
  userId: string | null; // ログイン中の auth ユーザーID（未開設でも入る）
  email: string | null; // ログイン中メール
  affiliatedShop: { handle: string; displayName: string } | null; // 自分（セラピスト）の所属先
  loading: boolean; // 初回 me 取得が終わるまで true（これが true の間は「未ログイン」と断定しない）
  refresh: () => void; // 明示再取得（プロフィール編集後など）
};

const MeContext = createContext<MeContextValue | null>(null);

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  // Provider 外でも壊れないフォールバック（/x 配下なら常に Provider 内）。
  if (!ctx) return { me: null, userId: null, email: null, affiliatedShop: null, loading: false, refresh: () => {} };
  return ctx;
}

export function XMeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<XProfile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [affiliatedShop, setAffiliatedShop] = useState<{ handle: string; displayName: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (uid: string | undefined, mail: string | null) => {
    if (!uid) {
      setUserId(null);
      setEmail(null);
      setMe(null);
      setAffiliatedShop(null);
      setLoading(false);
      return;
    }
    setUserId(uid);
    setEmail(mail);
    const { data } = await supabase.from('x_profiles').select(PROFILE_COLS).eq('auth_user_id', uid).maybeSingle();
    const p = (data as XProfile | null) ?? null;
    setMe(p);
    if (p && p.kind === 'therapist' && p.affiliated_shop_id) {
      const dict = await fetchShopMiniByIds(supabase, [p.affiliated_shop_id]);
      const s = dict.get(p.affiliated_shop_id);
      setAffiliatedShop(s ? { handle: s.handle, displayName: s.displayName } : null);
    } else {
      setAffiliatedShop(null);
    }
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    getSession().then((s) => load(s?.user.id, s?.user.email ?? null));
  }, [load]);

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

  return (
    <MeContext.Provider value={{ me, userId, email, affiliatedShop, loading, refresh }}>
      {children}
    </MeContext.Provider>
  );
}
