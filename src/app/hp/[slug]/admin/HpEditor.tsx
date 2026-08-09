'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { saveHpSiteContent } from '@/app/actions/hpAdmin';
import {
  type HpSite,
  type HpBlocksConfig,
  type HpBanner,
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  MAX_HP_HERO_IMAGES,
  MAX_HP_BANNERS,
  MAX_HP_CATCH_LEN,
  MAX_HP_TITLE_LEN,
  MAX_HP_CONCEPT_LEN,
  HP_SCHEDULE_DAYS_MIN,
  HP_SCHEDULE_DAYS_MAX,
  HP_DIARY_COUNT_MIN,
  HP_DIARY_COUNT_MAX,
  HP_REVIEWS_COUNT_MIN,
  HP_REVIEWS_COUNT_MAX,
} from '@/app/lib/hpSite';

// 公式HPの編集パネル（旧 mypage/HpTab.tsx を店舗ドメイン/admin へ移植・2026-08-09 段階3）。
//
// 旧版からの変更点:
//  - ひな形・カラーの選択UIを撤去（ギャラリーで確定済み＝ここでは表示のみ）。
//    保存アクション（saveHpSiteContent）も設計上その2列を書けない。
//  - カラーの体系は SALON_THEMES ではなく HP_COLOR_VARIANTS（ひな形ごと6色）。
//  - 保存は画面下部の「保存する」1ボタンに集約（項目ごとの個別保存にしない＝マニュアルを薄く保つ）。

const supabase = createClient();

