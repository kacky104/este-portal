'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getMediaShellState, type MediaShellState } from '@/app/actions/mediaShell';

// フクエスリンクの外枠の状態（ログイン・店・赤帯・コネックエフ切替済みか）を【1回だけ】読んで配る（第1120便・2026-10-03）。
//
// ★ コネックエフの ConecfSession（第1117便）と同じ作り。layout.tsx の下に置く＝画面を行き来しても Provider は生き続けるので、
//   読むのは「開いたとき1回」＋「5分経って別の画面へ移ったとき」だけ。
// ★ refresh(): ID・PW の保存／向きの切り替えのあと、画面が自分で呼び直す（★ 赤帯がすぐ追いつく）。
// ★ 読めなかったときは error を立てる（★ 一度読めた状態があれば、それを残す）。

const FRESH_MS = 5 * 60 * 1000;

type Ctx = {
  state: MediaShellState | null;
  error: boolean;
  refresh: () => Promise<void>;
  ensureFresh: () => void;
};

const SessionContext = createContext<Ctx | null>(null);

export function MediaSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MediaShellState | null>(null);
  const [error, setError] = useState(false);
  const loadedAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;
    const p = getMediaShellState()
      .then((s) => { setState(s); setError(false); loadedAtRef.current = Date.now(); })
      .catch(() => { setError(true); })
      .finally(() => { inflightRef.current = null; });
    inflightRef.current = p;
    return p;
  }, []);

  const ensureFresh = useCallback(() => {
    if (Date.now() - loadedAtRef.current > FRESH_MS) void refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<Ctx>(() => ({ state, error, refresh, ensureFresh }), [state, error, refresh, ensureFresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** ★ 外枠の状態。★ Provider の外（コネックエフの中で共用部品を使うときなど）では「読み込み中のまま・何もしない」 */
export function useMediaSession(): Ctx {
  const ctx = useContext(SessionContext);
  return ctx ?? { state: null, error: false, refresh: async () => {}, ensureFresh: () => {} };
}
