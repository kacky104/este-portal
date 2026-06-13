'use client';

import Link from 'next/link';
import { DIARIES } from '@/data/diaries';

const GRADIENTS = ['from-pink-100 to-rose-200', 'from-fuchsia-100 to-pink-200', 'from-rose-100 to-fuchsia-200'];

export function DiarySection() {
  return (
    <div className="w-full space-y-3">
      {/* 見出し */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">📷</span>
          <h2 className="text-base font-bold text-slate-900 tracking-wide">セラピスト写メ日記</h2>
        </div>
        <span className="text-[10px] text-pink-500 font-bold bg-pink-50 px-2 py-0.5 rounded-full">毎日更新中</span>
      </div>

      {/* 横スクロールリスト */}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {DIARIES.map((diary, i) => {
          const grad = GRADIENTS[i % GRADIENTS.length];
          return (
            <Link
              key={diary.id}
              href={`/salon/${diary.salonId}`}
              className="group flex-shrink-0 w-52 rounded-2xl border border-pink-50 bg-white shadow-sm hover:border-pink-200 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col justify-between"
            >
              <div>
                {/* 写真エリア */}
                <div className={`h-32 bg-gradient-to-br ${grad} flex items-center justify-center relative`}>
                  <div className="text-center space-y-1">
                    <span className="text-3xl">🌸</span>
                    <p className="text-[10px] font-bold text-pink-700/60 tracking-wider">PHOTO IMAGE</p>
                  </div>
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/40 backdrop-blur-sm text-white text-[10px] font-bold">
                    {diary.therapistName}
                  </span>
                  <span className="absolute top-2 right-2 text-[9px] text-slate-500 bg-white/80 backdrop-blur-sm px-1.5 py-0.5 rounded-md font-medium">
                    {diary.time}
                  </span>
                </div>

                {/* 本文 */}
                <div className="p-3 space-y-1">
                  <h3 className="font-bold text-xs text-slate-800 line-clamp-1 group-hover:text-pink-600 transition-colors">
                    {diary.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 break-all">
                    {diary.content}
                  </p>
                </div>
              </div>

              {/* 所属サロンフッター */}
              <div className="px-3 pb-3 pt-1 border-t border-dashed border-slate-50 flex items-center justify-between text-[9px] text-slate-400">
                <span className="truncate max-w-[120px]">📍 {diary.salonName}</span>
                <span className="text-pink-400 font-bold group-hover:translate-x-0.5 transition-transform">見る →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
