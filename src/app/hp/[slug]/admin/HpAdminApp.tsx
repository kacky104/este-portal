'use client';

import { useCallback, useEffect, useState } from 'react';
import { signInWithEmail, signOut } from '@/lib/auth';
import {
  getHpAdminContext,
  confirmHpDesign,
  setHpSiteLive,
  inviteHpAdmin,
  resendHpAdminInvite,
  unlinkHpAdmin,
  type HpAdminContext,
} from '@/app/actions/hpAdmin';
import type { HpSite, HpTemplateKey } from '@/app/lib/hpSite';
import { HpGallery } from './HpGallery';
import { HpEditor } from './HpEditor';

// 店舗ドメイン/admin の本体（2026-08-09 段階3）。
//
// 1画面で「ログイン → デザイン設定（未確定なら） → 編集」までを完結させる。
// ログイン専用ルートを分けていないのは、店舗に案内するURLを
// 「https://お店のドメイン/admin」の1本だけにしたいため（マニュアルを薄く保つ）。
//
// デザインの決め方（2026-08-09 夕の方針変更）:
//   店舗にはギャラリーで自己判断させない。デザイン一覧（/hp/templates・公開）を見せて
//   会話で決め、【運営】がこの画面のギャラリーから設定・確定する。
//   → design_locked=false のとき、operator にはギャラリー・店舗には「打ち合わせ中」の案内を出す。
//
// 権限判定はサーバー（actions/hpAdmin.ts）が唯一の正。ここでの出し分けは見た目だけで、
// 権限が無い状態で操作しても各アクションがエラーを返す。

type View =
  | { kind: 'loading' }
  | { kind: 'login'; notice: string }
  | { kind: 'ready'; ctx: HpAdminContext };

