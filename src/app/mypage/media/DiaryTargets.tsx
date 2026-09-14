'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSalonDiaryForwards,
  getMediaOverview,
  startMediaMailImport,
} from '@/app/actions/mediaCredentials';
// ★ 第370便: エステ魂のタブに「了承あり／在籍」の人数を出すため（DiaryConsent と同じ読み口）
import { getSalonDiaryConsents } from '@/app/actions/diaryForward';
import { toConsentState } from '@/lib/therapistMediaConsent';
// ★ 店舗全体の「どこで書くか」（第128便でセラピスト個人画面からここへ移した）
// ★ サイトごとの「投稿先アドレスをどう手に入れるか」は mediaSites.ts が正本（第84便）
import { findMediaSite } from '@/lib/mediaSites';
// ★ 第370便: diarySourceNote の import は外した（「どこで書くか」のブロックを消したため）。
//   ★ ライブラリ（lib/diarySource）と番人（check:diarysource）はそのまま残っている

// 写メ日記の投稿先（第58便・㉞ その3）。
//
// ★★★ 受け取れるのは【駅ちかとエステラブだけ】。
//   エステ魂はメール投稿が無く、全国エステランキングは写メ日記機能そのものが無い
//   （2026-08-26 調査・migration 20260826_diary_forward.sql）。
//   ★ 4サイトのうち2つだけであることを、画面にそのまま書く。
//
// ★★ アドレスは秘密値なので伏せ字で出す（maskAddress）。
//   ★ 1人ぶんを直すのはセラピスト画面の仕事。ここは【一覧して確かめる】場所。
//
// ★ 取り込みは2段のまま（確認 → 登録）。★ 常に上書きすることを押す前に書く。

/** 写メ日記を【メールで】受け取れる媒体。★ ここに無い媒体には投稿先（アドレス）そのものが無い */
const DIARY_PROVIDERS = ['ekichika', 'esulove'];
/**
 * ★★★ 上のブロックに並べるサイト（第201便・2026-09-07・カッキーさん）。
 *   ★ エステ魂は投稿先（アドレス）が無い（ご本人のアカウントで代理投稿・第141便）が、
 *     並んでいないと「エステ魂には写メ日記が行かない」と読める（第三者視点）。
 *   ★ 押すと、投稿先の一覧の代わりに【エステ魂の送信状況と了承】（esutamaPanel）を出す。
 */
const SITE_TABS = ['ekichika', 'esulove', 'esutama'];
const SITE_FALLBACK_LABEL: Record<string, string> = { ekichika: '駅ちか', esulove: 'エステラブ', esutama: 'エステ魂' };

