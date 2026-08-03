'use client';

import { useEffect, useMemo, useState } from 'react';
import { COUPON_COLORS, getCouponColor, type CouponColorKey } from '@/app/lib/couponColors';
import {
  getReviewCampaignTargets,
  sendCampaignVipLetter,
  type CampaignSalon,
} from '@/app/actions/vipLetters';

// /admin：口コミ投稿者へ店舗名義でVIPレターを個別送信する運営用パネル。
// フクエスオープン記念の「口コミ投稿者から抽選で10,000円割引」企画のための画面。
//
// 設計メモ：
//  - 送信は Server Action（sendCampaignVipLetter）。宛先は「その店舗に承認済み口コミを書いた会員」に
//    サーバー側でも限定している（任意の会員へ運営が自由に送れる仕組みにはしない）。
//  - 会員に届くのは既存のVIPレター受信箱（/member/vip-letters）。ヘッダーのアイコンに未読が出る。
//  - 割引の原資は店舗負担（来店時のその場値引き）想定。利用条件の初期文面はその前提で書いている。
//  - 抽選は運営が行い、口コミの内容は選考に関係しない旨を本文テンプレに明記している
//    （口コミの対価に見えるとステマ規制・景品表示法の観点でリスクがあるため）。

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';
const textareaClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200 resize-none';
const labelClass = 'text-[11px] font-bold text-slate-400 block mb-1';
const saveBtn =
  'px-5 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50';

const DEFAULT_TITLE = '【フクエスオープン記念】口コミ投稿者様への特別クーポン当選のお知らせ';

const DEFAULT_BODY = `このたびは口コミのご投稿、誠にありがとうございました。

フクエスのオープンを記念して、口コミをご投稿いただいた会員様の中から抽選を行い、
このたびご当選されましたのでお知らせいたします。

下記の特別クーポンをご提示のうえ、有効期限内に同店をご利用いただくと、
お会計の総額から10,000円を割引いたします。

抽選はフクエス運営が行っており、口コミの内容は選考に一切関係ありません。
今後ともフクエスをよろしくお願いいたします。

フクエス運営事務局`;

const DEFAULT_DISCOUNT = '¥10,000 OFF';

const DEFAULT_TERMS = `フクエスオープン記念・口コミ投稿者抽選のご当選特典です。
ご来店時に、このVIPレターの画面を店舗スタッフへご提示ください。
お会計総額10,000円以上のご利用が対象です。
他のクーポン・割引との併用はできません。
おひとり様1回限り有効です。`;

