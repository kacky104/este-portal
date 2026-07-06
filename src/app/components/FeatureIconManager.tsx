'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateFeaturedJobs } from '@/app/actions/jobs';
import { JOB_FEATURE_CATEGORY_KEYS } from '@/app/lib/jobs';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 特徴カテゴリーアイコン（feature_category_icons）管理。AreaIconManager を雛形に新設（構造・流儀を踏襲）。
// authenticated クライアント直（RLSで admin UUID のみ許可）。特徴は image_url 1カラム方式（エリアの SP/PC 2枚とは異なる）。
//
// 画像パスは `feature-icons/{slug}/{timestamp}.{ext}` でユニーク化（固定名+upsert だと差し替えても public URL 不変で
// CDN/ブラウザが旧画像をキャッシュし続けるため。エリアアイコンと同方式。upsert は使わない）。
// Storage は既存バケット area-banners を相乗り（新バケット不要・ポリシー追加不要）。
// アイコンは必ず feature-icons/ プレフィックス配下に置き、旧ファイル掃除も feature-icons/ 配下限定で判定する
//（バナー画像 {slug}/... 直下・エリアアイコン icons/... 配下を絶対に誤削除しない＝二重防御）。
// 保存成功後 revalidateFeaturedJobs() で /jobs＋5エリア＋出張専門(/jobs/dispatch)の7パスを再検証。
const BUCKET = 'area-banners';
const FEATURE_PREFIX = 'feature-icons/';

// DBの category（＝ JOB_FEATURE_CATEGORY_KEYS の日本語キー）→ Storageパス用ASCIIスラッグ対応表。
// この対応表は Storage パス生成専用（DB・表示側には持ち込まない）。日本語をパスに使わないための admin ローカル定数。
const FEATURE_ICON_SLUGS: Record<string, string> = {
  '経験・年齢': 'experience-age',
  '働き方': 'workstyle',
  '待遇・お金': 'pay',
  '環境・安心': 'environment-safety',
};

// 表示行：category=DB値（feature_category_icons.category のキー＝表示ラベルも兼ねる）、slug=Storageパス用。
// 並び順・文字列は JOB_FEATURE_CATEGORY_KEYS をそのまま使用（表示側と厳密一致）。
const FEATURE_ROWS = JOB_FEATURE_CATEGORY_KEYS.map((category) => ({
  category,
  slug: FEATURE_ICON_SLUGS[category] ?? 'unknown',
  label: category,
}));

