'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateFeaturedJobs } from '@/app/actions/jobs';
import { AREA_SLUGS_LIST, areaFromSlug } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// エリアアイコン（area_browse_icons）管理。AreaBannerManager を雛形に新設（構造・流儀を踏襲）。
// authenticated クライアント直（RLSで admin UUID のみ許可）。SP/PC 2枚方式（バナーと同構成：sp_image_url / pc_image_url）。
//
// 画像パスは `icons/{slug}/{timestamp}.{ext}` でユニーク化（固定名+upsert だと差し替えても public URL 不変で
// CDN/ブラウザが旧画像をキャッシュし続けるバグの再発防止＝featured/banner 画像で根治済みの方式を踏襲。upsert は使わない）。
// Storage は既存バケット area-banners を相乗り（新バケット不要）。ただしアイコンは必ず icons/ プレフィックス配下に置き、
// 旧ファイル掃除も icons/ 配下限定で判定する（バナー画像 {slug}/... 直下を絶対に誤削除しない）。
// 保存成功後 revalidateFeaturedJobs() で /jobs＋5エリア＋出張専門(/jobs/dispatch)の7パスを再検証。
const BUCKET = 'area-banners';
const ICON_PREFIX = 'icons/';

// 通常5エリア＋出張専門（計6行）。slug=Storageパス/命名用、area=DB値（area_browse_icons.area のキー・例 '博多・住吉'）。
// 出張は slug='dispatch' / area='出張'（Storageパスは icons/dispatch/{timestamp}.{ext} になる）。
// label は行の表示名。出張は areaLabel('出張')='出張' ではなく「出張専門」を固定文字列で特別扱いし /jobs/dispatch と揃える。
const AREA_ROWS = AREA_SLUGS_LIST.map((slug) => {
  const area = areaFromSlug(slug) as string;
  return { slug, area, label: slug === 'dispatch' ? '出張専門' : areaLabel(area) };
});

type IconRow = { spUrl: string | null; pcUrl: string | null };

