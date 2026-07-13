'use client';

// /mypage「運営から」タブ内のサブタブ「リンクバナー特典」。
// ・フクエス／フクエスワーク／fukuX の3サイトのリンクバナー（200×40）と貼り付け用タグ、特典説明を表示。
// ・自店の優先表示特典（本体 card_boost・求人 job_boost）の適用状況を「実行中✓／未適用」で表示する。
//   ブースト自体は運営がバナー設置を確認してから /admin で付与する（オーナーは変更不可・閲覧のみ）。
// ・設置報告は fukuX 専用フォームではなく、この場の簡易フォーム（店名・URL・貼ったバナー種類）で受ける。
//   連絡先メールはログインセッションから取得（submitMyBannerReport）。banner_reports に保存される。

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { getMyPerkStatus } from '@/app/actions/jobs';
import { submitMyBannerReport } from '@/app/actions/bannerReport';
import { BannerTagCode } from '@/app/components/BannerTagCode';

const SITE_URL = 'https://fukues.com';

type SiteKey = 'fukues' | 'work' | 'fukux';

type Banner = {
  key: SiteKey;
  file: string;
  label: string;
  href: string;
  alt: string;
  accent: 'pink' | 'emerald';
  desc: string;
};

// バナー素材は public/ 直下（配布ページ /banner・/jobs/banner・/x/banner と同一ファイル）。
const BANNERS: Banner[] = [
  {
    key: 'fukues',
    file: 'fukues-banner-200x40.png',
    label: 'フクエス（本体）',
    href: `${SITE_URL}/`,
    alt: 'フクエス｜福岡メンズエステ情報・口コミポータル',
    accent: 'pink',
    desc: 'サロンカードが、TOP・地域ページの一覧（30分ごとの表示切替）で上側に表示されやすくなります。',
  },
  {
    key: 'work',
    file: 'fukuwork-banner-200x40.png',
    label: 'フクエスワーク（求人）',
    href: `${SITE_URL}/jobs`,
    alt: 'フクエスワーク｜福岡メンズエステのセラピスト求人サイト',
    accent: 'emerald',
    desc: '求人カードが、フクエスワークの求人一覧（トップ・エリア・タグ・出張）で上側に表示されやすくなります。',
  },
  {
    key: 'fukux',
    file: 'fukux-banner-200x40.png',
    label: 'fukuX（フクエックス）',
    href: `${SITE_URL}/x`,
    alt: 'fukuX(フクエックス)｜福岡メンズエステ専用SNS',
    accent: 'pink',
    desc: '福岡メンズエステ専用SNS。写メ日記やお知らせを発信してお店を宣伝できます。相互リンクで露出アップに。',
  },
];

// 外部サイト貼り付け用タグ（配布ページと同一形式）。画像は直リンク参照可。
function bannerTag(b: Banner): string {
  return `<a href="${b.href}" target="_blank" rel="noopener"><img src="${SITE_URL}/${b.file}" width="200" height="40" alt="${b.alt}" loading="lazy" style="border:0;"></a>`;
}

// 特典適用状況の1行（実行中✓／未適用＋導線／対象外）。
function PerkStatusRow({
  label,
  state,
  activeDesc,
}: {
  label: string;
  // true=実行中 / false=未適用 / null=対象外（求人未掲載）
  state: boolean | null;
  activeDesc: string;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-3.5"
      style={{
        borderColor: state === true ? '#bbf7d0' : state === false ? '#fbcfe8' : '#e2e8f0',
        background: state === true ? 'rgba(240,253,244,0.7)' : state === false ? 'rgba(253,242,248,0.7)' : 'rgba(248,250,252,0.7)',
      }}
    >
      {/* チェックボックス風アイコン */}
      <span
        className="flex-shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-md border-2"
        style={{
          borderColor: state === true ? '#22c55e' : state === false ? '#f472b6' : '#cbd5e1',
          background: state === true ? '#22c55e' : 'white',
        }}
        aria-hidden
      >
        {state === true && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-slate-800">{label}</span>
          {state === true ? (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500 text-white">特典 実行中</span>
          ) : state === false ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">未適用</span>
          ) : (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">対象外</span>
          )}
        </div>
        {state === true ? (
          <p className="text-[11px] text-emerald-700 leading-relaxed mt-1">{activeDesc}</p>
        ) : state === false ? (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
            まだ特典が適用されていません。バナーを設置し、下の報告フォームからご報告いただくと、運営確認後に優先表示が有効になります。
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
            求人が未掲載のため対象外です。フクエスワークに求人を掲載すると対象になります。
          </p>
        )}
      </div>
    </div>
  );
}

