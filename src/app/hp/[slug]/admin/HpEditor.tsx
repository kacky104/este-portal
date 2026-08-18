'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { listHpTherapists, saveHpSiteContent } from '@/app/actions/hpAdmin';
import {
  type HpSite,
  type HpBlocksConfig,
  type HpBanner,
  type HpLinkBanner,
  type HpHeroSlide,
  HP_TEMPLATES,
  HP_COLOR_VARIANTS,
  MAX_HP_HERO_IMAGES,
  MAX_HP_HERO_SLIDES,
  MAX_HP_BANNERS,
  MAX_HP_CATCH_LEN,
  MAX_HP_TITLE_LEN,
  MAX_HP_CONCEPT_LEN,
  HP_SECTIONS,
  hpSectionOrder,
  parseHpBannerCode,
  parseHpLinkBanners,
  MAX_HP_LINK_BANNERS,
  type HpSectionKey,
  HP_DIARY_COUNT_MIN,
  HP_DIARY_COUNT_MAX,
  HP_REVIEWS_COUNT_MIN,
  HP_REVIEWS_COUNT_MAX,
  HP_DEMO_SLUG,
  normalizeHpSiteKey,
  hpDemoImageSlots,
} from '@/app/lib/hpSite';

// 公式HPの編集パネル（旧 mypage/HpTab.tsx を店舗ドメイン/admin へ移植・2026-08-09 段階3）。
//
// 旧版からの変更点:
//  - ひな形・カラーの選択UIを撤去（ギャラリーで確定済み＝ここでは表示のみ）。
//    保存アクション（saveHpSiteContent）も設計上その2列を書けない。
//  - カラーの体系は SALON_THEMES ではなく HP_COLOR_VARIANTS（ひな形ごとの色。タイプSは4色・A/B/Cは各6色）。
//  - 保存は画面下部の「保存する」1ボタンに集約（項目ごとの個別保存にしない＝マニュアルを薄く保つ）。

const supabase = createClient();

type FormState = {
  /** トップ画像のスライド（最大3枚）。旧 hero_images はサーバー側が1枚目から作る。 */
  hero_slides:       HpHeroSlide[];
  hero_catch:        string;
  concept_title:     string;
  concept_text:      string;
  concept_image_url: string | null;
  logo_url:          string | null;      // ヘッダーのロゴ（null=店名の文字を出す）
  blocks:            HpBlocksConfig;
  banners:           (HpBanner | null)[]; // スロット固定3（null=未設定）
  link_banners:      HpLinkBanner[];      // リンク欄（相互リンク・並びはこの配列の順）
  favicon_url:       string | null;
};

function siteToForm(site: HpSite): FormState {
  const slots: (HpBanner | null)[] = [null, null, null];
  site.banners.slice(0, MAX_HP_BANNERS).forEach((b, i) => { slots[i] = b; });
  return {
    hero_slides:       site.hero_slides,
    hero_catch:        site.hero_catch,
    concept_title:     site.concept_title,
    concept_text:      site.concept_text,
    concept_image_url: site.concept_image_url,
    logo_url:          site.logo_url,
    blocks:            site.blocks,
    banners:           slots,
    link_banners:      site.link_banners,
    favicon_url:       site.favicon_url,
  };
}

