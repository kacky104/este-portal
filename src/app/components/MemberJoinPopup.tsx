'use client';

import { useEffect, useState } from 'react';
import ScrollPopupImage from '@/components/ScrollPopupImage';
import { getSession, onAuthChange } from '@/lib/auth';

// ★ 第1618便: TOP の「フクエス会員募集中!!」ポップアップ（左下からポンっと出る・スマホのみ）。
//  - 中身は店舗詳細のポップアップと同じ ScrollPopupImage。
//  - ログイン中（＝もう会員）の人には出さない。ログイン状態はブラウザ内のセッションを読むだけ（通信なし）。
//    確認が終わるまでは出さない（会員の画面に一瞬出ないように）。
//  - 押すと /join/easy（短い説明ページ）へ。
// ★ 第1624便: ✕で閉じたら HIDE_MINUTES 分はリロード・ページ移動しても出さない（localStorage に期限を保存）。
//   保存できないブラウザ（プライベートモード等）では、従来どおりそのページの間だけ閉じる。
const HIDE_MINUTES = 5;
const STORAGE_KEY = 'fukues:memberPopupHiddenUntil';

function hiddenNow(): boolean {
  try {
    const until = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

export function MemberJoinPopup() {
  const [guest, setGuest] = useState(false);
  // 初回描画は guest=false で必ず null（サーバーと一致）なので、ここで localStorage を読んでもずれない。
  const [snoozed] = useState(() => (typeof window === 'undefined' ? true : hiddenNow()));

  useEffect(() => {
    let active = true;
    getSession().then((s) => { if (active) setGuest(!s); });
    const off = onAuthChange((s) => { if (active) setGuest(!s); });
    return () => { active = false; off(); };
  }, []);

  if (!guest || snoozed) return null;
  return (
    <ScrollPopupImage
      src="/join/member-popup.webp"
      href="/join/easy"
      mobileWidthVw={34}
      mobileHeightVh={25}
      alt="フクエス会員募集中！登録は約1分・メールアドレスだけ・ポイントが貯まる"
      onClose={() => {
        try {
          window.localStorage.setItem(STORAGE_KEY, String(Date.now() + HIDE_MINUTES * 60 * 1000));
        } catch {
          // 保存できなくても、このページでは ScrollPopupImage 側で閉じたまま
        }
      }}
    />
  );
}
