'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getMediaOverview, setMediaLinkMode } from '@/app/actions/mediaCredentials';
import { switchChoices, switchDoneText, type SiteDirection } from '@/lib/mediaOverview';

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

const PILL: Record<string, string> = {
  read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  write: 'bg-sky-50 text-sky-700 border-sky-200',
  // ★ off は【選んだ結果】。★ 未設定の灰色と分ける（第87便）
  off: 'bg-slate-100 text-slate-600 border-slate-300',
  unset: 'bg-white text-slate-400 border-slate-200',
};

function TileIcon({ name }: { name: 'work' | 'diary' | 'roster' | 'log' }) {
  const common = {
    width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'work':
      return (<svg {...common}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>);
    case 'diary':
      return (<svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case 'roster':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        </svg>
      );
    default:
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
  }
}

function Tile({ href, icon, title, sub }: {
  href: string; icon: 'work' | 'diary' | 'roster' | 'log'; title: string; sub: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-0.5 text-left bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4 hover:border-indigo-200 transition-colors"
    >
      <span className="w-7 h-7 mb-1.5 grid place-items-center bg-indigo-50 text-indigo-600">
        <TileIcon name={icon} />
      </span>
      <span className="text-[13px] font-bold text-slate-700">{title}</span>
      <span className="text-[11px] text-slate-400">{sub}</span>
    </Link>
  );
}

