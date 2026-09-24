'use client';

import { FUKUES_LINK_GUIDE, type GuideContent } from '@/lib/mediaGuide';
import { useMediaBrand } from './mediaBrand';
import { guideCard, SectionTitle, GoLink } from './GuideBoard';

// よくあるご質問（Q&A）（第394便b・2026-09-16・カッキーさん）。★ 使い方のページから分けた。
// ★ <details> で畳む（★ 知りたい問いだけ開ける。JS の状態を持たない）。★ 文言は lib/mediaGuide.ts。

export function QaBoard({ content = FUKUES_LINK_GUIDE }: { content?: GuideContent } = {}) {
  const { link } = useMediaBrand();
  return (
    <div className="space-y-4">
      <section className={`${guideCard} space-y-4`}>
        <SectionTitle>よくあるご質問</SectionTitle>
        {content.qa.map((g) => (
          <div key={g.group}>
            {/* ★ 第780便: 分類の見出しを見やすく（薄い灰色の小さな字 → 紺の太字） */}
            <p className="text-[14.5px] font-black text-indigo-700 mb-1.5">{g.group}</p>
            <div className="border-t border-slate-200">
              {g.items.map((qa) => (
                <details key={qa.q} className="group border-b border-slate-200">
                  <summary className="flex items-start gap-2.5 cursor-pointer list-none py-3 pr-1 [&::-webkit-details-marker]:hidden">
                    <span className="flex-none text-[15px] font-black text-indigo-600">Q</span>
                    <span className="flex-1 text-[15px] font-bold text-slate-800 leading-snug">{qa.q}</span>
                    <span className="flex-none text-slate-400 transition-transform group-open:rotate-180" aria-hidden>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </span>
                  </summary>
                  <div className="flex gap-2.5 pb-3.5">
                    <span className="flex-none text-[15px] font-black text-rose-500">A</span>
                    <div className="flex-1 space-y-1.5">
                      {/* ★ 第712便: 先頭が「!」の行は赤字（大事な注意）。★ 印は表示しない */}
                      {qa.a.map((line) => (
                        line.startsWith('!')
                          ? <p key={line} className="text-[14px] font-bold text-rose-600 leading-relaxed">{line.slice(1)}</p>
                          : <p key={line} className="text-[14px] text-slate-600 leading-relaxed">{line}</p>
                      ))}
                      {qa.link && qa.linkLabel && <GoLink href={link(qa.link)}>{qa.linkLabel}</GoLink>}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </section>
      <p className="text-center"><GoLink href={link('guide')}>{content.guideLinkLabel}</GoLink></p>
    </div>
  );
}
