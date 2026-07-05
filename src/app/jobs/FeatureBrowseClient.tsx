'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// FeatureBrowse の開閉部分だけを担うクライアントコンポーネント（アイコンfetch・href生成はサーバー側で完了済み）。
// 排他アコーディオン：1つ開くと他は閉じる／開いているタイルを再クリックで閉じる／初期は全閉。
export type FeatureBrowseTag = { slug: string; label: string; href: string; active: boolean };
export type FeatureBrowseCategory = {
  key: string;          // カテゴリーキー（= JOB_FEATURE_GROUPS の title・DB category 値）
  label: string;        // 表示名（key と同一）
  imageUrl: string | null;
  tags: FeatureBrowseTag[];
};

export function FeatureBrowseClient({
  title,
  categories,
}: {
  title: string;
  categories: FeatureBrowseCategory[];
}) {
  // 開いているカテゴリーの key（null = 全閉）。排他式のため単一値で管理。
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openCategory = categories.find((c) => c.key === openKey) ?? null;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(to bottom,#10B981,#84CC16)' }} />
        <h2 className="font-bold text-slate-900 text-sm">{title}</h2>
      </div>

      {/* カテゴリータイル：SP/PCとも横4つ・正方形（1:1）。クリックで排他アコーディオンを開閉。
          画像ありは写真タイル（オーバーレイなし・カテゴリー名は画像に焼き込み運用）。
          画像なしはチップ風テキストタイルを同セルに表示（グリッドは崩さない）。
          開いているタイルは ring-2 ring-emerald-500 でアクティブ表示（AreaBrowse と統一）。 */}
      <div className="grid grid-cols-4 gap-2">
        {categories.map((c) => {
          const open = c.key === openKey;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setOpenKey(open ? null : c.key)}
              aria-expanded={open}
              aria-label={`${c.label}の特徴タグを${open ? '閉じる' : '開く'}`}
              className={`relative block aspect-square rounded-xl overflow-hidden border transition-shadow ${
                open ? 'border-transparent ring-2 ring-emerald-500' : 'border-emerald-100'
              }`}
            >
              {c.imageUrl ? (
                <Image
                  src={c.imageUrl}
                  alt={c.label}
                  fill
                  sizes="25vw"
                  className="object-cover"
                />
              ) : (
                // 画像未設定：チップ風テキストタイル。開閉トリガーとして画像タイルと同様に動作。
                <span
                  className="flex items-center justify-center w-full h-full text-center text-[11px] font-bold leading-tight px-1"
                  style={{ color: '#059669' }}
                >
                  {c.label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 展開パネル：開いているカテゴリーの特徴タグチップを、タイル行の下に全幅で表示。
          チップの遷移先（href）と現在タグ強調（active）はサーバー側で確定済み＝各ページの現状挙動を維持。 */}
      {openCategory && (
        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="flex flex-wrap gap-1.5">
            {openCategory.tags.map((t) => (
              <Link
                key={t.slug}
                href={t.href}
                aria-current={t.active ? 'page' : undefined}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors"
                style={
                  t.active
                    ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#ffffff', borderColor: 'transparent' }
                    : { borderColor: '#A7F3D0', color: '#059669' }
                }
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
