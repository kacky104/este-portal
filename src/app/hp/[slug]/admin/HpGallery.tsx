'use client';

import { useState } from 'react';
import {
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  type HpTemplateKey,
} from '@/app/lib/hpSite';
import { DesignThumb, HP_TEMPLATE_NOTES, hpVariantColors } from '@/app/hp/_templates/DesignThumb';

// ひな形ギャラリー（2026-08-09）。
//
// ※ 方針変更（2026-08-09 夕）: デザインは店舗に自己判断させず、打ち合わせで決める。
//   店舗にはデザイン一覧（/hp/templates・公開）を見せて口頭で決定し、
//   【この画面は運営専用】として決定内容をここから設定・確定する（HpAdminApp が
//   role==='operator' のときだけ表示）。実物プレビュー（/hp/[slug]/preview/…）で
//   その店の実データが入った状態を確認してから確定できる。
//
// 確定するとロックされ、以後ひな形・カラーは saveHpSiteContent では変更できない
// （解除は SQL で design_locked=false に戻す）。

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

  const { accent, deep } = hpVariantColors(template, color);
  const colorLabel = HP_COLOR_VARIANTS[template].find((v) => v.key === color)?.label ?? '';
  const templateLabel = HP_TEMPLATES.find((t) => t.key === template)?.label ?? '';

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h2 className="text-sm font-black text-slate-800">デザインを選ぶ</h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          ひな形4種類 × カラー（タイプSは3色・ほかは各6色）から1つお選びください。
          選んだ組み合わせは、<span className="font-bold text-slate-700">お店の実際のデータが入った実物のページ</span>で確認できます。
          <br />
          <span className="font-bold text-rose-500">選んで確定すると、あとから変更できません。</span>
          写真・文章はいつでも変更できます。変更できないのは「型」と「色」だけです。
        </p>
      </div>

      {/* ── ひな形 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-xs font-bold text-slate-600">1. ひな形</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HP_TEMPLATES.map((t) => {
            const c = hpVariantColors(t.key, HP_COLOR_VARIANTS[t.key][0].key);
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
                <DesignThumb template={t.key} accent={c.accent} deep={c.deep} colorKey={HP_COLOR_VARIANTS[t.key][0].key} />
                <span className={`block px-2 py-2 text-[11px] font-bold ${on ? 'bg-pink-50 text-pink-600' : 'bg-white text-slate-500'}`}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{HP_TEMPLATE_NOTES[template]}</p>
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
              <DesignThumb template={template} accent={accent} deep={deep} colorKey={color} />
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
