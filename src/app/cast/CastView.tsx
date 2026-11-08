'use client';

import { createContext, useContext } from 'react';

// ★ 第1777便（カッキーさん・2026-11-08）: セラピストページを店舗オーナー様が【見るだけ】で開くときの印。
//   viewAs ＝ 見ているセラピストの id（読み取りの Server Action に渡す。本人が開いているときは null）。
//   readOnly ＝ 投稿・記録・保存・今すぐ・ニックネームのボタンを出さない（★ サーバー側でも本人以外は断る）。
export type CastView = { viewAs: number | null; readOnly: boolean };

const Ctx = createContext<CastView>({ viewAs: null, readOnly: false });

export function CastViewProvider({ value, children }: { value: CastView; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCastView(): CastView {
  return useContext(Ctx);
}
