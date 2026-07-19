'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

// サイト全体に肉球壁紙（body.paw-bg）を敷くトグル。テーマ色／着せ替えで背景が変わるページは除外する。
// 除外（プレフィックス）: /salon/*・/therapist/*（公開テーマページ）／/diary/[id]（個別＝サロンのテーマ背景）／
//                        /x/*（fukuX は独自トーンのため肉球壁紙を出さない）／
//                        /jobs/*（フクエスワークは別サイト風のため肉球壁紙を出さない）。
// 除外（完全一致）: /cast（着せ替えダッシュボード。CastThemeProvider が全面背景を出す）／/x（fukuX トップ）／
//                  /jobs（フクエスワーク トップ）。
// ※ /diary（一覧）・/cast/login など認証ページはテーマ背景ではないため除外しない（壁紙を出す）。
const EXCLUDED_PREFIXES = ['/salon/', '/therapist/', '/diary/', '/x/', '/jobs/'];
const EXCLUDED_EXACT = ['/cast', '/x', '/jobs', '/ranking'];

export default function Wallpaper() {
  const pathname = usePathname() || '';
  useEffect(() => {
    const excluded =
      EXCLUDED_EXACT.includes(pathname) ||
      EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p));
    const body = document.body;
    if (excluded) body.classList.remove('paw-bg');
    else body.classList.add('paw-bg');
    return () => {
      body.classList.remove('paw-bg');
    };
  }, [pathname]);
  return null;
}
