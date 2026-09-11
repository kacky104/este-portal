'use client';

import { useEffect, useState } from 'react';
import { getNewApplicationCount } from '@/app/actions/jobs';

// ★★★ 「まだ手を付けていない応募」の数（第272便・2026-09-11・カッキーさんの指示）。
//
//   ★ 数えるのは status === 'new' だけ。
//     ★ 連絡済み（contacted）・クローズ（closed）にした応募、削除した応募は数えない。
//     ★ 「新規に戻す」を押すと また数に戻る。★ 判定はサーバー側の1か所（getNewApplicationCount）。
//   ★ 出す場所は3つ:
//       ① フクエスワークのホームの「応募」カード
//       ② フクエスワークのサイドバー／ドロワーの「応募」
//       ③ /mypage のサイドバー「関連サイト → フクエスワーク（求人）」
//
// ★★ 軽さの決め（2026-09-11・カッキーさんと相談のうえ）
//   ★ 【件数だけ】返す専用の口を使う。★ 応募者の名前・電話・メモは運ばない・クエリは1本。
//   ★ 【定期更新はしない】。★ 数えるのは「画面を開いたとき」と「タブに戻ってきたとき」だけ。
//     ★ 秒読みで回すと、店舗数ぶんの通信が一日中走る。★ 応募は1日に何件も来るものではない。
//   ★ 失敗しても画面は止めず、数を出さないだけにする。

export function useNewApplicationCount(salonId: number | null | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (salonId == null || !Number.isFinite(Number(salonId))) {
      setCount(0);
      return;
    }
    let alive = true;
    const id = Number(salonId);

    const load = () => {
      getNewApplicationCount(id)
        .then((res) => {
          if (!alive) return;
          setCount(res.ok ? res.count : 0);
        })
        .catch(() => {
          // ★ 数が出ないだけ。★ ここでエラーを画面に出さない（サイドバーは黙って動く）。
          if (alive) setCount(0);
        });
    };

    load();

    // ★ タブに戻ってきたときだけ数え直す（★ タイマーでは回さない）。
    const onWake = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [salonId]);

  return count;
}

/** ★ 赤丸の数字。★ 0 のときは何も出さない。★ 3桁以上は 99+ にする。 */
export function NewCountBadge({ count, title }: { count: number; title?: string }) {
  if (count <= 0) return null;
  return (
    <span
      title={title ?? `未対応の応募が${count}件`}
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black leading-none shadow-sm flex-none"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
