'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMediaOverview, setMediaLinkMode } from '@/app/actions/mediaCredentials';
import {
  switchChoices, switchDoneText, switchAskText, homeHeadline, homeChoiceNote,
  sendOnlyChoiceNote, canReadProvider,
  type SiteDirection, type SwitchChoice,
} from '@/lib/mediaOverview';
// ★ 同意の取り直しは、ログイン情報の中だけでは気づけない（第89便）。★ 入口にも出す
import { CONSENT_RECHECK_BADGE, consentRecheckNotice } from '@/lib/mediaConsent';

// 媒体連携の入口（第56便・㉞）。
//
// ★★★ なぜ作り直したか
//   これまでは8つのかたまりが1画面に縦積みで、
//   ★ どれが「いまの状態」でどれが「操作」なのかが区別できなかった。
//   ★ 連携先が4サイトになると、同じかたまりが4組ぶん並ぶことになる（設計メモ §151）。
//
// ★★ この画面が引き受けるのは【状態を見せること】だけ。操作は各画面へ渡す。
//   ★ 説明文はここに置かない。必要なところに置き直す（画面案の決定）。
//
// ★ タイルの行き先は、すべて独立したページ（第65便で割り終わった）。
//   /mypage/media/therapists ・ /work ・ /diary ・ /login ・ /log
//   ★★ 途中の足場だった /mypage/media/all は畳んだ。★ もう存在しない。

type Site = {
  provider: string;
  slot: number;
  label: string;
  direction: string;
  statusLabel: string;
  canSwitch: boolean;
  /** ★ いま自動で反映しているか。★ 自動のまま戻させない（先に自動をやめてもらう） */
  autoOn: boolean;
  hasCredential: boolean;
  /** ★★★ 同意の取り直しが要るか。★ 要るあいだ、この枠へは何も送っていない（第89便） */
  needsConsent: boolean;
  lastVerifiedAt: string | null;
  listLastRunAt: string | null;
  fullLastRunAt: string | null;
  lastWriteOkAt: string | null;
  nextImportAt: string | null;
};

type Overview = { therapistCount: number; sites: Site[] };

/** 「8/30 06:13」。★ 読めない値は空文字にする（"Invalid Date" を店舗に見せない）。 */
function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

/** 「6:20」。時刻だけ。 */
function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

/**
 * ★★★ 動いていることを示す、ゆっくりした点滅（第90便・カッキーさん）。
 *
 * ★ 使うのは【いま動いている状態】だけ（read・write）。
 *   ★★ 止まっている状態（off・未設定）に付けない。★ 付けると、止まっているのに動いて見える。
 * ★ 速い点滅は「異常」に見える。★ ここは正常に動いている合図なので、ゆっくりにする。
 */
const LIVE_BLINK = 'animate-pulse';
/**
 * ★ 速さは style で渡す。★ Tailwind の animate-pulse は animation の一括指定なので、
 *   クラスで長さだけ足すと、並び順しだいで効いたり効かなかったりする。
 *   ★★ 見え方が並び順で変わる書き方をしない。★ style ならいつでも勝つ。
 */
const LIVE_BLINK_STYLE = { animationDuration: '2.5s' } as const;

const PILL: Record<string, string> = {
  read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  write: 'bg-sky-50 text-sky-700 border-sky-200',
  // ★ off は【選んだ結果】。★ 未設定の灰色と分ける（第87便）
  off: 'bg-slate-100 text-slate-600 border-slate-300',
  unset: 'bg-white text-slate-400 border-slate-200',
};

// ★ 用事のタイル（Tile / TileIcon）は第117便で外した。★ 左サイドバーと同じ行き先が二度並んでいたため

