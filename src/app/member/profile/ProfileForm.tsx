'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

const NICKNAME_MAX = 20;

// 会員ニックネームの編集フォーム。
// ★ニックネームは「初回設定のみ可・以降は変更不可」。
//   - 未設定（initialNickname が空）：入力可＋事前注意書き＋空保存禁止（必須）。
//   - 設定済み（initialNickname が非空）：読み取り専用＋確定メッセージ。保存ボタンは出さない。
//   DBトリガー（prevent_nickname_change）が本丸で、UIすり抜けの変更 upsert は DB が弾く。
// 保存は /mypage と同じくクライアント側の supabase から（RLS で本人の行のみ更新可）。
// id は必ずサーバーで確定したログインユーザーの uid を使い、ユーザー入力の id は受け取らない。
export function ProfileForm({ userId, initialNickname }: { userId: string; initialNickname: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // 設定済み（ロック）判定：trim 後に1文字以上あれば変更不可。
  const locked = initialNickname.trim().length > 0;

  const handleSave = async () => {
    // 必須化：空では保存させない（設定済みなら以降変更不可なので初回に必ず値を入れる）。
    if (!nickname.trim()) {
      setToast('ニックネームを入力してください');
      return;
    }
    setSaving(true);
    setToast('');
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, nickname: nickname.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
    setSaving(false);
    if (error) {
      setToast('保存に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    setToast('保存しました');
    // ダッシュボードへ反映（サーバー再取得）を促してから少し置いて遷移。
    router.refresh();
    setTimeout(() => router.push('/member'), 900);
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="nickname" className="text-[11px] font-bold text-slate-400 block mb-1.5">
          ニックネーム
        </label>
        <input
          id="nickname"
          type="text"
          value={locked ? initialNickname : nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX}
          readOnly={locked}
          placeholder="ニックネームを入力"
          className={
            locked
              ? 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-100 text-slate-500 cursor-not-allowed focus:outline-none'
              : 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200'
          }
        />
        {locked ? (
          // 設定済み：確定メッセージ。
          <p className="text-[12px] text-slate-400 mt-1">設定済みのニックネームは変更できません。</p>
        ) : (
          // 未設定：文字数カウンタ＋事前注意書き。
          <>
            <p className="text-[11px] text-slate-400 mt-1 text-right">{nickname.length}/{NICKNAME_MAX}</p>
            <p className="text-[12px] text-amber-600 font-medium mt-1">
              ※ニックネームは一度設定すると、後から変更できません。
            </p>
          </>
        )}
      </div>

      {toast && (
        <p className={`text-sm font-medium ${toast === '保存しました' ? 'text-emerald-600' : 'text-rose-500'}`}>
          {toast}
        </p>
      )}

      <div className="flex items-center gap-3">
        {/* 保存ボタンは未設定のときだけ表示（設定済みは編集項目が無いため出さない）。 */}
        {!locked && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !nickname.trim()}
            className="px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity"
            style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        )}
        <Link href="/member" className="text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors">
          マイページに戻る
        </Link>
      </div>
    </div>
  );
}
