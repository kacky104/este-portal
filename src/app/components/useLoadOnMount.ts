import { useEffect } from 'react';

/**
 * 画面を開いたとき（と load が変わったとき）に1回読み込む（第1985便でコネックエフに作り、第1986便で共通の置き場へ・CRM でも使う）。
 * ★ 使っている画面の load は、画面に入れる値を await のあとで入れている＝描き直しが続けて起きることは無い。
 *   eslint（react-hooks/set-state-in-effect）はそこを見分けられないので、呼び方をここにまとめた。
 * ★ load の最初（await の前）で setState すると1回よけいに描き直す。新しく使うときは await のあとに入れる
 */
export function useLoadOnMount(load: () => Promise<unknown>) {
  useEffect(() => { void load(); }, [load]);
}
