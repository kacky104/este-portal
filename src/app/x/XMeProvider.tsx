'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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

// /x レイアウト（サーバー）が getXContext で取得した me を seed として渡す。
// seed があればリロード時にクライアントが取り直さない（loading=false で開始＝待ちが消える）。
export type MeSeed = {
  me: XProfile | null;
  userId: string | null;
  email: string | null;
  affiliatedShop: { handle: string; displayName: string } | null;
};

export function XMeProvider({ children, seed }: { children: React.ReactNode; seed?: MeSeed }) {
  const [me, setMe] = useState<XProfile | null>(seed?.me ?? null);
  const [userId, setUserId] = useState<string | null>(seed?.userId ?? null);
  const [email, setEmail] = useState<string | null>(seed?.email ?? null);
  const [affiliatedShop, setAffiliatedShop] = useState<{ handle: string; displayName: string } | null>(
    seed?.affiliatedShop ?? null
  );
  // seed があれば確定値を持っているので loading=false で開始（リロード時の me 取得待ちを解消）。
  const [loading, setLoading] = useState(seed === undefined);
  // onAuthChange は購読時に INITIAL_SESSION を1回発火する。seed 済みで同一ユーザーならその初回再取得を抑止。
  const seededRef = useRef(seed !== undefined);

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
    // seed が無いときだけ初回取得（seed があれば既に確定値を持っている）。
    if (seed === undefined) {
      getSession().then((s) => {
        if (mounted) load(s?.user.id, s?.user.email ?? null);
      });
    }
    // ログイン/ログアウト切替は購読で反映。ただし seed 済みの初回イベント（INITIAL_SESSION）が
    // 同一ユーザーなら取り直さない＝リロード時の二重取得を回避（別ユーザー＝切替時のみ load）。
    const off = onAuthChange((s) => {
      if (!mounted) return;
      const uid = s?.user.id;
      if (seededRef.current) {
        seededRef.current = false;
        if ((uid ?? null) === (seed?.userId ?? null)) return;
      }
      load(uid, s?.user.email ?? null);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [load, seed]);

  return (
    <MeContext.Provider value={{ me, userId, email, affiliatedShop, loading, refresh }}>
      {children}
    </MeContext.Provider>
  );
}
