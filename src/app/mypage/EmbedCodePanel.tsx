'use client';

import { useState } from 'react';

// mypage 店舗タブ「公式サイトに貼る埋め込みコード」（2026-08-06 新設）。
//
// 契約店舗の公式ホームページに iframe で貼ってもらう2種類のウィジェット
// （/embed/salon/[id]/diary＝写メ日記3列×4段 / /embed/salon/[id]/reviews＝口コミ3件）の
// タグをコピーできるパネル。オーナーが自分でコピーして制作会社等に渡す想定。
//
// iframe の高さ:
//  - 日記は「幅に応じて高さが変わる」ため aspect-ratio で指定（3列×4段＋見出し・フッター分）。
//  - 口コミは本文を3行でクランプしているので固定高でよい。420 は PC幅前提のジャスト寄りの値
//    （スマホ幅では折返しが増えて下が切れることがある→その場合は貼り付け先で height を増やしてもらう。
//     2026-08-07 に 480→420 へ変更。余白が目立つという店舗フィードバックによる）。

const SITE = 'https://fukues.com';

function buildDiaryTag(salonId: number): string {
  return `<iframe src="${SITE}/embed/salon/${salonId}/diary" style="width:100%;max-width:600px;aspect-ratio:10/15;border:none;" loading="lazy" title="写メ日記（フクエス）"></iframe>`;
}

function buildReviewsTag(salonId: number): string {
  return `<iframe src="${SITE}/embed/salon/${salonId}/reviews" style="width:100%;max-width:600px;border:none;" height="420" loading="lazy" title="口コミ（フクエス）"></iframe>`;
}

// SEO用の通常テキストリンク。iframe の中のリンクは検索エンジンに「設置先からのリンク」として
// カウントされないため、被リンクとして効かせたい場合はこれを併設してもらう（2026-08-07 追加）。
// アンカーテキストは店舗名＋内容がわかる自然な文言にする（「こちら」等は避ける）。
function buildTextLinkTag(salonId: number, salonName: string): string {
  const label = `${salonName}の写メ日記・口コミ（福岡メンズエステ情報 フクエス）`;
  return `<a href="${SITE}/salon/${salonId}">${label}</a>`;
}

function CodeBlock({
  label,
  description,
  code,
  previewUrl,
  onToast,
}: {
  label: string;
  description: string;
  code: string;
  previewUrl: string;
  onToast: (m: string) => void;
}) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      onToast(`${label}のコードをコピーしました`);
    } catch {
      onToast('コピーに失敗しました');
    }
  };
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <p className="text-xs font-bold text-slate-600">{label}</p>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-pink-500 hover:text-pink-600"
        >
          プレビューを見る →
        </a>
      </div>
      <p className="text-[11px] text-slate-400 mb-1.5">{description}</p>
      <div className="flex items-start gap-2">
        <textarea
          readOnly
          value={code}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`${label}の埋め込みコード`}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-[11px] font-mono text-slate-600 resize-none focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 px-3 py-2 rounded-xl border border-pink-200 text-xs font-bold text-pink-500 hover:bg-pink-50 transition-colors"
        >
          コピー
        </button>
      </div>
    </div>
  );
}

export function EmbedCodePanel({
  salonId,
  salonName,
  onToast,
}: {
  salonId: number;
  salonName: string;
  onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <div>
          <h2 className="text-sm font-black text-slate-700">公式サイトに貼る埋め込みコード</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">
            お店の公式ホームページに、フクエスの写メ日記・口コミをそのまま表示できます
          </p>
        </div>
        <span className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 rounded-xl px-3 py-2">
            下のコードを公式サイトのHTMLに貼り付けるだけで表示されます（制作会社さんにそのまま渡してもOKです）。
            内容はフクエスの掲載情報から自動で更新され、クリックするとフクエスの該当ページが新しいタブで開きます。
          </p>

          <CodeBlock
            label="写メ日記ウィジェット"
            description="最新の写メ日記を3列×4段（最大12件）のサムネイルで表示します。"
            code={buildDiaryTag(salonId)}
            previewUrl={`/embed/salon/${salonId}/diary`}
            onToast={onToast}
          />

          <CodeBlock
            label="口コミウィジェット"
            description="承認済みの新着口コミ3件と平均評価を表示します。"
            code={buildReviewsTag(salonId)}
            previewUrl={`/embed/salon/${salonId}/reviews`}
            onToast={onToast}
          />

          <CodeBlock
            label="テキストリンク（SEO用・推奨）"
            description="ウィジェットの近くにこの通常リンクも貼ると、検索エンジンからの評価（被リンク）につながります。ウィジェットだけではリンクとしてカウントされないため、あわせての設置がおすすめです。"
            code={buildTextLinkTag(salonId, salonName)}
            previewUrl={`/salon/${salonId}`}
            onToast={onToast}
          />
        </div>
      )}
    </div>
  );
}
