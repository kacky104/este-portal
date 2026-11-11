'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getConecfAutoActive } from '@/app/actions/conecfAutoHub';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useConecfSession } from '../ConecfSession';

// コネックエフ「サイト自動更新」（第1847便・2026-11-09・カッキーさん）。
// ★ ベンリーの「コンテンツ更新」にあたる入口。ベンリーから移した各サイトの自動更新を、サイトごと（駅ちか → エステ魂 → 全国エステランキング）に並べる。
// ★ 出すのは運営が ON にした項目だけ（ConecfShell と同じ印）。中の画面はサイドバーに出さない（conecfNav の AUTO_HUB_CHILDREN）

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

type Item = { href: string; label: string; note: string; on: boolean };

export default function ConecfAutoHubPage() {
  const href = useConecfHref();
  const st = useConecfSession().state;
  // ★ 第1920便: いま自動が動いている項目（タイトルがキラリと光る）
  const [active, setActive] = useState<Record<string, boolean>>({});
  useEffect(() => { getConecfAutoActive().then(setActive).catch(() => {}); }, []);
  const groups: Array<{ site: string; items: Item[] }> = [
    {
      site: '駅ちか',
      items: [
        { href: '/news', label: '新着情報（ニュース）', note: 'カテゴリーごとに1日1回、順番に投稿', on: true },
        { href: '/ekichika-rankimgs', label: '店舗メイン・ランキング画像', note: '決めた間隔で、写るセラピストを入れ替え', on: st?.ekiRankImgNav ?? false },
        { href: '/ekichika-movies', label: '動画投稿', note: '決めた時刻に、セラピストの動画を投稿', on: st?.ekiMovieNav ?? false },
        { href: '/ekichika-magazines', label: 'プラチナムマガジン', note: '決めた時刻に、マイショップ会員へマガジンを配信', on: st?.ekiMagazineNav ?? false },
        { href: '/cocoa', label: 'ココア店長ブログ', note: '求人サイト「ココア」の店長ブログ（動画の記事も）を、決めた時刻に投稿', on: st?.cocoaNav ?? false },
      ],
    },
    {
      site: 'エステ魂',
      items: [
        { href: '/esutama-options', label: 'エステ魂オプション', note: '集客ブースト・セラピストアピール・求人アピール・本日体験入店・リアルタイム集客・メールマガジン・写メNote など', on: st?.esutamaOptNav ?? false },
      ],
    },
    {
      site: '全国エステランキング',
      items: [
        { href: '/zenkoku-options', label: 'ニュース・おすすめセラピスト', note: 'ニュースの投稿と、おすすめセラピストの入れ替え', on: st?.zenkokuOptNav ?? false },
      ],
    },
    {
      site: 'バニラ',
      items: [
        // ★ 第1903便
        { href: '/vanilla-blog', label: '店長ブログ', note: '求人サイト「バニラ」の店長ブログを、決めた時刻に順番に投稿（前の記事は消す）', on: st?.vanillaBlogNav ?? false },
      ],
    },
  ];
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.on) })).filter((g) => g.items.length > 0);
  return (
    <ConecfShell current="autoHub" title="サイト自動更新一覧">
      {() => (
        <div className="space-y-4 pb-32">
          {/* ★ 第1920便: 自動更新中のタイトルに光が流れる（動きを減らす設定の方には止める） */}
          <style>{`.conecf-shine{background:linear-gradient(100deg,#212121 0%,#212121 40%,#6366f1 46%,#c4b5fd 50%,#6366f1 54%,#212121 60%,#212121 100%);background-size:250% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:conecf-shine 3.2s ease-in-out infinite}@keyframes conecf-shine{0%{background-position:100% 0}60%,100%{background-position:0 0}}@media (prefers-reduced-motion:reduce){.conecf-shine{animation:none;color:#212121;background:none}}`}</style>
          <p className="text-[14px] leading-relaxed text-slate-600">各サイトの自動投稿・自動更新をまとめた画面です。項目を開いて、時刻・間隔・ON／OFF を設定します。</p>
          {!st && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {st && shown.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使える項目がまだありません。「運営お問い合わせ」からご連絡ください。</div>}
          {shown.map((g) => (
            <section key={g.site} className={CARD}>
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-[15px] font-bold text-slate-800"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-indigo-50 text-indigo-500" aria-hidden><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>{g.site}</h2>
              <ul>
                {g.items.map((i) => (
                  <li key={i.href} className="border-b border-slate-100 last:border-b-0">
                    <Link href={href(i.href)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-indigo-50">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[15px] font-bold ${active[i.href] ? 'conecf-shine' : 'text-[#212121]'}`}>{i.label}</span>
                          {active[i.href] && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">自動更新中</span>}
                        </div>
                        <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{i.note}</div>
                      </div>
                      <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-indigo-50 text-[16px] text-indigo-500" aria-hidden>›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </ConecfShell>
  );
}
