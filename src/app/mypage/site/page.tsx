// フクエスサイト（公式ホームページ制作）のご案内（第1172便・2026-10-04・カッキーさんの指示）。
// ★ マイページのサイドバーの「フクエスサイト」バナーから、まだ申し込んでいないお店が開く、1ページの簡単な説明。
//   読んだあと「デザインを見る」（/hp/templates/designs）・「制作について問い合わせる」（/hp/templates/contact）へ。
//   くわしい説明（営業ページ）は今までどおり /hp/templates（このページからもリンクしている）。
// ★ 制作中・停止中・公開中のお店の行き先は今までどおり（mypage/page.tsx の hpNav・判断はあちらの1か所）。
// ★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。
// ★ コネックエフ（第1164便）・フクエスCRM（第1165便）のご案内と同じ要領＝大事なところだけの1ページ（淡い地・角の丸い札・番号の丸）。
//   画像ではなく文字で組んである（文言は下の配列を直すだけ）。カッキーさんの画像ができたら、fukuX・コネックエフと同じく画像1枚＋ボタンに替える。
// ★★ 料金の数字は /hp/templates（営業ページ）と同じ確定値。★ 料金を変えるときは、あちら（画像・sr-only・JSON-LD）と【ここ】も必ず同時に直す。
//   デザインの数（全◯パターン）は定義から数える（あちらと同じ式）。

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { HP_TEMPLATES, HP_COLOR_VARIANTS } from '@/app/lib/hpSite';

export const metadata: Metadata = { title: 'フクエスサイトのご案内｜フクエス マイページ' };

const HP_PATTERN_COUNT = HP_TEMPLATES.reduce((n, t) => n + HP_COLOR_VARIANTS[t.key].length, 0);

