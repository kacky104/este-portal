'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';

// フクエスワークのウェルカム画面（ヒーロー画像＋ENTER）。
// SEO保護のため「リダイレクト/別ページ」ではなく、SSR済みの本体（求人本文・JobPosting JSON-LD）の
// 上に被せるクライアントオーバーレイ方式。HTMLには常に本体が残る。
//
// 表示制御（既存鉄則と同じ）：初期stateは非表示に固定し、マウント後に localStorage を判定して
// 未訪問のときだけ表示に切り替える。→ SSR出力は常に非表示で一致＝ハイドレーション不整合なし、
// 訪問済みユーザーへのチラつきも無い。
const VISITED_KEY = 'fukuwork_visited';

export function WelcomeSplash() {
  const [show, setShow] = useState(false); // SSR/初期描画は必ず非表示
  const [closing, setClosing] = useState(false); // フェードアウト用

  useEffect(() => {
    try {
      if (localStorage.getItem(VISITED_KEY) !== '1') setShow(true);
    } catch {
      // localStorage 不可の環境では表示しない（本体は常に見えているため実害なし）。
    }
  }, []);

  // 表示中は背面スクロールをロック。
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [show]);

  if (!show) return null;

  const handleEnter = () => {
    try {
      localStorage.setItem(VISITED_KEY, '1');
    } catch {
      // 保存できなくても閉じる操作は続行する。
    }
    // 軽いフェードアウト後に取り外す（ライブラリ不要・CSS transition のみ）。
    setClosing(true);
    window.setTimeout(() => setShow(false), 300);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 py-8 transition-opacity duration-300 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'linear-gradient(#ffffff,#F1FAF4)' }}
      role="dialog"
      aria-modal="true"
      aria-label="フクエスワーク ウェルカム"
    >
      {/* ヒーロー画像（PC／SP 出し分け）。画面に収める（object-contain＋max-h制御）。 */}
      <div className="w-full max-w-4xl flex-1 flex items-center justify-center min-h-0">
        {/* PC */}
        <Image
          src="/hero-fukuwork-pc.png"
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={1920}
          height={1080}
          priority
          className="hidden md:block w-auto h-auto max-h-[70vh] max-w-full object-contain"
        />
        {/* SP */}
        <Image
          src="/hero-fukuwork-sp.png"
          alt="フクエスワーク｜福岡メンズエステのセラピスト求人サイト"
          width={1080}
          height={1920}
          priority
          className="md:hidden w-auto h-auto max-h-[62vh] max-w-full object-contain"
        />
      </div>

      {/* ENTER ボタン */}
      <div className="mt-6 flex flex-col items-center flex-shrink-0">
        <button
          type="button"
          onClick={handleEnter}
          className="px-14 py-4 rounded-full text-white font-extrabold text-lg tracking-[0.2em] shadow-lg hover:opacity-90 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
        >
          ENTER
        </button>
        <span className="mt-2.5 text-xs font-medium" style={{ color: '#059669' }}>
          フクエスワークをはじめる
        </span>
      </div>
    </div>
  );
}
