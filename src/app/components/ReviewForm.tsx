'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { submitReview } from '@/app/actions/reviews';
import { StarIcon } from './Stars';

// 口コミ投稿フォーム（クライアント）。
// ISR を壊さないよう、会員判定・データ取得・送信判定はすべてこのクライアントコンポーネント内で行う
// （VIPレターアイコンや「今すぐ」修正と同じ方針）。<form> タグは使わず onClick で送信する。

const BODY_MAX = 2000;
const STAR_SIZE = 34;

export function ReviewForm({ therapistId }: { therapistId: number }) {
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [rating, setRating] = useState(0); // 確定値（0.5刻み）
  const [hover, setHover] = useState(0); // ホバー中のプレビュー値
  const [body, setBody] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // マウント後にログイン状態を判定（未ログインならフォームを出さない）。
  useEffect(() => {
    setMounted(true);
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (active) setLoggedIn(!!user);
      } catch {
        // 失敗時は未ログイン扱い（フォームを出さないだけ）。
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // ハイドレーション対策：マウント前は何も出さない。
  if (!mounted) return null;

  // 未ログイン：投稿フォームは出さず、会員登録/ログインへの導線を表示。
  if (!loggedIn) {
    return (
      <div className="bg-pink-50/60 border border-pink-100 rounded-2xl p-5 text-center">
        <p className="text-sm text-slate-600 mb-3">口コミの投稿には会員登録が必要です</p>
        <Link
          href="/login"
          className="inline-block px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          ログイン / 会員登録
        </Link>
      </div>
    );
  }

  // 送信完了：お礼を表示してフォームは出さない。
  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-center">
        <p className="text-sm text-emerald-700 font-medium">
          投稿ありがとうございます。運営の承認後に公開されます。
        </p>
      </div>
    );
  }

  const display = hover || rating; // ホバー優先で星を塗る
  const remaining = BODY_MAX - body.length;
  const trimmed = body.trim();
  const canSubmit =
    rating >= 0.5 && trimmed.length >= 1 && trimmed.length <= BODY_MAX && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await submitReview({ therapistId, rating, body: trimmed });
      setDone(true);
      setRating(0);
      setHover(0);
      setBody('');
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : '投稿に失敗しました。時間をおいて再度お試しください。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ★0.5刻みの星入力（クリックで半星も選べる：各星を左右ハーフのヒットエリアに分割） */}
      <div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
            {[0, 1, 2, 3, 4].map((i) => {
              const fill = Math.max(0, Math.min(1, display - i));
              const pct = `${fill * 100}%`;
              return (
                <span
                  key={i}
                  className="relative inline-block"
                  style={{ width: STAR_SIZE, height: STAR_SIZE }}
                >
                  {/* 見た目（下地グレー＋オレンジを幅クリップで重ねる） */}
                  <span className="absolute inset-0">
                    <StarIcon size={STAR_SIZE} color="#e2e8f0" />
                  </span>
                  <span className="absolute inset-0 overflow-hidden" style={{ width: pct }}>
                    <StarIcon size={STAR_SIZE} color="#FB923C" />
                  </span>
                  {/* ヒットエリア：左半分=0.5、右半分=1.0 */}
                  <button
                    type="button"
                    aria-label={`${i + 0.5}点`}
                    className="absolute inset-y-0 left-0 w-1/2 z-10 cursor-pointer"
                    onMouseEnter={() => setHover(i + 0.5)}
                    onClick={() => setRating(i + 0.5)}
                  />
                  <button
                    type="button"
                    aria-label={`${i + 1}点`}
                    className="absolute inset-y-0 right-0 w-1/2 z-10 cursor-pointer"
                    onMouseEnter={() => setHover(i + 1)}
                    onClick={() => setRating(i + 1)}
                  />
                </span>
              );
            })}
          </div>
          <span className="text-sm font-bold text-slate-600 tabular-nums">
            {(display || 0).toFixed(1)}
          </span>
        </div>
      </div>

      {/* 本文 */}
      <div>
        <textarea
          rows={4}
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="施術やサービスの感想を入力してください。"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">残り {remaining} 文字</p>
      </div>

      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          {submitting ? '送信中...' : '口コミを投稿'}
        </button>
      </div>
    </div>
  );
}
