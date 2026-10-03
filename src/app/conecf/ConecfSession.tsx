'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getConecfShellState, type ConecfShellState } from '@/app/actions/conecf';

// コネックエフの外枠の状態（権限・赤帯・ココアの出し分け）を【1回だけ】読んで配る（第1117便・2026-10-03）。
//
// ★ もとは ConecfShell が画面を開くたびに3本の server action を呼んでいた（毎ページ約13本の読み）。
//   ★ layout.tsx の下にこの Provider を置く＝画面を行き来しても Provider は生き続けるので、
//     読むのは「開いたとき1回」＋「5分経って別の画面へ移ったとき」だけ。
// ★ refresh(): ID・PASS の保存／ココア設定の保存のあと、画面が自分で呼び直す（★ 赤帯・ココアの表示がすぐ追いつく）。
// ★ 読めなかったときは error を立てる（★ 一度読めた状態があれば、それを残す）。

const FRESH_MS = 5 * 60 * 1000;

type Ctx = {
  state: ConecfShellState | null;
  error: boolean;
  /** 今すぐ読み直す（★ 同時に2回は出さない） */
  refresh: () => Promise<void>;
  /** 5分より古ければ読み直す（★ 画面を開いたときに呼ぶ） */
  ensureFresh: () => void;
};

const SessionContext = createContext<Ctx | null>(null);

export function ConecfSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConecfShellState | null>(null);
  const [error, setError] = useState(false);
  const loadedAtRef = useRef(0);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback((): Promise<void> => {
    if (inflightRef.current) return inflightRef.current;
    const p = getConecfShellState()
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

/** ★ 外枠の状態。★ Provider の外（無いはず）では「読み込み中のまま」になる */
export function useConecfSession(): Ctx {
  const ctx = useContext(SessionContext);
  return ctx ?? { state: null, error: false, refresh: async () => {}, ensureFresh: () => {} };
}
