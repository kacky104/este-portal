'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMediaOverview, setMediaLinkMode, setAllLinkModes } from '@/app/actions/mediaCredentials';
import {
  switchChoices, switchDoneText, switchAskText, homeHeadline, isReadingElsewhere, readingElsewhereLabel, offRowNote,
  isWritingElsewhere, writingElsewhereLabels, readBlockedNote, doubleWriteNote,
  sendOnlyChoiceNote, canReadProvider,
  bulkPlan, bulkAskText, bulkDoneText, bulkLabel, readLinkLabel,
  type SiteDirection, type SwitchChoice, type BulkTarget,
} from '@/lib/mediaOverview';
// ★ 同意の取り直しは、ログイン情報の中だけでは気づけない（第89便）。★ 入口にも出す
import { CONSENT_RECHECK_BADGE, consentRecheckNotice } from '@/lib/mediaConsent';
// ★ 反映の早見表（第212便〜第298便）は第299便で別ページ（/mypage/media/matrix・MatrixBoard.tsx）へ移した。
//   ★ ここには何も残さない（左サイドバーに行き先があるので、同じ行き先を二度並べない・第117便と同じ理由）。

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
  /** ★ そのサイトへ【いま】送れるものの名前（第193便）。★ ログイン情報の画面と同じ元 */
  capabilities: string[];
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
/**
 * ★★ 「いま動いている」見出しの演出（第296便・2026-09-12・カッキーさんの指示）。
 *   ★ 点滅（animate-pulse）から【キラリ】へ置き換えた。文字の上を光の帯が通る。
 *   ★ 中身は globals.css の .link-live-kirari（★ 色とkeyframeの正はあちら1か所）。
 *   ★★ 点滅と重ねない。★ animation は一括指定なので、2つ書くとどちらかが黙って消える。
 */
const LIVE_BLINK = 'link-live-kirari';
/**
 * ★ 速さは style で渡す（★ クラスに書くと並び順しだいで効かないことがある・style ならいつでも勝つ）。
 *   ★ 3秒に1回。★ 前半で通り（約1.65秒）、後半は休む（約1.35秒）。★ 忙しない光り方にしない。
 */
const LIVE_BLINK_STYLE = { '--lk-duration': '3s' } as React.CSSProperties;

/**
 * ★★ 行の右端に並ぶ小さな札・ボタンの【寸法】（第296便・2026-09-12・カッキーさんの指示）。
 *   ★ 「駅ちかから反映中」（状態の札）と「反映しない」（ボタン）と「反映なし」（状態の札）が
 *     ばらばらの高さ・幅だった。★ 寸法だけここに置いて、全部に同じものを付ける。
 *   ★ 高さは 34px で揃える。★ 幅は 112px を下限にする（★ 「反映なし」と「反映しない」が同じ幅になる）。
 *   ★ 中身は縦横とも中央。★ 色は各所のまま（★ ここは寸法だけを持つ）。
 */
const ROW_CHIP = 'flex-none inline-flex items-center justify-center text-center text-[13px] font-bold px-3 min-h-[34px] min-w-[112px] border';

const PILL: Record<string, string> = {
  read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  write: 'bg-sky-50 text-sky-700 border-sky-200',
  // ★ off は【選んだ結果】。★ 未設定の灰色と分ける（第87便）
  off: 'bg-slate-100 text-slate-600 border-slate-300',
  unset: 'bg-white text-slate-400 border-slate-200',
};

// ★ 用事のタイル（Tile / TileIcon）は第117便で外した。★ 左サイドバーと同じ行き先が二度並んでいたため

