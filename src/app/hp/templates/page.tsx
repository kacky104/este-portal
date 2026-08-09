import type { Metadata } from 'next';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  HP_DEMO_SLUG,
  type HpTemplateKey,
} from '@/app/lib/hpSite';
import { DesignThumb, HP_TEMPLATE_NOTES, hpVariantColors } from '@/app/hp/_templates/DesignThumb';

// 公式ホームページ制作の【LP 兼 デザイン一覧】（2026-08-09）。
//
// vootec の /lp/mens-esthe を参考にした営業用ページ。契約店舗（・検討中の店舗）には
// このページを見せてデザインを会話で決め、設定・カスタマイズ・納品はすべて運営が行う。
//
// 構成（順次拡張していく。2026-08-09 はヒーロー＋デザイン一覧まで）:
//   1. ヒーロー … 用意されたキービジュアル（文字入り）。PC=16:9・スマホ=縦長を出し分け。
//      文字が画像に焼き込まれているため cover で切り抜かず、原寸比率のまま画面幅いっぱいに表示
//      （フルHDでほぼ画面ぴったり。切り抜くと端の文字が欠ける）。
//   2. デザイン一覧 … 3ひな形×6色。ヒーローに合わせた白×ピンク×金の明るいトーン。
//   3. （予定）料金・制作の流れ・お問い合わせ
//
// 画像: public/hp-lp/hero-pc.webp（2400×1350）/ hero-sp.webp（1080×1620）。
// 差し替え時は同名で上書きすればよい（この寸法・比率を守ること）。
//
// 各デザインの「デモを見る」は /hp/demo/preview/{template}/{color} へ。
// demo は HP_DEMO_SLUG の予約 slug で、この slug に限りプレビューがログイン不要
// （★デモ用サロンの用意は保留中・2026-08-09。行が無い間は 404 になる）。
//
// 静的セグメントなので /hp/[slug] より優先される（slug='templates' は発行禁止。HP_RESERVED_SLUGS）。

export const metadata: Metadata = {
  title: 'メンズエステ専門の公式ホームページ制作｜フクエス',
  description:
    'フクエス掲載店舗さま向け・メンズエステ専門の公式ホームページ制作。集客・信頼・ブランディングを加速させる、高級感のあるデザイン18パターン。ドメイン取得から制作・運用まで運営がすべて対応します。',
};

const TEMPLATE_TITLES: Record<HpTemplateKey, { en: string; name: string }> = {
  a: { en: 'LUXE',  name: '高級・しっとり' },
  b: { en: 'CLEAN', name: '清潔感・癒やし' },
  c: { en: 'MODE',  name: '都会的・シャープ' },
};

export default function HpTemplatesPage() {
  return (
    <div className="min-h-screen bg-[#fdf5f5] text-[#4a3f3a]">
      {/* ── ヒーロー（KV・文字焼き込み済み）──
          PC は 16:9・スマホは縦長を <picture> で出し分け。文字が欠けるため cover 切り抜きはしない */}
      <section>
        <picture>
          <source media="(max-width: 639px)" srcSet="/hp-lp/hero-sp.webp" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hp-lp/hero-pc.webp"
            alt="メンズエステ専門のホームページ制作 — 集客・信頼・ブランディングを加速させる。デザイン性・スマホ対応・集客サポート。すべてのデバイスで美しく、使いやすく。"
            className="block w-full h-auto"
            fetchPriority="high"
          />
        </picture>
      </section>

      {/* ── デザイン一覧 ── */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-16">
        <header className="text-center mb-10">
          <p className="text-[11px] tracking-[.3em] text-[#c99ba6] mb-2">DESIGN LINEUP</p>
          <h2 className="text-xl sm:text-2xl font-bold tracking-wider mb-4 text-[#3f342e]">
            選べるデザイン <span className="text-[#b98d4f]">全18パターン</span>
          </h2>
          <p className="text-[13px] leading-relaxed text-[#8a7a70] max-w-xl mx-auto">
            3つのひな形 × 各6カラーをご用意しました。
            気になるデザインが決まりましたら、担当者までお知らせください。
            <br className="hidden sm:block" />
            ドメイン取得・制作・写真や文章の設定まで、すべて運営がおこなって納品します。
          </p>
        </header>

        <div className="space-y-8">
          {HP_TEMPLATES.map((t) => {
            const title = TEMPLATE_TITLES[t.key];
            const variants = HP_COLOR_VARIANTS[t.key];
            return (
              <section key={t.key} className="rounded-2xl border border-[#f0dde0] bg-white shadow-sm p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
                  <div>
                    <p className="text-[10px] tracking-[.28em] text-[#b98d4f]">{title.en}</p>
                    <h3 className="text-lg font-bold tracking-wide text-[#3f342e]">
                      {t.label}
                      <span className="ml-3 text-[12px] font-normal text-[#8a7a70]">{title.name}</span>
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#a08e84]">{HP_TEMPLATE_NOTES[t.key]}</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {variants.map((v) => {
                    const c = hpVariantColors(t.key, v.key);
                    return (
                      <a
                        key={v.key}
                        href={`/hp/${HP_DEMO_SLUG}/preview/${t.key}/${v.key}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group block rounded-xl overflow-hidden border border-[#ecdcdc] hover:border-[#d5a86b] hover:shadow-md transition-all"
                      >
                        <DesignThumb template={t.key} accent={c.accent} deep={c.deep} />
                        <span className="flex items-center justify-between px-2.5 py-2 bg-[#faf4f0] text-[10px] font-bold text-[#7a6a60]">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-black/10 flex-shrink-0"
                              style={{ backgroundColor: c.accent }}
                            />
                            <span className="truncate">{v.label}</span>
                          </span>
                          <span className="text-[#b98d4f] flex-shrink-0">デモ →</span>
                        </span>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      {/* ── フッター（お問い合わせ）── */}
      <footer className="border-t border-[#f0dde0] bg-white">
        <div className="mx-auto max-w-5xl px-5 py-10 text-center space-y-3">
          <p className="text-[13px] leading-relaxed text-[#6d5d53]">
            「デモ →」から、サンプル店舗のデータが入った実際のページをご覧いただけます。
            <br className="hidden sm:block" />
            写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
          </p>
          <p className="text-[12px] text-[#a08e84]">
            掲載・制作のご相談：フクエス運営事務局（
            <a href="mailto:info@fukues.com" className="underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
            ）
          </p>
        </div>
      </footer>
    </div>
  );
}
