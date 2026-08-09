'use client';

import { useState } from 'react';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  type HpTemplateKey,
} from '@/app/lib/hpSite';

// ひな形ギャラリー（2026-08-09 段階3）。
//
// 3ひな形 × 各6色 = 18通りから1つ選んで【確定】する画面。確定するとロックされ、
// 以後ひな形とカラーは店舗側から変更できない（変更は運営の有償作業）。
// 確定前の1回きりの画面なので、公開ページ（/hp/[slug]）のデータ取得には一切依存させない
// （＝写真も文章も未入力の状態で選べる）。
//
// サムネイルは公開ページのCSSを流用せず、ここだけの簡易表現で描いている（雰囲気の当たり用）。
// 【実物の確認】は /hp/[slug]/preview/{template}/{color} に任せる：その店の実データが入った
// 公開ページを選択中のひな形×カラーでそのまま描画する（2026-08-09 追加。簡易サムネだけで
// 変更不可の確定をさせるのは無理がある、という指摘への対応）。確定前に必ずここへ誘導する。

type ThumbProps = { template: HpTemplateKey; accent: string; deep: string };

function Thumb({ template, accent, deep }: ThumbProps) {
  if (template === 'a') {
    // LUXE: 黒基調・明朝・細い金の罫線
    return (
      <div style={{ background: '#17161a', color: '#e8e3d9', padding: '14px 12px', height: 168, fontFamily: 'serif' }}>
        <div style={{ height: 44, background: `linear-gradient(135deg, ${accent}66, #0b0a0c 70%)`, border: `1px solid ${accent}55` }} />
        <div style={{ width: 22, height: 1, background: accent, margin: '14px auto 8px' }} />
        <div style={{ fontSize: 8, letterSpacing: '.28em', textAlign: 'center', color: accent }}>CONCEPT</div>
        <div style={{ margin: '10px auto 0', width: '78%' }}>
          <div style={{ height: 3, background: '#3a3730', marginBottom: 5 }} />
          <div style={{ height: 3, background: '#3a3730', marginBottom: 5 }} />
          <div style={{ height: 3, background: '#3a3730', width: '60%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 30, background: '#232026', border: `1px solid ${accent}33` }} />
          ))}
        </div>
      </div>
    );
  }
  if (template === 'b') {
    // CLEAN: 生成り地・丸ゴシック・面で見せる
    return (
      <div style={{ background: '#faf7f2', color: '#4a463f', padding: '14px 12px', height: 168 }}>
        <div style={{ height: 44, background: `linear-gradient(135deg, ${accent}, ${deep})`, borderRadius: 10 }} />
        <div style={{ fontSize: 9, fontWeight: 800, marginTop: 12, color: deep }}>コンセプト</div>
        <div style={{ marginTop: 8 }}>
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, marginBottom: 5 }} />
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, marginBottom: 5 }} />
          <div style={{ height: 3, background: '#ded8cf', borderRadius: 2, width: '55%' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ flex: 1, height: 30, background: '#fff', borderRadius: 8, border: '1px solid #e7e1d8' }} />
          ))}
        </div>
      </div>
    );
  }
  // MODE: 白地・太ゴシック・連番と極太アクセント
  return (
    <div style={{ background: '#fff', color: '#111114', padding: '14px 12px', height: 168 }}>
      <div style={{ height: 44, background: '#111114' }} />
      {/* アクセント帯はヒーローの【下】に置く。中に重ねると mono（黒）が黒地に沈んで見えないため */}
      <div style={{ width: 52, height: 5, background: accent }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: accent }}>01</span>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: '.1em' }}>CONCEPT</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ height: 3, background: '#e3e3e6', marginBottom: 5 }} />
        <div style={{ height: 3, background: '#e3e3e6', marginBottom: 5 }} />
        <div style={{ height: 3, background: '#e3e3e6', width: '50%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginTop: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 30, background: '#f1f1f3' }} />
        ))}
      </div>
    </div>
  );
}

function variantColors(template: HpTemplateKey, colorKey: string): { accent: string; deep: string } {
  const list = HP_COLOR_VARIANTS[template];
  const v = list.find((x) => x.key === colorKey) ?? list[0];
  const accent = v.css['--hp-accent'] ?? '#c4a469';
  const deep = v.css['--hp-accent-deep'] ?? v.css['--hp-accent-soft'] ?? accent;
  return { accent, deep };
}

const TEMPLATE_NOTE: Record<HpTemplateKey, string> = {
  a: '黒基調・明朝体の高級路線。落ち着いた大人向けの店舗に。',
  b: '生成り地のやわらかい印象。清潔感・癒やし系の店舗に。',
  c: '白地に太字とアクセント。都会的でシャープな印象に。',
};

