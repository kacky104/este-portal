import { useSyncExternalStore } from 'react';

// ★ 第1073便（2026-10-01）: 「ブラウザで画面が組み上がったか」を返す共通フック。
//   それまで各部品が `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`
//   と書いていたものの置き換え（eslint react-hooks/set-state-in-effect の警告を消すため）。
//   ★ 動きは同じ: サーバーで HTML を作るとき＝false／ブラウザで組み上がったあと＝true。
//   ★ 違いは1つだけ: ページ移動で後から出てくる部品は、最初から true（描き直しが1回減る）。
//   ★ ハイドレーション（サーバーのHTMLとの突き合わせ）中は必ず false から始まるので、不一致は起きない。
const subscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
