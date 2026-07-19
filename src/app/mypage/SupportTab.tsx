'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { submitOwnerInquiry } from '@/app/actions/ownerInquiry';
import { BannerPerkPanel } from '@/app/mypage/BannerPerkPanel';

const supabase = createClient();

// /mypage「運営から」タブ。内部を3つのサブタブに分割:
//  - notices: 運営からのお知らせ一覧（owner_notices・一斉＋自店舗個別を RLS が絞る）
//  - inquiry: 運営へのお問い合わせフォーム（Server Action submitOwnerInquiry）＋送信履歴
//  - faq:     よくある質問（owner_faqs・/admin「オーナー連絡」で作成した全店舗共通FAQ）
// 未読管理: owner_notice_reads に既読行が無いお知らせを未読とし、件数を onUnreadChange で
// 親（page.tsx のタブバッジ）へ通知。タブが開かれ notices サブタブが表示されている間に
// 未読ぶんを一括既読化する（初期サブタブは notices）。
// パネルは page.tsx の hidden 切替方式で常時マウントされるため、読み込みは mount 時に1回行う。

type OwnerNotice = {
  id: string;
  salon_id: number | null; // null = 全店舗一斉
  title: string;
  body: string;
  created_at: string;
};

type OwnerInquiry = {
  id: string;
  subject: string;
  body: string;
  status: 'open' | 'done';
  created_at: string;
};

type OwnerFaq = {
  id: string;
  question: string;
  answer: string;
};

type OptionBanner = {
  id: string;
  title: string;
  description: string | null;
  site: string; // 対象サイト（fukues / work / fukux）。
  price: number | null; // 円。null は「応相談」表示。
  stock: number | null; // 残り枠数。null=枠表示なし / 0=売り切れ / ≥1=残りN枠。
};

// オプション商品の対象サイトの表示ラベルと識別バッジ配色
// （フクエス=ピンク / フクエスワーク=エメラルド / フクエックス=インディゴ。管理Managerと同一）。
const OPTION_SITE_META: Record<string, { label: string; badge: string; card: string }> = {
  fukues: { label: 'フクエス', badge: 'bg-pink-50 text-pink-600 border-pink-200', card: 'border-pink-200 bg-pink-50/40 border-l-4 border-l-pink-400' },
  work: { label: 'フクエスワーク', badge: 'bg-emerald-50 text-emerald-600 border-emerald-200', card: 'border-emerald-200 bg-emerald-50/40 border-l-4 border-l-emerald-400' },
  fukux: { label: 'フクエックス', badge: 'bg-indigo-50 text-indigo-600 border-indigo-200', card: 'border-indigo-200 bg-indigo-50/40 border-l-4 border-l-indigo-400' },
};

function formatDateJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric',
  }).format(d);
}