export function BannerPerkPanel({ salonId }: { salonId: number | null }) {
  // undefined=読み込み中 / boolean=適用状況 / (job は null=求人未掲載もあり)
  const [cardBoost, setCardBoost] = useState<boolean | undefined>(undefined);
  const [jobBoost, setJobBoost] = useState<boolean | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // ── 設置報告フォーム（この場で完結する簡易版） ──
  const formRef = useRef<HTMLDivElement>(null);
  const [salonName, setSalonName] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  const [sites, setSites] = useState<Set<SiteKey>>(new Set());
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (salonId == null) return;
    (async () => {
      setLoading(true);
      const res = await getMyPerkStatus(salonId);
      if (!res.ok) {
        setErrorMsg(res.error);
        setLoading(false);
        return;
      }
      setErrorMsg('');
      setCardBoost(res.cardBoost);
      setJobBoost(res.jobBoost);
      setSalonName((prev) => (prev === '' ? res.salonName : prev)); // 店名を初期プリフィル（編集後は保持）
      setLoading(false);
    })();
  }, [salonId]);

  const bothActive = cardBoost === true && jobBoost === true;
  const anyInactive = cardBoost === false || jobBoost === false;

  const toggleSite = (key: SiteKey) => {
    setSites((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setDone(false);
  };

  const canSubmit = salonName.trim() !== '' && pageUrl.trim() !== '' && sites.size > 0 && !sending;

  const submit = async () => {
    setFormError('');
    setSending(true);
    const res = await submitMyBannerReport({
      salonName: salonName.trim(),
      pageUrl: pageUrl.trim(),
      sites: [...sites],
      comment: comment.trim(),
    });
    setSending(false);
    if (!res.ok) {
      setFormError(res.error ?? '送信に失敗しました');
      return;
    }
    setDone(true);
    // 店名は残し、他はクリア（連続報告しづらくするため sites/URL はリセット）。
    setPageUrl('');
    setSites(new Set());
    setComment('');
  };

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';

  return (
    <div className="space-y-4">
      {/* ── 特典の適用状況 ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="text-sm font-black text-slate-700">リンクバナー設置特典</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
            貴サイトにフクエス／フクエスワークのリンクバナーを設置し、運営にご報告いただくと、
            <span className="font-bold text-pink-600">サロン・求人カードの優先表示（一覧の上側に来やすくなる特典）</span>
            が有効になります。現在の適用状況はこちらです。
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400 py-4 text-center">読み込み中…</p>
        ) : errorMsg ? (
          <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{errorMsg}</p>
        ) : (
          <div className="space-y-2.5">
            <PerkStatusRow
              label="フクエス（本体）優先表示"
              state={cardBoost ?? false}
              activeDesc="サロンカードが一覧の上側に表示されやすくなっています。"
            />
            <PerkStatusRow
              label="フクエスワーク（求人）優先表示"
              state={jobBoost === undefined ? false : jobBoost}
              activeDesc="求人カードが一覧の上側に表示されやすくなっています。"
            />

            {/* まとめメッセージ＋未適用時の導線（下の報告フォームへスクロール） */}
            {bothActive ? (
              <p className="text-xs font-bold text-emerald-600 text-center pt-1">
                🎉 バナー設置特典が適用中です。ご協力ありがとうございます！
              </p>
            ) : anyInactive ? (
              <div className="rounded-2xl border border-pink-200 bg-pink-50/60 p-3.5 text-center space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  まだバナー未設置の特典があります。下のバナーを貴サイトに貼って、設置報告をすると特典を受けられます。
                </p>
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="inline-block px-5 py-2 rounded-full bg-pink-600 text-white text-xs font-bold hover:bg-pink-500 transition-colors shadow-sm shadow-pink-500/20"
                >
                  バナー設置を報告する →
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── バナー素材・タグ・特典説明 ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-5">
        <div>
          <h2 className="text-sm font-black text-slate-700">リンクバナー（200×40）</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
            下記タグを貴サイトに貼り付けてご利用ください（画像はダウンロードして設置してもOK）。
            リンク先は各タグ記載のURLでお願いします。画像の改変はご遠慮ください。
          </p>
        </div>

        {BANNERS.map((b) => (
          <section key={b.key} className="space-y-2">
            <h3 className="text-xs font-black text-slate-700">{b.label}</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">{b.desc}</p>
            {/* プレビュー：輪郭が出るよう枠線つきの面に載せる。 */}
            <div className="inline-block p-3 rounded-xl bg-slate-50 border border-slate-200">
              <Image
                src={`/${b.file}`}
                alt={b.alt}
                width={200}
                height={40}
                className="block border border-slate-200"
              />
            </div>
            <BannerTagCode tag={bannerTag(b)} accent={b.accent} />
          </section>
        ))}
      </div>

      {/* ── 設置報告フォーム（この場で完結・簡易版） ── */}
      <div ref={formRef} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div>
          <h2 className="text-sm font-black text-slate-700">バナー設置を報告する</h2>
          <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
            バナーを設置したら、店名・設置ページのURL・貼ったバナーの種類をご報告ください。
            運営が設置を確認のうえ、優先表示の特典を有効化します（確認まで数日いただく場合があります）。
            ご連絡はログイン中のメールアドレス宛に行います。
          </p>
        </div>

        {done ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
            <p className="text-sm font-bold text-emerald-700">報告を受け付けました ✓</p>
            <p className="text-[11px] text-emerald-600 mt-1">運営が確認のうえ、特典を有効化します。続けて別のページを報告する場合は下から入力してください。</p>
            <button
              type="button"
              onClick={() => setDone(false)}
              className="mt-3 px-4 py-1.5 rounded-full text-xs font-bold bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition"
            >
              続けて報告する
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                店名 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                maxLength={100}
                placeholder="例：アロマサロン◯◯"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">
                バナーを設置したページのURL <span className="text-rose-400">*</span>
              </label>
              <input
                type="url"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                maxLength={500}
                placeholder="例：https://example.com/links"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1.5">
                貼ったバナー <span className="text-rose-400">*</span>（複数選択可）
              </label>
              <div className="flex flex-wrap gap-2">
                {BANNERS.map((b) => {
                  const on = sites.has(b.key);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => toggleSite(b.key)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-colors ${
                        on
                          ? 'bg-pink-600 text-white border-pink-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-pink-300'
                      }`}
                    >
                      <span
                        className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-sm border ${
                          on ? 'bg-white border-white' : 'border-slate-300'
                        }`}
                      >
                        {on && (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#db2777" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </span>
                      {b.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-400 block mb-1">補足コメント（任意）</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="補足があればご記入ください"
                className={inputClass}
              />
            </div>

            {formError && <p className="text-xs text-rose-500">{formError}</p>}

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
            >
              {sending ? '送信中…' : '設置を報告する'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
