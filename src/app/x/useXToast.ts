'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// トースト表示の共通フック。
// 従来は各コンポーネントが setToast + window.setTimeout を直書きしていたが、
// タイマーIDを保持しないため「表示中に次のトーストを出すと旧タイマーが新トーストを途中で消す」
// 「アンマウント後の setState」が起きていた。ここで一元管理し、
// 次の表示前と unmount 時に clearTimeout する。
export function useXToast(durationMs = 2600) {
  const [toast, setToast] = useState('');
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (msg: string) => {
      clearTimer();
      setToast(msg);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setToast('');
      }, durationMs);
    },
    [clearTimer, durationMs]
  );

  // unmount 時にタイマー破棄（破棄後の setState 防止）
  useEffect(() => clearTimer, [clearTimer]);

  return { toast, showToast };
}
