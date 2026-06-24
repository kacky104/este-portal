'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { submitReview } from '@/app/actions/reviews';
import { StarRatingInput } from '@/app/components/StarRatingInput';

// 店舗単位の口コミ投稿フォーム（クライアント）。components/ReviewForm.tsx とは別物。
// マウント時にログイン判定し、未ログインなら案内＋導線、ログイン済みならフォームを表示。
// ISR を壊さないよう判定・送信はすべてここで行う。<form> タグは使わず onClick で送信。

const BODY_MAX = 2000;

// JST の今日（'YYYY-MM-DD'）。date input の max と既定値に使う。
function todayJST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

export function SalonReviewForm({
  salonId,
  salonName,
  therapists,
}: {
  salonId: number;
  salonName: string;
  therapists: { id: number; name: string }[];
}) {
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  const [therapistId, setTherapistId] = useState<number | ''>('');
  const [service, setService] = useState(0);
  const [technique, setTechnique] = useState(0);
  const [reception, setReception] = useState(0);
  const [visitedOn, setVisitedOn] = useState('');
  const [body, setBody] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const today = todayJST();

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

  if (!mounted) return null;

  // 未ログイン：案内＋ログイン/新規登録への導線（このサイトの認証は /login のタブ切替）。
  if (!loggedIn) {
    return (
      <div className="bg-white border border-pink-100 rounded-2xl p-6 text-center shadow-sm">
        <p className="text-sm text-slate-600 mb-4">口コミの投稿には会員登録が必要です</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm"
            style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
          >
            ログイン
          </Link>
          <Link
            href="/login"
            className="inline-block px-5 py-2.5 rounded-xl border border-pink-300 text-pink-600 font-bold text-sm hover:bg-pink-50 transition-colors"
          >
            新規登録
          </Link>
        </div>
      </div>
    );
  }

  // 送信完了。
  if (done) {
    return (
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center shadow-sm space-y-4">
        <p className="text-sm text-emerald-700 font-medium">
          投稿ありがとうございます。運営の承認後に公開されます。
        </p>
        <Link
          href={`/salon/${salonId}`}
          className="inline-block px-5 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          店舗ページへ戻る
        </Link>
      </div>
    );
  }

  const noTherapists = therapists.length === 0;
  const trimmed = body.trim();
  const ratingsOk = service > 0 && technique > 0 && reception > 0;
  const canSubmit =
    !noTherapists &&
    therapistId !== '' &&
    ratingsOk &&
    visitedOn !== '' &&
    visitedOn <= today &&
    trimmed.length >= 1 &&
    trimmed.length <= BODY_MAX &&
    !submitting;

  const handleSubmit = async () => {
    // canSubmit が true の時点で therapistId は number に確定している。
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await submitReview({
        salonId,
        therapistId: Number(therapistId),
        ratingService: service,
        ratingTechnique: technique,
        ratingReception: reception,
        visitedOn,
        body: trimmed,
      });
      setDone(true);
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

  const labelClass = 'text-[13px] font-bold text-slate-700 block mb-2';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
      <p className="text-sm text-slate-500">
        <span className="font-bold text-slate-700">{salonName}</span> への口コミを投稿します。
      </p>

      {/* 1. 誰への口コミか */}
      <div>
        <label className={labelClass}>誰への口コミですか？</label>
        {noTherapists ? (
          <p className="text-sm text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            在籍セラピストがいません。
          </p>
        ) : (
          <select
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
          >
            <option value="">セラピストを選択してください</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 2. 3軸の星 */}
      <div>
        <label className={labelClass}>評価</label>
        <div className="space-y-2.5">
          <StarRatingInput value={service} onChange={setService} label="接客" />
          <StarRatingInput value={technique} onChange={setTechnique} label="施術" />
          <StarRatingInput value={reception} onChange={setReception} label="受付対応" />
        </div>
      </div>

      {/* 3. 来店日 */}
      <div>
        <label htmlFor="visitedOn" className={labelClass}>
          来店日
        </label>
        <input
          id="visitedOn"
          type="date"
          value={visitedOn}
          max={today}
          onChange={(e) => setVisitedOn(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <p className="text-[11px] text-slate-400 mt-1">※ 今日以前の日付を選んでください。</p>
      </div>

      {/* 4. 本文 */}
      <div>
        <label htmlFor="body" className={labelClass}>
          本文
        </label>
        <textarea
          id="body"
          rows={5}
          value={body}
          maxLength={BODY_MAX}
          onChange={(e) => setBody(e.target.value)}
          placeholder="施術やサービスの感想を入力してください。"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">残り {BODY_MAX - body.length} 文字</p>
      </div>

      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {/* 5. 送信 */}
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