export function HpAdminApp({ siteKey, previewHref }: { siteKey: string; previewHref: string }) {
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 4000);
  }, []);

  const load = useCallback(async () => {
    const res = await getHpAdminContext(siteKey);
    if (res.ok) setView({ kind: 'ready', ctx: res.ctx });
    else setView({ kind: 'login', notice: res.error });
  }, [siteKey]);

  useEffect(() => {
    load();
  }, [load]);

  const patchSite = (site: HpSite) =>
    setView((v) => (v.kind === 'ready' ? { kind: 'ready', ctx: { ...v.ctx, site } } : v));

  if (view.kind === 'loading') {
    return <div className="min-h-screen flex items-center justify-center text-xs text-slate-400">読み込み中です…</div>;
  }

  if (view.kind === 'login') {
    // ログイン成功後はハードリロード。ソフト再取得だと、確立直後のセッションCookieが
    // Server Action のリクエストに乗り切らず未ログイン扱いに戻るレースがある
    // （/cast/login で実際に踏んだ問題。全documentリクエストにすれば確実）。
    return <LoginCard notice={view.notice} onDone={() => window.location.reload()} />;
  }

  const { ctx } = view;
  const { site } = ctx;

  const statusLabel =
    site.status === 'live' ? '公開中' : site.status === 'suspended' ? '停止中（運営）' : '非公開（制作中）';
  const statusColor =
    site.status === 'live' ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
    : site.status === 'suspended' ? 'bg-rose-50 text-rose-500 border-rose-200'
    : 'bg-slate-50 text-slate-500 border-slate-200';

  const handleConfirmDesign = async (template: HpTemplateKey, color: string) => {
    setBusy(true);
    const res = await confirmHpDesign(siteKey, template, color);
    setBusy(false);
    if (!res.ok) { showToast(res.error); return; }
    patchSite(res.site);
    showToast('デザインを確定しました。続けて写真と文章を入力してください');
  };

  const handleToggleLive = async () => {
    setBusy(true);
    const res = await setHpSiteLive(siteKey, site.status !== 'live');
    setBusy(false);
    if (!res.ok) { showToast(res.error); return; }
    patchSite({ ...site, status: res.status });
    showToast(res.status === 'live' ? '公開にしました' : '非公開にしました');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      {/* ── ヘッダー ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-black text-slate-800">ホームページ管理</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">{ctx.salonName}</p>
          </div>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          ドメイン：{site.domain
            ? <span className="font-bold text-slate-700">{site.domain}</span>
            : '準備中（運営で取得手続き中です）'}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={previewHref}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300"
          >
            ページを見る
          </a>
          {site.status !== 'suspended' && site.design_locked && (
            <button
              onClick={handleToggleLive}
              disabled={busy}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors disabled:opacity-50 ${
                site.status === 'live'
                  ? 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                  : 'bg-pink-500 text-white border-pink-500 hover:bg-pink-600'
              }`}
            >
              {site.status === 'live' ? '非公開にする' : '公開する'}
            </button>
          )}
          <button
            onClick={async () => { await signOut(); load(); }}
            className="ml-auto px-4 py-2 rounded-full text-xs font-bold text-slate-400 hover:text-slate-600"
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* ── 本体 ──
          確定済み: 編集パネル（全ロール）
          未確定:   運営にはギャラリー（打ち合わせ結果を設定・確定する）、
                    店舗には「デザイン打ち合わせ中」の案内 ── */}
      {site.design_locked ? (
        <HpEditor siteKey={siteKey} site={site} onSaved={patchSite} onToast={showToast} />
      ) : ctx.role === 'operator' ? (
        <HpGallery onConfirm={handleConfirmDesign} busy={busy} previewHref={previewHref} />
      ) : (
        <DesignPendingCard />
      )}

      {/* ── HP管理者アカウント（オーナー・運営にだけ表示） ── */}
      {(ctx.role === 'owner' || ctx.role === 'operator') && (
        <AdminAccountCard siteKey={siteKey} ctx={ctx} onToast={showToast} onChanged={load} />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-slate-900/90 text-white text-xs font-bold shadow-lg max-w-[90vw] text-center">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── デザイン打ち合わせ中（店舗向け・design_locked=false のとき） ──────
function DesignPendingCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-black text-slate-800">ホームページのデザインを準備中です</h3>
      <p className="text-xs text-slate-500 leading-relaxed">
        ホームページのデザイン（ひな形とカラー）は、担当者との打ち合わせで決定します。
        下のデザイン一覧からお好みのイメージをお選びのうえ、担当者までお知らせください。
      </p>
      <a
        href="https://fukues.com/hp/templates"
        target="_blank"
        rel="noreferrer"
        className="inline-block px-5 py-2.5 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 transition-colors"
      >
        デザイン一覧を見る
      </a>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        デザインの設定が完了すると、この画面で写真や文章の変更ができるようになります。
      </p>
    </div>
  );
}

// ── ログイン ─────────────────────────────────────────
function LoginCard({ notice, onDone }: { notice: string; onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 「ログインが必要です」は初回表示では警告に見えるので出さない（未ログインは想定内）。
  const showNotice = notice !== '' && notice !== 'ログインが必要です';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) { setError('メールアドレスとパスワードを入力してください。'); return; }
    setLoading(true);
    try {
      const res = await signInWithEmail(email.trim(), password);
      if (!res.ok) { setError(res.error ?? 'ログインに失敗しました。'); return; }
      onDone();
    } catch {
      setError('通信エラーが発生しました。インターネット環境をお確かめください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-lg font-black text-slate-900">ホームページ管理</h1>
          <p className="text-xs text-slate-500 mt-1">オーナー様・ご担当者様専用</p>
        </div>

        {showNotice && (
          <p className="mb-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-relaxed">
            {notice}
          </p>
        )}

        <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-7 space-y-5">
          <div>
            <label htmlFor="hp-admin-email" className="block text-xs font-bold text-slate-600 mb-1.5">メールアドレス</label>
            <input
              id="hp-admin-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="hp-admin-password" className="block text-xs font-bold text-slate-600 mb-1.5">パスワード</label>
            <input
              id="hp-admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-60 transition"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-slate-400 leading-relaxed">
          フクエスのオーナーアカウント、または招待メールで作成したアカウントでログインできます。
          <br />
          <a href="https://fukues.com/forgot-password" className="text-pink-600 font-medium hover:underline">
            パスワードをお忘れの方はこちら →
          </a>
        </p>
      </div>
    </div>
  );
}

// ── HP管理者アカウント ────────────────────────────────
function AdminAccountCard({
  siteKey,
  ctx,
  onToast,
  onChanged,
}: {
  siteKey: string;
  ctx: HpAdminContext;
  onToast: (msg: string) => void;
  onChanged: () => void;
}) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<{ ok: true; warning?: string } | { ok: false; error: string }>, okMsg: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(res.warning ?? okMsg);
    onChanged();
  };

  const state = ctx.adminLinked ? 'linked' : ctx.adminEmail ? 'invited' : 'none';

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
      <h3 className="text-sm font-black text-slate-800">ホームページ担当者のアカウント</h3>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        オーナー様はご自身のフクエスのアカウントでこの画面に入れます。
        スタッフの方にホームページの更新をお願いする場合は、その方専用のアカウントを1つ発行できます
        （フクエスのマイページには入れません。このホームページの編集だけができます）。
      </p>

      {state === 'linked' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">
            現在の担当者：<span className="font-bold text-slate-800">{ctx.adminEmail}</span>
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-600">
              ログイン済み
            </span>
          </p>
          <button
            onClick={() => run(() => unlinkHpAdmin({ siteKey }), '担当者アカウントを解除しました')}
            disabled={busy}
            className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-rose-200 hover:text-rose-500 disabled:opacity-50"
          >
            解除する
          </button>
        </div>
      )}

      {state === 'invited' && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600">
            招待中：<span className="font-bold text-slate-800">{ctx.adminEmail}</span>
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600">
              メール確認待ち
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => run(() => resendHpAdminInvite({ siteKey }), '招待メールを再送しました')}
              disabled={busy}
              className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300 disabled:opacity-50"
            >
              招待を再送する
            </button>
            <button
              onClick={() => run(() => unlinkHpAdmin({ siteKey }), '招待を取り消しました')}
              disabled={busy}
              className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-rose-200 hover:text-rose-500 disabled:opacity-50"
            >
              招待を取り消す
            </button>
          </div>
        </div>
      )}

      {state === 'none' && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@example.com"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300"
          />
          <button
            onClick={() => run(() => inviteHpAdmin({ siteKey, email }), '招待メールを送信しました')}
            disabled={busy || email.trim() === ''}
            className="px-5 py-2 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 disabled:opacity-50"
          >
            招待する
          </button>
        </div>
      )}
    </div>
  );
}