type Site = { provider: string; slot: number; label: string; hasCredential: boolean };
type Forward = { therapistId: string; provider: string; slot: number; addressMask: string; isEnabled: boolean };
type Data = {
  diarySource: string;
  therapists: Array<{ id: string; name: string }>;
  forwards: Forward[];
  lastRead: { at: string; applied: boolean; created: number; updated: number; unchanged: number; unmatched: number } | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

export function DiaryTargets({ salonId, onToast, esutamaPanel, consentVersion = 0 }: {
  salonId: number | null;
  onToast: (m: string) => void;
  /** ★ 「エステ魂」を選んだときに、投稿先の一覧の代わりに出すもの（送信状況・了承）。★ 第201便 */
  esutamaPanel?: React.ReactNode;
  /**
   * ★ 第370便: 下の了承パネル（DiaryConsent）で「了承あり」を押したら、タブの人数も読み直すための番号。
   *   ★ 親（diary/page.tsx）が押されるたびに +1 する。★ 値そのものに意味はない
   */
  consentVersion?: number;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  // ★ 第370便: エステ魂のタブに出す人数の【分子】＝了承ありが何名か。
  //   ★ 駅ちか・エステラブの「投稿先が何人ぶん入っているか」に当たるものが、エステ魂では「了承が何人ぶん取れているか」。
  //
  //   ★★★ 母数は3つとも同じ（＝`total`＝この店のセラピスト全員・第370便でカッキーさんと決めた）。
  //     ★ ここで【公開中だけ】に絞らない。絞ると「1/26名」と「40/40名」が横に並び、
  //       同じ形の括弧なのに母数が違う＝読む人が数を比べられない。
  //     ★ そのため分子も全員から数える（非公開の方の了承も1名として数える）。★ 分母と揃える
  //   ★ 下の了承パネルの見出しは「在籍 26名」（公開中）のまま。★ あちらは"送る相手"の話、ここは"サイトの比較"。
  const [esutamaAgreed, setEsutamaAgreed] = useState<number | null>(null);
  // ★ 第370便: siteFacts（全サイトの向き・鍵・同意）は消した。★ 「どこで書くか」のブロックと一緒に用済み
  const [picked, setPicked] = useState<string>('ekichika');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const [d, ov] = await Promise.all([
      getSalonDiaryForwards({ salonId }),
      getMediaOverview({ salonId }),
    ]);
    if (!d.ok) { setError(d.error); setLoading(false); return; }
    setData(d.data);
    // ★ 写メ日記を受け取れる媒体だけ並べる。★ 連携していない媒体も「未設定」で出す
    const known = ov.ok ? ov.data.sites : [];
    setSites(
      SITE_TABS.map((p) => {
        const hit = known.find((s) => s.provider === p);
        return {
          provider: p,
          slot: hit?.slot ?? 1,
          label: hit?.label ?? SITE_FALLBACK_LABEL[p] ?? p,
          hasCredential: hit?.hasCredential === true,
        };
      })
    );
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  // ★ 第370便: エステ魂の了承の人数。★ 投稿先（forwards）とは別に読む——了承を押すたびにこちらだけ読み直す。
  //   ★ 読めなかったときは null のまま＝タブに人数を出さない（★ 0/40 と書かない。読めていないことと0名は違う）
  useEffect(() => {
    if (salonId == null) return;
    let live = true;
    void (async () => {
      const res = await getSalonDiaryConsents({ salonId, provider: 'esutama' });
      if (!live) return;
      if (!res.ok) { setEsutamaAgreed(null); return; }
      const of = new Map(res.data.consents.map((c) => [c.therapistId, toConsentState(c.state)]));
      // ★ 全員から数える（isActive で絞らない）。★ 母数を駅ちか・エステラブに揃えるため（上の★★★）
      setEsutamaAgreed(res.data.therapists.filter((t) => (of.get(t.id) ?? 'unknown') === 'agreed').length);
    })();
    return () => { live = false; };
  }, [salonId, consentVersion]);

  const onImport = async (apply: boolean) => {
    if (salonId == null) return;
    const site = sites.find((s) => s.provider === picked);
    if (!site) return;
    setBusy(true);
    try {
      const res = await startMediaMailImport({
        salonId, provider: site.provider, slot: site.slot, apply,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast(apply
        ? '登録を受け付けました。結果は「連携の記録」に出ます'
        : '取り込む内容を確認しています。結果は「連携の記録」に出ます（まだ登録していません）');
      setConfirmApply(false);
    } finally {
      setBusy(false);
    }
  };

  if (salonId == null) return null;

  const site = sites.find((s) => s.provider === picked) ?? null;
  // ★ 投稿先（アドレス）があるサイトか。★ エステ魂は無い（一覧の代わりに esutamaPanel を出す）
  const hasAddressBook = DIARY_PROVIDERS.includes(picked);
  const rows = (data?.forwards ?? []).filter((f) => f.provider === picked);
  const nameOf = new Map((data?.therapists ?? []).map((t) => [t.id, t.name]));
  const withAddress = rows.filter((r) => r.addressMask.length > 0);
  const shown = showAll ? withAddress : withAddress.slice(0, 5);
  const total = data?.therapists.length ?? 0;
  // ★ このサイトの投稿先アドレスは、こちらで読めるか／手で入れてもらうか（mediaSites が正本）
  const manualAddress = findMediaSite(picked)?.diaryAddressSource === 'manual';
  // ★ そのサイトに投稿先が何人ぶん入っているか（★ タブに出す）。
  //   ★ 読めていないときは 0 と書かない——このページは自分のDBを見ているので 0 は 0 でよい
  const countOf = (provider: string) =>
    (data?.forwards ?? []).filter((f) => f.provider === provider && f.addressMask.length > 0).length;

  return (
    <div className="space-y-3">

      {/* ── どのサイトを見るか ─────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        <h3 className="text-[16px] font-bold text-slate-700 mb-3">どのサイトを見ますか？</h3>

        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[14px] text-rose-600 leading-relaxed">
            投稿先を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sites.map((s) => {
              const on = picked === s.provider;
              return (
                <button
                  key={s.provider}
                  onClick={() => { setPicked(s.provider); setConfirmApply(false); setShowAll(false); }}
                  aria-pressed={on}
                  className={`px-3 py-2 border text-[14px] font-bold transition-colors ${
                    on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  {s.label}
                  {/* ★★ 「（未設定）」をやめた（第85便・カッキー様の指摘）。
                      ★ もとは hasCredential（ログイン情報の有無）を出していたが、
                        ・投稿先の登録にも、送信にも、ログイン情報は要らない（手で入れれば送れる）
                        ・エステラブはログイン情報を預からないので【永久に「未設定」】だった
                      ★ 「設定していない＝使えない」と読まれ、しかも直しようが無かった。
                      → ★ このページの関心事は【何人ぶん入っているか】。それを出す。 */}
                  {/* ★ 駅ちか・エステラブ: 投稿先（アドレス）が何人ぶん入っているか */}
                  {DIARY_PROVIDERS.includes(s.provider) && (
                    <span className="ml-1 font-medium text-slate-400 tabular-nums">
                      （{countOf(s.provider)}/{total}名）
                    </span>
                  )}
                  {/* ★ 第370便（2026-09-15・カッキーさん）: エステ魂にも人数を出す。
                      ★ 第201便では「投稿先が無いので出さない」としていたが、了承ありの人がいるのに
                        駅ちか・エステラブだけ人数が付いていると「エステ魂は誰も送れない」と読める。
                      ★ 数えるものだけ違う（投稿先の数／了承の数）。★★ 母数は3つとも同じ `total` に揃える */}
                  {s.provider === 'esutama' && esutamaAgreed != null && (
                    <span className="ml-1 font-medium text-slate-400 tabular-nums">
                      （{esutamaAgreed}/{total}名）
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ★ 2026-08-31（第85便・カッキー様）: 店舗が読む文として短くした。
            ★ もとは「エステ魂はメールでの投稿ができず、全国エステランキングには
              写メ日記そのものがありません」と、出ていない2サイトの理由まで書いていた。
            ★ その理由は mediaSites.ts の diaryAddressSource: 'none' に残してある。 */}
        {/* ★ 第201便: エステ魂が並んだので、違い（投稿先が要るか）を1行で言う
            ★ 第370便（2026-09-15・カッキーさん）: 上のタブに3つとも人数が付いたので、この行は短く。
              ★ 「投稿先が要らず」を落としたのは、直前の「投稿先メールアドレスを登録」との対比で読めるため */}
        <p className="mt-3 text-[13px] text-slate-400 leading-relaxed">
          駅ちか・エステラブは、セラピストの投稿先メールアドレスを登録。エステ魂はご本人の了承を記録。
        </p>
      </div>

      {/* ── 正本の注意（二重投稿を防ぐ唯一の仕掛け）───────── */}
      {/* ★ 青→赤（第85便・カッキー様）。★ ここは「登録しても送っていない」という
          いちばん誤解される点。★ 目に留まる色にする。 */}
      {!loading && !error && data?.diarySource !== 'fukues' && (
        <div className="border border-rose-200 bg-rose-50 px-4 py-3">
          {/* ★ 第200便（2026-09-07・カッキーさん）: 「正本」「他社経由の転送」はこちらの言葉。
              ★ 店舗様が押すもの（下の「フクエスで書く」）で言い、理由は括弧で1つだけ。 */}
          <p className="text-[14px] leading-relaxed text-slate-600">
            {/* ★ 第370便（2026-09-15・カッキーさん）: 「送る」→「転送」に言い換え、次にすることを1文で言う。
                ★ もとは「投稿先を登録しても…送りません」と、できないことの説明が先に来ていた。 */}
            <b className="font-bold text-rose-700">現在、フクエスから写メ日記を転送していません。</b>{' '}
            フクエスから写メ日記を転送する場合、ホームで「フクエスから反映」にしてください。（日記の二重投稿を防ぐため）
          </p>
        </div>
      )}

      {/* ★★★ 第370便（2026-09-15・カッキーさん）: 「写メ日記をどこで書くか」のブロックを【まるごと外した】。
          ★ もとは第205便（2026-09-07）でホームの「3つの設定」を読み取って1行で言うために置いたもの。
          ★★ 外した理由: すぐ上の赤い帯が「ホームで『フクエスから反映』にしてください」と同じことを言っており、
            ホームへの案内が2つ並んでいた。★ 設定の正本はホーム——この画面は【投稿先を見る】場所に戻す。
          ★★★ 消したのは【この画面の表示だけ】。判断そのもの（lib/diarySource の diarySourceNote・番人あり）も、
            ホーム側（MediaHome）の設定も、`data.diarySource` を見ている上の赤い帯も、いっさい触っていない。
            ★ 戻したくなったら、ここに diarySourceNote(data.diarySource, siteFacts) を呼ぶブロックを戻すだけ。 */}

      {/* ★★★ 手で入れてもらうサイト（第84便）。
          ★ これまでは「ログイン情報を登録すると読み取れます」と出していたが、
            エステラブは /admin へ到達できず（403）**読み取れない**。
            しかもログイン情報の登録も閉じた。★ **二重に嘘**になっていた。
          ★ 入力の口は【セラピストさんのページ】に既にある。★ 新しく作らず、そこへ案内する。 */}
      {/* ── ★ エステ魂（第201便）: 投稿先の一覧の代わりに、送信状況と了承を出す ── */}
      {!loading && !error && !hasAddressBook && esutamaPanel}

      {!loading && !error && site && hasAddressBook && manualAddress ? (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
          <div>
            <p className="text-[19px] font-black text-slate-800">
              {site.label}の投稿先は、手でご入力ください
            </p>
            <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">
              {site.label}は、フクエスのサーバからの接続を受け付けていないため、
              投稿用アドレスを自動で読み取れません。お手数ですが、
              セラピストさんごとに{site.label}の投稿用アドレスをご登録ください。
              <br />
              ★ 登録は、セラピストさんのページの「写メ日記の転送先」で行えます。
            </p>
          </div>

          {total === 0 ? (
            <p className="text-[14px] text-slate-400">セラピストさんが登録されていません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="text-slate-400 text-left">
                    <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                    <th className="font-medium py-1 pr-3 whitespace-nowrap">投稿先</th>
                    <th className="font-medium py-1 whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.therapists ?? []).map((t) => {
                    const f = rows.find((r) => r.therapistId === t.id);
                    return (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3 text-slate-700 break-words">{t.name || '（名前なし）'}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums">
                          {f && f.addressMask.length > 0 ? (
                            <span className="text-slate-500">{f.addressMask}</span>
                          ) : (
                            // ★ 「未登録」と言い切ってよい（読めていないのではなく、こちらのDBを見ている）
                            <span className="text-amber-700 font-bold">未登録</span>
                          )}
                        </td>
                        <td className="py-1.5 whitespace-nowrap">
                          <Link
                            href={`/mypage/therapist/${t.id}`}
                            className="text-[13.5px] font-bold px-2.5 py-1 border border-slate-200 text-slate-600"
                          >
                            {f && f.addressMask.length > 0 ? '変える' : '入力する'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : !loading && !error && site && hasAddressBook && !site.hasCredential ? (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
          <p className="text-[19px] font-black text-slate-800">{site.label}とはまだ連携していません</p>
          <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">
            ログイン情報を登録すると、{site.label}が発行している投稿用アドレスを読み取れます。
          </p>
          <Link
            href="/mypage/media/login"
            className="mt-3 inline-block text-[14px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600"
          >
            ログイン情報を登録する
          </Link>
        </div>
      ) : !loading && !error && site && hasAddressBook ? (
        <>
          {/* ── いまの状態 ────────────────────────────── */}
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[19px] font-black text-slate-800">
                  {withAddress.length}名ぶん 登録済み
                </p>
                <p className="mt-0.5 text-[14px] text-slate-500">
                  {/* ★ 読んだ記録が無いことを「0件」と書かない */}
                  {data?.lastRead
                    ? `${fmt(data.lastRead.at)} に${site.label}から読み取りました`
                    : `まだ${site.label}から読み取っていません`}
                </p>
              </div>
              <span className="flex-none text-[13px] font-bold px-3 py-0.5 border bg-white text-slate-400 border-slate-200 tabular-nums">
                全{total}名中
              </span>
            </div>

            {data?.lastRead && (
              <dl className="mt-4 grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 overflow-hidden">
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[12px] font-bold text-slate-400">新しく増えた</dt>
                  <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.created}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[12px] font-bold text-slate-400">宛先が変わった</dt>
                  <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.updated}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[12px] font-bold text-slate-400">変わりなし</dt>
                  <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.unchanged}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
              </dl>
            )}

            {data?.lastRead && data.lastRead.unmatched > 0 && (
              <p className="mt-2.5 text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                {data.lastRead.unmatched}名は、フクエスのセラピストと結びつきませんでした。
                お名前が違っている可能性があります。
              </p>
            )}

            {data?.lastRead && !data.lastRead.applied && (
              <p className="mt-2.5 text-[13px] font-bold text-indigo-600">
                これは確認したときの件数です。まだ登録していません。
              </p>
            )}

            {/* ★ 第370便（2026-09-15・カッキーさん）: 「取り込んで登録する」は下のブロックへ移した。
                ★ ここに残すのは【読むだけ】の「取り込む内容を確認」。★ この画面を書き換えない操作 */}
            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => onImport(false)}
                disabled={busy}
                className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-600 disabled:opacity-50"
              >
                取り込む内容を確認
              </button>
            </div>
          </div>

          {/* ── だれの日記が、どこへ届くか ────────────────── */}
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
            {/* ★★ 第370便: 見出しの右に「取り込んで登録する」。★ 上書きされるのは【この一覧】なので、
                操作をその一覧の上に置く。★ 確定の2段（やめる／上書きして登録する）も同じ場所に出す */}
            <div className="mb-3 flex items-start justify-between gap-3 flex-wrap">
              <h3 className="text-[16px] font-bold text-slate-700">だれの日記が、どこへ届くか</h3>
              <div className="flex flex-wrap gap-2 justify-end">
                {confirmApply ? (
                  <>
                    <button
                      onClick={() => setConfirmApply(false)}
                      className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-500"
                    >
                      やめる
                    </button>
                    <button
                      onClick={() => onImport(true)}
                      disabled={busy}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                    >
                      上書きして登録する（確定）
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmApply(true)}
                    disabled={busy}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                  >
                    取り込んで登録する
                  </button>
                )}
              </div>
            </div>

            {/* ★ 上書きすることを、押す前に読める場所に書く（★ ボタンと一緒にこちらへ移した） */}
            <p className="mb-3 text-[13px] text-slate-400 leading-relaxed">
              登録すると、いま入っている投稿先は{site.label}の内容で上書きされます。
              {site.label}側でアドレスが出し直されたときに、古いまま送り続けないためです。
            </p>

            {withAddress.length === 0 ? (
              <p className="text-[14px] text-slate-400">
                まだ登録されていません。「取り込んで登録する」を押すと、{site.label}から読み取って入れます。
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="text-slate-400 text-left">
                        <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                        <th className="font-medium py-1 pr-3 whitespace-nowrap">届け先</th>
                        <th className="font-medium py-1 whitespace-nowrap">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.therapistId + '#' + r.slot} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700 break-words">
                            {nameOf.get(r.therapistId) || '（名前なし）'}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap tabular-nums">{r.addressMask}</td>
                          <td className="py-1.5 whitespace-nowrap">
                            {r.isEnabled ? (
                              <span className="text-[13px] font-bold px-2.5 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200">
                                使えます
                              </span>
                            ) : (
                              <span className="text-[13px] font-bold px-2.5 py-0.5 border bg-white text-slate-400 border-slate-200">
                                止めています
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {withAddress.length > shown.length && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="mt-3 text-[14px] font-bold text-slate-500 underline"
                  >
                    残り{withAddress.length - shown.length}名を見る
                  </button>
                )}

                {/* ★ アドレスを丸ごと出さない理由を書く。★ 隠していることを隠さない */}
                <p className="mt-3 text-[13px] text-slate-400 leading-relaxed">
                  アドレスは頭とドメインだけをお見せしています。
                  このアドレスを知っている人は誰でもその媒体に投稿できるためです。
                  全部を見たり直したりするときは、セラピストの画面をお使いください。
                </p>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
