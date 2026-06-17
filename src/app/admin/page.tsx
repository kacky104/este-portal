'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import HeaderSliderManager from '@/app/components/HeaderSliderManager';
import FeaturedSalonsManager from '@/app/components/FeaturedSalonsManager';
import SalonEditModal, { type SalonForEdit } from '@/app/components/SalonEditModal';
import ThemeWallpaperManager from '@/app/components/ThemeWallpaperManager';

const supabase = createClient();
const ADMIN_UUID = '63aca737-b399-4fb2-bf92-8a3816955d69';

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
};

type AuthState = 'loading' | 'forbidden' | 'authorized';

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
  const [toast, setToast] = useState('');
  const [editingSalon, setEditingSalon] = useState<SalonForEdit | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchSalons = useCallback(async () => {
    const { data, error } = await supabase
      .from('salons')
      .select('id, name, area, price, rating, owner_id, hours, phone, address, access, closed_days')
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
      if (!user) { router.push('/login'); return; }
      if (user.id !== ADMIN_UUID) { setAuthState('forbidden'); return; }
      setAuthState('authorized');
      await fetchSalons();
    })();
  }, [router, fetchSalons]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
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
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── トップページ画像スライダー設定 ── */}
        <HeaderSliderManager />

        {/* ── ピックアップサロン設定 ── */}
        <FeaturedSalonsManager
          allSalons={salons.map(s => ({
            id:   s.id,
            name: s.name   ?? '',
            area: s.area   ?? '',
          }))}
        />

        {/* ── テーマ壁紙設定 ── */}
        <ThemeWallpaperManager onToast={showToast} />

        {/* ── 新規サロン追加フォーム ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-sm font-black text-slate-700 mb-5">新規サロン追加</h2>
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
                  {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
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

        {/* ── 掲載サロン一覧テーブル ── */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-700">掲載サロン一覧</h2>
            <span className="text-xs text-slate-400">{salons.length}件</span>
          </div>

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
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">料金</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 w-16">評価</th>
                    <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400">オーナーUUID</th>
                    <th className="px-4 py-3 w-16" />
                  </tr>
                </thead>
                <tbody>
                  {salons.map((salon, i) => (
                    <tr
                      key={salon.id}
                      className={`border-b border-slate-100 hover:bg-pink-50/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">{salon.id}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-800">{salon.name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-100 font-medium">
                          {salon.area ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{salon.price ?? '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold text-pink-600">
                        {salon.rating != null ? `★${salon.rating}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-[10px] text-slate-400 font-mono break-all">
                        {salon.owner_id ?? <span className="text-slate-300">未設定</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEditingSalon(salon)}
                          className="text-[11px] font-bold px-3 py-1 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors"
                        >
                          編集
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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