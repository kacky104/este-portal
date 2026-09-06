'use client';

import { useCallback, useEffect, useState } from 'react';
import { getCouponColor } from '@/app/lib/couponColors';
import { getSentVipLetters, SENT_LETTERS_WINDOW_DAYS, type SentVipLetter } from '@/app/actions/vipLetters';

// 店舗側「送信済みVIPレター」の一覧（2026-09-06・カッキーさんの指示）。
//
// ★★★ なぜ要るか
//   これまで /mypage には【送信フォームしか無かった】。★ 送信は取り消せないのに、
//   自分が何を送ったのかを後から見る場所が無かった。
//   → 「何を・いつ・何人に・何人が開いたか」を出す。
//
// ★ 一覧はクーポン／お知らせと同じ【たたむ形】。★ 閉じているときは日時・題名・人数だけ。
// ★★ 読めなかったときは「0件」と書かない（作法3-3）。理由の1行を出す。

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function formatExpiry(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

export function VipLetterSentList({ salonId, reloadKey }: { salonId: number; reloadKey: number }) {
  const [letters, setLetters] = useState<SentVipLetter[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await getSentVipLetters(salonId);
      if ('error' in res) { setError(res.error); return; }
      setLetters(res.letters);
    } catch {
      setError('通信に失敗しました。時間をおいて開き直してください');
    }
  }, [salonId]);

  // ★ 送信のたびに読み直す（reloadKey が変わる）。
  useEffect(() => { void load(); }, [load, reloadKey]);

  return (
    <div className="bg-white rounded-none border border-slate-100 shadow-sm p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black text-pink-600">
          送信済みVIPレター
          {letters && <span className="ml-1 font-normal text-slate-400">（{letters.length}件）</span>}
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          className="px-3 py-1.5 rounded-none border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          読み直す
        </button>
      </div>

      {/* ★ 読めなかった＝「0件」ではない。理由をそのまま出す */}
      {error && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-none px-3 py-2">{error}</p>
      )}

      {!error && letters === null && (
        <p className="text-xs text-slate-400">読み込み中です…</p>
      )}

      {!error && letters !== null && letters.length === 0 && (
        <p className="text-xs text-slate-400">
          直近{SENT_LETTERS_WINDOW_DAYS}日に送信したVIPレターはありません。
        </p>
      )}

      {/* ★ 出していないだけで、消えたのではない。★ そう書いておく（黙って消さない） */}
      {!error && letters !== null && letters.length > 0 && (
        <p className="text-[10px] text-slate-400">
          ※ 直近{SENT_LETTERS_WINDOW_DAYS}日ぶんを表示しています（会員様の受信箱でも{SENT_LETTERS_WINDOW_DAYS}日を過ぎると表示されなくなります）。
        </p>
      )}

      {!error && letters !== null && letters.map((l) => {
        const isOpen = openId === l.id;
        const cc = l.coupon ? getCouponColor(l.coupon.color) : null;
        return (
          <div key={l.id} className="rounded-none border border-pink-100 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : l.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-pink-50/40 transition-colors"
            >
              <span className="text-sm font-bold text-slate-700 truncate min-w-0">
                {l.title || '(タイトル未設定)'}
              </span>
              {l.coupon && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-none flex-shrink-0 bg-amber-50 text-amber-600 border border-amber-100">
                  クーポン付き
                </span>
              )}
              <span className="ml-auto flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-slate-400 hidden sm:inline">{formatSentAt(l.sentAt)}</span>
                {/* ★ 送った人数。★ 開封数は出さない（2026-09-06・カッキーさんの指示）。
                    ★ 数え方（read_at）は残してあるので、戻すならここに1行。 */}
                <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                  {l.recipientCount}人へ
                </span>
                <svg
                  className={`w-4 h-4 text-pink-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 pt-3 space-y-3 border-t border-pink-100">
                <p className="text-[10px] text-slate-400 sm:hidden">{formatSentAt(l.sentAt)}</p>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{l.body}</p>

                {l.coupon && cc && (
                  <div className="rounded-none border border-slate-200 overflow-hidden">
                    <div
                      className="px-4 py-2.5 text-white text-sm font-bold"
                      style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.36) 100%), ${cc.background}` }}
                    >
                      同梱した特別クーポン
                    </div>
                    <div className="p-4 space-y-1">
                      <p className="text-lg font-extrabold leading-tight break-words" style={{ color: cc.accent }}>
                        {l.coupon.discount}
                      </p>
                      {l.coupon.terms && (
                        <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-wrap break-words">{l.coupon.terms}</p>
                      )}
                      {l.coupon.expiresAt && (
                        <p className="text-[11px] text-slate-400">有効期限：{formatExpiry(l.coupon.expiresAt)}まで</p>
                      )}
                    </div>
                  </div>
                )}

                {/* ★ 送信は取り消せない。★ 消せると誤解させるボタンは置かない */}
                <p className="text-[10px] text-slate-400">
                  ※ 送信済みのVIPレターは、編集も取り消しもできません。
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
