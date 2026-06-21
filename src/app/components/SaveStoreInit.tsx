'use client';

import { useEffect } from 'react';
import { initSaveStore } from '@/lib/saveStore';

// 保存ストアを全ページで初期化（認証状態の購読＆ログイン時の端末→DBマージを有効化）。
// 画面には何も描画しない。
export function SaveStoreInit() {
  useEffect(() => {
    initSaveStore();
  }, []);
  return null;
}
