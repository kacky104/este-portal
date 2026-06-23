'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon } from '@/app/lib/revalidateTop';
import { TimeRangePicker } from '@/components/TimeRangePicker';

const AREAS = [
  '福岡全域', '博多・住吉', '中洲・天神・薬院',
  '北九州・小倉', '久留米', '福岡県その他', '出張',
] as const;

export type SalonForEdit = {
  id:          number;
  name:        string | null;
  area:        string | null;
  price:       string | null;
  hours:       string | null;
  phone:       string | null;
  address:     string | null;
  access:      string | null;
  closed_days: string | null;
  owner_id:    string | null;
};

type Props = {
  salon:   SalonForEdit;
  onClose: () => void;
  onSaved: (msg: string) => void;
};

// クライアントはコンポーネント初期化時に一度だけ生成（認証セッションを確実に引き継ぐ）
const supabase = createClient();

export default function SalonEditModal({ salon, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name:        salon.name        ?? '',
    area:        salon.area        ?? AREAS[1],
    price:       salon.price       ?? '',
    hours:       salon.hours       ?? '',
    phone:       salon.phone       ?? '',
    address:     salon.address     ?? '',
    access:      salon.access      ?? '',
    closed_days: salon.closed_days ?? '',
    owner_id:    salon.owner_id    ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('店舗名は必須です'); return; }
    setSaving(true);
    setError('');

    const { data, error: dbErr } = await supabase
      .from('salons')
      .update({
        name:        form.name.trim(),
        area:        form.area,
        price:       form.price.trim(),
        hours:       form.hours.trim(),
        phone:       form.phone.trim(),
        address:     form.address.trim(),
        access:      form.access.trim(),
        closed_days: form.closed_days.trim(),
        owner_id:    form.owner_id.trim() || null,
      })
      .eq('id', salon.id)
      .select('id');   // 影響行を取得してRLSブロックを検出

    setSaving(false);

    if (dbErr) {
      console.error('[SalonEdit] update error:', dbErr);
      setError(`保存に失敗しました: ${dbErr.message}`);
    } else if (!data || data.length === 0) {
      // RLSポリシーが存在しない/権限不足のとき影響行数0で error:null になる
      console.warn('[SalonEdit] update affected 0 rows — check RLS policy on salons table');
      setError('更新できませんでした。RLSポリシーを確認してください。\n(supabase/migrations/20260616_salons_rls_update.sql を実行してください)');
    } else {
      revalidateSalon(salon.id); // 成功時：このサロンの詳細＋トップのISRを即時更新
      onSaved('サロン情報を更新しました ✓');
    }
  };

  const textField = (
    label: string,
    key: keyof typeof form,
    placeholder = '',
    mono = false,
  ) => (
    <div className="space-y-1">
      <label className="text-[11px] font-bold text-slate-400 block">{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        value={form[key]}
        onChange={set(key)}
        className={`w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h3 className="text-sm font-black text-slate-800">
            サロン編集
            <span className="ml-2 text-[11px] font-normal text-slate-400">ID: {salon.id}</span>
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs flex items-center justify-center hover:bg-slate-200 transition-colors"
          >✕</button>
        </div>

        {/* ── Body ── */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 scrollbar-pink">

          {/* 店舗名 */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">
              店舗名 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>

          {/* エリア ＋ 料金 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block">エリア</label>
              <select
                value={form.area}
                onChange={set('area')}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            {textField('料金', 'price', '例: 60分 ¥8,000〜')}
          </div>

          {/* 営業時間 */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">営業時間</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="例: 11:00〜翌4:00"
                value={form.hours}
                onChange={set('hours')}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <TimeRangePicker value={form.hours} onChange={v => setForm(p => ({ ...p, hours: v }))} />
            </div>
          </div>

          {/* 電話 ＋ 定休日 */}
          <div className="grid grid-cols-2 gap-4">
            {textField('電話番号', 'phone', '例: 092-XXX-XXXX')}
            {textField('定休日',   'closed_days', '例: 年中無休')}
          </div>

          {textField('住所',     'address', '例: 福岡市博多区...')}
          {textField('アクセス', 'access',  '例: 博多駅より徒歩5分')}

          {/* オーナーUUID */}
          {textField('オーナーUUID', 'owner_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', true)}

          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-500 font-medium hover:border-slate-300 hover:text-slate-700 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
