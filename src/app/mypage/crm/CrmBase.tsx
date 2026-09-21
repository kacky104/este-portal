'use client';

import { createContext, useContext } from 'react';
import { crmHref, crmSpecialHref, fukuesHref } from '@/lib/crmHost';

// ★ リンクの頭（fukuescrm.com なら ''、fukues.com・プレビューなら '/mypage/crm'）を画面に配る（第631便）。
// ★ 値は layout.tsx がリクエストのホストから決める（★ 画面側で window を見ない＝描画のずれを作らない）。ConecfBase と同じ形。

const BaseContext = createContext<string>('/mypage/crm');

export function CrmBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <BaseContext.Provider value={base}>{children}</BaseContext.Provider>;
}

/** 画面内のリンクを作る道具。★ path は CRM の中のパス（'/' '/customers' …） */
export function useCrmLinks(): {
  base: string;
  href: (path: string) => string;
  special: (key: 'login' | 'terms' | 'data') => string;
  fukues: (path: string) => string;
} {
  const base = useContext(BaseContext);
  return {
    base,
    href: (path: string) => crmHref(base, path),
    special: (key) => crmSpecialHref(base, key),
    fukues: (path: string) => fukuesHref(base, path),
  };
}
