'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthChange } from '@/lib/auth';
import { loadMyXMe } from './xMeActions';
import type { XProfile } from './xProfile';

// fukuX の「自分（me）」をクライアントで一元管理する Context。
// /x レイアウト直下に置き（レイアウト常駐＝遷移で再マウントされない）、セッション中 1 回だけ
// getSession() ＋ x_profiles を取得して全 client ページ／ヘッダーに配布する。
// これにより、各ページが遷移のたびに自分プロフィールを取り直していた重複往復を排除する。
//
// ⚠ ISR凍結回避：me（ログイン依存）はこの「クライアント Context」だけで保持し、
//    サーバーコンポーネント／ISRキャッシュには一切焼かない。公開読み取りや時間依存の方針も不変。

// ★ 第986便: me の取り直しはサーバー（loadMyXMe）で行う。ブラウザの getSession / x_profiles 読み込みは
//   アプリ内ブラウザで止まったり「未ログイン」と誤って返ったりして、ログイン中なのにログアウト表示になるため使わない。
//   ブラウザのログイン状態の変化（onAuthChange）は「取り直しのきっかけ」にだけ使う。

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

  const load = useCallback(async () => {
    let r: MeSeed;
    try {
      r = await loadMyXMe();
    } catch {
      setLoading(false); // ★ 通信できないときは今の表示を保つ（ログアウト扱いにはしない）
      return;
    }
    setUserId(r.userId);
    setEmail(r.email);
    setMe(r.me);
    setAffiliatedShop(r.affiliatedShop);
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let mounted = true;
    // seed が無いときだけ初回取得（seed があれば既に確定値を持っている）。
    if (seed === undefined) void load();
    // ログイン/ログアウト切替は購読で「きっかけ」を受け、中身はサーバーで取り直す。
    // seed 済みの初回イベント（INITIAL_SESSION）が同一ユーザーなら取り直さない＝リロード時の二重取得を回避。
    const off = onAuthChange((s) => {
      if (!mounted) return;
      const uid = s?.user.id ?? null;
      if (seededRef.current) {
        seededRef.current = false;
        if (uid === (seed?.userId ?? null)) return;
      }
      void load();
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
