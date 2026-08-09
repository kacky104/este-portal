import type { Metadata } from 'next';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  HP_DEMO_SLUG,
  type HpTemplateKey,
} from '@/app/lib/hpSite';
import { DesignThumb, HP_TEMPLATE_NOTES, hpVariantColors } from '@/app/hp/_templates/DesignThumb';

// 公式ホームページの【デザイン一覧】（2026-08-09・公開ページ）。
//
// vootec の /template と同じ立ち位置の営業用ページ。契約店舗（・検討中の店舗）には
// このページを見せてデザインを会話で決め、設定・カスタマイズ・納品はすべて運営が行う
// （店舗の管理画面にはデザイン選択UIを出さない。2026-08-09 の方針変更）。
//
// 各デザインの「デモを見る」は /hp/demo/preview/{template}/{color} へ飛ぶ。
// demo は HP_DEMO_SLUG の予約 slug で、この slug に限りプレビューがログイン不要。
// ★運営の事前準備: ダミー内容のサロンを1つ作り salon_sites に slug='demo' の行を入れておくこと。
//   行が無い間は 404 になる（ページ自体は表示されるのでリンク切れにだけ注意）。
//
// 静的セグメントなので /hp/[slug] より優先される（slug='templates' は発行禁止。HP_RESERVED_SLUGS）。

export const metadata: Metadata = {
  title: '公式ホームページ デザイン一覧｜フクエス',
  description:
    'フクエス掲載店舗さま向け・公式ホームページ制作のデザイン一覧です。3つのひな形×各6カラーの計18パターンから、お店の雰囲気に合わせてお選びいただけます。',
};

const TEMPLATE_TITLES: Record<HpTemplateKey, { en: string; name: string }> = {
  a: { en: 'LUXE',  name: '高級・しっとり' },
  b: { en: 'CLEAN', name: '清潔感・癒やし' },
  c: { en: 'MODE',  name: '都会的・シャープ' },
};

export default function HpTemplatesPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 text-[#e8e3d9]">
      {/* ── ヘッダー ── */}
      <header className="text-center mb-12">
        <p className="text-[11px] tracking-[.3em] text-[#948f85] mb-3">OFFICIAL WEBSITE DESIGN</p>
        <h1 className="text-2xl font-bold tracking-wider mb-4">公式ホームページ デザイン一覧</h1>
        <p className="text-[13px] leading-relaxed text-[#b5afa3] max-w-xl mx-auto">
          フクエス掲載店舗さま向けの公式ホームページは、3つのひな形 × 各6カラーの
          計18パターンからお選びいただけます。
          <br />
          気になるデザインが決まりましたら、担当者までお知らせください。
          ドメイン取得・制作・写真や文章の設定まで、すべて運営がおこなって納品します。
        </p>
      </header>

      {/* ── ひな形ごとのセクション ── */}
      <div className="space-y-10">
        {HP_TEMPLATES.map((t) => {
          const title = TEMPLATE_TITLES[t.key];
          const variants = HP_COLOR_VARIANTS[t.key];
          return (
            <section key={t.key} className="rounded-2xl border border-[#33302c] bg-[#17161a] p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
                <div>
                  <p className="text-[10px] tracking-[.28em] text-[#948f85]">{title.en}</p>
                  <h2 className="text-lg font-bold tracking-wide">
                    {t.label}
                    <span className="ml-3 text-[12px] font-normal text-[#b5afa3]">{title.name}</span>
                  </h2>
                </div>
                <p className="text-[11px] text-[#948f85]">{HP_TEMPLATE_NOTES[t.key]}</p>
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
                      className="group block rounded-xl overflow-hidden border border-[#3a3730] hover:border-[#c4a469] transition-colors"
                    >
                      <DesignThumb template={t.key} accent={c.accent} deep={c.deep} />
                      <span className="flex items-center justify-between px-2.5 py-2 bg-[#201e23] text-[10px] font-bold text-[#b5afa3] group-hover:text-[#e8e3d9]">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-3 h-3 rounded-full border border-white/10"
                            style={{ backgroundColor: c.accent }}
                          />
                          {v.label}
                        </span>
                        <span className="text-[#c4a469]">デモ →</span>
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── フッター ── */}
      <footer className="mt-12 text-center space-y-3">
        <p className="text-[12px] leading-relaxed text-[#b5afa3]">
          「デモ →」から、サンプル店舗のデータが入った実際のページをご覧いただけます。
          <br className="hidden sm:block" />
          写真・文章・表示する内容は、お店ごとに運営がカスタマイズしてお納めします。
        </p>
        <p className="text-[11px] text-[#948f85]">
          掲載・制作のご相談：フクエス運営事務局（
          <a href="mailto:info@fukues.com" className="underline hover:text-[#e8e3d9]">info@fukues.com</a>
          ）
        </p>
      </footer>
    </div>
  );
}