type FormState = {
  hero_images:       string[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  blocks:            HpBlocksConfig;
  banners:           (HpBanner | null)[]; // スロット固定3（null=未設定）
  favicon_url:       string | null;
};

function siteToForm(site: HpSite): FormState {
  const slots: (HpBanner | null)[] = [null, null, null];
  site.banners.slice(0, MAX_HP_BANNERS).forEach((b, i) => { slots[i] = b; });
  return {
    hero_images:       site.hero_images,
    hero_catch:        site.hero_catch,
    concept_title:     site.concept_title,
    concept_text:      site.concept_text,
    concept_image_url: site.concept_image_url,
    blocks:            site.blocks,
    banners:           slots,
    favicon_url:       site.favicon_url,
  };
}

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export function HpEditor({
  siteKey,
  site,
  onSaved,
  onToast,
}: {
  siteKey: string;
  site: HpSite;
  onSaved: (site: HpSite) => void;
  onToast: (msg: string) => void;
}) {
  const [form, setForm] = useState<FormState>(() => siteToForm(site));
  const [saving, setSaving] = useState(false);
  // アップロード中のスロット識別子（'hero0'〜 / 'concept' / 'banner0'〜）
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const patchBlocks = (p: Partial<HpBlocksConfig>) =>
    setForm((prev) => ({ ...prev, blocks: { ...prev.blocks, ...p } }));

  // 保存済みサイト行で使われていないURLだけ storage から削除する（best-effort）。
  // 保存前に消すと DB が参照中の画像を壊すため、保存済みURLには触らない。
  const removeIfUnsaved = (url: string) => {
    const savedUrls = new Set<string>([
      ...site.hero_images,
      ...(site.concept_image_url ? [site.concept_image_url] : []),
      ...(site.favicon_url ? [site.favicon_url] : []),
      ...site.banners.map((b) => b.image_url),
    ]);
    if (savedUrls.has(url)) return;
    const marker = '/salon-images/';
    const idx = url.indexOf(marker);
    if (idx !== -1) supabase.storage.from('salon-images').remove([url.slice(idx + marker.length)]);
  };

  // 画像アップロード共通（salon-images バケット流用・path は hp_ プレフィックスで区別）。
  const uploadImage = async (slotKey: string, file: File): Promise<string | null> => {
    const err = validateImageFile(file);
    if (err) { onToast(err); return null; }
    setUploadingSlot(slotKey);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${site.salon_id}/hp_${slotKey}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('salon-images')
      .upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    setUploadingSlot(null);
    if (uploadError) {
      onToast(`アップロードに失敗しました: ${uploadError.message}`);
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    return publicUrl;
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await saveHpSiteContent(siteKey, {
      hero_images:       form.hero_images,
      hero_catch:        form.hero_catch,
      concept_title:     form.concept_title,
      concept_text:      form.concept_text,
      concept_image_url: form.concept_image_url,
      blocks:            form.blocks,
      banners:           form.banners.filter((b): b is HpBanner => b !== null && b.image_url !== ''),
      favicon_url:       form.favicon_url,
    });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    setForm(siteToForm(res.site));
    onSaved(res.site);
    onToast('保存しました');
  };

  const inputCls =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300';

  const templateLabel = HP_TEMPLATES.find((t) => t.key === site.template_key)?.label ?? '';
  const colorVariant = HP_COLOR_VARIANTS[site.template_key].find((v) => v.key === site.theme_key)
    ?? HP_COLOR_VARIANTS[site.template_key][0];

  return (
    <div className="space-y-4">
      {/* ── デザイン（確定済み・表示のみ） ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h3 className="text-sm font-black text-slate-800">デザイン</h3>
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-full border border-black/10 flex-shrink-0"
            style={{ backgroundColor: colorVariant.css['--hp-accent'] }}
          />
          <p className="text-xs font-bold text-slate-700">
            {templateLabel}／{colorVariant.label}
          </p>
          <span className="ml-auto inline-flex items-center px-2.5 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-500">
            確定済み
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ※ ひな形とカラーの変更は運営事務局での作業（有償）となります。写真・文章はこのページからいつでも変更できます。
        </p>
      </div>

      {/* ── トップ（ヒーロー） ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-800">トップ画像・キャッチコピー</h3>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: MAX_HP_HERO_IMAGES }, (_, i) => {
            const url = form.hero_images[i] ?? null;
            const slotKey = `hero${i}`;
            return (
              <div key={i} className="space-y-1">
                {url ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`トップ画像${i + 1}`} className="w-full aspect-video object-cover rounded-xl border border-slate-200" />
                    <button
                      onClick={() => {
                        patch({ hero_images: form.hero_images.filter((u) => u !== url) });
                        removeIfUnsaved(url);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                      aria-label="削除"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center w-full aspect-video rounded-xl border-2 border-dashed border-slate-200 text-[11px] text-slate-400 cursor-pointer hover:border-pink-300">
                    {uploadingSlot === slotKey ? 'アップ中…' : `画像${i + 1}`}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={uploadingSlot !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const publicUrl = await uploadImage(slotKey, file);
                        if (publicUrl) patch({ hero_images: [...form.hero_images, publicUrl].slice(0, MAX_HP_HERO_IMAGES) });
                      }}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400">
          ※ 横長のバナー画像は全体が表示され、縦長の写真は上下が切り取られて表示されます（自動で切り替わります）。
        </p>
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">キャッチコピー（最大{MAX_HP_CATCH_LEN}文字）</p>
          <input
            type="text"
            value={form.hero_catch}
            maxLength={MAX_HP_CATCH_LEN}
            onChange={(e) => patch({ hero_catch: e.target.value })}
            placeholder="例）非日常のくつろぎを、駅から3分で。"
            className={inputCls}
          />
        </div>
      </div>

      {/* ── コンセプト ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-800">コンセプト</h3>
        <p className="text-[11px] text-slate-400">
          ※ フクエス掲載ページの紹介文とは別の、ホームページ専用の文章です（同じ文章のコピーは検索評価の面で不利になります）。
        </p>
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">見出し（最大{MAX_HP_TITLE_LEN}文字）</p>
          <input
            type="text"
            value={form.concept_title}
            maxLength={MAX_HP_TITLE_LEN}
            onChange={(e) => patch({ concept_title: e.target.value })}
            className={inputCls}
          />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">本文（最大{MAX_HP_CONCEPT_LEN}文字）</p>
          <textarea
            value={form.concept_text}
            maxLength={MAX_HP_CONCEPT_LEN}
            onChange={(e) => patch({ concept_text: e.target.value })}
            rows={8}
            className={inputCls}
          />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-600 mb-1">画像（任意・1枚）</p>
          {form.concept_image_url ? (
            <div className="relative w-40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.concept_image_url} alt="コンセプト画像" className="w-40 aspect-video object-cover rounded-xl border border-slate-200" />
              <button
                onClick={() => {
                  const url = form.concept_image_url;
                  patch({ concept_image_url: null });
                  if (url) removeIfUnsaved(url);
                }}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ) : (
            <label className="inline-flex items-center justify-center px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 cursor-pointer hover:border-pink-300">
              {uploadingSlot === 'concept' ? 'アップ中…' : '画像を選ぶ'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingSlot !== null}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const publicUrl = await uploadImage('concept', file);
                  if (publicUrl) patch({ concept_image_url: publicUrl });
                }}
              />
            </label>
          )}
        </div>
      </div>

      {/* ── ブロック表示設定 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-800">表示するブロック</h3>
        <p className="text-[11px] text-slate-400">
          ※ 各ブロックの中身（セラピスト・出勤・写メ日記・口コミ・クーポン・お知らせ等）は、
          フクエスのマイページで編集した内容がそのまま表示されます。ここで二重に入力する必要はありません。
        </p>

        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">セラピスト一覧</span>
          <input type="checkbox" checked={form.blocks.therapists.on}
            onChange={(e) => patchBlocks({ therapists: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
        </label>

        <div className="flex items-center justify-between py-1 gap-2">
          <span className="text-xs font-bold text-slate-600">出勤スケジュール</span>
          <div className="flex items-center gap-2">
            <select
              value={form.blocks.schedule.days}
              onChange={(e) => patchBlocks({ schedule: { ...form.blocks.schedule, days: Number(e.target.value) } })}
              disabled={!form.blocks.schedule.on}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
            >
              {Array.from({ length: HP_SCHEDULE_DAYS_MAX - HP_SCHEDULE_DAYS_MIN + 1 }, (_, i) => HP_SCHEDULE_DAYS_MIN + i).map((n) => (
                <option key={n} value={n}>{n}日分</option>
              ))}
            </select>
            <input type="checkbox" checked={form.blocks.schedule.on}
              onChange={(e) => patchBlocks({ schedule: { ...form.blocks.schedule, on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
          </div>
        </div>

        <div className="flex items-center justify-between py-1 gap-2">
          <span className="text-xs font-bold text-slate-600">写メ日記</span>
          <div className="flex items-center gap-2">
            <select
              value={form.blocks.diary.count}
              onChange={(e) => patchBlocks({ diary: { ...form.blocks.diary, count: Number(e.target.value) } })}
              disabled={!form.blocks.diary.on}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
            >
              {Array.from({ length: HP_DIARY_COUNT_MAX - HP_DIARY_COUNT_MIN + 1 }, (_, i) => HP_DIARY_COUNT_MIN + i).map((n) => (
                <option key={n} value={n}>{n}件</option>
              ))}
            </select>
            <input type="checkbox" checked={form.blocks.diary.on}
              onChange={(e) => patchBlocks({ diary: { ...form.blocks.diary, on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
          </div>
        </div>

        <div className="flex items-center justify-between py-1 gap-2">
          <span className="text-xs font-bold text-slate-600">口コミ</span>
          <div className="flex items-center gap-2">
            <select
              value={form.blocks.reviews.count}
              onChange={(e) => patchBlocks({ reviews: { ...form.blocks.reviews, count: Number(e.target.value) } })}
              disabled={!form.blocks.reviews.on}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
            >
              {Array.from({ length: HP_REVIEWS_COUNT_MAX - HP_REVIEWS_COUNT_MIN + 1 }, (_, i) => HP_REVIEWS_COUNT_MIN + i).map((n) => (
                <option key={n} value={n}>{n}件</option>
              ))}
            </select>
            <input type="checkbox" checked={form.blocks.reviews.on}
              onChange={(e) => patchBlocks({ reviews: { ...form.blocks.reviews, on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
          </div>
        </div>

        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">クーポン</span>
          <input type="checkbox" checked={form.blocks.coupon.on}
            onChange={(e) => patchBlocks({ coupon: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
        </label>

        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">お知らせ</span>
          <input type="checkbox" checked={form.blocks.news.on}
            onChange={(e) => patchBlocks({ news: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
        </label>

        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">求人（フクエスワークへのリンク）</span>
          <input type="checkbox" checked={form.blocks.jobs.on}
            onChange={(e) => patchBlocks({ jobs: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
        </label>

        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">フリーページ</span>
          <input type="checkbox" checked={form.blocks.freePages.on}
            onChange={(e) => patchBlocks({ freePages: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
        </label>
      </div>

      {/* ── バナー ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-black text-slate-800">バナー（最大{MAX_HP_BANNERS}枠）</h3>
        <p className="text-[11px] text-slate-400">※ ページ下部に表示するバナーです。リンクは任意（空欄=リンクなし）。</p>
        {Array.from({ length: MAX_HP_BANNERS }, (_, i) => {
          const banner = form.banners[i];
          const slotKey = `banner${i}`;
          const setBanner = (b: HpBanner | null) =>
            patch({ banners: form.banners.map((v, j) => (j === i ? b : v)) });
          return (
            <div key={i} className="flex items-start gap-3">
              {banner ? (
                <div className="relative w-40 flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={banner.image_url} alt={`バナー${i + 1}`} className="w-40 object-contain rounded-lg border border-slate-200" />
                  <button
                    onClick={() => { const url = banner.image_url; setBanner(null); removeIfUnsaved(url); }}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                    aria-label="削除"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center w-40 h-16 flex-shrink-0 rounded-lg border-2 border-dashed border-slate-200 text-[11px] text-slate-400 cursor-pointer hover:border-pink-300">
                  {uploadingSlot === slotKey ? 'アップ中…' : `バナー${i + 1}`}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploadingSlot !== null}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const publicUrl = await uploadImage(slotKey, file);
                      if (publicUrl) setBanner({ image_url: publicUrl, link: '' });
                    }}
                  />
                </label>
              )}
              <input
                type="url"
                value={banner?.link ?? ''}
                disabled={!banner}
                onChange={(e) => banner && setBanner({ ...banner, link: e.target.value })}
                placeholder="リンク先URL（https://…）"
                className={`${inputCls} disabled:opacity-40`}
              />
            </div>
          );
        })}
      </div>

      {/* ── ファビコン ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-800">ファビコン（ブラウザタブのアイコン）</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ※ 独自ドメインで開いたとき、ブラウザのタブに表示される小さなアイコンです。
          512×512ピクセルの正方形PNG推奨（お店のロゴマークなど）。
        </p>
        <div className="flex items-center gap-3">
          {form.favicon_url ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.favicon_url} alt="ファビコン" className="w-16 h-16 object-cover rounded-xl border border-slate-200" />
              <button
                onClick={() => {
                  const url = form.favicon_url;
                  patch({ favicon_url: null });
                  if (url) removeIfUnsaved(url);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-16 h-16 rounded-xl border-2 border-dashed border-slate-200 text-[10px] text-slate-400 cursor-pointer hover:border-pink-300">
              {uploadingSlot === 'favicon' ? 'アップ中…' : '選ぶ'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingSlot !== null}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const publicUrl = await uploadImage('favicon', file);
                  if (publicUrl) patch({ favicon_url: publicUrl });
                }}
              />
            </label>
          )}
          <p className="text-[11px] text-slate-400">保存すると反映されます。</p>
        </div>
      </div>

      {/* ── 保存 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
        <button
          onClick={handleSave}
          disabled={saving || uploadingSlot !== null}
          className="w-full py-3 rounded-full bg-pink-500 text-white text-sm font-black hover:bg-pink-600 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        <button
          onClick={() => setForm(siteToForm(site))}
          disabled={saving}
          className="w-full py-2 rounded-full text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
        >
          変更を破棄して元に戻す
        </button>
        <p className="text-[11px] text-slate-400 text-center">
          ※ 保存すると公開ページに反映されます（反映まで少し時間がかかることがあります）。
        </p>
      </div>
    </div>
  );
}
