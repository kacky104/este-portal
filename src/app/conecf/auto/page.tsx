'use client';

import Link from 'next/link';
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
  const groups: Array<{ site: string; items: Item[] }> = [
    {
      site: '駅ちか',
      items: [
        { href: '/news', label: '新着情報（ニュース）', note: '速報NEWS・新人速報などのカテゴリーごとに、1日1回ずつ順番に投稿します', on: true },
        { href: '/ekichika-rankimgs', label: 'ランキング画像（店舗メイン／ランキング）', note: '決めた間隔で、店舗メイン・ランキングの女の子を順番に入れ替えます', on: st?.ekiRankImgNav ?? false },
        { href: '/ekichika-movies', label: '動画投稿', note: '決めた時刻に、女の子の動画を投稿します（前の同じ記事は消してから）', on: st?.ekiMovieNav ?? false },
        { href: '/ekichika-magazines', label: 'プラチナムマガジン', note: '決めた時刻に、マイショップ登録の会員さんへマガジンを配信します', on: st?.ekiMagazineNav ?? false },
        { href: '/cocoa', label: 'ココア店長ブログ', note: '駅ちかの求人サイト「ココア」の店長ブログを、決めた時刻にメールで投稿します', on: st?.cocoaNav ?? false },
      ],
    },
    {
      site: 'エステ魂',
      items: [
        { href: '/esutama-options', label: 'エステ魂オプション', note: '集客ブースト・セラピストアピール・求人アピール・本日体験入店・リアルタイム集客／求人・メールマガジン・店長の求人ブログ', on: st?.esutamaOptNav ?? false },
      ],
    },
    {
      site: '全国エステランキング',
      items: [
        { href: '/zenkoku-options', label: 'ニュース・おすすめセラピスト', note: '決めた時刻にニュースを投稿し、おすすめセラピストを入れ替えます', on: st?.zenkokuOptNav ?? false },
      ],
    },
  ];
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => i.on) })).filter((g) => g.items.length > 0);
  return (
    <ConecfShell current="autoHub" title="サイト自動更新">
      {() => (
        <div className="space-y-4">
          <p className="text-[14px] leading-relaxed text-slate-600">各サイトへの自動の投稿・更新を、サイトごとにまとめています。項目を開くと、時刻や間隔・自動の ON／OFF を設定できます。結果は「更新結果」に出ます。</p>
          {!st && <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>}
          {st && shown.length === 0 && <div className={`${CARD} p-5 text-[14px] text-slate-500`}>使えるようになっている項目がありません。運営事務局までご連絡ください。</div>}
          {shown.map((g) => (
            <section key={g.site} className={CARD}>
              <h2 className="border-b border-slate-100 px-5 py-3 text-[16px] font-bold text-violet-700">{g.site}</h2>
              <ul>
                {g.items.map((i) => (
                  <li key={i.href} className="border-b border-slate-100 last:border-b-0">
                    <Link href={href(i.href)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-indigo-50">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-[#212121]">{i.label}</div>
                        <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{i.note}</div>
                      </div>
                      <span className="flex-none text-[18px] text-indigo-400" aria-hidden>›</span>
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
