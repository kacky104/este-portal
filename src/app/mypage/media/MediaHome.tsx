'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMediaOverview, setMediaLinkMode, setAllLinkModes } from '@/app/actions/mediaCredentials';
import {
  switchChoices, switchDoneText, switchAskText, homeHeadline, isReadingElsewhere,
  isWritingElsewhere, writingElsewhereLabels, readBlockedNote,
  canReadProvider,
  bulkPlan, bulkAskText, bulkDoneText, bulkLabel, readLinkLabel,
  autoOffWorkSites, autoOffNoticeText,
  type SiteDirection, type SwitchChoice, type BulkTarget,
} from '@/lib/mediaOverview';
// ★ 同意の取り直しは、ログイン情報の中だけでは気づけない（第89便）。★ 入口にも出す
import { consentRecheckNotice } from '@/lib/mediaConsent';
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
  /** ★ 第348便: 最後に【内容を確かめた】時刻。★ 「最終確認」に使う */
  planCheckedAt: string | null;
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

// ★ 行の札・ボタンの寸法（ROW_CHIP・PILL）は第682便でサイトごとの行と一緒に外した。

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

  // ★★★ 第668便（2026-09-22・カッキーさんの決定）: フクエスリンクは【駅ちかから反映（取り込み）専用】。
  //   ★ ホームに出すのは読める媒体（駅ちか）だけ。★ 書き込み（フクエスから反映）の道はコネックエフへ移した。
  //   ★ ほかの媒体の設定・鍵は消していない（コネックエフが同じ表を使う）。★ 画面に出さないだけ。
  const sites = (data?.sites ?? []).filter((s) => canReadProvider(s.provider));
  // ★★★ 同意の取り直しが要る枠（第89便）。★ 入口のいちばん上に出す
  const recheck = sites.filter((s) => s.needsConsent);
  // ★★★★ 第393便: 反映する向きなのに、出勤がまだ自動更新でない枠。★ 判定は mediaOverview（純粋関数）
  // ★ 第668便: 出勤の自動更新（書き込み）はコネックエフへ移したので、ここでは出さない
  const autoOffWork: typeof sites = [];
  void autoOffWorkSites;
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

      {/* ── ★★★★ 出勤の自動更新が未設定（第393便・2026-09-16・カッキーさんの指示）──────
          ★★ 「フクエスから反映」にした時点で出勤も自動になる、と思って止まっている店舗様が居る。
            ★ 押すときの赤字（一括の問い）は【そのとき】しか出ない。★ 読み飛ばすと二度と出てこない。
          ★ ここは【いまその状態である】ことを出す場所。★ 直したら消える（残り続けない）。
          ★ 判定は autoOffWorkSites（純粋関数）。★ この画面では数えない・決めない。
          ★ 同意の取り直し（上）と同じ形。★ あちらは琥珀、こちらは赤（★ 出勤が止まっているため）。 */}
      {!loading && !error && autoOffWork.length > 0 && (
        <div className="border-2 border-rose-300 bg-rose-50 p-4">
          <p className="text-[15.5px] font-black text-rose-700">
            {autoOffNoticeText(autoOffWork.map((s) => s.label)).title}
          </p>
          <p className="mt-1 text-[14px] text-rose-900/80 leading-relaxed">
            {autoOffNoticeText(autoOffWork.map((s) => s.label)).body}
          </p>
          <Link
            href="/mypage/media/work"
            className="inline-block mt-2.5 px-3 py-1.5 border border-rose-400 bg-white text-[13.5px] font-bold text-rose-700 hover:bg-rose-100"
          >
            出勤の自動更新設定を開く
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
                  （★ 「朝6時台に更新」は、まだ1度も回っていなくても正しい）。
                ★ 第393便（2026-09-16・カッキーさん）: 「週間の予定は…反映」→「週間出勤は…更新」。
                  ★ 「予定」はフクエスの言葉ではない。★ 店舗様が見ているものの名前（週間出勤）で言う。 */}
            <p className="mt-2.5 text-[13px] text-slate-400 text-center">
              週間出勤は1日1回の朝6時台に更新。
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
                : '駅ちかのお店のページが登録されると始められます。運営事務局へご連絡ください。'}
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
        {/* ★★★ 第668便: 3つの設定（フクエスから反映／反映しない／駅ちかから反映）は、
            【駅ちかから反映する】ボタン1つにした。★ 止める道（反映しない）は下の行に残る（第111便）。
            ★ 書き込み（フクエスから反映）はコネックエフへ（★ ボタンの下に案内を1行）。 */}
        {(() => {
          if (loading || error || sites.length === 0) return null;
          const readable = sites.find((s) => s.canSwitch && s.direction !== 'read') ?? null;
          if (!readable) return null;
          const busy = switching !== '' || bulking;
          const onReadLink = () => {
            const others = (data?.sites ?? []).map((x) => ({ provider: x.provider, slot: x.slot, direction: x.direction, label: x.label }));
            const me = { provider: readable.provider, slot: readable.slot };
            const choices = switchChoices(
              readable.direction as SiteDirection, readable.label, readable.provider,
              isReadingElsewhere(others, me), isWritingElsewhere(others, me),
            );
            const read = choices.find((c) => c.mode === 'read');
            // ★★ 出せない理由を黙らない（第190便）
            if (!read) { onToast(readBlockedNote(readable.label, writingElsewhereLabels(others, me))); return; }
            setAsk({ site: readable, choice: read });
          };
          return (
            <div className="pb-4 mb-2 border-b border-slate-100 text-center">
              <button
                type="button"
                onClick={onReadLink}
                disabled={busy}
                className="w-full max-w-[360px] px-4 py-3.5 border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-40"
              >
                <span className="block text-[16px] font-black">{readLinkLabel(readable.label)}</span>
              </button>
              <p className="mt-3 text-[13px] text-slate-400 leading-relaxed">
                各サイトへの書き込み（出勤・写メ日記の転送など）は<Link href="/mypage/conecf" className="underline font-bold text-indigo-600">コネックエフ</Link>で行います。
              </p>
            </div>
          );
        })()}

        {/* ★★★ 第682便（2026-09-23・カッキーさんの指示）: サイトごとの行（駅ちか＋チップ＋最終確認＋札＋ボタン）を消した。
            ★ フクエスリンクは「駅ちかから反映する／しない」だけ（第668便）。★ 上の箱にすでに全部書いてある。
            ★ 止める道（反映しない）だけは必ず残す（第111便）。★ 小さな文字リンクにして、押す前の問いは今までどおり。 */}
        {!loading && !error && reading && reading.canSwitch && (() => {
          const others = sites.map((x) => ({ provider: x.provider, slot: x.slot, direction: x.direction, label: x.label }));
          const me = { provider: reading.provider, slot: reading.slot };
          const stop = switchChoices(
            reading.direction as SiteDirection, reading.label, reading.provider,
            isReadingElsewhere(others, me), isWritingElsewhere(others, me),
          ).find((c) => c.mode === 'none');
          if (!stop) return null;
          return (
            <p className="text-center">
              <button
                type="button"
                onClick={() => setAsk({ site: reading, choice: stop })}
                disabled={switching !== '' || bulking}
                className="text-[13px] text-slate-400 underline hover:text-slate-600 disabled:opacity-40"
              >
                {switching === reading.provider + '#' + reading.slot ? '変えています…' : '駅ちかからの反映をやめる'}
              </button>
            </p>
          );
        })()}
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
              {/* ★★★★ 第393便（2026-09-16・カッキーさん）: いちばん大事な一文は【赤字で別の行】に。
                  ★ 「フクエスから反映」にした時点で出勤も自動更新になる、と読む方が居るため。
                  ★ 本文にまぜない。★ まぜると読み飛ばされる（それが今までの形だった）。 */}
              {text.note && (
                <p className="mt-2 text-[14px] font-bold text-rose-600 leading-relaxed border border-rose-200 bg-rose-50 px-3 py-2">
                  {text.note}
                </p>
              )}
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
            {/* ★ 第684便: 本文が空の問い（駅ちかからの反映を止めますか？）は見出しだけ */}
            {switchAskText(ask.choice.mode, ask.site.label, ask.site.provider).body && (
              <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
                {switchAskText(ask.choice.mode, ask.site.label, ask.site.provider).body}
              </p>
            )}
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
