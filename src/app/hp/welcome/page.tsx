import type { Metadata } from 'next';

// ホームページ担当者（HP管理者）の招待着地ページだった場所（2026-08-09 段階3）。
//
// ★★★ 2026-09-12（第280便・カッキーさんの指示）で【担当者アカウントを完全に閉じた】。
//   ★ 招待・再送・解除・本人化（claimHpAdmin）はサーバー側ごと撤去した。
//   ★ ここはその招待メールのリンクの行き先だった場所。★ 招待は1件も出していないので
//     たどり着く人はいないが、ルートだけ残して【ただの案内】にしてある。
//   ★ 中身を空にしたのは、消えた口（claimHpAdmin）を呼ばないようにするため。
//   ★★ ファイルごと消してもよい（★ どこからもリンクされていない）。★ 消すのはこの1ファイルだけ。
//
// ※ /hp/[slug] より静的セグメントが優先されるため、slug='welcome' の店舗と衝突しても
//    このページが勝つ。運営が slug を発行するとき 'welcome' は使わないこと。

export const metadata: Metadata = {
  title: 'ご案内',
  robots: { index: false, follow: false },
};

export default function HpWelcomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 shadow-sm p-7 text-center space-y-3">
        <h1 className="text-sm font-black text-slate-800">この入口は終了しました</h1>
        <p className="text-xs text-slate-500 leading-relaxed">
          ホームページの更新は、オーナー様のフクエスのアカウントで
          マイページから行っていただけます。
        </p>
        <a
          href="https://fukues.com/mypage"
          className="inline-block px-5 py-2.5 bg-pink-500 text-white text-xs font-black hover:bg-pink-600 transition-colors"
        >
          マイページへ
        </a>
      </div>
    </div>
  );
}