// 有効期限の初期値：本日から2週間後（YYYY-MM-DD）。
function defaultExpiry(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatJa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ReviewCampaignManager({ onToast }: { onToast?: (msg: string) => void }) {
  const [salons, setSalons] = useState<CampaignSalon[] | null>(null);
  const [loadError, setLoadError] = useState('');

  const [salonId, setSalonId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [couponEnabled, setCouponEnabled] = useState(true);
  const [couponDiscount, setCouponDiscount] = useState(DEFAULT_DISCOUNT);
  const [couponTerms, setCouponTerms] = useState(DEFAULT_TERMS);
  const [couponExpiresAt, setCouponExpiresAt] = useState(defaultExpiry);
  const [couponColor, setCouponColor] = useState<CouponColorKey>('gold');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentMsg, setSentMsg] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await getReviewCampaignTargets();
        if (!active) return;
        if ('error' in res) { setLoadError(res.error); return; }
        setSalons(res.salons);
        if (res.salons.length > 0) setSalonId(res.salons[0].salonId);
      } catch {
        if (active) setLoadError('投稿者一覧の取得に失敗しました');
      }
    })();
    return () => { active = false; };
  }, []);

  const current = useMemo(
    () => (salons ?? []).find((s) => s.salonId === salonId) ?? null,
    [salons, salonId],
  );

  // 店舗を切り替えたら選択をリセット（別店舗の会員が混ざらないように）。
  const changeSalon = (id: number) => {
    setSalonId(id);
    setSelected(new Set());
    setError('');
    setSentMsg('');
  };

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const canSend =
    salonId !== null && selected.size > 0 && title.trim() !== '' && body.trim() !== '' && !sending;

  const handleSend = async () => {
    if (!canSend || salonId === null) return;
    setSending(true);
    setError('');
    setSentMsg('');
    let res: Awaited<ReturnType<typeof sendCampaignVipLetter>>;
    try {
      res = await sendCampaignVipLetter({
        salonId,
        title,
        body,
        couponEnabled,
        couponDiscount,
        couponTerms,
        couponExpiresAt,
        couponColor,
        recipientUserIds: [...selected],
      });
    } catch {
      res = { ok: false, error: '通信に失敗しました。時間をおいて再度お試しください' };
    } finally {
      setSending(false);
    }
    if (res.ok) {
      const msg = `VIPレターを送信しました（${res.recipientCount}人）`;
      setSentMsg(msg);
      onToast?.(msg);
      setSelected(new Set());
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-pink-100 shadow-sm p-5 space-y-3">
      <h3 className="text-xs font-black text-pink-600">口コミ投稿者へVIPレターを個別送信</h3>
      <p className="text-[10px] text-slate-400 leading-relaxed">
        店舗を選び、その店に承認済み口コミを書いた会員の中から宛先を選んで送信します。
        会員には店舗名義のVIPレターとして届きます（ヘッダーのアイコンに未読が出ます）。
        送信後の取り消しはできません。
      </p>

      {loadError && (
        <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{loadError}</p>
      )}

      {salons === null && !loadError && (
        <p className="text-[11px] text-slate-400">投稿者を読み込み中…</p>
      )}

      {salons !== null && salons.length === 0 && (
        <p className="text-[11px] text-slate-400">承認済みの口コミがまだありません。</p>
      )}

      {salons !== null && salons.length > 0 && (
        <>
          <div>
            <label className={labelClass}>対象店舗</label>
            <select
              className={inputClass}
              value={salonId ?? ''}
              onChange={(e) => changeSalon(Number(e.target.value))}
            >
              {salons.map((s) => (
                <option key={s.salonId} value={s.salonId}>
                  {s.salonName}（投稿者 {s.authors.length}人）
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>
              送信先の会員 <span className="text-rose-400">*</span>
              <span className="font-normal text-slate-300 ml-1">選択中 {selected.size}人</span>
            </label>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
              {(current?.authors ?? []).map((a) => (
                <label
                  key={a.userId}
                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-pink-50/40 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-pink-500 flex-shrink-0"
                    checked={selected.has(a.userId)}
                    onChange={() => toggle(a.userId)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slate-700 truncate">{a.nickname}</span>
                    <span className="block text-[10px] text-slate-400">
                      口コミ {a.reviewCount}件 ／ 最新 {formatJa(a.latestAt)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              ※ ニックネーム未設定の会員は「ゲスト」と表示されます。退会済みの会員は宛先に出ません。
            </p>
          </div>

          <div>
            <label className={labelClass}>タイトル <span className="text-rose-400">*</span></label>
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>本文 <span className="text-rose-400">*</span></label>
            <textarea rows={12} className={textareaClass} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-pink-500 flex-shrink-0"
              checked={couponEnabled}
              onChange={(e) => setCouponEnabled(e.target.checked)}
            />
            <span className="text-xs font-bold text-slate-600">特別クーポンを付ける</span>
          </label>

          {couponEnabled && (
            <div className="space-y-3 rounded-2xl border border-pink-100 bg-pink-50/30 p-4">
              <div>
                <label className={labelClass}>割引内容 <span className="text-rose-400">*</span></label>
                <input className={inputClass} value={couponDiscount} onChange={(e) => setCouponDiscount(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>利用条件</label>
                <textarea rows={5} className={textareaClass} value={couponTerms} onChange={(e) => setCouponTerms(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>有効期限（初期値：本日から2週間後）</label>
                <input type="date" className={inputClass} value={couponExpiresAt} onChange={(e) => setCouponExpiresAt(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>背景色</label>
                <div className="flex flex-wrap gap-2">
                  {COUPON_COLORS.map((cc) => {
                    const isSelected = couponColor === cc.key;
                    return (
                      <button
                        key={cc.key}
                        type="button"
                        onClick={() => setCouponColor(cc.key)}
                        aria-label={cc.label}
                        title={cc.label}
                        className={`relative w-10 h-10 rounded-xl border-2 transition-transform ${
                          isSelected ? 'border-pink-500 ring-2 ring-pink-200 scale-105' : 'border-slate-200 hover:border-pink-300'
                        }`}
                        style={{ background: cc.background }}
                      >
                        {isSelected && (
                          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold" style={{ color: cc.text }}>✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">選択中：{getCouponColor(couponColor).label}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{error}</p>
          )}
          {sentMsg && (
            <p className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">{sentMsg}</p>
          )}

          <div className="flex flex-col items-end gap-1.5">
            <button className={saveBtn} onClick={handleSend} disabled={!canSend}>
              {sending ? '送信中...' : `選択した${selected.size}人に送信`}
            </button>
            <p className="text-[11px] text-slate-400">※送信後は取り消せません。</p>
          </div>
        </>
      )}
    </div>
  );
}