export function MediaHome({ salonId, onToast }: {
  salonId: number | null;
  /** ★ 店舗名は第119便で画面から外した（左のサイドバーに常に出ているため）。
      ★ 受け取らないが、型には残す（呼び出し側を変えない） */
  salonName?: string | null;
  onToast: (m: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');
  // ★ 押す前の問い（第88便）。★ null のあいだは何も出さない
  const [ask, setAsk] = useState<{ site: Site; choice: SwitchChoice } | null>(null);
  // ★★★ 一括ボタンの押す前の問い（第192便）。★ 1枠の問いとは別に持つ（押した範囲が違う）
  const [bulkAsk, setBulkAsk] = useState<BulkTarget | null>(null);
  const [bulking, setBulking] = useState(false);

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

  /**
   * ★★★ 一括で倒す（第192便）。★ 受け口（setAllLinkModes）が bulkPlan の順に1枠ずつ変える。
   * ★ 途中で止まったら、どこまで変わったかを文で返す（bulkDoneText）。★ 黙って続けない。
   */
  const onBulk = async (to: BulkTarget) => {
    if (salonId == null) return;
    setBulking(true);
    const res = await setAllLinkModes({ salonId, to });
    const back = await getMediaOverview({ salonId });
    if (back.ok) setData(back.data);
    setBulking(false);
    onToast(res.ok ? bulkDoneText(res.data) : res.error);
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
                {/* ★ 第312便: スマホでは時刻を1段小さく（★ 3つ並びで折り返さない大きさ） */}
                <dd className="text-[15px] sm:text-[17px] font-black text-slate-800 tabular-nums">
                  {fmt(reading.listLastRunAt) || '—'}
                </dd>
              </div>
              <div className="bg-white px-3 py-2.5 text-center">
                <dt className="text-[12px] font-bold text-slate-400">次の反映</dt>
                {/* ★★ 分からない・止まっているときは時刻を出さない。
                    ★ 過ぎている時刻を「次」と書かない（mediaOverview.nextImportAt） */}
                <dd className="text-[15px] sm:text-[17px] font-black text-slate-800 tabular-nums">
                  {reading.nextImportAt ? `${fmtTime(reading.nextImportAt)}ごろ` : '—'}
                </dd>
              </div>
            </dl>

            {/* ★★ 第310便（2026-09-12・カッキーさん）: 「（最後は 9/12 06:13）」を落とした。
                ★ 知りたいのは【いつ回るか】で、前回の時刻まではいらない。
                ★ 時刻を出さなくなったので、前回が有るかどうかで出し分けるのもやめた
                  （★ 「朝6時台に反映」は、まだ1度も回っていなくても正しい）。 */}
            <p className="mt-2.5 text-[13px] text-slate-400 text-center">
              週間の予定は1日1回の朝6時台に反映。
            </p>
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
        {/* ★★★ 3つの設定（第192便・設計メモ_フクエスリンクの3つの設定ボタン_2026-09-07.md）
            ★ 主ボタン「フクエスから反映」（設定2・ゴール）＝色付き・大。
            ★ 副ボタン「どのサイトにも反映しない」（設定3）＝白。
            ★ 「駅ちかから反映にする ›」（設定1）＝小さな文字リンク・下。★ わざと押しにくくする
              （「フクエスからの反映は設定しやすく、駅ちかからの反映は設定しにくく」・カッキーさん）。
            ★★ 一括で変えるのは主・副だけ。★ 小リンクは駅ちか1枠を変えるだけで、
              ほかが write なら従来のガード（第190便）で断られる（一括で倒さない・案A）。 */}
        {(() => {
          if (loading || error || sites.length === 0) return null;
          const switchable = sites.filter((s) => s.canSwitch);
          if (switchable.length === 0) return null;
          const busy = switching !== '' || bulking;
          const write = bulkLabel('write');
          const none = bulkLabel('none');
          // ★ 設定1のリンク。★ 読める媒体で、鍵があり、まだ read でない枠に出す
          // ★★★★ 第343便（2026-09-13・カッキーさんが実機で発見）: 【!s.autoOn を外した】。
          //   ★ 自動にした枠では、このリンクも行のボタンも消えて、
          //     **ホームから「駅ちかから反映」へ戻る道が1つも無くなっていた**（行き止まり）。
          //   ★ 第331便で自動を選べるようになって、初めてこの穴に入った。
          //   ★★ link_mode は1つの列なので、read にすれば自動は定義上そこで終わる。
          //     ★ 矛盾した状態（read なのに write_auto）は作れない。★ だから塞ぐ理由が無い。
          const readable = sites.find((s) => canReadProvider(s.provider) && s.canSwitch && s.direction !== 'read') ?? null;
          const onReadLink = () => {
            if (!readable) return;
            const others = sites.map((x) => ({ provider: x.provider, slot: x.slot, direction: x.direction, label: x.label }));
            const me = { provider: readable.provider, slot: readable.slot };
            const choices = switchChoices(
              readable.direction as SiteDirection, readable.label, readable.provider,
              isReadingElsewhere(others, me), isWritingElsewhere(others, me),
            );
            const read = choices.find((c) => c.mode === 'read');
            // ★★ 出せない理由を黙らない（第190便）。★ 先にほかの「反映しない」を押してもらう
            if (!read) { onToast(readBlockedNote(readable.label, writingElsewhereLabels(others, me))); return; }
            setAsk({ site: readable, choice: read });
          };
          return (
            <div className="pb-4 mb-2 border-b border-slate-100">
              {/* ★ 2つのボタンは【同じ幅】にする（第296便・2026-09-12・カッキーさんの指示）。
                  ★ 文字数が違うので、横に並べるだけだと幅が揃わない。
                  ★ 2等分の枠（grid-cols-2）に入れて、中身の長さで幅が動かないようにした。
                  ★ 狭いときは縦に積む（そのときも幅は同じ）。 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[560px] mx-auto">
                <button
                  type="button"
                  onClick={() => setBulkAsk('write')}
                  disabled={busy}
                  className="w-full px-4 py-3.5 border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40"
                >
                  <span className="block text-[16px] font-black">{bulking ? '変えています…' : write.label}</span>
                  <span className="block text-[12px] font-bold text-indigo-100">（{write.sub}）</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkAsk('none')}
                  disabled={busy}
                  className="w-full px-4 py-3.5 border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40"
                >
                  <span className="block text-[16px] font-bold">{none.label}</span>
                  <span className="block text-[12px] font-bold text-slate-400">（{none.sub}）</span>
                </button>
              </div>
              {/* ★★ 説明文は大きなボタンの【直下】に置く（第192便）。★ エステ魂の行の真下に置くと、
                  エステ魂の説明に読める（カッキーさんが実際にそう読んだ） */}
              {(() => {
                // ★★ 第310便（カッキーさん）: 読める媒体があるときの1行
                //   （homeChoiceNote＝「出勤の反映は、フクエスと駅ちかのどちらか一方です。」）は出さない。
                //   ★ ボタンが2つ並んでいて片方が濃い色、という形そのものが「どちらか一方」を言っている。
                //   ★★ 送るだけの媒体しか無い店舗様の1行（sendOnlyChoiceNote）は残す。
                //     ★ あちらは【送るだけ】という別の事実で、見ただけでは分からない。
                //   ★ 出し分けの順番は変えていない（★ 読める媒体があれば、送るだけの文は出さない）。
                // ★ 第343便: !s.autoOn を外した（上のリンクと同じ理由）
                const readableSite = sites.find((s) => s.canSwitch && canReadProvider(s.provider));
                const sendOnlySite = sites.find((s) => s.canSwitch && !canReadProvider(s.provider));
                const note = readableSite
                  ? ''
                  : sendOnlySite
                    ? sendOnlyChoiceNote(sendOnlySite.label)
                    : '';
                if (!note) return null;
                return (
                  <p className="mt-3 text-[13px] text-slate-400 leading-relaxed text-center">{note}</p>
                );
              })()}
              {readable && (
                <p className="mt-3 text-center">
                  <button
                    type="button"
                    onClick={onReadLink}
                    disabled={busy}
                    className="text-[13px] font-bold text-slate-400 underline underline-offset-4 hover:text-slate-600 disabled:opacity-40"
                  >
                    {readLinkLabel(readable.label)} ›
                  </button>
                </p>
              )}
            </div>
          );
        })()}

        {/* ★★★ 見出し・ログイン情報のリンク・サイト名・最後の読み取り・いまの状態の印を外した
            （第90便・カッキーさん）。★ すぐ上のブロックに同じことが書いてあり、二度読ませていた。
            ★ ログイン情報へは左の並びから行ける。
          ★★★ 第192便: 行はサイトごとの【名前・状態・個別の「反映しない」】だけにした。
            ★ 読める媒体の大きなボタン（read / write）は上の3つの設定へ移した。★ 止める道は行に必ず残す（第111便）。 */}
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : sites.length === 0 ? (
          <p className="text-[14px] text-slate-400">まだ登録されていません。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sites.map((s) => {
              // ★ 自動で反映しているあいだは変えさせない。★ 先に自動をやめてもらう。
              // ★★ 第111便: provider を渡す。★ 書くだけのサイトには 'read' を出さない
              // ★★★ ほかの媒体が正本のあいだは 'write' を出さない（第127便）。
              // ★★★ 逆側（第190便）: ほかの媒体へフクエスから反映しているあいだは 'read' を出さない
              const others = sites.map((x) => ({ provider: x.provider, slot: x.slot, direction: x.direction, label: x.label }));
              const me = { provider: s.provider, slot: s.slot };
              const elsewhere = isReadingElsewhere(others, me);
              const writingElsewhere = isWritingElsewhere(others, me);
              // ★★★★ 第343便: 自動中でも【止める道】を残す。★ !s.autoOn を外した。
              //   ★ 自動にしたとたん「反映しない」も消えていた。★ 第111便で塞いだ穴と同じ形になっていた。
              const all = s.canSwitch
                ? switchChoices(s.direction as SiteDirection, s.label, s.provider, elsewhere, writingElsewhere)
                : [];
              // ★★★ 第192便: 読める媒体（駅ちか）の行には【個別の「反映しない」】だけを出す。
              //   ★ read / write へは上の3つの設定（一括ボタン・小リンク）から入る。★ 同じボタンを2か所に出さない。
              //   ★ 書くだけの媒体は従来どおり（write / none）。★ 行き先が1つしかないので迷わない（第111便）。
              const choices = canReadProvider(s.provider) ? all.filter((c) => c.mode === 'none') : all;
              // ★★★ 禁止の組み合わせが【既にできている】か（第190便）。★ write の行で、ほかが正本のとき
              const dbl = s.direction === 'write' ? doubleWriteNote(s.label, readingElsewhereLabel(others, me)) : null;

              return (
                <div key={s.provider + '#' + s.slot} className="py-3">
                  {/* ★★★ 第312便（2026-09-12・カッキーさんの指示）: スマホは【縦に積む】。
                      ★ 横1列のままだと、サイト名＋チップ＋状態の札＋ボタンが 360px に入らず、
                        名前が1文字ずつ折り返すか、ボタンが潰れていた。
                      ★ PC（md以上）の見た目は1つも変えない。★ 右側のまとまりは md:contents で
                        包みを透明にし、これまでどおり行の直接の子として並ぶ。 */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
                    <span className="min-w-0 flex-1">
                      {/* ★★ 送れるもののチップをサイト名の【すぐ右】に（第193便・カッキーさん）。
                          ★ 「送れるもの：」の文字は付けない（右に「◯◯から反映中」とあるので、言葉が重なる）。
                          ★★ 置くのは名前の側。★ 右端の状態の印のそばに置くと「この4つをいま反映している」と読める。
                            ★ 左は【できること】、右は【いまの状態】。★ 見た目はログイン情報の画面と同じ灰色のチップ。 */}
                      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <b className="text-[15px] font-bold text-slate-700">{s.label}</b>
                        {(s.capabilities ?? []).map((c) => (
                          <span key={c} className="inline-block text-[12px] leading-5 border border-slate-200 text-slate-500 px-1.5">
                            {c}
                          </span>
                        ))}
                      </span>
                      <span className={`block text-[13px] tabular-nums ${dbl ? 'text-amber-800 font-bold' : 'text-slate-400'}`}>
                        {/* ★★ 止まっているときは、時刻より先に【止まっていること】を書く（第89便） */}
                        {s.needsConsent
                          ? '同意の取り直しが必要です。いまは何も更新していません'
                          : s.direction === 'read'
                          // ★ 第313便（カッキーさん）: 時刻の見出しは【最終確認】にそろえた（★ 第310便の「最後の更新」から）
                          //   （★ 「読む」はこちら側の動き。★ 店舗様から見て起きるのは、この画面の中身が新しくなること）
                          ? (fmt(s.listLastRunAt) ? `最終確認 ${fmt(s.listLastRunAt)}` : 'まだ確認していません')
                          : s.direction === 'write'
                            // ★★★ 禁止の組み合わせが既にできているとき（第190便）は、時刻より先にそれを言う
                            ? (dbl ?? (fmt(s.lastWriteOkAt) ? `最後の反映 ${fmt(s.lastWriteOkAt)}` : 'まだ反映していません'))
                            // ★★ 選んで止めているのだから、失敗のように書かない（§223）
                            : s.direction === 'off'
                              // ★ 文言は mediaOverview.offRowNote（第189便）。★ ほかが正本なら理由も言う
                            ? offRowNote(s.label, readingElsewhereLabel(others, me))
                              : (s.hasCredential ? '入力する場所が決まっていません' : 'ログイン情報がまだありません')}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2 md:contents">
                    {s.needsConsent && (
                      <span className={`${ROW_CHIP} bg-amber-50 text-amber-800 border-amber-300`}>
                        {CONSENT_RECHECK_BADGE}
                      </span>
                    )}
                    <span className={`${ROW_CHIP} ${PILL[s.direction] ?? PILL.unset}`}>
                      {s.statusLabel}
                    </span>
                    {s.canSwitch && s.autoOn && (
                      <Link
                        href="/mypage/media/work"
                        className={`${ROW_CHIP} border-slate-200 text-slate-500 hover:border-slate-300`}
                      >
                        自動をやめる
                      </Link>
                    )}
                    {/* ★★★ サイトごとの選ぶボタン（第111便）。
                        ★ 名前と状態の右に小さく置く。★ これが無いと、write にした店に
                          【止める道が画面から消える】（第111便で見つかった穴）。 */}
                    {choices.length > 0 && (
                      <span className="flex-none flex flex-wrap gap-2">
                        {choices.map((c) => (
                          <button
                            key={c.mode}
                            type="button"
                            onClick={() => setAsk({ site: s, choice: c })}
                            disabled={switching !== '' || bulking}
                            className={`${ROW_CHIP} border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-40`}
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
                        className={`${ROW_CHIP} border-slate-200 text-slate-500 hover:border-slate-300`}
                      >
                        設定する
                      </Link>
                    )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ★ 反映の早見表（折りたたみ）はここにあったが、第299便で /mypage/media/matrix へ移した。 */}

      {/* ── ★★★ 一括ボタンの押す前の問い（第192便）──────────
          ★ 名前を列挙する（何が変わり、何が変わらないか）。★ 「どのサイトにも反映しない」は取り込みも止まると必ず言う。
          ★ 変えるところが無ければ、押す側のボタンを出さない（問いだけ出して何も起きない、を避ける）。 */}
      {bulkAsk && (() => {
        const plan = bulkPlan(
          sites.map((s) => ({ provider: s.provider, slot: s.slot, label: s.label, direction: s.direction, hasCredential: s.hasCredential, autoOn: s.autoOn })),
          bulkAsk,
        );
        const text = bulkAskText(plan);
        const go = plan.steps.length > 0;
        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setBulkAsk(null)}
          >
            <div
              className="w-full max-w-[380px] bg-white border border-slate-200 shadow-lg p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[17px] font-black text-slate-800">{text.title}</p>
              <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">{text.body}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkAsk(null)}
                  className="px-4 py-1.5 border border-slate-200 text-[14px] font-bold text-slate-500 hover:bg-slate-50"
                >
                  {go ? 'やめる' : '閉じる'}
                </button>
                {go && (
                  <button
                    type="button"
                    onClick={() => { const t = bulkAsk; setBulkAsk(null); void onBulk(t); }}
                    disabled={bulking || switching !== ''}
                    className="px-4 py-1.5 border border-indigo-600 bg-indigo-600 text-[14px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
                  >
                    {bulkLabel(bulkAsk).label}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

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
