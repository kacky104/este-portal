'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { areaLabel } from '@/app/lib/areaLabel';
import { revalidateRanking } from '@/app/lib/revalidateTop';

// 週間ランキングの管理：店舗/セラピストの「下駄（ハンデ）」設定＋ヒーロー（ヘッダー）画像設定。
// 下駄の保存は管理者判定付きRPC admin_set_ranking_bonus、ヒーロー画像は admin_set_ranking_hero(p_tab,p_url) 経由。
// 画像は既存の公開バケット header-slider を再利用（ranking/ 配下に保存）。
// ヒーロー画像は総合/店舗/セラピストのタブ別に3枚設定できる。
const supabase = createClient();

const HERO_BUCKET = 'header-slider';
type HeroSel = 'overall' | 'salon' | 'therapist';
const HERO_LABELS: Record<HeroSel, string> = { overall: '総合', salon: '店舗', therapist: 'セラピスト' };

type SalonRow = { id: number; name: string; area: string | null; bonus: number };
type TherapistRow = { id: number; name: string; salonId: number | null; salonName: string; bonus: number };
type TabKey = 'salon' | 'therapist' | 'hero';

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="flex-shrink-0 text-slate-300" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function RankingHandicapManager({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<TabKey>('salon');
  const [salons, setSalons] = useState<SalonRow[]>([]);
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({}); // `${type}:${id}` -> 入力中の文字列
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [selectedSalonId, setSelectedSalonId] = useState<number | null>(null); // セラピストタブで選択中の店舗
  // ヒーロー画像（タブ別3枚）
  const [heroUrls, setHeroUrls] = useState<Record<HeroSel, string | null>>({ overall: null, salon: null, therapist: null });
  const [heroSel, setHeroSel] = useState<HeroSel>('overall'); // ヘッダー画像タブ内で編集中のページ
  const [heroBusy, setHeroBusy] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [{ data: sData, error: sErr }, { data: tData, error: tErr }, { data: hData }] = await Promise.all([
      supabase.from('salons').select('id, name, area, ranking_bonus').eq('is_hidden', false).order('id', { ascending: true }),
      supabase
        .from('therapists')
        .select('id, name, ranking_bonus, is_active, salon_id, salons(name)')
        .eq('is_active', true)
        .order('id', { ascending: true }),
      supabase.from('ranking_hero').select('hero_overall, hero_salon, hero_therapist').eq('id', 1).maybeSingle(),
    ]);
    if (sErr || tErr) {
      setError('データの取得に失敗しました');
      setLoaded(true);
      return;
    }
    const s: SalonRow[] = (sData ?? []).map((r) => ({
      id: Number(r.id),
      name: (r.name as string) ?? '',
      area: (r.area as string | null) ?? null,
      bonus: Number((r.ranking_bonus as number | null) ?? 0),
    }));
    const t: TherapistRow[] = (tData ?? []).map((r) => {
      const row = r as unknown as {
        id: number;
        name: string | null;
        ranking_bonus: number | null;
        salon_id: number | null;
        salons: { name: string | null } | { name: string | null }[] | null;
      };
      const salonRel = Array.isArray(row.salons) ? row.salons[0] : row.salons;
      return {
        id: Number(row.id),
        name: row.name ?? '',
        salonId: row.salon_id != null ? Number(row.salon_id) : null,
        salonName: salonRel?.name ?? '',
        bonus: Number(row.ranking_bonus ?? 0),
      };
    });
    const init: Record<string, string> = {};
    s.forEach((r) => (init[`salon:${r.id}`] = String(r.bonus)));
    t.forEach((r) => (init[`therapist:${r.id}`] = String(r.bonus)));
    setSalons(s);
    setTherapists(t);
    setInputs(init);
    const pick = (v: unknown): string | null => ((v as string | null) ?? null) || null;
    setHeroUrls({
      overall: pick((hData as { hero_overall?: unknown } | null)?.hero_overall),
      salon: pick((hData as { hero_salon?: unknown } | null)?.hero_salon),
      therapist: pick((hData as { hero_therapist?: unknown } | null)?.hero_therapist),
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (type: 'salon' | 'therapist', id: number) => {
    const key = `${type}:${id}`;
    const raw = inputs[key] ?? '0';
    const val = Math.max(0, Math.floor(Number(raw)) || 0);
    setSavingKey(key);
    const { error: rpcErr } = await supabase.rpc('admin_set_ranking_bonus', {
      p_item_type: type,
      p_item_id: id,
      p_bonus: val,
    });
    setSavingKey(null);
    if (rpcErr) {
      onToast(`保存に失敗しました: ${rpcErr.message}`);
      return;
    }
    if (type === 'salon') setSalons((prev) => prev.map((r) => (r.id === id ? { ...r, bonus: val } : r)));
    else setTherapists((prev) => prev.map((r) => (r.id === id ? { ...r, bonus: val } : r)));
    setInputs((prev) => ({ ...prev, [key]: String(val) }));
    revalidateRanking();
    onToast(val > 0 ? `下駄（+${val.toLocaleString()}）を保存しました` : '下駄を解除しました');
  };

  // ── ヒーロー画像：アップロード（header-slider/ranking/ 配下）→ RPCでタブ別にURL保存 ──
  const onHeroFile = async (sel: HeroSel, file: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      onToast('JPEG / PNG / WebP のみアップロードできます');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast('画像は5MBまでです');
      return;
    }
    setHeroBusy(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `ranking/hero-${sel}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(HERO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setHeroBusy(false);
      onToast(`アップロードに失敗しました: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from(HERO_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: rpcErr } = await supabase.rpc('admin_set_ranking_hero', { p_tab: sel, p_url: url });
    setHeroBusy(false);
    if (rpcErr) {
      onToast(`保存に失敗しました: ${rpcErr.message}`);
      return;
    }
    setHeroUrls((prev) => ({ ...prev, [sel]: url }));
    if (heroInputRef.current) heroInputRef.current.value = '';
    revalidateRanking();
    onToast(`「${HERO_LABELS[sel]}」のヘッダー画像を設定しました`);
  };

  const removeHero = async (sel: HeroSel) => {
    setHeroBusy(true);
    const { error: rpcErr } = await supabase.rpc('admin_set_ranking_hero', { p_tab: sel, p_url: '' });
    setHeroBusy(false);
    if (rpcErr) {
      onToast(`削除に失敗しました: ${rpcErr.message}`);
      return;
    }
    setHeroUrls((prev) => ({ ...prev, [sel]: null }));
    revalidateRanking();
    onToast(`「${HERO_LABELS[sel]}」のヘッダー画像を削除しました`);
  };

  // 切替時は検索と選択店舗をリセット。
  const switchTab = (key: TabKey) => {
    setTab(key);
    setQ('');
    setSelectedSalonId(null);
  };

  const filteredSalons = useMemo(() => {
    const kw = q.trim();
    if (!kw) return salons;
    return salons.filter((r) => r.name.includes(kw));
  }, [salons, q]);

  const therapistShops = useMemo(() => {
    const map = new Map<number, { salonId: number; salonName: string; therapists: TherapistRow[]; bonusCount: number }>();
    therapists.forEach((t) => {
      const sid = t.salonId ?? -1;
      if (!map.has(sid)) {
        map.set(sid, { salonId: sid, salonName: t.salonName || '（店舗未設定）', therapists: [], bonusCount: 0 });
      }
      const g = map.get(sid)!;
      g.therapists.push(t);
      if (t.bonus > 0) g.bonusCount += 1;
    });
    return [...map.values()];
  }, [therapists]);

  const selectedShop = useMemo(
    () => (selectedSalonId == null ? null : therapistShops.find((s) => s.salonId === selectedSalonId) ?? null),
    [therapistShops, selectedSalonId],
  );

  const filteredShops = useMemo(() => {
    const kw = q.trim();
    if (!kw) return therapistShops;
    return therapistShops.filter((s) => s.salonName.includes(kw));
  }, [therapistShops, q]);

  const filteredShopTherapists = useMemo(() => {
    if (!selectedShop) return [];
    const kw = q.trim();
    if (!kw) return selectedShop.therapists;
    return selectedShop.therapists.filter((t) => t.name.includes(kw));
  }, [selectedShop, q]);

  const salonBonusCount = salons.filter((r) => r.bonus > 0).length;

  const searchPlaceholder =
    tab === 'salon' ? '店舗名で絞り込み' : selectedShop ? 'セラピスト名で絞り込み' : '店舗名で絞り込み';

  const anyHero = Boolean(heroUrls.overall || heroUrls.salon || heroUrls.therapist);
  const currentHero = heroUrls[heroSel];

  const row = (type: 'salon' | 'therapist', id: number, title: string, sub: string) => {
    const key = `${type}:${id}`;
    const current = type === 'salon'
      ? salons.find((r) => r.id === id)?.bonus ?? 0
      : therapists.find((r) => r.id === id)?.bonus ?? 0;
    const inputVal = inputs[key] ?? '0';
    const dirty = String(current) !== String(Math.max(0, Math.floor(Number(inputVal)) || 0));
    return (
      <div key={key} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800 truncate">{title || '—'}</p>
          {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
        </div>
        {current > 0 && (
          <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
            +{current.toLocaleString()}
          </span>
        )}
        <input
          type="number"
          min={0}
          step={100}
          value={inputVal}
          onChange={(e) => setInputs((prev) => ({ ...prev, [key]: e.target.value }))}
          className="flex-shrink-0 w-24 px-2 py-1.5 rounded-lg border border-slate-200 text-xs text-right bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <button
          type="button"
          onClick={() => save(type, id)}
          disabled={savingKey === key || !dirty}
          className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {savingKey === key ? '保存中…' : '保存'}
        </button>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-3">
      {tab === 'hero' ? (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
          週間ランキングページ最上部の<strong className="text-slate-700">ヘッダー画像</strong>を、
          <strong className="text-slate-700">総合／店舗／セラピストのタブごと</strong>に設定できます。
          JPEG / PNG / WebP・5MBまで。未設定のタブは非表示。横長のバナー画像がおすすめです。
        </p>
      ) : (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 leading-relaxed">
          設定した値が<strong className="text-slate-700">毎週のアクセス数に自動で加算</strong>されます（週リセット後も維持）。
          0 で解除。<strong className="text-slate-700">数値は公開ランキングには表示されません</strong>（順位の底上げのみ）。
        </p>
      )}

      {/* サブタブ：店舗 / セラピスト / ヘッダー画像 */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ['salon', '店舗', salons.length],
          ['therapist', 'セラピスト', therapists.length],
          ['hero', 'ヘッダー画像', null],
        ] as const).map(([key, label, count]) => {
          const selected = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              {count != null && (
                <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black leading-none ${selected ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {count}
                </span>
              )}
              {key === 'hero' && anyHero && (
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="設定あり" />
              )}
            </button>
          );
        })}
      </div>

      {/* ══ ヘッダー画像タブ（総合／店舗／セラピスト別） ══ */}
      {tab === 'hero' ? (
        <div className="space-y-3">
          {/* 編集するページの選択（それぞれ設定済みは緑ドット） */}
          <div className="flex gap-1.5">
            {(['overall', 'salon', 'therapist'] as const).map((k) => {
              const sel = heroSel === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setHeroSel(k)}
                  aria-pressed={sel}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                    sel
                      ? 'bg-pink-50 text-pink-600 border-pink-300'
                      : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {HERO_LABELS[k]}
                  {heroUrls[k] && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" aria-label="設定あり" />}
                </button>
              );
            })}
          </div>

          {!loaded ? (
            <div className="py-8 text-center text-sm text-slate-400">読み込み中...</div>
          ) : (
            <>
              {currentHero ? (
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentHero} alt={`現在のヘッダー画像（${HERO_LABELS[heroSel]}）`} className="w-full h-auto block" />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
                  「{HERO_LABELS[heroSel]}」のヘッダー画像は未設定です
                </div>
              )}

              <input
                ref={heroInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onHeroFile(heroSel, f);
                }}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => heroInputRef.current?.click()}
                  disabled={heroBusy}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {heroBusy ? '処理中…' : currentHero ? '画像を差し替える' : '画像をアップロード'}
                </button>
                {currentHero && (
                  <button
                    type="button"
                    onClick={() => removeHero(heroSel)}
                    disabled={heroBusy}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 font-bold text-xs hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          {/* セラピストタブで店舗選択中は、店舗名のパンくず＋戻る */}
          {tab === 'therapist' && selectedShop && (
            <button
              type="button"
              onClick={() => { setSelectedSalonId(null); setQ(''); }}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-pink-600 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              店舗一覧へ戻る
            </button>
          )}

          {/* 検索 */}
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
          />

          {/* 件数の案内 */}
          {tab === 'salon' ? (
            <p className="text-[11px] text-slate-400">下駄あり：{salonBonusCount}件 / 全{salons.length}件</p>
          ) : selectedShop ? (
            <p className="text-[11px] text-slate-400">
              {selectedShop.salonName}：下駄あり {selectedShop.bonusCount}件 / 全{selectedShop.therapists.length}名
            </p>
          ) : (
            <p className="text-[11px] text-slate-400">店舗を選ぶと所属セラピストを設定できます（全{therapistShops.length}店舗 / {therapists.length}名）</p>
          )}

          {error ? (
            <div className="py-8 text-center text-sm text-rose-400">{error}</div>
          ) : !loaded ? (
            <div className="py-8 text-center text-sm text-slate-400">読み込み中...</div>
          ) : tab === 'salon' ? (
            <div className="rounded-2xl border border-slate-100 overflow-hidden max-h-[420px] overflow-y-auto">
              {filteredSalons.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">該当する店舗がありません</div>
              ) : (
                filteredSalons.map((r) => row('salon', r.id, r.name, r.area ? areaLabel(r.area) : ''))
              )}
            </div>
          ) : selectedShop ? (
            <div className="rounded-2xl border border-slate-100 overflow-hidden max-h-[420px] overflow-y-auto">
              {filteredShopTherapists.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">該当するセラピストがいません</div>
              ) : (
                filteredShopTherapists.map((t) => row('therapist', t.id, t.name, ''))
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-100 overflow-hidden max-h-[420px] overflow-y-auto">
              {filteredShops.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">該当する店舗がありません</div>
              ) : (
                filteredShops.map((shop) => (
                  <button
                    key={shop.salonId}
                    type="button"
                    onClick={() => { setSelectedSalonId(shop.salonId); setQ(''); }}
                    className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-pink-50/30 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate">{shop.salonName}</p>
                      <p className="text-[11px] text-slate-400">{shop.therapists.length}名</p>
                    </div>
                    {shop.bonusCount > 0 && (
                      <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                        下駄{shop.bonusCount}
                      </span>
                    )}
                    <Chevron />
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