export default function FeatureIconManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [rows,     setRows]     = useState<Record<string, string | null>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ category: string; slug: string } | null>(null);

  const fetchIcons = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data, error } = await sb
      .from('feature_category_icons')
      .select('category, image_url');

    if (error) {
      setErrorMsg('feature_category_icons テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }

    const byCategory: Record<string, string | null> = {};
    (data ?? []).forEach((r) => {
      byCategory[r.category as string] = (r.image_url as string | null) ?? null;
    });
    setErrorMsg('');
    setRows(byCategory);
    setLoading(false);
  }, []);

  useEffect(() => { fetchIcons(); }, [fetchIcons]);

  const triggerUpload = (category: string, slug: string) => {
    uploadTarget.current = { category, slug };
    fileInputRef.current?.click();
  };

  const resetInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = '';
    uploadTarget.current = null;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = uploadTarget.current;
    if (!file || !target) return;
    const { category, slug } = target;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    // timestamp でユニーク化（差し替え時に public URL が必ず変わる＝旧キャッシュを引かない）。upsert は使わない。
    // 必ず feature-icons/ プレフィックス配下に置く（バナー {slug}/... 直下・エリアアイコン icons/... 配下と分離）。
    const path = `${FEATURE_PREFIX}${slug}/${Date.now()}.${ext}`;

    setSaving(true);

    // 差し替え前の旧storageパスを控える（feature-icons/ 配下の Storage 由来URLのみ後で掃除）。
    // 掃除対象は feature_category_icons テーブル由来の URL（＝rows[category]）のみ＝二重防御(2)。
    const oldUrl = rows[category] ?? null;
    const oldPath = oldUrl && oldUrl.includes(`/${BUCKET}/`) ? oldUrl.split(`/${BUCKET}/`)[1] : null;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });

    if (upErr) {
      onToast(`画像のアップロードに失敗しました: ${upErr.message}`);
      resetInput(e);
      setSaving(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    // category UNIQUE を利用した upsert（行が無ければ insert、あれば image_url＋updated_at を更新）。
    // category には JOB_FEATURE_CATEGORY_KEYS の日本語キーをそのまま入れる（表示側 fetchFeatureCategoryIcons と厳密一致）。
    const { error: dbErr } = await supabase
      .from('feature_category_icons')
      .upsert({ category, image_url: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'category' });

    if (dbErr) {
      onToast(`保存に失敗しました: ${dbErr.message}`);
    } else if (oldPath && oldPath !== path && oldPath.startsWith(FEATURE_PREFIX)) {
      // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
      // 二重防御：(1) feature-icons/ 前方一致 かつ (2) 掃除対象は feature_category_icons 由来URL（oldUrl=rows[category]）のみ。
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    resetInput(e);
    setSaving(false);
    if (!dbErr) await revalidateFeaturedJobs();
    await fetchIcons();
  };

  const handleDeleteImage = async (category: string) => {
    const url = rows[category] ?? null;
    if (!url) return;

    setSaving(true);
    // 削除は行を消さず image_url を null 化（表示側はテキストタイルにフォールバックする）。
    const { error } = await supabase
      .from('feature_category_icons')
      .update({ image_url: null, updated_at: new Date().toISOString() })
      .eq('category', category);

    if (error) {
      onToast(`削除に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }
    // 二重防御：(1) feature-icons/ 前方一致 かつ (2) 掃除対象は feature_category_icons 由来URL（url=rows[category]）のみ。
    // → バナー画像 {slug}/... 直下・エリアアイコン icons/... 配下には構造上絶対に到達しない。
    if (url.includes(`/${BUCKET}/`)) {
      const p = url.split(`/${BUCKET}/`)[1];
      if (p && p.startsWith(FEATURE_PREFIX)) await supabase.storage.from(BUCKET).remove([p]);
    }
    setSaving(false);
    await revalidateFeaturedJobs();
    await fetchIcons();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[10px] text-slate-400">推奨: 640×640px（1:1）</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
        「特徴から探す」（/jobs・タグ／エリアページ）のカテゴリータイル画像です。SP・PC 共通の1枚を設定します。
        スマホでは1タイル約80〜90px幅で表示されるため、カテゴリー名は画像に焼き込み・文字は大きくシンプルにしてください。
        未設定のカテゴリーはテキストタイルで表示されます。
      </p>

      {/* hidden file input（全カテゴリー共用・uploadTarget で識別） */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">
          ⚠ {errorMsg}
        </div>
      ) : (
        <div className="space-y-2">
          {FEATURE_ROWS.map(({ category, slug, label }) => {
            const url = rows[category] ?? null;
            return (
              <div key={slug} className="bg-emerald-50/40 rounded-2xl px-4 py-3 border border-emerald-100/70">
                {/* 1カテゴリー=1行。カテゴリー名＋正方形(1:1)プレビューを横並び。高さ h-24（96px）で揃える。 */}
                <div className="flex flex-wrap items-start gap-4">
                  <p className="text-xs font-bold text-slate-800 w-24 flex-shrink-0 pt-4">{label}</p>
                  {url ? (
                    <div className="flex flex-col gap-1">
                      {/* 全体表示（切り抜きなし）：object-contain＋薄色背景で画像の余白と区別できるようにする。 */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${label} アイコン`}
                        className="h-24 aspect-square object-contain rounded-lg border border-emerald-100 bg-slate-50"
                      />
                      <div className="flex gap-2 mt-0.5">
                        <button
                          onClick={() => triggerUpload(category, slug)}
                          disabled={saving}
                          className="text-[10px] font-semibold hover:underline disabled:opacity-40 transition-opacity"
                          style={{ color: '#059669' }}
                        >
                          変更
                        </button>
                        <button
                          onClick={() => handleDeleteImage(category)}
                          disabled={saving}
                          className="text-[10px] text-rose-400 font-semibold hover:underline disabled:opacity-40 transition-opacity"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => triggerUpload(category, slug)}
                      disabled={saving}
                      className="h-24 aspect-square text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg bg-slate-50 flex items-center justify-center text-center px-2 hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-40 transition-colors"
                    >
                      📷 未設定
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
