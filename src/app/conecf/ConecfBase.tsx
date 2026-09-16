'use client';

import { createContext, useContext } from 'react';
import { conecfHref } from '@/lib/conecfHost';

// ★ リンクの頭（conecf.com なら ''、プレビューなら '/conecf'）を画面に配る（第395便）。
// ★ 値は layout.tsx がリクエストのホストから決める（★ 画面側で window を見ない＝描画のずれを作らない）。

const BaseContext = createContext<string>('/conecf');

export function ConecfBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

/** 画面内のパス → 実際のリンク先 */
export function useConecfHref(): (path: string) => string {
  const base = useContext(BaseContext);
  return (path: string) => conecfHref(base, path);
}
