'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deleteMyMemberAccount } from '@/app/actions/memberAccount';
import { signOut } from '@/lib/auth';

// 退会（会員アカウントの本人削除）。プロフィール編集ページの最下部に置く危険操作ブロック。
// fukuX の /x/settings と同じ作法：折りたたみ → 展開 → 本人確認入力の一致でのみ確定できる。
// 確認キーはメールアドレス（会員にはハンドルが無いため）。実際の照合はサーバー側でも行う。
export function DeleteAccountPanel({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [hasXAccount, setHasXAccount] = useState(false);
  const [done, setDone] = useState(false);

  const confirmOk = confirmText.trim().toLowerCase() === email.trim().toLowerCase();

  const handleDelete = async () => {
    if (deleting || !confirmOk) return;
    setDeleting(true);
    setError('');
    setHasXAccount(false);
    try {
      const res = await deleteMyMemberAccount(confirmText);
      if (!res.ok) {
        setDeleting(false);
        setError(res.error);
        setHasXAccount(!!res.hasXAccount);
        return;
      }
      // 端末に残っているセッションを破棄してから完了画面に切り替える。
      // auth.users は既に消えているので失敗しても実害はない（ローカル掃除が目的）。
      try { await signOut(); } catch { /* ローカル掃除の失敗は無視 */ }
      setDone(true);
    } catch {
      setDeleting(false);
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    }
  };

  // ── 完了表示 ──
  if (done) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5 text-center">
        <p className="text-sm font-bold text-slate-700">退会が完了しました</p>
        <p className="text-[12px] text-slate-500 leading-relaxed mt-2">
          ご利用ありがとうございました。<br />
          アカウントと保存データは削除されました。
        </p>
        {/* ハードナビゲーションにする（router.push だと削除済みの状態が残ったまま遷移するため）。 */}
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          className="inline-block mt-4 px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          トップへ
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/50 p-5">
      <p className="text-sm font-black text-rose-700">退会する</p>

      {!open ? (
        <>
          <p className="text-[12px] text-slate-600 mt-1 mb-3 leading-relaxed">
            アカウントと保存データを削除します。
          </p>
          <button
            type="button"
            onClick={() => { setError(''); setHasXAccount(false); setOpen(true); }}
            className="px-4 py-2 rounded-lg border border-rose-300 bg-white text-rose-600 text-xs font-bold hover:bg-rose-100 transition-colors"
          >
            退会手続きに進む
          </button>
        </>
      ) : (
        <div className="mt-2">
          <p className="text-[12px] text-slate-700 leading-relaxed">
            退会すると、<span className="font-bold">保存した店舗・セラピスト／閲覧履歴／通知／VIPレター</span>
            がすべて削除され、<span className="font-bold text-rose-700">元に戻すことはできません</span>。
          </p>
          <p className="text-[12px] text-slate-600 leading-relaxed mt-2">
            投稿済みの口コミは、他の方の店舗選びの参考情報としてそのまま残ります。
            ただし表示名は「ゲスト」に変わり、あなたのアカウントとは結びつかなくなります。
          </p>

          <label htmlFor="confirm-email" className="block text-[12px] font-bold text-slate-600 mt-3 mb-1">
            確認のため、ご登録のメールアドレス <span className="text-rose-600 font-black break-all">{email}</span> を入力してください
          </label>
          <input
            id="confirm-email"
            type="email"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={email}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={deleting}
            className="w-full px-4 py-3 rounded-xl border border-rose-200 text-base text-slate-900 placeholder:text-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-rose-300"
          />

          {error && (
            <div className="mt-3 p-3 rounded-xl bg-white border border-rose-200 text-rose-600 text-[12px] font-medium leading-relaxed">
              ⚠️ {error}
              {hasXAccount && (
                <>
                  <br />
                  <Link href="/x/settings" className="underline font-bold">
                    fukuX の設定ページを開く →
                  </Link>
                </>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!confirmOk || deleting}
              className="px-4 py-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {deleting ? '退会処理中...' : '退会する'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirmText(''); setError(''); setHasXAccount(false); }}
              disabled={deleting}
              className="px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-xs font-bold hover:border-slate-300 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