// ── 色（フクエスサイトのバナーの赤）。ここだけ直せば全体が変わる ──
const INK = '#2b1d1b'; // 見出しの濃い色
const MAIN = '#d6453d'; // 主役の赤
const DEEP = '#a12d27'; // 濃い赤（番号の丸・ボタン）

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const ICONS: Record<'person' | 'clock' | 'yen' | 'photo', ReactNode> = {
  person: (<><circle cx="12" cy="8.5" r="3.5" {...stroke} /><path d="M5 19.5c.7-3.5 3.4-5.3 7-5.3s6.3 1.8 7 5.3" {...stroke} /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M12 7.5V12l3 2" {...stroke} /></>),
  yen: (<><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M8.8 7.5l3.2 5 3.2-5M12 12.5V17M9.2 12.5h5.6M9.2 15h5.6" {...stroke} /></>),
  photo: (<><rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} /><path d="M7 15.5l3.2-3.2 2.6 2.6 2-2 2.2 2.2" {...stroke} /><circle cx="15.8" cy="9" r="1" fill="currentColor" /></>),
};

/** 01 そのまま反映されるもの（4枚） */
const ITEMS: ReadonlyArray<{ icon: keyof typeof ICONS; name: string; sub: string }> = [
  { icon: 'person', name: 'セラピスト', sub: '写真・プロフィール' },
  { icon: 'clock', name: '本日の出勤', sub: 'いつも最新' },
  { icon: 'yen', name: '料金', sub: 'コース・料金表' },
  { icon: 'photo', name: '写メ日記・口コミ', sub: 'そのまま表示' },
];

/** 02 料金（税込）。★ /hp/templates と同じ数字 */
const PRICES: ReadonlyArray<{ name: string; price: string; off?: string; cond?: string }> = [
  { name: '制作料（初回のみ）', price: '165,000円', off: '0円', cond: 'フクエス掲載店さまなら' },
  { name: '月額利用料', price: '11,000円', off: '0円', cond: 'フクエスワークにもご掲載なら' },
  { name: 'ドメイン更新料（年額）', price: '11,000円' },
];

/** 03 制作の流れ（5つ） */
const STEPS: ReadonlyArray<string> = ['お申し込み', 'デザインを決める', '運営が制作', 'ご確認・公開', '公開後の更新'];

function SectionHead({ no, children, tag }: { no: string; children: ReactNode; tag?: string }) {
  return (
    <div className="mt-9 mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-3 text-[20px] sm:text-[24px] font-black" style={{ color: INK }}>
        <span className="text-[13px] font-bold" style={{ color: MAIN }}>{no}</span>
        {children}
      </h2>
      {tag && <span className="flex-shrink-0 rounded-full bg-[#fde8e6] px-3 sm:px-4 py-1.5 text-[11.5px] sm:text-[12.5px] font-bold" style={{ color: DEEP }}>{tag}</span>}
    </div>
  );
}

export default function HpIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <article className="overflow-hidden border border-[#f6dcd9] bg-[#fffaf9] shadow-sm">
          <div className="h-1.5" style={{ background: MAIN }} />
          <div className="px-4 sm:px-10 pt-6 sm:pt-7 pb-8">
            {/* ── 見出しの行 ── */}
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-baseline gap-3 whitespace-nowrap">
                <span className="text-[24px] sm:text-[30px] font-black tracking-tight" style={{ color: INK }}>フクエスサイト</span>
                <span className="hidden sm:inline text-[14px] font-bold" style={{ color: MAIN }}>ご案内</span>
              </p>
              <span className="flex-shrink-0 rounded-full bg-[#fde8e6] px-3 sm:px-4 py-1.5 text-[11.5px] sm:text-[12.5px] font-bold" style={{ color: DEEP }}>フクエス掲載店さまへ</span>
            </div>

            {/* ── いちばん言いたいこと ＋ 流れの絵 ── */}
            <div className="mt-7 grid gap-6 sm:grid-cols-[1fr_236px] sm:items-center">
              <div>
                <h1 className="text-[32px] sm:text-[43px] font-black leading-[1.25] tracking-tight" style={{ color: INK }}>
                  公式ホームページを、
                  <br />
                  <span style={{ color: MAIN }}>制作料0円で。</span>
                </h1>
                <p className="mt-4 text-[17px] sm:text-[19px] font-black leading-relaxed" style={{ color: DEEP }}>
                  フクエスの掲載情報が、
                  <br />
                  そのまま公式ホームページに。
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {['二度打ち ゼロ', '制作は運営におまかせ'].map((t) => (
                    <span key={t} className="rounded-full px-5 py-2.5 text-[14px] sm:text-[15px] font-black text-white" style={{ background: MAIN }}>{t}</span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#f6dcd9] bg-white p-4 text-center">
                <div className="rounded-xl border-2 px-3 py-3" style={{ borderColor: '#f0b9b4' }}>
                  <p className="text-[19px] font-black" style={{ color: INK }}>フクエス</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">いつもどおり更新</p>
                </div>
                <svg viewBox="0 0 24 24" className="mx-auto my-1.5 h-7 w-7" style={{ color: MAIN }} aria-hidden><path d="M12 4v15M6 13.5l6 6 6-6" {...stroke} strokeWidth={2.4} /></svg>
                <div className="rounded-xl px-3 py-3 text-white" style={{ background: MAIN }}>
                  <p className="text-[17px] font-black">公式ホームページ</p>
                  <p className="mt-0.5 text-[12.5px] font-bold text-white/90">自動で反映</p>
                </div>
              </div>
            </div>

            {/* ── 01 そのまま反映されるもの ── */}
            <SectionHead no="01">そのまま反映されるもの</SectionHead>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ITEMS.map((it) => (
                <li key={it.name} className="rounded-2xl border border-[#f6dcd9] bg-white px-2 py-4 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#fde8e6]" style={{ color: DEEP }}>
                    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>{ICONS[it.icon]}</svg>
                  </span>
                  <p className="mt-2.5 text-[15.5px] sm:text-[16px] font-black tracking-tight" style={{ color: INK }}>{it.name}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">{it.sub}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[12.5px] text-slate-500">お店だけの独自ドメインも、運営が取得・管理・更新します。デザインは全{HP_PATTERN_COUNT}パターンから選べます。</p>

            {/* ── 02 料金 ── */}
            <SectionHead no="02" tag="表示はすべて税込">料金</SectionHead>
            <ul className="rounded-2xl border border-[#f6dcd9] bg-white px-4 sm:px-6 py-1.5">
              {PRICES.map((p, i) => (
                <li key={p.name} className={`flex items-center justify-between gap-3 py-3.5 ${i > 0 ? 'border-t border-[#fbeeed]' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-[15px] sm:text-[15.5px] font-black" style={{ color: INK }}>{p.name}</p>
                    {p.cond && <p className="mt-0.5 text-[12.5px] font-bold text-slate-500">{p.cond}</p>}
                  </div>
                  <p className="flex flex-shrink-0 items-baseline gap-1.5 sm:gap-2 whitespace-nowrap">
                    {p.off ? (
                      <>
                        <span className="text-[13px] sm:text-[13.5px] text-slate-400 line-through">{p.price}</span>
                        <span className="text-[13px] font-black" style={{ color: MAIN }} aria-hidden>→</span>
                        <span className="text-[22px] font-black leading-none" style={{ color: MAIN }}>{p.off}</span>
                      </>
                    ) : (
                      <span className="text-[17px] font-black" style={{ color: INK }}>{p.price}</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-balance rounded-2xl px-4 py-3 text-center text-[14.5px] sm:text-[16px] font-black text-white" style={{ background: MAIN }}>
              両方ご掲載なら、年間 11,000円だけで持てます。
            </p>

            {/* ── 03 制作の流れ ── */}
            <SectionHead no="03" tag="1週間前後で納品">制作の流れ</SectionHead>
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5 sm:gap-2.5">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3 rounded-2xl border border-[#f6dcd9] bg-white px-3.5 py-2.5 sm:block sm:px-2 sm:py-3.5 sm:text-center">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[16px] font-black text-white sm:mx-auto" style={{ background: DEEP }}>{i + 1}</span>
                  <p className="text-balance text-[15px] font-black leading-snug sm:mt-2 sm:text-[13.5px]" style={{ color: INK }}>{s}</p>
                </li>
              ))}
            </ol>

            {/* ── 知っておくこと ── */}
            <div className="mt-6 rounded-2xl bg-[#fde8e6] px-4 sm:px-6 py-5">
              <p className="text-[17px] font-black" style={{ color: MAIN }}>知っておくこと</p>
              <ul className="mt-2.5 space-y-2.5">
                <li>
                  <p className="text-[14.5px] font-black" style={{ color: INK }}>写真や文章の用意は、いりません。</p>
                  <p className="text-[13.5px] leading-relaxed text-slate-600">ドメインの取得からキービジュアル・写真・文章の設定まで、運営がおこないます。</p>
                </li>
                <li>
                  <p className="text-[14.5px] font-black" style={{ color: INK }}>公開したあとは、フクエスを更新するだけ。</p>
                  <p className="text-[13.5px] leading-relaxed text-slate-600">ご質問は無料です。ページ内容の変更などの作業のご依頼は、1回 3,300円（複雑な作業はお見積り）。</p>
                </li>
              </ul>
              <p className="mt-2.5 text-[12.5px] text-slate-500">※ 独自ドメインのメールアドレスは対象外です。</p>
            </div>

            <p className="mt-7 border-t border-[#f6dcd9] pt-4 text-center text-[13.5px] font-bold" style={{ color: DEEP }}>
              くわしい説明は、
              <Link href="/hp/templates" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: MAIN }}>公式ホームページ制作のページ</Link>
              をご覧ください。
            </p>
          </div>
        </article>

        {/* ★ ボタンは紙の外に大きく。★ PC は横並び・スマホは縦並び */}
        <div className="mt-5 flex flex-col gap-3 pb-6 sm:flex-row">
          <Link href="/hp/templates/designs" target="_blank" rel="noopener noreferrer" className="flex-1 py-4 text-center text-[17px] font-black text-white shadow-md hover:opacity-95" style={{ background: `linear-gradient(to right, ${DEEP}, ${MAIN})` }}>
            デザインを見る →
          </Link>
          <Link href="/hp/templates/contact" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center border-2 bg-white px-5 py-3.5 text-[14.5px] font-bold hover:bg-red-50" style={{ borderColor: MAIN, color: DEEP }}>
            制作について問い合わせる
          </Link>
          <Link href="/mypage" className="flex items-center justify-center bg-slate-800 px-5 py-3.5 text-[14.5px] font-bold text-white hover:opacity-90">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