export function MediaHome({ salonId, salonName, onToast }: {
  salonId: number | null; salonName: string | null; onToast: (m: string) => void;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');

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
    onToast(switchDoneText(mode, s.label));
  };

  const sites = data?.sites ?? [];
  const reading = sites.find((s) => s.direction === 'read') ?? null;
  const writing = sites.filter((s) => s.direction === 'write');

  return (
    <div className="space-y-3">

      {/* ── 取り込みの状態 ────────────────────────────────
          ★ いちばん上は【状態】だけ。★ 操作も説明も置かない。 */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        {loading ? (
          <p className="text-[12px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-600 leading-relaxed">
            連携の状態を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : reading ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-black text-slate-800">
                  {reading.label}から取り込んでいます
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">{salonName ?? ''}</p>
              </div>
              {/* ★ 見出しが「◯◯から取り込んでいます」なので、印も同じ言葉で置く。
                  ★ 「読み込み」は下の行の【どこで入力するか】とぶつかる（第86便） */}
              <span className={`flex-none text-[11px] font-bold px-3 py-0.5 border ${PILL.read}`}>
                取り込み中
              </span>
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 overflow-hidden">
              <div className="bg-white px-3 py-2.5">
                <dt className="text-[10px] font-bold text-slate-400">セラピスト</dt>
                <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                  {data?.therapistCount ?? 0}<span className="text-[11px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-[10px] font-bold text-slate-400">最後の取り込み</dt>
                <dd className="text-[15px] font-black text-slate-800 tabular-nums">
                  {fmt(reading.listLastRunAt) || '—'}
                </dd>
              </div>
              <div className="bg-white px-3 py-2.5">
                <dt className="text-[10px] font-bold text-slate-400">次の取り込み</dt>
                {/* ★★ 分からない・止まっているときは時刻を出さない。
                    ★ 過ぎている時刻を「次」と書かない（mediaOverview.nextImportAt） */}
                <dd className="text-[15px] font-black text-slate-800 tabular-nums">
                  {reading.nextImportAt ? `${fmtTime(reading.nextImportAt)}ごろ` : '—'}
                </dd>
              </div>
            </dl>

            {reading.fullLastRunAt && (
              <p className="mt-2.5 text-[11px] text-slate-400">
                週間の予定は1日1回まとめて取り込みます（最後は {fmt(reading.fullLastRunAt)}）。
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[17px] font-black text-slate-800">取り込みはしていません</p>
            <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
              {writing.length > 0
                ? 'いまはフクエスで入力して、各サイトへ反映しています。'
                : 'まだどのサイトとも連携していません。ログイン情報を登録すると始められます。'}
            </p>
          </>
        )}
      </div>

      {/* ── 連携しているサイト ──────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-bold text-slate-700">連携しているサイト</h3>
          <Link
            href="/mypage/media/login"
            className="text-[11px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:border-slate-300"
          >
            ログイン情報
          </Link>
        </div>

        {loading ? (
          <p className="text-[12px] text-slate-400">読み込み中…</p>
        ) : sites.length === 0 ? (
          <p className="text-[12px] text-slate-400">まだ登録されていません。</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {sites.map((s) => (
              <div key={s.provider + '#' + s.slot} className="py-3">
                <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-[13px] font-bold text-slate-700">{s.label}</b>
                  <span className="block text-[11px] text-slate-400 tabular-nums">
                    {s.direction === 'read'
                      ? (fmt(s.listLastRunAt) ? `最後の読み取り ${fmt(s.listLastRunAt)}` : 'まだ読み取っていません')
                      : s.direction === 'write'
                        ? (fmt(s.lastWriteOkAt) ? `最後の反映 ${fmt(s.lastWriteOkAt)}` : 'まだ反映していません')
                        // ★★ 選んで止めているのだから、失敗のように書かない（§223）
                        : s.direction === 'off'
                          ? 'どこにも送らず、取り込みもしていません'
                          : (s.hasCredential ? '入力する場所が決まっていません' : 'ログイン情報がまだありません')}
                  </span>
                </span>
                <span className={`flex-none text-[11px] font-bold px-3 py-0.5 border ${PILL[s.direction] ?? PILL.unset}`}>
                  {s.statusLabel}
                </span>
                {/* ★ 切り替えを出すのは読める媒体だけ（mediaOverview.canSwitchDirection）。
                    ★ 書くだけのサイトに出すと、選べるように見えて選べない画面になる */}
                {/* ★ 自動で反映しているあいだは変えさせない。★ 先に自動をやめてもらう */}
                {s.canSwitch && s.autoOn && (
                  <Link
                    href="/mypage/media/work"
                    className="flex-none text-[11px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:border-slate-300"
                  >
                    自動をやめる
                  </Link>
                )}
                {/* ★★ 未設定のときは「変える」を出さない。★ 変える先が決まっていない */}
                {s.canSwitch && !s.autoOn && s.direction === 'unset' && (
                  <Link
                    href="/mypage/media/login"
                    className="flex-none text-[11px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:border-slate-300"
                  >
                    設定する
                  </Link>
                )}
                </div>

                {/* ★★ 選べる先は2つある（第87便）。★ 横に並べると名前が読めなくなるので下の段へ。
                    ★ いまの状態は出さない（switchChoices が外している） */}
                {s.canSwitch && !s.autoOn && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {switchChoices(s.direction as SiteDirection, s.label).map((c) => (
                      <button
                        key={c.mode}
                        type="button"
                        onClick={() => void onSwitch(s, c.mode)}
                        disabled={switching !== ''}
                        className="text-[11px] font-bold px-3 py-1.5 border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {switching === s.provider + '#' + s.slot ? '変えています…' : c.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
          出勤を入力する場所は、駅ちかとフクエスのどちらか一方です。両方には入れられません。
          「フクエスだけで使う」を選ぶと、どのサイトへも送らず、取り込みもしません。
          選べるのは駅ちかだけで、ほかのサイトへは反映するだけです。
        </p>
      </div>

      {/* ── 用事のタイル ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5">
        <Tile
          href="/mypage/media/work"
          icon="work"
          title="出勤を送る"
          sub={
            writing.length === 0
              ? 'いまは送っていません'
              : `${writing.length}サイトへ` + (fmt(writing[0].lastWriteOkAt) ? ` ・ 最後 ${fmt(writing[0].lastWriteOkAt)}` : '')
          }
        />
        <Tile
          href="/mypage/media/diary"
          icon="diary"
          title="写メ日記の投稿先"
          sub="駅ちか・エステラブ"
        />
        <Tile
          href="/mypage/media/therapists"
          icon="roster"
          title="セラピスト一覧"
          sub="どのサイトに出ているか"
        />
        <Tile
          href="/mypage/media/log"
          icon="log"
          title="連携の記録"
          sub="したことが残ります"
        />
      </div>
    </div>
  );
}