// スライド1枚ぶんの枠（位置＝用途）。pc が必須で、sp は省略可。
// ★ 2026-08-18（第21便）から、この2枠が「スライド1枚」の単位になった。
//   以前は hero_images[0]=PC / [1]=スマホ という配列の位置で表していた（禁則110）。
const HERO_SLOTS = [
  { key: 'pc', label: 'パソコン用', hint: '横長 2400×960', previewCls: 'aspect-[5/2]' },
  { key: 'sp', label: 'スマートフォン用', hint: '1080×760・省略可', previewCls: 'aspect-[27/19]' },
] as const;

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
  // デモ店だけの欄（2026-08-11 → 08-12 ひな形ぶんも）。デモは1行で全デザインを見せるため、
  // 「いま確定している見た目」以外にも写真を持てるようにしている（実店舗はデザインが1つなので出さない）。
  //   S / A / B … 配色ごと（地色ごと作り分けているので、色ごとに写真を変える意味がある）
  //   C         … ひな形ごとに1セット（カラーはアクセント1色しか変わらないため）
  const isDemo = normalizeHpSiteKey(siteKey) === HP_DEMO_SLUG;
  const previewSlots = isDemo ? hpDemoImageSlots(site.template_key, site.theme_key) : [];
  // アップロード中のスロット識別子（'hero0'〜 / 'concept' / 'banner0'〜）
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  // 配色ごとのセラピスト写真を設定するための一覧（デモ店だけ・掲載データから引く）
  const [therapistList, setTherapistList] = useState<{ id: string; name: string; imageUrl: string | null }[]>([]);
  // 相互リンク用バナーコードの貼り付け欄（保存はしない。取り込んだらバナー枠へ入れる）
  const [bannerCode, setBannerCode] = useState('');
  // リンク欄（相互リンク）の貼り付け欄
  const [linkCode, setLinkCode] = useState('');

  const patch = (p: Partial<FormState>) => setForm((prev) => ({ ...prev, ...p }));
  const patchBlocks = (p: Partial<HpBlocksConfig>) =>
    setForm((prev) => ({ ...prev, blocks: { ...prev.blocks, ...p } }));

  // デモ店のときだけセラピスト一覧を取りに行く（配色ごとの写真を並べるため）。
  // 失敗しても編集画面そのものは使えるので、エラーは黙って無視する（欄が出ないだけ）。
  useEffect(() => {
    if (!isDemo) return;
    let alive = true;
    listHpTherapists(siteKey).then((res) => {
      if (alive && res.ok) setTherapistList(res.therapists);
    });
    return () => { alive = false; };
  }, [isDemo, siteKey]);

  // ── セクションの並び順（2026-08-10）────────────────
  // 公開ページと同じ hpSectionOrder() を使う＝この一覧の並び＝実際のサイトの並び。
  // 未設定ならひな形ごとの既定（タイプSは「本日の出勤」が先頭）を表示する。
  const sectionOrder: HpSectionKey[] = hpSectionOrder(site.template_key, form.blocks.order);
  const sectionLabel = (k: HpSectionKey) => HP_SECTIONS.find((s) => s.key === k)?.label ?? k;

  const moveSection = (index: number, dir: -1 | 1) => {
    const next = [...sectionOrder];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    patchBlocks({ order: next });
  };

  /** ON/OFF を持つセクションの現在値。null＝切り替え不可（中身があるときだけ自動で出る）。 */
  const sectionOn = (k: HpSectionKey): boolean | null => {
    switch (k) {
      case 'concept':    return form.blocks.concept.on;
      case 'courses':    return form.blocks.courses.on;
      case 'therapists': return form.blocks.therapists.on;
      case 'schedule':   return form.blocks.schedule.on;
      case 'diary':      return form.blocks.diary.on;
      case 'reviews':    return form.blocks.reviews.on;
      case 'coupon':     return form.blocks.coupon.on;
      case 'news':       return form.blocks.news.on;
      case 'freePages':  return form.blocks.freePages.on;
      default:           return null; // info / banners（中身があるときだけ自動で出る）
    }
  };
  const setSectionOn = (k: HpSectionKey, on: boolean) => {
    switch (k) {
      case 'concept':    patchBlocks({ concept: { on } }); break;
      case 'courses':    patchBlocks({ courses: { on } }); break;
      case 'therapists': patchBlocks({ therapists: { on } }); break;
      case 'schedule':   patchBlocks({ schedule: { ...form.blocks.schedule, on } }); break;
      case 'diary':      patchBlocks({ diary: { ...form.blocks.diary, on } }); break;
      case 'reviews':    patchBlocks({ reviews: { ...form.blocks.reviews, on } }); break;
      case 'coupon':     patchBlocks({ coupon: { on } }); break;
      case 'news':       patchBlocks({ news: { on } }); break;
      case 'freePages':  patchBlocks({ freePages: { on } }); break;
      default: break;
    }
  };

  // 保存済みサイト行で使われていないURLだけ storage から削除する（best-effort）。
  // 保存前に消すと DB が参照中の画像を壊すため、保存済みURLには触らない。
  const removeIfUnsaved = (url: string) => {
    const savedUrls = new Set<string>([
      ...site.hero_images,
      // スライドは pc / sp の両方を「使用中」として数える。片方だけ数えると、
      // 保存済みのスマホ用画像を storage から消してしまう。
      ...site.hero_slides.flatMap((s) => (s.sp ? [s.pc, s.sp] : [s.pc])),
      ...(site.concept_image_url ? [site.concept_image_url] : []),
      ...(site.logo_url ? [site.logo_url] : []),
      ...(site.favicon_url ? [site.favicon_url] : []),
      ...site.banners.map((b) => b.image_url),
      ...Object.values(site.blocks.heroByColor).flat(),
      ...Object.values(site.blocks.therapistImagesByColor).flatMap((m) => Object.values(m)),
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

  /** 貼り付けたバナーコードから画像URLとリンク先を取り出し、空いている枠に入れる。 */
  const importBannerCode = () => {
    const parsed = parseHpBannerCode(bannerCode);
    if (!parsed) {
      onToast('コードを読み取れませんでした。画像URLが https で始まる <img> を含むコードを貼ってください');
      return;
    }
    const slot = form.banners.findIndex((b) => b === null);
    if (slot === -1) {
      onToast(`バナーは最大${MAX_HP_BANNERS}枠です。空きを作ってから取り込んでください`);
      return;
    }
    patch({ banners: form.banners.map((v, j) => (j === slot ? parsed : v)) });
    setBannerCode('');
    onToast(`バナー${slot + 1}に入れました。表示を確認して「保存する」を押してください`);
  };

  /** 貼り付けたコードからリンクを何件でも取り出して、リンク欄の末尾に足す。 */
  const addLinkBanners = () => {
    const parsed = parseHpLinkBanners(linkCode);
    if (parsed.length === 0) {
      onToast('リンクを読み取れませんでした。<a href="…"> を含むコードを貼ってください');
      return;
    }
    const room = MAX_HP_LINK_BANNERS - form.link_banners.length;
    if (room <= 0) {
      onToast(`リンクは最大${MAX_HP_LINK_BANNERS}件です`);
      return;
    }
    const added = parsed.slice(0, room);
    patch({ link_banners: [...form.link_banners, ...added] });
    setLinkCode('');
    onToast(
      added.length < parsed.length
        ? `${added.length}件を追加しました（上限${MAX_HP_LINK_BANNERS}件のため残りは追加していません）`
        : `${added.length}件を追加しました。「保存する」を押すと反映されます`,
    );
  };
  const moveLinkBanner = (index: number, dir: -1 | 1) => {
    const next = [...form.link_banners];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    patch({ link_banners: next });
  };
  const removeLinkBanner = (index: number) =>
    patch({ link_banners: form.link_banners.filter((_, i) => i !== index) });

  // ── トップ画像のスライド操作（2026-08-18 第21便）──
  // ★ スライドは「パソコン用が入って初めて1枚」。パソコン用を消したら
  //   スマートフォン用も一緒に外し、そのスライドごと配列から取り除く
  //   （PCなし・SPありは表示できないため。従来の2枠のときと同じ考え方）。
  const setHeroSlide = (index: number, slide: HpHeroSlide | null) => {
    const next = [...form.hero_slides];
    if (slide) next[index] = slide;
    else next.splice(index, 1);
    patch({ hero_slides: next.slice(0, MAX_HP_HERO_SLIDES) });
  };
  const moveHeroSlide = (index: number, dir: -1 | 1) => {
    const next = [...form.hero_slides];
    const to = index + dir;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    patch({ hero_slides: next });
  };
  // 表示する枠の数＝いま入っている枚数＋（まだ増やせるなら）追加用の1枠。
  const heroRowCount = Math.min(form.hero_slides.length + 1, MAX_HP_HERO_SLIDES);

  const handleSave = async () => {
    setSaving(true);
    const res = await saveHpSiteContent(siteKey, {
      hero_slides:       form.hero_slides,
      hero_catch:        form.hero_catch,
      concept_title:     form.concept_title,
      concept_text:      form.concept_text,
      concept_image_url: form.concept_image_url,
      logo_url:          form.logo_url,
      blocks:            form.blocks,
      banners:           form.banners.filter((b): b is HpBanner => b !== null && b.image_url !== ''),
      link_banners:      form.link_banners,
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
        {/* スライド1枚 ＝ パソコン用（横長・必須）＋スマートフォン用（縦長・省略可）。
            2枚以上入れると自動で切り替わるスライダーになる（最大3枚）。
            ★ 位置に意味があるので、枠を消したら後ろを詰める（末尾に穴を残さない）。 */}
        <div className="space-y-3">
          {Array.from({ length: heroRowCount }, (_, si) => {
            const slide = form.hero_slides[si] ?? null;
            const isNew = slide === null;
            return (
              <div key={si} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-600">
                    {si + 1}枚目
                    {isNew && <span className="ml-1 font-normal text-slate-400">（増やす場合はここに）</span>}
                  </p>
                  {!isNew && form.hero_slides.length > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveHeroSlide(si, -1)}
                        disabled={si === 0}
                        className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 disabled:opacity-30"
                      >
                        ↑ 前へ
                      </button>
                      <button
                        type="button"
                        onClick={() => moveHeroSlide(si, 1)}
                        disabled={si === form.hero_slides.length - 1}
                        className="px-2 py-0.5 rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 disabled:opacity-30"
                      >
                        ↓ 次へ
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {HERO_SLOTS.map((slot) => {
                    const isPc = slot.key === 'pc';
                    const url = (isPc ? slide?.pc : slide?.sp) ?? null;
                    const slotKey = `hero${si}-${slot.key}`;
                    return (
                      <div key={slot.key} className="space-y-1.5">
                        <p className="text-xs font-bold text-slate-600">
                          {slot.label}
                          <span className="ml-1 font-normal text-slate-400">{slot.hint}</span>
                        </p>
                        {url ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={slot.label}
                              className={`w-full object-cover rounded-xl border border-slate-200 ${slot.previewCls}`}
                            />
                            <button
                              onClick={() => {
                                if (isPc) {
                                  // パソコン用を消す＝このスライドごと外す。
                                  // 一緒に外れるスマートフォン用も未保存なら消しておく。
                                  const sp = slide?.sp ?? null;
                                  setHeroSlide(si, null);
                                  removeIfUnsaved(url);
                                  if (sp) removeIfUnsaved(sp);
                                } else if (slide) {
                                  setHeroSlide(si, { pc: slide.pc, sp: null });
                                  removeIfUnsaved(url);
                                }
                              }}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                              aria-label="削除"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label
                            className={`flex items-center justify-center w-full rounded-xl border-2 border-dashed border-slate-200 text-[11px] text-slate-400 cursor-pointer hover:border-pink-300 ${slot.previewCls}`}
                          >
                            {uploadingSlot === slotKey ? 'アップ中…' : '画像を選ぶ'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={uploadingSlot !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                if (!isPc && !slide) {
                                  onToast('先にパソコン用の画像を設定してください');
                                  return;
                                }
                                const publicUrl = await uploadImage(slotKey, file);
                                if (!publicUrl) return;
                                if (isPc) setHeroSlide(si, { pc: publicUrl, sp: slide?.sp ?? null });
                                else if (slide) setHeroSlide(si, { pc: slide.pc, sp: publicUrl });
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ※ スマートフォン用を設定すると、スマホで見たときだけそちらに自動で切り替わります（未設定ならパソコン用を共用）。
          <br />
          ※ 推奨サイズ：パソコン用 2400×960px ／ スマートフォン用 1080×760px。
          <br />
          ※ 2枚以上を設定すると、4秒ごとに自動で切り替わるスライドショーになります（最大{MAX_HP_HERO_SLIDES}枚）。
          <br />
          ※ <b className="text-slate-500">3枚とも同じサイズ（2400×960px）でご用意ください。</b>
          サイズが違うと、1枚目の高さに合わせて2枚目以降の上下または左右が切れて表示されます。
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

      {/* ── 配色ごとのトップ画像（デモ店だけ・2026-08-11）──
           デモは1行で全デザインを見せるので、上の「トップ画像」だけだと
           どの配色のプレビューにも同じ写真が出てしまう。ここに入れた写真は
           その配色で見たときだけ差し替わる（/hp/demo/preview/{ひな形}/{カラー}）。
           セラピスト写真も同じ考え方で、掲載データの写真の代わりに使う。 */}
      {previewSlots.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <h3 className="text-sm font-black text-slate-800">デザインごとの画像（デモ専用）</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            デザイン一覧のプレビューで、その見た目のときだけ差し替える写真です（トップ画像とセラピスト写真）。
            タイプS・A・Bは配色ごと、タイプCはひな形ごとに1セット（そのひな形の全カラーで共通）。
            未設定のものは、トップ画像はタイプS・Aなら色味を合わせた既定画像、それ以外は上の「トップ画像」、
            セラピスト写真は掲載データの写真がそのまま使われます。
          </p>
          {previewSlots.map((variant) => {
            const list = form.blocks.heroByColor[variant.key] ?? [];
            const setList = (next: string[]) => {
              const map = { ...form.blocks.heroByColor };
              if (next.length === 0) delete map[variant.key];
              else map[variant.key] = next;
              patchBlocks({ heroByColor: map });
            };
            const imageCount =
              (form.blocks.heroByColor[variant.key]?.length ?? 0) +
              Object.keys(form.blocks.therapistImagesByColor[variant.key] ?? {}).length;
            return (
              // 数が増えるので既定は畳んでおく（開いた中身は従来どおり）
              <details key={variant.key} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <summary className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer list-none">
                  <span
                    className="w-4 h-4 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: variant.accent }}
                  />
                  <span className="min-w-0 truncate">{variant.label} 用</span>
                  <span className="ml-auto text-[10px] font-normal text-slate-400 flex-shrink-0">
                    {imageCount > 0 ? `設定済み ${imageCount}枚` : '未設定'}
                  </span>
                </summary>
                <div className="pt-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  {HERO_SLOTS.map((slot, i) => {
                    const url = list[i] ?? null;
                    const slotKey = `hero_${variant.key}${i}`;
                    return (
                      <div key={slot.key} className="space-y-1.5">
                        <p className="text-[11px] font-bold text-slate-500">
                          {slot.label}
                          <span className="ml-1 font-normal text-slate-400">{slot.hint}</span>
                        </p>
                        {url ? (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`${variant.label} ${slot.label}`}
                              className={`w-full object-cover rounded-xl border border-slate-200 ${slot.previewCls}`}
                            />
                            <button
                              onClick={() => {
                                // 上の「トップ画像」と同じ規則: PC用を消したらスマホ用も一緒に外す
                                setList(i === 0 ? [] : list.slice(0, 1));
                                removeIfUnsaved(url);
                              }}
                              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                              aria-label="削除"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label
                            className={`flex items-center justify-center w-full rounded-xl border-2 border-dashed border-slate-200 text-[11px] text-slate-400 cursor-pointer hover:border-pink-300 ${slot.previewCls}`}
                          >
                            {uploadingSlot === slotKey ? 'アップ中…' : '画像を選ぶ'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={uploadingSlot !== null}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                if (i === 1 && !list[0]) {
                                  onToast('先にパソコン用の画像を設定してください');
                                  return;
                                }
                                const publicUrl = await uploadImage(slotKey, file);
                                if (!publicUrl) return;
                                const next = [...list];
                                next[i] = publicUrl;
                                setList(next.slice(0, MAX_HP_HERO_IMAGES));
                              }}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* セラピスト写真（配色ごと・2026-08-11）。
                    掲載データの写真は1人1枚しか持てないので、ワインの回だけ別の写真を出したいときに使う。
                    未設定の人は掲載データの写真（＝下に薄く出ているもの）のまま。 */}
                {therapistList.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-500">
                      セラピスト写真
                      <span className="ml-1 font-normal text-slate-400">縦長 4:5・入れた人だけ差し替わります</span>
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {therapistList.map((t) => {
                        const map = form.blocks.therapistImagesByColor[variant.key] ?? {};
                        const url = map[t.id] ?? null;
                        const slotKey = `th_${variant.key}_${t.id}`;
                        const setOne = (next: string | null) => {
                          const all = { ...form.blocks.therapistImagesByColor };
                          const inner = { ...(all[variant.key] ?? {}) };
                          if (next === null) delete inner[t.id];
                          else inner[t.id] = next;
                          if (Object.keys(inner).length === 0) delete all[variant.key];
                          else all[variant.key] = inner;
                          patchBlocks({ therapistImagesByColor: all });
                        };
                        return (
                          <div key={t.id} className="space-y-1">
                            {url ? (
                              <div className="relative">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={t.name}
                                  className="w-full aspect-[4/5] object-cover rounded-lg border border-slate-200"
                                />
                                <button
                                  onClick={() => { setOne(null); removeIfUnsaved(url); }}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-[10px] font-bold"
                                  aria-label="削除"
                                >
                                  ×
                                </button>
                              </div>
                            ) : (
                              <label className="relative block w-full aspect-[4/5] rounded-lg border-2 border-dashed border-slate-200 cursor-pointer hover:border-pink-300 overflow-hidden">
                                {/* 未設定のときは掲載データの写真を薄く敷いて「いま出ている写真」を分かるように */}
                                {t.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={t.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                                )}
                                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                  {uploadingSlot === slotKey ? 'アップ中…' : '画像を選ぶ'}
                                </span>
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
                                    if (publicUrl) setOne(publicUrl);
                                  }}
                                />
                              </label>
                            )}
                            <p className="text-[10px] text-slate-500 text-center truncate">{t.name}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </details>
            );
          })}
        </div>
      )}

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

      {/* ── ブロック表示設定＋並び順 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-black text-slate-800">表示するブロックと並び順</h3>
          {form.blocks.order !== null && (
            <button
              type="button"
              onClick={() => patchBlocks({ order: null })}
              className="text-[11px] font-bold text-slate-400 underline underline-offset-2 hover:text-pink-500"
            >
              並び順を既定に戻す
            </button>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          ※ 上から順に、ホームページに表示される順番です。▲▼で入れ替えられます。トップ画像・
          電話／LINEの予約ボタン・フッターの位置は固定です。各ブロックの中身（セラピスト・出勤・
          写メ日記・口コミ・クーポン・お知らせ等）は、フクエスのマイページで編集した内容が
          そのまま表示されます。
        </p>

        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {sectionOrder.map((k, i) => {
            const on = sectionOn(k);
            return (
              <li key={k} className="flex items-center gap-2 py-2">
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    aria-label={`${sectionLabel(k)}を上へ`}
                    className="w-7 h-5 rounded-t-md border border-slate-200 text-[10px] leading-none text-slate-500 disabled:opacity-25 hover:border-pink-300 hover:text-pink-500"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(i, 1)}
                    disabled={i === sectionOrder.length - 1}
                    aria-label={`${sectionLabel(k)}を下へ`}
                    className="w-7 h-5 rounded-b-md border border-t-0 border-slate-200 text-[10px] leading-none text-slate-500 disabled:opacity-25 hover:border-pink-300 hover:text-pink-500"
                  >
                    ▼
                  </button>
                </div>

                <span className="flex-1 text-xs font-bold text-slate-600">
                  {sectionLabel(k)}
                  {on === null && (
                    <span className="ml-2 font-normal text-[10px] text-slate-400">内容があるときだけ表示</span>
                  )}
                  {/* マルチページ構成では、これらのON/OFFは「トップに抜粋を出すか」だけの意味。
                      OFFでも専用ページ（/therapist・/system・/diary・/voice）とメニューの導線は残る。 */}
                  {site.blocks.multipage && (k === 'courses' || k === 'therapists' || k === 'diary' || k === 'reviews') && (
                    <span className="ml-2 font-normal text-[10px] text-slate-400">
                      トップに載せるか（OFFでも専用ページとメニューは残ります）
                    </span>
                  )}
                </span>

                {k === 'diary' && (
                  <select
                    value={form.blocks.diary.count}
                    onChange={(e) => patchBlocks({ diary: { ...form.blocks.diary, count: Number(e.target.value) } })}
                    disabled={!form.blocks.diary.on}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                  >
                    {Array.from({ length: HP_DIARY_COUNT_MAX - HP_DIARY_COUNT_MIN + 1 }, (_, n) => HP_DIARY_COUNT_MIN + n).map((n) => (
                      <option key={n} value={n}>{n}件</option>
                    ))}
                  </select>
                )}
                {k === 'reviews' && (
                  <select
                    value={form.blocks.reviews.count}
                    onChange={(e) => patchBlocks({ reviews: { ...form.blocks.reviews, count: Number(e.target.value) } })}
                    disabled={!form.blocks.reviews.on}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 disabled:opacity-40"
                  >
                    {Array.from({ length: HP_REVIEWS_COUNT_MAX - HP_REVIEWS_COUNT_MIN + 1 }, (_, n) => HP_REVIEWS_COUNT_MIN + n).map((n) => (
                      <option key={n} value={n}>{n}件</option>
                    ))}
                  </select>
                )}

                {on === null ? (
                  <span className="w-4 h-4 shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setSectionOn(k, e.target.checked)}
                    aria-label={`${sectionLabel(k)}を表示する`}
                    className="w-4 h-4 shrink-0 accent-pink-500"
                  />
                )}
              </li>
            );
          })}
        </ul>

        {/* 求人はセクションではなくフッター内のリンクなので、並び替えの対象外。 */}
        <label className="flex items-center justify-between py-1">
          <span className="text-xs font-bold text-slate-600">
            求人（フクエスワークへのリンク）
            <span className="ml-2 font-normal text-[10px] text-slate-400">フッター内・位置は固定</span>
          </span>
          <input type="checkbox" checked={form.blocks.jobs.on}
            onChange={(e) => patchBlocks({ jobs: { on: e.target.checked } })} className="w-4 h-4 accent-pink-500" />
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

        {/* ── バナーのコードから登録（相互リンク用） ──
             貼られたHTMLをそのまま表示するのではなく、画像URLとリンク先だけを取り出して
             上のバナー枠に入れる。script や onclick が混ざっていても取り込まれない。 */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <h4 className="text-xs font-black text-slate-700">バナーのコードから登録</h4>
          <p className="text-[11px] text-slate-400">
            ※ フクエスなど相互リンク用のバナーコードを貼って「取り込む」を押すと、空いている枠に入ります。
            読み取るのは画像URLとリンク先だけです（画像URLは https:// のもののみ）。
          </p>
          <textarea
            value={bannerCode}
            onChange={(e) => setBannerCode(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder={'<a href="https://fukues.com/"><img src="https://fukues.com/banner.png" alt="フクエス"></a>'}
            className={`${inputCls} font-mono text-[11px] leading-relaxed`}
          />
          <button
            type="button"
            onClick={importBannerCode}
            disabled={bannerCode.trim() === ''}
            className="px-4 py-2 rounded-full bg-slate-800 text-white text-xs font-bold disabled:opacity-30"
          >
            取り込む
          </button>
        </div>
      </div>

      {/* ── リンク（相互リンク） ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-800">リンク（最大{MAX_HP_LINK_BANNERS}件）</h3>
        <p className="text-[11px] text-slate-400">
          ※ 掲載サイト・求人サイトから配られる相互リンク用のコードを貼って「追加する」を押すと、
          ページの「リンク」欄に並びます。複数まとめて貼れます。画像の無い文字だけのリンクにも対応しています。
          読み取るのは画像URL・リンク先・表示文字だけです。
        </p>

        <textarea
          value={linkCode}
          onChange={(e) => setLinkCode(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder={'<a href="https://example.com/"><img src="https://example.com/banner.gif" alt="サイト名"></a>'}
          className={`${inputCls} font-mono text-[11px] leading-relaxed`}
        />
        <button
          type="button"
          onClick={addLinkBanners}
          disabled={linkCode.trim() === ''}
          className="px-4 py-2 rounded-full bg-slate-800 text-white text-xs font-bold disabled:opacity-30"
        >
          追加する
        </button>

        {form.link_banners.length > 0 && (
          <ul className="divide-y divide-slate-100 border-t border-slate-100 pt-1">
            {form.link_banners.map((l, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <div className="flex flex-col shrink-0">
                  <button type="button" onClick={() => moveLinkBanner(i, -1)} disabled={i === 0} aria-label="上へ"
                    className="w-7 h-5 rounded-t-md border border-slate-200 text-[10px] leading-none text-slate-500 disabled:opacity-25 hover:border-pink-300">▲</button>
                  <button type="button" onClick={() => moveLinkBanner(i, 1)} disabled={i === form.link_banners.length - 1} aria-label="下へ"
                    className="w-7 h-5 rounded-b-md border border-t-0 border-slate-200 text-[10px] leading-none text-slate-500 disabled:opacity-25 hover:border-pink-300">▼</button>
                </div>
                <div className="flex-1 min-w-0">
                  {l.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image_url} alt={l.label} className="max-h-12 max-w-[220px] object-contain" />
                  ) : (
                    <span className="text-xs font-bold text-slate-600">{l.label}</span>
                  )}
                  <div className="text-[10px] text-slate-400 truncate">{l.link || 'リンクなし'}</div>
                </div>
                <button type="button" onClick={() => removeLinkBanner(i)} aria-label="削除"
                  className="w-7 h-7 shrink-0 rounded-full bg-slate-100 text-slate-500 text-xs font-bold hover:bg-rose-100 hover:text-rose-500">×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── ヘッダーのロゴ ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-black text-slate-800">ヘッダーのロゴ</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ※ ページ上部の固定ヘッダーに表示されます。未設定のときは店名の文字が出ます。
          横長の透過PNG推奨（高さ80ピクセル以上・横幅600ピクセルまで）。
          高さを揃えて表示するので、横幅は元の比率のままになります。
        </p>
        <div className="flex items-center gap-3">
          {form.logo_url ? (
            <div className="relative">
              {/* 背景が明るいひな形も暗いひな形もあるので、確認しやすいよう市松模様の上に置く */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.logo_url}
                alt="ロゴ"
                className="h-12 max-w-[240px] object-contain rounded-lg border border-slate-200 bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px] px-2"
              />
              <button
                onClick={() => {
                  const url = form.logo_url;
                  patch({ logo_url: null });
                  if (url) removeIfUnsaved(url);
                }}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black/50 text-white text-xs font-bold"
                aria-label="削除"
              >
                ×
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center w-40 h-12 rounded-lg border-2 border-dashed border-slate-200 text-[11px] text-slate-400 cursor-pointer hover:border-pink-300">
              {uploadingSlot === 'logo' ? 'アップ中…' : 'ロゴ画像を選ぶ'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingSlot !== null}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const publicUrl = await uploadImage('logo', file);
                  if (publicUrl) patch({ logo_url: publicUrl });
                }}
              />
            </label>
          )}
          <p className="text-[11px] text-slate-400">保存すると反映されます。</p>
        </div>
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
