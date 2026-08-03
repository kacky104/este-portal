'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSession, onAuthChange } from '@/lib/auth';

// /join のCTA。ページ本体は ISR（静的）のままにしたいので、ログイン状態の出し分けはここだけで行う。
// ハイドレーション対策：初期描画は必ず未ログイン表示（＝新規登録CTA）。マウント後に差し替える。
// SEO上も、クローラが見る初期HTMLに「無料で会員登録する」が入るのは正しい状態。
export function JoinCta({ variant = 'hero' }: { variant?: 'hero' | 'footer' }) {
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    let active = true;
    getSession().then((s) => { if (active) setLoggedIn(!!s); });
    const off = onAuthChange((s) => { if (active) setLoggedIn(!!s); });
    return () => { active = false; off(); };
  }, []);

  const isMember = mounted && loggedIn;

  // 主ボタン（未ログイン＝新規登録／ログイン中＝マイページ）。
  const primaryHref = isMember ? '/member' : '/login?mode=signup&redirectTo=/member';
  const primaryLabel = isMember ? 'マイページへ' : '無料で会員登録する';

  const primary = (
    <Link
      href={primaryHref}
      className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3.5 rounded-full bg-gradient-to-r from-orange-500 via-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-lg shadow-pink-500/20 hover:opacity-95 transition-opacity"
    >
      {primaryLabel}
      <span aria-hidden>→</span>
    </Link>
  );

  if (variant === 'footer') {
    return (
      <div className="rounded-3xl border border-pink-100 bg-white/90 backdrop-blur-sm p-6 sm:p-8 shadow-sm text-center">
        <p className="text-base sm:text-lg font-bold text-slate-800">
          {isMember ? 'いつもご利用ありがとうございます' : '登録は1分、もちろん無料です'}
        </p>
        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-500">
          {isMember
            ? '保存した店舗・セラピスト、VIPレター、通知はマイページからご確認いただけます。'
            : 'メールアドレスとパスワードだけで登録できます。いつでも退会できます。'}
        </p>
        <div className="mt-5">{primary}</div>
        {!isMember && (
          <p className="mt-4 text-[11px] text-slate-400">
            すでにアカウントをお持ちの方は
            <Link href="/login" className="text-pink-600 font-medium hover:underline mx-1">ログイン</Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        {primary}
        {!isMember && (
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full sm:w-auto px-8 py-3.5 rounded-full border border-pink-200 bg-white/80 text-pink-600 font-bold text-sm hover:bg-pink-50 transition-colors"
          >
            ログイン
          </Link>
        )}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        {isMember ? 'ログイン中です' : '登録・利用ともに無料／18歳以上の方が対象です'}
      </p>
    </div>
  );
}