export function SupportTab({
  salonId,
  active,
  onUnreadChange,
  onToast,
}: {
  salonId: number | null;
  active: boolean;
  onUnreadChange: (count: number) => void;
  onToast: (msg: string) => void;
}) {
  const [subTab, setSubTab] = useState<'notices' | 'inquiry' | 'faq' | 'banner' | 'option'>('notices');
  const [notices, setNotices] = useState<OwnerNotice[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [inquiries, setInquiries] = useState<OwnerInquiry[]>([]);
  const [faqs, setFaqs] = useState<OwnerFaq[]>([]);
  const [optionBanners, setOptionBanners] = useState<OptionBanner[]>([]);
  // 申込中の商品ID（ボタン二度押し防止）。
  const [applyingId, setApplyingId] = useState<string | null>(null);
  // 開いているFAQ（アコーディオン・複数開閉可）。
  const [openFaqIds, setOpenFaqIds] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  // 既読化の多重実行防止（active の再切替やレンダー中の連続呼び出し対策）。
  const markingRef = useRef(false);

  // 初回読み込み（salonId 確定後に1回）。
  // お知らせは配信から6ヶ月以内のみ表示（古いものは自動非表示＝溜まり続けない）。
  // 未読バッジもこの取得結果ベースなので、6ヶ月超の未読が残ってもバッジには数えられない。
  useEffect(() => {
    if (salonId == null) return;
    (async () => {
      setNoticesLoading(true);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const [{ data: noticeData }, { data: readData }, { data: inquiryData }, { data: faqData }, { data: optionData }] = await Promise.all([
        supabase
          .from('owner_notices')
          .select('id, salon_id, title, body, created_at')
          .gte('created_at', sixMonthsAgo.toISOString())
          .order('created_at', { ascending: false }),
        supabase
          .from('owner_notice_reads')
          .select('notice_id')
          .eq('salon_id', salonId),
        supabase
          .from('owner_inquiries')
          .select('id, subject, body, status, created_at')
          .eq('salon_id', salonId)
          .order('created_at', { ascending: false }),
        supabase
          .from('owner_faqs')
          .select('id, question, answer')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('option_banners')
          .select('id, site, title, description, price, stock')
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
      ]);
      setNotices((noticeData ?? []) as OwnerNotice[]);
      setReadIds(new Set((readData ?? []).map(r => String(r.notice_id))));
      setInquiries((inquiryData ?? []) as OwnerInquiry[]);
      setFaqs((faqData ?? []) as OwnerFaq[]);
      setOptionBanners((optionData ?? []) as OptionBanner[]);
      setNoticesLoading(false);
    })();
  }, [salonId]);

  // 未読件数を親（タブバッジ）へ通知。
  const unreadIds = notices.filter(n => !readIds.has(n.id)).map(n => n.id);
  useEffect(() => {
    onUnreadChange(unreadIds.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.length]);

  // タブが開かれたら未読を一括既読化。
  // ignoreDuplicates:true ＝ ON CONFLICT DO NOTHING。オーナーには UPDATE ポリシーが無いため、
  // DO UPDATE になる通常の upsert は既存行との競合時に RLS で失敗する（INSERT のみで完結させる）。
  useEffect(() => {
    if (!active || subTab !== 'notices' || salonId == null || unreadIds.length === 0 || markingRef.current) return;
    markingRef.current = true;
    (async () => {
      const { error } = await supabase
        .from('owner_notice_reads')
        .upsert(unreadIds.map(id => ({ notice_id: id, salon_id: salonId })), { onConflict: 'notice_id,salon_id', ignoreDuplicates: true });
      if (!error) setReadIds(prev => new Set([...prev, ...unreadIds]));
      markingRef.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, subTab, salonId, unreadIds.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError('');
    setSending(true);
    try {
      const res = await submitOwnerInquiry({ subject, body });
      if (!res.ok) {
        setSendError(res.error ?? '送信に失敗しました');
        return;
      }
      onToast('お問い合わせを送信しました');
      setSubject('');
      setBody('');
      // 履歴を再取得（IDや created_at をサーバー値で揃える）。
      if (salonId != null) {
        const { data } = await supabase
          .from('owner_inquiries')
          .select('id, subject, body, status, created_at')
          .eq('salon_id', salonId)
          .order('created_at', { ascending: false });
        setInquiries((data ?? []) as OwnerInquiry[]);
      }
    } finally {
      setSending(false);
    }
  };

  // オプション商品の申込：新テーブルは作らず、既存の問い合わせ経路（owner_inquiries＋運営メール通知）に
  // 「どの商品を申し込んだか」を件名・本文に載せて送る（submitOwnerInquiry を流用）。送信後は履歴を再取得。
  const handleApply = async (p: OptionBanner) => {
    if (p.stock === 0) { onToast('この商品は売り切れです'); return; }
    const priceText = p.price == null ? '応相談' : `¥${p.price.toLocaleString()}`;
    if (!window.confirm(`「${p.title}」を申し込みますか？\n運営に申込内容が送信され、折り返しご連絡します。`)) return;
    setApplyingId(p.id);
    try {
      const res = await submitOwnerInquiry({
        subject: `【オプション申込】${p.title}`.slice(0, 100),
        body: [
          '以下のオプションを申し込みます。',
          '',
          `商品: ${p.title}`,
          `料金: ${priceText}`,
          p.description ? `\n${p.description}` : '',
          '',
          '※「オプション申込」から送信されました。',
        ].join('\n'),
      });
      if (!res.ok) { onToast(res.error ?? '申込の送信に失敗しました'); return; }
      onToast('申込を送信しました。運営より折り返しご連絡します');
      // 送信履歴（問い合わせ一覧）に反映。
      if (salonId != null) {
        const { data } = await supabase
          .from('owner_inquiries')
          .select('id, subject, body, status, created_at')
          .eq('salon_id', salonId)
          .order('created_at', { ascending: false });
        setInquiries((data ?? []) as OwnerInquiry[]);
      }
    } finally {
      setApplyingId(null);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';

  const toggleFaq = (id: string) => {
    setOpenFaqIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* ── サブタブ（運営から / 運営に問い合わせ / よくある質問） ── */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {([
          ['notices', '運営から'],
          ['inquiry', '運営に問い合わせ'],
          ['faq',     'よくある質問'],
          ['banner',  'リンクバナー特典'],
          ['option',  'オプション申込'],
        ] as const).map(([key, label]) => {
          const selected = subTab === key;
          return (
            <button
              key={key}
              onClick={() => setSubTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
              {/* お知らせサブタブ: 未読件数バッジ（親タブと同型） */}
              {key === 'notices' && unreadIds.length > 0 && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-pink-500 text-white text-[9px] font-black leading-none">
                  {unreadIds.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 運営からのお知らせ ── */}
      <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${subTab === 'notices' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-black text-slate-700">運営からのお知らせ</h2>
        <p className="text-[11px] text-slate-400">※ お知らせは配信から6ヶ月間表示されます。それより古いものは自動的に非表示になります。</p>
        {noticesLoading ? (
          <p className="text-xs text-slate-400">読み込み中…</p>
        ) : notices.length === 0 ? (
          <p className="text-xs text-slate-400">現在お知らせはありません。</p>
        ) : (
          <div className="space-y-3">
            {notices.map(n => (
              <div key={n.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">{formatDateJST(n.created_at)}</span>
                  {n.salon_id != null && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                      あなたの店舗宛
                    </span>
                  )}
                  {!readIds.has(n.id) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500 text-white">
                      NEW
                    </span>
                  )}
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">{n.title}</h3>
                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 運営へのお問い合わせ ── */}
      <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${subTab === 'inquiry' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-black text-slate-700">運営へのお問い合わせ</h2>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          掲載内容の変更依頼・不具合のご報告・その他のご相談はこちらから送信してください。
          返信が必要な内容は、ご登録のログインメールアドレス宛にご連絡します。
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">
              件名 <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              maxLength={100}
              required
              placeholder="例：店舗情報の変更について"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1">
              お問い合わせ内容 <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={4000}
              required
              rows={5}
              placeholder="お問い合わせの内容をご記入ください"
              className={inputClass}
            />
          </div>
          {sendError && <p className="text-xs text-rose-500">{sendError}</p>}
          <button
            type="submit"
            disabled={sending || subject.trim() === '' || body.trim() === ''}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
          >
            {sending ? '送信中…' : '送信する'}
          </button>
        </form>

        {/* 送信履歴 */}
        {inquiries.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 mb-2">送信履歴</h3>
            <p className="text-[11px] text-slate-400 mb-2">※ 対応履歴は3ヶ月後に消去されます。</p>
            <div className="space-y-2">
              {inquiries.map(q => (
                <div key={q.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[11px] text-slate-400">{formatDateJST(q.created_at)}</span>
                    {q.status === 'done' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">受付済み</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-slate-700">{q.subject}</p>
                  <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-0.5 line-clamp-3">{q.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── よくある質問（/admin「オーナー連絡」で作成・全店舗共通） ── */}
      <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${subTab === 'faq' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-black text-slate-700">よくある質問</h2>
        {noticesLoading ? (
          <p className="text-xs text-slate-400">読み込み中…</p>
        ) : faqs.length === 0 ? (
          <p className="text-xs text-slate-400">よくある質問はまだ登録されていません。</p>
        ) : (
          <div className="space-y-2">
            {faqs.map(f => {
              const open = openFaqIds.has(f.id);
              return (
                <div key={f.id} className="rounded-2xl border border-slate-100 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleFaq(f.id)}
                    aria-expanded={open}
                    className="w-full flex items-start justify-between gap-3 p-3.5 text-left hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="flex items-start gap-2 min-w-0">
                      <span className="flex-shrink-0 text-pink-500 font-black text-xs leading-5">Q.</span>
                      <span className="text-xs font-bold text-slate-700 leading-5 break-words">{f.question}</span>
                    </span>
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`flex-shrink-0 mt-1 text-pink-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5 flex items-start gap-2 border-t border-slate-50">
                      <span className="flex-shrink-0 text-slate-400 font-black text-xs leading-5 mt-3">A.</span>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words mt-3">{f.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── リンクバナー特典（バナー素材・タグ・特典適用状況） ── */}
      <div className={subTab === 'banner' ? '' : 'hidden'}>
        <BannerPerkPanel salonId={salonId} />
      </div>

      {/* ── オプション申込（option_banners・公開中を表示順で・各「申込」→ owner_inquiries へ送信） ── */}
      <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4 ${subTab === 'option' ? '' : 'hidden'}`}>
        <h2 className="text-sm font-black text-slate-700">オプション申込</h2>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ご希望のオプションの「申込」ボタンを押すと、運営に申込内容が届きます。折り返しご連絡のうえ、詳細をご案内します。
        </p>
        {noticesLoading ? (
          <p className="text-xs text-slate-400">読み込み中…</p>
        ) : optionBanners.length === 0 ? (
          <p className="text-xs text-slate-400">現在お申し込みいただけるオプションはありません。</p>
        ) : (
          <div className="space-y-3">
            {optionBanners.map((p) => {
              const soldOut = p.stock === 0;
              const siteMeta = OPTION_SITE_META[p.site];
              return (
              <div key={p.id} className={`rounded-2xl border p-4 ${siteMeta ? siteMeta.card : 'border-slate-100 bg-slate-50/60'}`}>
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {siteMeta && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${siteMeta.badge}`}>{siteMeta.label}</span>
                      )}
                      <h3 className="text-sm font-bold text-slate-800 break-words">{p.title}</h3>
                      {soldOut ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-500">売り切れ</span>
                      ) : p.stock != null ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">残り{p.stock}枠</span>
                      ) : null}
                    </div>
                    {p.description && (
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words mt-1">{p.description}</p>
                    )}
                    <p className="text-sm font-black text-pink-600 mt-2">
                      {p.price == null ? '応相談' : `¥${p.price.toLocaleString()}`}
                      {p.price != null && (
                        <span className="ml-1 text-[11px] font-medium text-slate-400">（税込）</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleApply(p)}
                    disabled={applyingId === p.id || soldOut}
                    className="w-full sm:w-auto flex-shrink-0 px-5 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
                  >
                    {soldOut ? '売り切れ' : applyingId === p.id ? '送信中…' : '申込'}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
