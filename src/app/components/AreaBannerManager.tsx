'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateFeaturedJobs } from '@/app/actions/jobs';
import { AREA_SLUGS_LIST, areaFromSlug } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// エリア別ヒーローバナー（area_hero_banners）管理。FeaturedJobsManager と同方式で authenticated クライアント直
// （RLSで admin UUID のみ許可）。sp/pc それぞれ独立にアップロード／削除（URLをnullに）できる。
//
// 画像パスは `{slug}/{timestamp}.{ext}` でユニーク化（固定名+upsert だと差し替えても public URL 不変で
// CDN/ブラウザが旧画像をキャッシュし続けるバグの再発防止＝featured 画像で根治済みの方式を踏襲。upsert は使わない）。
// 保存成功後 revalidateFeaturedJobs() で /jobs＋5エリア＋出張専門(/jobs/dispatch)の7パスを再検証（既存 server action をそのまま利用）。
const BUCKET = 'area-banners';

// 通常5エリア＋出張専門（計6行）。slug=Storageパス/命名用、area=DB値（area_hero_banners.area のキー・例 '博多・住吉'）。
// 出張は slug='dispatch' / area='出張'（Storageパスは既存規約どおり dispatch/{timestamp}.{ext} になる）。
// label は行の表示名。出張は areaLabel('出張')='出張' ではなく「出張専門」を固定文字列で特別扱いし /jobs/dispatch と揃える。
const AREA_ROWS = AREA_SLUGS_LIST.map((slug) => {
  const area = areaFromSlug(slug) as string;
  return { slug, area, label: slug === 'dispatch' ? '出張専門' : areaLabel(area) };
});

type BannerRow = { spUrl: string | null; pcUrl: string | null };

export default function AreaBannerManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [rows,     setRows]     = useState<Record<string, BannerRow>>({});
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ area: string; slug: string; kind: 'sp' | 'pc' } | null>(null);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    const sb = createClient();
    const { data, error } = await sb
      .from('area_hero_banners')
      .select('area, sp_image_url, pc_image_url');

    if (error) {
      setErrorMsg('area_hero_banners テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }

    const byArea: Record<string, BannerRow> = {};
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

  useEffect(() => { fetchBanners(); }, [fetchBanners]);

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
    const path = `${slug}/${Date.now()}.${ext}`;

    setSaving(true);

    // 差し替え前の旧storageパスを控える（Storage由来のURLのみ後で掃除。相対パス初期データは対象外）。
    const current = rows[area];
    const oldUrl = current ? (kind === 'sp' ? current.spUrl : current.pcUrl) : null;
    const oldPath = oldUrl && oldUrl.includes(`/${BUCKET}/`) ? oldUrl.split(`/${BUCKET}/`)[1] : null;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type });

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
      .from('area_hero_banners')
      .upsert({ area, [col]: publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'area' });

    if (dbErr) {
      onToast(`保存に失敗しました: ${dbErr.message}`);
    } else if (oldPath && oldPath !== path) {
      // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    resetInput(e);
    setSaving(false);
    if (!dbErr) await revalidateFeaturedJobs();
    await fetchBanners();
  };

  const handleDeleteImage = async (area: string, kind: 'sp' | 'pc') => {
    const current = rows[area];
    const url = current ? (kind === 'sp' ? current.spUrl : current.pcUrl) : null;
    if (!url) return;

    setSaving(true);
    const col = kind === 'sp' ? 'sp_image_url' : 'pc_image_url';
    const { error } = await supabase
      .from('area_hero_banners')
      .update({ [col]: null, updated_at: new Date().toISOString() })
      .eq('area', area);

    if (error) {
      onToast(`削除に失敗しました: ${error.message}`);
      setSaving(false);
      return;
    }
    // Storage由来のURLのみ物理削除（相対パスの初期データ＝public配下の静的アセットは触らない）。
    if (url.includes(`/${BUCKET}/`)) {
      const p = url.split(`/${BUCKET}/`)[1];
      if (p) await supabase.storage.from(BUCKET).remove([p]);
    }
    setSaving(false);
    await revalidateFeaturedJobs();
    await fetchBanners();
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-[10px] text-slate-400">推奨: SP 750×900（縦5:6）／ PC 1536×512（横3:1）</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        各エリアページ（/jobs/area/&lt;エリア&gt;）の見出し直下に表示されるヒーローバナーです。SP・PC は個別に設定できます。
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
                {/* 1エリア=1行。エリア名＋SP(縦長)＋PC(横長)を横並び。高さ h-40 に揃え、比率は aspect で維持。
                    admin はPC利用前提のため md未満は折り返し許容（崩れなければ十分）。 */}
                <div className="flex flex-wrap items-start gap-4">
                  <p className="text-xs font-bold text-slate-800 w-24 flex-shrink-0 pt-4">{label}</p>
                  {(['sp', 'pc'] as const).map((kind) => {
                    const url = kind === 'sp' ? row?.spUrl ?? null : row?.pcUrl ?? null;
                    // 高さ固定 h-40（160px）＋aspectで幅が決まる：SP=5/6(約133px)／PC=3/1(約480px)。
                    // 未設定プレースホルダーも同じ h-40・同aspectにして5エリアの行高を揃える。
                    const aspect = kind === 'sp' ? 'aspect-[5/6]' : 'aspect-[3/1]';
                    return (
                      <div key={kind} className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-slate-400">{kind.toUpperCase()}</span>
                        {url ? (
                          <>
                            {/* 全体表示（切り抜きなし）：object-contain＋薄色背景で画像の余白と区別できるようにする。 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${label} ${kind} バナー`}
                              className={`h-40 ${aspect} object-contain rounded-lg border border-emerald-100 bg-slate-50`}
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
                            className={`h-40 ${aspect} text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg bg-slate-50 flex items-center justify-center text-center px-2 hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-40 transition-colors`}
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