export default function AreaIconManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [rows,     setRows]     = useState<Record<string, IconRow>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ area: string; slug: string; kind: 'sp' | 'pc' } | null>(null);

  const fetchIcons = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data, error } = await sb
      .from('area_browse_icons')
      .select('area, sp_image_url, pc_image_url');

    if (error) {
      setErrorMsg('area_browse_icons テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }

    const byArea: Record<string, IconRow> = {};
    (data ?? []).forEach((r) => {
      byArea[r.area as string] = {
        spUrl: (r.sp_image_url as string | null) ?? null,
        pcUrl: (r.pc_image_url as string | null) ?? null,
      };
    });
    setErrorMsg('');
    setRows(byArea);
    setLoading(false);
  }, []);

  useEffect(() => { fetchIcons(); }, [fetchIcons]);

  const triggerUpload = (area: string, slug: string, kind: 'sp' | 'pc') => {
    uploadTarget.current = { area, slug, kind };
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
    const { area, slug, kind } = target;

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    // timestamp でユニーク化（差し替え時に public URL が必ず変わる＝旧キャッシュを引かない）。upsert は使わない。
    // アイコンは sp/pc とも必ず icons/ プレフィックス配下に置く（バナー画像 {slug}/... 直下と分離）。
    const path = `${ICON_PREFIX}${slug}/${Date.now()}.${ext}`;

    setSaving(true);

    // 差し替え前の旧storageパスを控える（icons/ 配下の Storage 由来URLのみ後で掃除。相対パス初期データ・バナーは対象外）。
    const current = rows[area];
    const oldUrl = current ? (kind === 'sp' ? current.spUrl : current.pcUrl) : null;
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
    const col = kind === 'sp' ? 'sp_image_url' : 'pc_image_url';
    // area UNIQUE を利用した upsert（行が無ければ insert、あれば該当カラム＋updated_at のみ更新。
    // ペイロードに無いもう片方の image_url は保持される）。
    const { error: dbErr } = await supabase
      .from('area_browse_icons')
      .upsert({ area, [col]: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'area' });

    if (dbErr) {
      onToast(`保存に失敗しました: ${dbErr.message}`);
    } else if (oldPath && oldPath !== path && oldPath.startsWith(ICON_PREFIX)) {
      // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。icons/ 配下のみ＝バナー誤削除を防ぐ。
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    resetInput(e);
    setSaving(false);
    if (!dbErr) await revalidateFeaturedJobs();
    await fetchIcons();
  };

  const handleDeleteImage = async (area: string, kind: 'sp' | 'pc') => {
    const current = rows[area];
    const url = current ? (kind === 'sp' ? current.spUrl : current.pcUrl) : null;
    if (!url) return;

    setSaving(true);
    const col = kind === 'sp' ? 'sp_image_url' : 'pc_image_url';
    // 削除は行を消さず該当カラムを null 化（AreaBannerManager の削除流儀に合わせる）。
    const { error } = await supabase
      .from('area_browse_icons')
      .update({ [col]: null, updated_at: new Date().toISOString() })
      .eq('area', area);

    if (error) {
      onToast(`削除に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }
    // icons/ 配下の Storage 由来URLのみ物理削除（相対パス初期データ・バナー画像 {slug}/... 直下は触らない）。
    if (url.includes(`/${BUCKET}/`)) {
      const p = url.split(`/${BUCKET}/`)[1];
      if (p && p.startsWith(ICON_PREFIX)) await supabase.storage.from(BUCKET).remove([p]);
    }
    setSaving(false);
    await revalidateFeaturedJobs();
    await fetchIcons();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[10px] text-slate-400">推奨: SP 640×160px（4:1）／ PC 640×320px（2:1）</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        「エリアから探す」（/jobs・エリアページ）のタイル画像です。SP・PC は個別に設定でき、未設定のエリアはテキストチップで表示されます。
      </p>

      {/* hidden file input（sp/pc 共用・uploadTarget で識別） */}
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
          {AREA_ROWS.map(({ area, slug, label }) => {
            const row = rows[area];
            return (
              <div key={slug} className="bg-emerald-50/40 rounded-2xl px-4 py-3 border border-emerald-100/70">
                {/* 1エリア=1行。エリア名＋SP(4:1)＋PC(2:1)を横並び。高さ h-24 に揃え、比率は aspect で維持。
                    admin はPC利用前提のため md未満は折り返し許容（崩れなければ十分）。 */}
                <div className="flex flex-wrap items-start gap-4">
                  <p className="text-xs font-bold text-slate-800 w-24 flex-shrink-0 pt-4">{label}</p>
                  {(['sp', 'pc'] as const).map((kind) => {
                    const url = kind === 'sp' ? row?.spUrl ?? null : row?.pcUrl ?? null;
                    // 高さ固定 h-24（96px）＋aspectで幅が決まる：SP=4/1(約384px)／PC=2/1(約192px)。
                    // 未設定プレースホルダーも同じ h-24・同aspectにして6エリアの行高を揃える。
                    const aspect = kind === 'sp' ? 'aspect-[4/1]' : 'aspect-[2/1]';
                    return (
                      <div key={kind} className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400">{kind.toUpperCase()}</span>
                        {url ? (
                          <>
                            {/* 全体表示（切り抜きなし）：object-contain＋薄色背景で画像の余白と区別できるようにする。 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${label} ${kind} アイコン`}
                              className={`h-24 ${aspect} object-contain rounded-lg border border-emerald-100 bg-slate-50`}
                            />
                            <div className="flex gap-2 mt-0.5">
                              <button
                                onClick={() => triggerUpload(area, slug, kind)}
                                disabled={saving}
                                className="text-[10px] font-semibold hover:underline disabled:opacity-40 transition-opacity"
                                style={{ color: '#059669' }}
                              >
                                変更
                              </button>
                              <button
                                onClick={() => handleDeleteImage(area, kind)}
                                disabled={saving}
                                className="text-[10px] text-rose-400 font-semibold hover:underline disabled:opacity-40 transition-opacity"
                              >
                                削除
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            onClick={() => triggerUpload(area, slug, kind)}
                            disabled={saving}
                            className={`h-24 ${aspect} text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg bg-slate-50 flex items-center justify-center text-center px-2 hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-40 transition-colors`}
                          >
                            📷 未設定
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
