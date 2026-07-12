'use client';

import { useState } from 'react';
import { SukiIcon } from './SukiIcon';
import { sukiProfile } from './xSukiActions';
import { useXToast } from './useXToast';

// スキのボタンラベル（暫定）。表記変更はここ1箇所で行う。
export const SUKI_LABEL = 'スキ';

// フォロワー一覧の各行に出す唇ボタン（owner かつ therapist のときだけ親が描画する）。
// 1回きり・非トグル：押すと楽観的に「スキ済み」へ。成功なら塗り＋押下不可のまま、失敗なら元に戻す。
// トーストは自前ローカル（codebase 既存の各コンポーネント流儀に合わせる。押下は1件ずつなので重ならない）。
export function XSukiButton({
  targetProfileId,
  initialSuki,
}: {
  targetProfileId: string;
  initialSuki: boolean;
}) {
  const [sukied, setSukied] = useState(initialSuki);
  const [pending, setPending] = useState(false);
  const { toast, showToast } = useXToast();

  const onClick = async () => {
    if (sukied || pending) return;
    setSukied(true); // 楽観的にスキ済み表示
    setPending(true);
    showToast('スキしました。');

    const res = await sukiProfile(targetProfileId);
    setPending(false);
    if (!res.ok) {
      setSukied(false); // ロールバック
      showToast(res.error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={sukied || pending}
        aria-label={sukied ? 'スキ済み' : SUKI_LABEL}
        aria-pressed={sukied}
        className={`relative z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition flex-shrink-0 ${
          sukied
            ? 'bg-pink-50 text-pink-500 cursor-default'
            : 'bg-[color:var(--x-inset)] text-[color:var(--x-text-muted)] hover:bg-pink-50 hover:text-pink-500'
        }`}
      >
        <SukiIcon className="w-4 h-4" />
        {SUKI_LABEL}
      </button>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
