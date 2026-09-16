'use client';

import Link from 'next/link';
import { ConecfShell } from './ConecfShell';
import { useConecfHref } from './ConecfBase';

// コネックエフのホーム（第395便・1a：外枠と入口だけ）。
// ★ 状態（止まっている連携・今日の出勤人数など）は 1b で足す。

const STEPS: ReadonlyArray<{ title: string; body: string; href: string }> = [
  { title: 'ID・PASS登録',     body: '連携するサイトのログイン情報を登録します。', href: '/sites' },
  { title: '女性一覧',         body: 'セラピストの情報と写真を登録します。',       href: '/girls' },
  { title: '週間スケジュール', body: '出勤を入力し、各サイトへ自動で更新します。', href: '/schedule' },
];

export default function ConecfHomePage() {
  const href = useConecfHref();
  return (
    <ConecfShell current="home" title="ホーム">
      {(access) => (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
            <p className="text-[13px] font-bold text-slate-400">ようこそ</p>
            <p className="mt-1 text-[18px] font-black text-slate-800 break-words">{access.salonName || access.email} 様</p>
            <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
              コネックエフは、各サイトへの出勤・セラピスト・写メ日記の更新をまとめて行うツールです。
              画面は順番に使えるようにしていきます。
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STEPS.map((s, i) => (
              <Link
                key={s.href}
                href={href(s.href)}
                className="block bg-white border border-slate-200 p-4 hover:border-indigo-300 transition-colors"
              >
                <span className="inline-grid place-items-center w-7 h-7 bg-gradient-to-br from-indigo-700 to-indigo-500 text-white text-[14px] font-black">{i + 1}</span>
                <p className="mt-2 text-[15px] font-black text-slate-800">{s.title}</p>
                <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">{s.body}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </ConecfShell>
  );
}
