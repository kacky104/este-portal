'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { approveReview, rejectReview, deleteReview } from '@/app/actions/reviews';
import { Stars } from '@/app/components/Stars';

// 審査カードの表示用データ（pending / approved 共通の形）。
// rating は3軸＋総合（overall）。来店日（visitedOn）も持つ。
export type PendingReviewView = {
  reviewId: string;
  ratingService: number;
  ratingTechnique: number;
  ratingReception: number;
  overall: number;
  visitedOn: string; // 'YYYY-MM-DD'
  body: string;
  nickname: string;
  therapistName: string;
  createdAt: string; // ISO
};

export type ApprovedReviewView = PendingReviewView;

function formatJaDateTime(s: string): string {
  return new Date(s).toLocaleString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatVisited(s: string): string {
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return '';
  return `${Number(y)}/${Number(m)}/${Number(d)} 来店`;
}

// 総合星＋3軸内訳＋来店日（pending/approved 共通の表示部）。
function ReviewBody({
  ratingService,
  ratingTechnique,
  ratingReception,
  overall,
  visitedOn,
  body,
  nickname,
  createdAt,
}: Omit<PendingReviewView, 'reviewId' | 'therapistName'>) {
  return (
    <>
      {/* 総合星・投稿者・投稿日時 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Stars value={overall} size={16} />
          <span className="text-sm font-bold text-slate-700 tabular-nums">{overall.toFixed(1)}</span>
          <span className="text-sm text-slate-500 truncate">／ {nickname}</span>
        </div>
        <span className="text-xs text-slate-400 flex-shrink-0">{formatJaDateTime(createdAt)}</span>
      </div>

      {/* 3軸内訳＋来店日 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <AxisMini label="接客" value={ratingService} />
        <AxisMini label="施術" value={ratingTechnique} />
        <AxisMini label="受付" value={ratingReception} />
        {visitedOn && (
          <span className="text-[11px] text-pink-500 font-medium">{formatVisited(visitedOn)}</span>
        )}
      </div>

      {/* 本文 */}
      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{body}</p>
    </>
  );
}

function AxisMini({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      <Stars value={value} size={11} />
      <span className="text-[11px] font-bold text-slate-500 tabular-nums">{value.toFixed(1)}</span>
    </span>
  );
}

// 1件分の未承認口コミの表示＋承認/却下ボタン（クライアント）。
// <form> タグは使わず onClick で Server Action を呼ぶ。処理中はボタン無効化、
// 完了したらその行を一覧から消す（楽観的に hidden ＋ router.refresh() でサーバー再取得）。
export function ReviewModeration({
  reviewId,
  therapistName,
  ...rest
}: PendingReviewView) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  if (hidden) return null;

  const run = async (action: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'approve') await approveReview(reviewId);
      else await rejectReview(reviewId);
      setHidden(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '処理に失敗しました');
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      {/* 対象セラピスト名 */}
      <div className="flex items-center gap-2 text-xs font-bold text-pink-600">
        <span className="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-100">対象</span>
        <span className="truncate">{therapistName}</span>
      </div>

      <ReviewBody {...rest} />

      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* 承認 / 却下 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => run('approve')}
          disabled={busy}
          className="px-5 py-2 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          {busy ? '処理中...' : '承認'}
        </button>
        <button
          type="button"
          onClick={() => run('reject')}
          disabled={busy}
          className="px-5 py-2 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          却下
        </button>
      </div>
    </div>
  );
}

// 承認済み（公開中）口コミ1件の表示＋削除ボタン（クライアント）。
// 削除は取り返しがつかないため、必ず window.confirm で確認してから deleteReview を呼ぶ。
export function ApprovedReviewModeration({
  reviewId,
  therapistName,
  ...rest
}: ApprovedReviewView) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  if (hidden) return null;

  const handleDelete = async () => {
    if (busy) return;
    // 削除は元に戻せないため、必ず確認を取る。キャンセル時はなにもしない。
    if (!window.confirm('この口コミを完全に削除します。元に戻せません。よろしいですか？')) return;
    setBusy(true);
    setError('');
    try {
      await deleteReview(reviewId);
      setHidden(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '処理に失敗しました');
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
      {/* 対象セラピスト名＋公開中バッジ（pending と見分けやすく緑系） */}
      <div className="flex items-center gap-2 text-xs font-bold">
        <span className="px-2 py-0.5 rounded-full bg-pink-50 border border-pink-100 text-pink-600">対象</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">公開中</span>
        <span className="truncate text-slate-700">{therapistName}</span>
      </div>

      <ReviewBody {...rest} />

      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* 削除（危険操作・赤系） */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="px-5 py-2 rounded-xl bg-rose-600 text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity hover:bg-rose-700"
        >
          {busy ? '削除中...' : '削除'}
        </button>
      </div>
    </div>
  );
}