export function HpGallery({
  onConfirm,
  busy,
  previewHref,
}: {
  onConfirm: (template: HpTemplateKey, color: string) => void;
  busy: boolean;
  previewHref: string;
}) {
  const [template, setTemplate] = useState<HpTemplateKey>('a');
  const [color, setColor] = useState<string>(HP_COLOR_VARIANTS.a[0].key);
  const [asking, setAsking] = useState(false);

  const pickTemplate = (t: HpTemplateKey) => {
    setTemplate(t);
    setColor(HP_COLOR_VARIANTS[t][0].key); // ひな形ごとに色の体系が違うので先頭色へ戻す
  };

  // 実物プレビューのURL。previewHref は公開ページの場所（店舗ドメインなら '/'・
  // fukues.com なら '/hp/{key}'）なので、その配下の /preview/… に繋げる。
  const livePreviewUrl =
    previewHref === '/' ? `/preview/${template}/${color}` : `${previewHref}/preview/${template}/${color}`;

  const { accent, deep } = variantColors(template, color);
  const colorLabel = HP_COLOR_VARIANTS[template].find((v) => v.key === color)?.label ?? '';
  const templateLabel = HP_TEMPLATES.find((t) => t.key === template)?.label ?? '';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h2 className="text-sm font-black text-slate-800">デザインを選ぶ</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          ひな形3種類 × カラー6色から1つお選びください。
          選んだ組み合わせは、<span className="font-bold text-slate-700">お店の実際のデータが入った実物のページ</span>で確認できます。
          <br />
          <span className="font-bold text-rose-500">選んで確定すると、あとから変更できません。</span>
          写真・文章はいつでも変更できます。変更できないのは「型」と「色」だけです。
        </p>
      </div>

      {/* ── ひな形 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-xs font-bold text-slate-600">1. ひな形</p>
        <div className="grid grid-cols-3 gap-3">
          {HP_TEMPLATES.map((t) => {
            const c = variantColors(t.key, HP_COLOR_VARIANTS[t.key][0].key);
            const on = template === t.key;
            return (
              <button
                key={t.key}
                onClick={() => pickTemplate(t.key)}
                aria-pressed={on}
                className={`text-left rounded-xl overflow-hidden border-2 transition-colors ${
                  on ? 'border-pink-400' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <Thumb template={t.key} accent={c.accent} deep={c.deep} />
                <span className={`block px-2 py-2 text-[11px] font-bold ${on ? 'bg-pink-50 text-pink-600' : 'bg-white text-slate-500'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{TEMPLATE_NOTE[template]}</p>
      </div>

      {/* ── カラー ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-xs font-bold text-slate-600">2. カラー</p>
        <div className="flex flex-wrap gap-2">
          {HP_COLOR_VARIANTS[template].map((v) => {
            const on = color === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setColor(v.key)}
                aria-pressed={on}
                title={v.label}
                className={`flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border transition-colors ${
                  on ? 'border-pink-400 bg-pink-50 text-pink-600' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <span
                  className="w-5 h-5 rounded-full border border-black/10"
                  style={{ backgroundColor: v.css['--hp-accent'] }}
                />
                <span className="text-[11px] font-bold">{v.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 実物プレビューと確定 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-bold text-slate-600">3. 実物を確認して確定</p>
        <p className="text-center text-xs font-bold text-slate-700">
          いま選んでいるもの：{templateLabel}／{colorLabel}
        </p>
        <a
          href={livePreviewUrl}
          target="_blank"
          rel="noreferrer"
          className="block w-full py-3 rounded-full border-2 border-pink-400 text-pink-600 text-sm font-black text-center hover:bg-pink-50 transition-colors"
        >
          この組み合わせを実物のページで見る
        </a>
        <p className="text-[11px] text-slate-400 text-center leading-relaxed">
          お店の実際のセラピスト・出勤・料金が入った状態のページが別タブで開きます。
          スマートフォンでの見え方は、開いたページのURLをスマートフォンに送ってご確認ください。
        </p>
        <button
          onClick={() => setAsking(true)}
          disabled={busy}
          className="w-full py-3 rounded-full bg-pink-500 text-white text-sm font-black hover:bg-pink-600 transition-colors disabled:opacity-50"
        >
          このデザインで確定する
        </button>
        <p className="text-[11px] text-slate-400 text-center leading-relaxed">
          迷う場合は確定せずに閉じてかまいません。確定後にこのページを開くと、写真や文章の入力画面になります。
        </p>
      </div>

      {/* ── 確定モーダル ── */}
      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-black text-slate-800">このデザインで確定しますか？</h3>
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <Thumb template={template} accent={accent} deep={deep} />
            </div>
            <p className="text-center text-xs font-bold text-slate-700">
              {templateLabel}／{colorLabel}
            </p>
            <p className="text-[11px] text-rose-500 leading-relaxed">
              確定すると、ひな形とカラーはあとから変更できません（変更をご希望の場合は運営事務局での有償作業となります）。
              写真・文章・表示するブロックは、確定後もいつでも変更できます。
            </p>
            <a
              href={livePreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-[11px] font-bold text-pink-600 hover:text-pink-700 underline"
            >
              実物のページをもう一度確認する（別タブ）
            </a>
            <div className="flex gap-2">
              <button
                onClick={() => setAsking(false)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-full border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"
              >
                もう少し選ぶ
              </button>
              <button
                onClick={() => onConfirm(template, color)}
                disabled={busy}
                className="flex-1 py-2.5 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 disabled:opacity-50"
              >
                {busy ? '確定中…' : '確定する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