export function MediaHome({ salonId, salonName, onToast }: {
  salonId: number | null; salonName: string | null; onToast: (m: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');
  // ★ 押す前の問い（第88便）。★ null のあいだは何も出さない
  const [ask, setAsk] = useState<{ site: Site; choice: SwitchChoice } | null>(null);

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    (async () => {
      const res = await getMediaOverview({ salonId });
      if (!alive) return;
      if (res.ok) setData(res.data);
      // ★ 読めなかったことを黙って0件に見せない。理由を出す（引き継ぎメモ 3-5）
      else setError(res.error);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [salonId]);

  /**
   * ★★★ 入力する場所を、その場で変える（第86便その2・カッキーさん）。
   *
   * ★ これまではログイン情報の画面へ飛ばしていた。★ 画面を1枚またぐと、
   *   何のために飛んだのかを覚えていなければならない。★ ここで終わらせる。
   * ★★ 押す前の確認は置かない。★ 代わりに【止まるほう】を押した直後に必ず言い、
   *   反対向きのボタンをその場に出す（1回押せば戻せる）。
   * ★ 自動で反映しているあいだは出さない。★ 一度に2つ変えると、
   *   どちらのつもりで押したのかが分からなくなる（WorkSend.onSwitchAuto と同じ理由）。
   */
  const onSwitch = async (s: Site, mode: 'read' | 'write' | 'none') => {
    if (salonId == null) return;
    setSwitching(s.provider + '#' + s.slot);
    const res = await setMediaLinkMode({ salonId, provider: s.provider, slot: s.slot, mode });
    if (!res.ok) { setSwitching(''); onToast(res.error); return; }
    const back = await getMediaOverview({ salonId });
    if (back.ok) setData(back.data);
    setSwitching('');
    onToast(switchDoneText(mode, s.label, s.provider));
  };

  const sites = data?.sites ?? [];
  // ★★★ 同意の取り直しが要る枠（第89便）。★ 入口のいちばん上に出す
  const recheck = sites.filter((s) => s.needsConsent);
  const reading = sites.find((s) => s.direction === 'read') ?? null;
  const writing = sites.filter((s) => s.direction === 'write');
  // ★ 自分で「送らない」を選んでいる枠。★ 未設定と混ぜて書かない（§223）
  const offSite = sites.find((s) => s.direction === 'off') ?? null;
  // ★ いちばん上の1行は、この3つで決まる。★ 文言は mediaOverview に置いてある（点検で固定）
  const topDirection: SiteDirection =
    reading ? 'read' : writing.length > 0 ? 'write' : offSite ? 'off' : 'unset';
  const topLabel = reading?.label ?? offSite?.label ?? '';

  return (
    <div className="space-y-3">

      {/* ── ★★★ 同意の取り直し（第89便）─────────────────────
          ★★ ログイン情報の画面まで行かないと気づけない、をやめる。
            ★ 止まっているのに、入口には何も出ていなかった（§223）。 */}
      {recheck.length > 0 && (
        <div className="border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-[15.5px] font-black text-amber-900">
            {consentRecheckNotice(recheck.map((s) => s.label)).title}
          </p>
          <p className="mt-1 text-[14px] text-amber-900/80 leading-relaxed">
            {consentRecheckNotice(recheck.map((s) => s.label)).body}
          </p>
          <Link
            href="/mypage/media/login"
            className="inline-block mt-2.5 px-3 py-1.5 border border-amber-400 bg-white text-[13.5px] font-bold text-amber-900 hover:bg-amber-100"
          >
            同意する場所を開く
          </Link>
        </div>
      )}

      {/* ── 取り込みの状態 ────────────────────────────────
          ★ いちばん上は【状態】だけ。★ 操作も説明も置かない。 */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[14px] text-rose-600 leading-relaxed">
            連携の状態を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : reading ? (
          <>
            {/* ★★★ いちばん上は【いま何が動いているか】の1行だけ（第90便・カッキーさん）。
                ★ 右にあった「反映中」のバッジは外した。★ 見出しに「中」が入ったので同じことを2回書いていた。
                ★★ 中央に置き、ゆっくり点滅させる。★ 動いていることを、言葉と絵の両方で言う。
                ★ 点滅は【動いている状態だけ】。止まっているときは点滅させない（下の枝）。 */}
            <div className="text-center">
              <p
                className={`text-[19px] font-black text-slate-800 ${LIVE_BLINK}`}
                style={LIVE_BLINK_STYLE}
              >
                {homeHeadline('read', reading.label)}
              </p>
              <p className="mt-0.5 text-[14px] text-slate-500">{salonName ?? ''}</p>
            </div>

            {/* ★ 3つとも中央表示（第90便・カッキーさん）。★ 見出しの中央寄せと揃える */}
            <dl className="mt-4 grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 overflow-hidden">
              <div className="bg-white px-3 py-2.5 text-center">
                <dt className="text-[12px] font-bold text-slate-400">セラピスト</dt>
                <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                  {data?.therapistCount ?? 0}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="bg-white px-3 py-2.5 text-center">
                <dt className="text-[12px] font-bold text-slate-400">最後の反映</dt>
                <dd className="text-[17px] font-black text-slate-800 tabular-nums">
                  {fmt(reading.listLastRunAt) || '—'}
                </dd>
              </div>
              <div className="bg-white px-3 py-2.5 text-center">
                <dt className="text-[12px] font-bold text-slate-400">次の反映</dt>
                {/* ★★ 分からない・止まっているときは時刻を出さない。
                    ★ 過ぎている時刻を「次」と書かない（mediaOverview.nextImportAt） */}
                <dd className="text-[17px] font-black text-slate-800 tabular-nums">
                  {reading.nextImportAt ? `${fmtTime(reading.nextImportAt)}ごろ` : '—'}
                </dd>
              </div>
            </dl>

            {reading.fullLastRunAt && (
              // ★★ 上のカードは「最後の反映」「次の反映」に揃えた（第88便）。
              //   ★ ここだけ「取り込みます」が残っていた（第90便で揃えた・引き継ぎメモ §5④）
              <p className="mt-2.5 text-[13px] text-slate-400 text-center">
                週間の予定は1日1回の反映（最後は {fmt(reading.fullLastRunAt)}）。
              </p>
            )}
          </>
        ) : writing.length > 0 ? (
          /* ★★ フクエスで入力しているときも【動いている】。★ read と同じ形にする（第90便）。
              ★ 2つの動いている状態で見え方が違うと、どちらかが止まって見える。 */
          <div className="text-center">
            <p
              className={`text-[19px] font-black text-slate-800 ${LIVE_BLINK}`}
              style={LIVE_BLINK_STYLE}
            >
              {homeHeadline('write', topLabel)}
            </p>
            <p className="mt-0.5 text-[14px] text-slate-500">{salonName ?? ''}</p>
          </div>
        ) : (
          <>
            {/* ★ ここは【止まっている】2つ（off・未設定）。★ 点滅させない */}
            <p className="text-[19px] font-black text-slate-800">
              {homeHeadline(topDirection, topLabel)}
            </p>
            <p className="mt-1 text-[14px] text-slate-500 leading-relaxed">
              {/* ★★ off は【選んだ結果】。★ 「していません」の1行だけで終わらせず、
                     選んだことと、戻せることを、すぐ下に書く（§223） */}
              {offSite
                ? '「反映しない」を選んでいます。下のボタンでいつでも戻せます。'
                : 'ログイン情報を登録すると始められます。'}
            </p>
          </>
        )}
      </div>

      {/* ── 連携しているサイト ──────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        {/* ★★★ 見出し・ログイン情報のリンク・サイト名・最後の読み取り・いまの状態の印を外した
            （第90便・カッキーさん）。★ すぐ上のブロックに同じことが書いてあり、二度読ませていた。
            ★ ログイン情報へは左の並びから行ける。
          ★★★ ただし【選ぶボタンが出ない行】では外さない。★ 外すと行が空になる。
            ★ 書くだけのサイト・未設定・自動で反映中の枠がそれにあたる。 */}
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : sites.length === 0 ? (
          <p className="text-[14px] text-slate-400">まだ登録されていません。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sites.map((s) => {
              // ★ 切り替えを出すのは読める媒体だけ（mediaOverview.canSwitchDirection）。
              //   ★ 書くだけのサイトに出すと、選べるように見えて選べない画面になる。
              // ★ 自動で反映しているあいだは変えさせない。★ 先に自動をやめてもらう。
              // ★★ 第111便: provider を渡す。★ 書くだけのサイトには 'read' を出さない
              const choices = s.canSwitch && !s.autoOn
                ? switchChoices(s.direction as SiteDirection, s.label, s.provider)
                : [];

              // ── 選ぶだけの行。★ ボタン以外は出さない ──────────────
              // ★★★ 大きく中央に出すのは【読める媒体】だけ（第111便）。
              //   ★ 書くだけのサイトにも選ぶボタンが出るようになったが、
              //     同じ形にすると **名前の無いボタンだけの行が2つ**並ぶ。
              //   ★ どちらのサイトのボタンなのかが読めなくなる。
              //   → 書くだけのサイトは、名前と状態の行に小さく添える（下の枝）。
              if (choices.length > 0 && canReadProvider(s.provider)) {
                return (
                  <div key={s.provider + '#' + s.slot} className="py-4">
                    {/* ★★★ 同意の取り直しだけは消さない。
                        ★ 消すと、止まっていることが行から消える（第89便で足したばかり） */}
                    {s.needsConsent && (
                      <p className="mb-3 text-center">
                        <span className="text-[13px] font-bold px-3 py-1 border bg-amber-50 text-amber-800 border-amber-300">
                          {CONSENT_RECHECK_BADGE}
                        </span>
                      </p>
                    )}
                    {/* ★ 中央に大きく（第90便）。★ ここが、この画面でいちばん押すところ */}
                    <div className="flex flex-wrap justify-center gap-3">
                      {choices.map((c) => (
                        <button
                          key={c.mode}
                          type="button"
                          onClick={() => setAsk({ site: s, choice: c })}
                          disabled={switching !== ''}
                          className="min-w-[210px] text-[16px] font-bold px-7 py-3.5 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40"
                        >
                          {switching === s.provider + '#' + s.slot ? '変えています…' : c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }

              // ── 選ぶボタンが出ない行。★ 名前と状態を出す（出さないと空の行になる）──
              return (
                <div key={s.provider + '#' + s.slot} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <b className="block text-[15px] font-bold text-slate-700">{s.label}</b>
                      <span className="block text-[13px] text-slate-400 tabular-nums">
                        {/* ★★ 止まっているときは、時刻より先に【止まっていること】を書く（第89便） */}
                        {s.needsConsent
                          ? '同意の取り直しが必要です。いまは何も送っていません'
                          : s.direction === 'read'
                          ? (fmt(s.listLastRunAt) ? `最後の読み取り ${fmt(s.listLastRunAt)}` : 'まだ読み取っていません')
                          : s.direction === 'write'
                            ? (fmt(s.lastWriteOkAt) ? `最後の反映 ${fmt(s.lastWriteOkAt)}` : 'まだ反映していません')
                            // ★★ 選んで止めているのだから、失敗のように書かない（§223）
                            : s.direction === 'off'
                              ? 'どこにも送らず、取り込みもしていません'
                              : (s.hasCredential ? '入力する場所が決まっていません' : 'ログイン情報がまだありません')}
                      </span>
                    </span>
                    {s.needsConsent && (
                      <span className="flex-none text-[13px] font-bold px-3 py-0.5 border bg-amber-50 text-amber-800 border-amber-300">
                        {CONSENT_RECHECK_BADGE}
                      </span>
                    )}
                    <span className={`flex-none text-[13px] font-bold px-3 py-0.5 border ${PILL[s.direction] ?? PILL.unset}`}>
                      {s.statusLabel}
                    </span>
                    {s.canSwitch && s.autoOn && (
                      <Link
                        href="/mypage/media/work"
                        className="flex-none text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:border-slate-300"
                      >
                        自動をやめる
                      </Link>
                    )}
                    {/* ★★★ 書くだけのサイトの選ぶボタン（第111便）。
                        ★ 名前と状態の右に小さく置く。★ これが無いと、write にした店に
                          【止める道が画面から消える】（第111便で見つかった穴）。 */}
                    {choices.length > 0 && !canReadProvider(s.provider) && (
                      <span className="flex-none flex flex-wrap gap-2">
                        {choices.map((c) => (
                          <button
                            key={c.mode}
                            type="button"
                            onClick={() => setAsk({ site: s, choice: c })}
                            disabled={switching !== ''}
                            className="text-[13px] font-bold px-3 py-1.5 border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40"
                          >
                            {switching === s.provider + '#' + s.slot ? '変えています…' : c.label}
                          </button>
                        ))}
                      </span>
                    )}
                    {/* ★★ 未設定のときは「変える」を出さない。★ 変える先が決まっていない
                        ★ 書くだけのサイトは行き先が1つなので、すぐ上のボタンが出る（第111便） */}
                    {canReadProvider(s.provider) && s.canSwitch && !s.autoOn && s.direction === 'unset' && (
                      <Link
                        href="/mypage/media/login"
                        className="flex-none text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:border-slate-300"
                      >
                        設定する
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ★ 3文 → 2文にした（第90便）。★ 残りは押す前の問いに書いてある
            ★★★ 第111便: 読める媒体が無い店では homeChoiceNote が嘘になる。
              ★ 「◯◯とフクエスのどちらか一方です」は【選べる媒体がある店の事実】。
              ★ エステ魂だけの店には「どちらか一方」が無い。★ 別の1行に分ける。
            ★★ 選ぶボタンが1つも無いときは、選び方の説明そのものを出さない。 */}
        {(() => {
          const readableSite = sites.find((s) => s.canSwitch && !s.autoOn && canReadProvider(s.provider));
          const sendOnlySite = sites.find((s) => s.canSwitch && !s.autoOn && !canReadProvider(s.provider));
          const note = readableSite
            ? homeChoiceNote(readableSite.label)
            : sendOnlySite
              ? sendOnlyChoiceNote(sendOnlySite.label)
              : '';
          if (!note) return null;
          return (
            <p className="mt-3 text-[13px] text-slate-400 leading-relaxed text-center">{note}</p>
          );
        })()}
      </div>

      {/* ── ★★★ 押す前の問い（第88便）─────────────────────
          ★ ここで初めて【何が止まるか】を出す。★ 押したあとの文（switchDoneText）と対。
          ★ 既定は「やめる」側。★ 何もしないほうを、押しやすい位置に置く。 */}
      {ask && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAsk(null)}
        >
          <div
            className="w-full max-w-[360px] bg-white border border-slate-200 shadow-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-black text-slate-800">
              {switchAskText(ask.choice.mode, ask.site.label, ask.site.provider).title}
            </p>
            <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
              {switchAskText(ask.choice.mode, ask.site.label, ask.site.provider).body}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="px-4 py-1.5 border border-slate-200 text-[14px] font-bold text-slate-500 hover:bg-slate-50"
              >
                やめる
              </button>
              <button
                type="button"
                onClick={() => { const a = ask; setAsk(null); void onSwitch(a.site, a.choice.mode); }}
                disabled={switching !== ''}
                className="px-4 py-1.5 border border-indigo-600 bg-indigo-600 text-[14px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {ask.choice.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ★★ 用事のタイル（4枚）は第117便で外した（カッキーさん・2026-09-03）。
          ★ 左サイドバーに同じ4つが常に出ているので、同じ行き先が画面に二度並んでいた。
          ★ 出勤の「最後に送った日時」だけはこのタイルにしか無かったが、
            上の枠（媒体ごとの行）に「最後の反映 9/2 22:38」として出ているので落として差し支えない。 */}
    </div>
  );
}
