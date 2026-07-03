'use client';

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import HeaderSliderManager from '@/app/components/HeaderSliderManager';
import FeaturedSalonsManager from '@/app/components/FeaturedSalonsManager';
import SalonEditModal, { type SalonForEdit } from '@/app/components/SalonEditModal';
import ThemeWallpaperManager from '@/app/components/ThemeWallpaperManager';
import AdminJobsManager from '@/app/components/AdminJobsManager';
import FeaturedJobsManager from '@/app/components/FeaturedJobsManager';
import { ADMIN_UUID } from '@/app/lib/admin';
import { areaLabel } from '@/app/lib/areaLabel';
import { revalidateTopAndAreas, revalidateSalon } from '@/app/lib/revalidateTop';

const supabase = createClient();

const AREAS = ['福岡全域', '博多・住吉', '中洲・天神・薬院', '北九州・小倉', '久留米', '福岡県その他', '出張'] as const;

type Salon = {
  id:          number;
  name:        string | null;
  area:        string | null;
  price:       string | null;
  rating:      number | null;
  owner_id:    string | null;
  hours:       string | null;
  phone:       string | null;
  address:     string | null;
  access:      string | null;
  closed_days: string | null;
  show_on_top: boolean | null;
  dispatch_type: 'none' | 'available' | 'only' | null;
  is_hidden: boolean | null;
  booking_email: string | null;
};

type AuthState = 'loading' | 'forbidden' | 'authorized';

// 本体タブ内のアコーディオン1セクション。見出し（クリックで開閉・chevron付き）＋本文。
// 開閉は CSS の hidden 切替のみ（本文は常にマウントしたまま）＝内部フォームの入力中state が破棄されない。
function AccordionSection({
  id,
  title,
  meta,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  meta?: ReactNode;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  children: ReactNode;
}) {
  const isOpen = expanded.has(id);
  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-white rounded-2xl border border-slate-100 shadow-sm hover:bg-slate-50/60 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-black text-slate-700">{title}</span>
          {meta}
        </span>
        <svg
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {/* 本文は常にレンダリングし、閉時は display:none（unmount しない＝入力中stateを保持）。 */}
      <div className={isOpen ? 'mt-3' : 'hidden'}>{children}</div>
    </div>
  );
}

const EMPTY_FORM = {
  name: '',
  area: '博多・住吉',
  price: '',
  hours: '',
  phone: '',
  address: '',
  access: '',
  closed_days: '',
  owner_id: '',
};

