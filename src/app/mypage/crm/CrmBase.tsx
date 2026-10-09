'use client';

import { createContext, useContext, useEffect } from 'react';
import { crmHref, crmSpecialHref, fukuesHref, type CrmSpecialKey } from '@/lib/crmHost';

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
  special: (key: CrmSpecialKey) => string;
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

// ★ 2026-10-09 点検#6: 「保存していない変更」の印。設定のように保存バーがある画面が立て、CrmShell の上の帯（タブ・画面を更新）が見る。
//   beforeunload は再読込・タブを閉じるときしか効かず、上の帯のタブ（App Router のソフト遷移）では黙って編集が消えていた。
//   ★ 画面ごとに Context を増やさず、モジュールの変数1つ（CRM は1画面1ページなので足りる）。
export const crmDirty = { current: false };
export const CRM_DIRTY_MSG = '保存していない変更があります。このまま移動すると消えます。移動しますか？';

/** 未保存の変更がある画面が呼ぶ。アンマウントで必ず下ろす */
export function useCrmDirty(dirty: boolean) {
  useEffect(() => {
    crmDirty.current = dirty;
    return () => { crmDirty.current = false; };
  }, [dirty]);
}

/** リンク・ボタンの onClick で使う。移動してよければ true */
export function crmLeaveOk(): boolean {
  return !crmDirty.current || window.confirm(CRM_DIRTY_MSG);
}
