'use client';

import { useEffect, useState } from 'react';
import ScrollPopupImage from '@/components/ScrollPopupImage';
import { getSession, onAuthChange } from '@/lib/auth';

// ★ 第1618便: TOP の「フクエス会員募集中!!」ポップアップ（左下からポンっと出る・スマホのみ）。
//  - 中身は店舗詳細のポップアップと同じ ScrollPopupImage（✕ で閉じるとそのセッション中は出ない）。
//  - ログイン中（＝もう会員）の人には出さない。ログイン状態はブラウザ内のセッションを読むだけ（通信なし）。
//    確認が終わるまでは出さない（会員の画面に一瞬出ないように）。
//  - 押すと /join/easy（短い説明ページ）へ。
export function MemberJoinPopup() {
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let active = true;
    getSession().then((s) => { if (active) setGuest(!s); });
    const off = onAuthChange((s) => { if (active) setGuest(!s); });
    return () => { active = false; off(); };
  }, []);

  if (!guest) return null;
  return <ScrollPopupImage src="/join/member-popup.webp" href="/join/easy" mobileWidthVw={34} mobileHeightVh={25} alt="フクエス会員募集中！登録は約1分・メールアドレスだけ・ポイントが貯まる" />;
}