export default function AdminDashboard() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [salons, setSalons] = useState<Salon[]>([]);
  const [fetchError, setFetchError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  // area とは独立した別軸のフラグ（文字列フォームとは別 state で型安全に管理）。
  const [showOnTop, setShowOnTop] = useState(true);
  const [dispatchType, setDispatchType] = useState<'none' | 'available' | 'only'>('none');
  const [toast, setToast] = useState('');
  const [editingSalon, setEditingSalon] = useState<SalonForEdit | null>(null);
  const [hidingId, setHidingId] = useState<number | null>(null);
  // タブ（本体/求人）とアコーディオン開閉。タブはURLクエリ ?tab= と同期（リロード・ブックマークで維持）。
  const [activeTab, setActiveTab] = useState<'main' | 'jobs'>('main');
  // 初期は使用頻度の高い「掲載サロン一覧」のみ開。開閉状態はクライアントstateのみ（永続化しない）。
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['salon-list']));
  // 求人タブのバッジ用（AdminJobsManager が読み込み時に求人件数・新規応募合計を通知）。
  const [jobStats, setJobStats] = useState<{ total: number; newCount: number }>({ total: 0, newCount: 0 });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // タブ切替時にURLも更新（履歴を汚さない replace。ページ自体は同一ルートなので再マウントされない）。
  const selectTab = (key: 'main' | 'jobs') => {
    setActiveTab(key);
    router.replace(`/admin?tab=${key}`, { scroll: false });
  };

  // マウント時に ?tab= を反映（リロード・ブックマークでタブを維持）。
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'jobs') setActiveTab('jobs');
  }, []);

  const fetchSalons = useCallback(async () => {
    const { data, error } = await supabase
      .from('salons')
      .select('id, name, area, price, rating, owner_id, hours, phone, address, access, closed_days, show_on_top, dispatch_type, is_hidden, booking_email')
      .order('id', { ascending: true });
    if (error) {
      setFetchError('サロンデータの取得に失敗しました');
    } else {
      setFetchError('');
      setSalons(data ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login?redirectTo=' + encodeURIComponent(window.location.pathname)); return; }
      if (user.id !== ADMIN_UUID) { setAuthState('forbidden'); return; }
      setAuthState('authorized');
      await fetchSalons();
    })();
  }, [router, fetchSalons]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // 掲載サロンの非表示トグル（削除ではない・即復帰可）。
  // 非表示にすると公開側（一覧・検索・詳細・所属セラピスト・写メ日記）から見えなくなる。
  // オーナー本人・運営は引き続き閲覧/編集できる（salons RLS）。
  const handleToggleHidden = async (salon: Salon) => {
    const next = !salon.is_hidden;
    if (
      next &&
      !window.confirm(
        `「${salon.name ?? 'この店舗'}」を非表示にしますか？\n公開側（一覧・検索・詳細・所属セラピスト・写メ日記）から見えなくなります。\nデータは残り、いつでも表示に戻せます。`,
      )
    ) {
      return;
    }
    setHidingId(salon.id);
    const { error } = await supabase.from('salons').update({ is_hidden: next }).eq('id', salon.id);
    setHidingId(null);
    if (error) {
      showToast(`更新に失敗しました: ${error.message}`);
      return;
    }
    setSalons(prev => prev.map(s => (s.id === salon.id ? { ...s, is_hidden: next } : s)));
    // 公開側キャッシュ（トップ・地域・当該サロン詳細）を即時再検証して残像を防ぐ。
    revalidateTopAndAreas();
    revalidateSalon(salon.id);
    showToast(next ? '非表示にしました' : '表示に戻しました');
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setAddError('店舗名は必須です'); return; }
    setAddError('');
    setAdding(true);

    const { error } = await supabase.from('salons').insert({
      name:              form.name.trim(),
      area:              form.area,
      price:             form.price.trim(),
      hours:             form.hours.trim(),
      phone:             form.phone.trim(),
      address:           form.address.trim(),
      access:            form.access.trim(),
      closed_days:       form.closed_days.trim(),
      owner_id:          form.owner_id.trim() || null,
      show_on_top:       showOnTop,
      dispatch_type:     dispatchType,
      rating:            0,
      review_count:      0,
      courses:           [],
      tags:              [],
      description:       '',
      appeal:            '',
      therapist_count:   null,
      therapist_types:   null,
      therapist_profile: '',
      note:              '',
    });

    setAdding(false);

    if (error) {
      setAddError(`追加に失敗しました: ${error.message}`);
    } else {
      setForm(EMPTY_FORM);
      setShowOnTop(true);
      setDispatchType('none');
      revalidateTopAndAreas(); // 新規サロンをトップ＋地域ページ（出張含む）に反映
      showToast('サロンを追加しました');
      await fetchSalons();
    }
  };

  const field = (label: string, key: keyof typeof EMPTY_FORM, placeholder = '') => (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-slate-400 block">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
      />
    </div>
  );

  if (authState === 'loading') {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center">
        <p className="text-slate-400 text-sm">読み込み中...</p>
      </div>
    );
  }

  if (authState === 'forbidden') {
    return (
      <div className="min-h-screen bg-pink-50/30 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-rose-100 shadow-xl p-8 max-w-sm w-full text-center space-y-4">
          <span className="text-4xl">🚫</span>
          <h1 className="text-lg font-black text-slate-800">アクセス権限がありません</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            このページは管理者専用です。<br />
            権限のないアカウントでログインしています。
          </p>
          <button
            onClick={handleSignOut}
            className="w-full py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-rose-500 hover:border-rose-200 transition-colors font-medium"
          >
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-pink-200 shadow-lg rounded-2xl px-6 py-3 text-sm font-bold text-pink-600">
          {toast}
        </div>
      )}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">⚙</span>
            </div>
            <h1 className="text-base font-black text-slate-800 tracking-wide">管理者ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-pink-600 font-medium transition-colors"
            >
              サイトを見る
            </Link>
            <button
              onClick={handleSignOut}
              className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* ── タブナビゲーション（mypage と同系統のチップ・本体/求人の2タブ。URLクエリ ?tab= と同期） ── */}
      <div className="max-w-5xl mx-auto px-3 pt-4 flex flex-wrap justify-center gap-1.5">
        {([
          ['main', '本体'],
          ['jobs', '求人'],
        ] as const).map(([key, label]) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => selectTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              {key === 'jobs' && jobStats.newCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-black leading-none">
                  {jobStats.newCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ══════════ 本体タブ ══════════ */}
        <div className={`space-y-4 ${activeTab === 'main' ? '' : 'hidden'}`}>

          <AccordionSection id="header-slider" title="トップページ画像スライダー設定" expanded={expandedSections} onToggle={toggleSection}>
            <HeaderSliderManager />
          </AccordionSection>

          <AccordionSection id="featured-salons" title="ピックアップサロン設定" expanded={expandedSections} onToggle={toggleSection}>
            <FeaturedSalonsManager
              allSalons={salons.map(s => ({
                id:   s.id,
                name: s.name   ?? '',
                area: s.area   ?? '',
              }))}
            />
          </AccordionSection>

          <AccordionSection id="theme-wallpaper" title="テーマ壁紙設定" expanded={expandedSections} onToggle={toggleSection}>
            <ThemeWallpaperManager onToast={showToast} />
          </AccordionSection>

          {/* ── 新規サロン追加フォーム ── */}
          <AccordionSection id="add-salon" title="新規サロン追加" expanded={expandedSections} onToggle={toggleSection}>
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 店舗名 */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-400 block">
                  店舗名 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 極楽の宙 博多店"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                />
              </div>

              {/* エリア */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 block">エリア</label>
                <select
                  value={form.area}
                  onChange={e => setForm(p => ({ ...p, area: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  {AREAS.map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
                </select>
              </div>

              {field('料金', 'price', '例: 60分 ¥8,000〜')}

              {/* 営業時間 — テキスト入力 + ドラムロールピッカー */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-400 block">営業時間</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="例: 11:00〜翌4:00"
                    value={form.hours}
                    onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                  <TimeRangePicker value={form.hours} onChange={v => setForm(p => ({ ...p, hours: v }))} />
                </div>
              </div>

              {field('電話番号', 'phone', '例: 092-XXX-XXXX')}
              {field('住所', 'address', '例: 福岡市博多区...')}
              {field('アクセス', 'access', '例: 博多駅より徒歩5分')}
              {field('定休日', 'closed_days', '例: 年中無休')}

              {/* オーナーUUID */}
              <div className="space-y-1 sm:col-span-2">
                <label className="text-[11px] font-bold text-slate-400 block">オーナーUUID</label>
                <input
                  type="text"
                  placeholder="例: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={form.owner_id}
                  onChange={e => setForm(p => ({ ...p, owner_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 font-mono"
                />
              </div>
            </div>

            {/* 掲載・出張区分（area とは独立した別軸） */}
            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showOnTop}
                  onChange={e => setShowOnTop(e.target.checked)}
                  className="w-4 h-4 accent-pink-500"
                />
                トップに表示
              </label>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">出張</label>
                <select
                  value={dispatchType}
                  onChange={e => setDispatchType(e.target.value as 'none' | 'available' | 'only')}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
                >
                  <option value="none">出張なし</option>
                  <option value="available">出張あり</option>
                  <option value="only">出張専門</option>
                </select>
              </div>
            </div>

            {addError && (
              <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{addError}</p>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={adding}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {adding ? '追加中...' : '追加'}
              </button>
            </div>
          </form>
        </div>

          </AccordionSection>

          {/* ── 掲載サロン一覧テーブル（件数はアコーディオン見出しに表示） ── */}
          <AccordionSection
            id="salon-list"
            title="掲載サロン一覧"
            meta={<span className="text-xs text-slate-400 font-medium">{salons.length}件</span>}
            expanded={expandedSections}
            onToggle={toggleSection}
          >
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">

          {fetchError ? (
            <div className="p-6 text-center text-sm text-rose-400">{fetchError}</div>
          ) : salons.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-400">データがありません</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-pink-50/50 border-b border-slate-100">
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 w-14">ID</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">サロン名</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">エリア</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">状態</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">料金</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 w-16">評価</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">オーナーUUID</th>
                    <th className="px-4 py-3 w-44" />
                  </tr>
                </thead>
                <tbody>
                  {salons.map((salon, i) => (
                    <tr
                      key={salon.id}
                      className={`border-b border-slate-100 hover:bg-pink-50/20 transition-colors ${salon.is_hidden ? 'opacity-50' : i % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{salon.id}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{salon.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-medium">
                          {salon.area ? areaLabel(salon.area) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {salon.is_hidden && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-600 border border-rose-200 font-bold">非表示中</span>
                          )}
                          {salon.show_on_top === false ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 font-medium">非掲載</span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 font-medium">トップ</span>
                          )}
                          {salon.dispatch_type === 'available' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-medium">出張</span>
                          )}
                          {salon.dispatch_type === 'only' && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-300 font-medium">出張専門</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{salon.price ?? '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-pink-600">
                        {salon.rating != null ? `★${salon.rating}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-400 font-mono break-all">
                        {salon.owner_id ?? <span className="text-slate-300">未設定</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleToggleHidden(salon)}
                            disabled={hidingId === salon.id}
                            className={`text-[11px] font-bold px-3 py-1 rounded-lg border transition-colors disabled:opacity-50 ${
                              salon.is_hidden
                                ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {salon.is_hidden ? '表示に戻す' : '非表示にする'}
                          </button>
                          <button
                            onClick={() => setEditingSalon(salon)}
                            className="text-[11px] font-bold px-3 py-1 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors"
                          >
                            編集
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </div>
          </AccordionSection>

        </div>
        {/* ══════════ 本体タブ ここまで ══════════ */}

        {/* ══════════ 求人タブ（本体タブと同じアコーディオン方式） ══════════ */}
        <div className={`space-y-4 ${activeTab === 'jobs' ? '' : 'hidden'}`}>

          {/* おすすめ求人（featured_jobs）設定：本体のピックアップサロンと同方式 */}
          <AccordionSection id="featured-jobs" title="おすすめ求人設定" expanded={expandedSections} onToggle={toggleSection}>
            <FeaturedJobsManager onToast={showToast} />
          </AccordionSection>

          {/* 求人管理（フクエスワーク）。件数・新規応募バッジは折りたたみ時も見えるよう見出しに表示。 */}
          <AccordionSection
            id="jobs-manage"
            title="求人管理（フクエスワーク）"
            meta={
              <>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(16,185,129,0.12)', color: '#059669' }}>
                  {jobStats.total}件
                </span>
                {jobStats.newCount > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-pink-50 text-pink-600 border border-pink-200">
                    新規応募{jobStats.newCount}件
                  </span>
                )}
              </>
            }
            expanded={expandedSections}
            onToggle={toggleSection}
          >
            <AdminJobsManager onToast={showToast} onStats={setJobStats} />
          </AccordionSection>

        </div>

      </main>

      {/* ── サロン編集モーダル ── */}
      {editingSalon && (
        <SalonEditModal
          salon={editingSalon}
          onClose={() => setEditingSalon(null)}
          onSaved={(msg) => {
            setEditingSalon(null);
            showToast(msg);
            fetchSalons();
          }}
        />
      )}
    </div>
  );
}