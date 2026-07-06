'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateSalon, revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { TimeRangePicker } from '@/components/TimeRangePicker';
import { areaLabel } from '@/app/lib/areaLabel';
import { AREA_ORDER } from '@/app/lib/areas';
import {
  adminGetOwnerEmail,
  adminUpdateOwnerEmail,
  adminSendOwnerPasswordReset,
} from '@/app/actions/adminOwner';

// メール形式の簡易チェック（サーバー側 adminOwner と同等。UI 側の事前確認用）。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  show_on_top: boolean | null;
  dispatch_type: 'none' | 'available' | 'only' | null;
  booking_email: string | null;
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
    area:        salon.area        ?? AREA_ORDER[1],
    price:       salon.price       ?? '',
    hours:       salon.hours       ?? '',
    phone:       salon.phone       ?? '',
    address:     salon.address     ?? '',
    access:      salon.access      ?? '',
    closed_days: salon.closed_days ?? '',
    owner_id:    salon.owner_id    ?? '',
    booking_email: salon.booking_email ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  // area とは独立した別軸のフラグ（boolean なので文字列フォームとは別 state で管理）。
  const [showOnTop,    setShowOnTop]    = useState(salon.show_on_top ?? true);
  const [dispatchType, setDispatchType] = useState<'none' | 'available' | 'only'>(salon.dispatch_type ?? 'none');

  // ── ログインメール（auth.users）管理 ──
  // 対象は「この salon が開かれた時点の owner_uuid」に紐づくアカウント（既存アカウント引き継ぎのため
  // UUID は変えず email だけ差し替える）。UUID 欄の手動編集とは独立。
  const ownerUuid = salon.owner_id;
  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  const [ownerLinked, setOwnerLinked] = useState<boolean | null>(null); // null=読込中
  const [newEmail, setNewEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // モーダルを開いた際に現在のログインメールを取得（admin 専用サーバーアクション経由）。
  useEffect(() => {
    let alive = true;
    (async () => {
      setOwnerLinked(null);
      const res = await adminGetOwnerEmail(ownerUuid);
      if (!alive) return;
      if (res.ok) {
        setOwnerEmail(res.email);
        setOwnerLinked(res.linked);
      } else {
        setOwnerLinked(false);
        setEmailMsg({ kind: 'err', text: res.error });
      }
    })();
    return () => { alive = false; };
  }, [ownerUuid]);

  const handleChangeEmail = async () => {
    const next = newEmail.trim();
    setEmailMsg(null);
    if (!ownerUuid) { setEmailMsg({ kind: 'err', text: 'オーナーUUIDが未設定のため変更できません' }); return; }
    if (!EMAIL_RE.test(next)) { setEmailMsg({ kind: 'err', text: 'メールアドレスの形式が正しくありません' }); return; }
    if (ownerEmail && next.toLowerCase() === ownerEmail.toLowerCase()) {
      setEmailMsg({ kind: 'err', text: '新しいメールが現在のメールと同じです' });
      return;
    }
    if (!window.confirm(`現在のメール ${ownerEmail ?? '(不明)'} を ${next} に変更します。よろしいですか？`)) return;
    setEmailBusy(true);
    const res = await adminUpdateOwnerEmail(ownerUuid, next);
    setEmailBusy(false);
    if (!res.ok) { setEmailMsg({ kind: 'err', text: res.error }); return; }
    setOwnerEmail(res.email);
    setOwnerLinked(true);
    setNewEmail('');
    setEmailMsg({ kind: 'ok', text: `ログインメールを ${res.email} に変更しました ✓` });
  };

  const handleSendReset = async () => {
    const target = ownerEmail;
    setEmailMsg(null);
    if (!target) { setEmailMsg({ kind: 'err', text: '送信先のログインメールがありません' }); return; }
    if (!window.confirm(`${target} にパスワード再設定メールを送信します。よろしいですか？`)) return;
    setResetBusy(true);
    const res = await adminSendOwnerPasswordReset(target);
    setResetBusy(false);
    setEmailMsg(res.ok
      ? { kind: 'ok', text: `${target} にパスワード再設定メールを送信しました ✓` }
      : { kind: 'err', text: res.error });
  };

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError('店舗名は必須です'); return; }
    // 予約通知メール：空欄は許可、入力時のみ形式チェック。
    const bookingEmail = form.booking_email.trim();
    if (bookingEmail && !EMAIL_RE.test(bookingEmail)) {
      setError('予約通知メールの形式が正しくありません');
      return;
    }
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
        show_on_top: showOnTop,
        dispatch_type: dispatchType,
        booking_email: bookingEmail || null,
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
      revalidateSalon(salon.id);   // このサロンの詳細＋トップを更新
      revalidateTopAndAreas();     // 掲載/出張フラグ・エリア変更を地域ページ（出張含む）にも反映
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
                {AREA_ORDER.map(a => <option key={a} value={a}>{areaLabel(a)}</option>)}
              </select>
            </div>
            {textField('料金', 'price', '例: 60分 ¥8,000〜')}
          </div>

          {/* 掲載・出張区分（area とは独立した別軸） */}
          <div className="flex flex-wrap items-center gap-5">
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

          {/* 予約通知メール（空欄可・入力時のみ形式チェック） */}
          {textField('予約通知メール', 'booking_email', '例: owner@example.com（ネット予約の通知先）')}

          {/* オーナーUUID */}
          {textField('オーナーUUID', 'owner_id', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', true)}

          {/* ── ログインメール（オーナーアカウント）管理 ── */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500">ログインメール</span>
              {ownerLinked === null ? (
                <span className="text-[10px] text-slate-400">確認中...</span>
              ) : ownerLinked ? (
                <span className="text-[11px] font-mono text-slate-700 break-all text-right">{ownerEmail ?? '(不明)'}</span>
              ) : (
                <span className="text-[10px] text-amber-600 font-bold">アカウント未連携</span>
              )}
            </div>

            {ownerLinked && (
              <>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  既存アカウントを引き継ぎ、ログインメールだけを新オーナーのものへ変更します（オーナーUUIDは変わりません）。
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="新しいログインメール"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
                  />
                  <button
                    onClick={handleChangeEmail}
                    disabled={emailBusy}
                    className="flex-shrink-0 px-3 py-2 rounded-xl bg-pink-500 text-white font-bold text-[11px] shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
                  >
                    {emailBusy ? '変更中...' : 'ログインメールを変更'}
                  </button>
                </div>
                <button
                  onClick={handleSendReset}
                  disabled={resetBusy}
                  className="text-[11px] font-semibold text-pink-600 border border-pink-200 rounded-lg px-3 py-1.5 hover:bg-pink-50 disabled:opacity-50 transition-colors"
                >
                  {resetBusy ? '送信中...' : 'パスワード再設定メールを送信'}
                </button>
              </>
            )}

            {emailMsg && (
              <p className={`text-[11px] rounded-lg px-3 py-2 whitespace-pre-line ${
                emailMsg.kind === 'ok'
                  ? 'text-emerald-600 bg-emerald-50 border border-emerald-100'
                  : 'text-rose-500 bg-rose-50 border border-rose-100'
              }`}>
                {emailMsg.text}
              </p>
            )}
          </div>

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
