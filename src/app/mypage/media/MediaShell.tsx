'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMediaLinkAlerts } from '@/app/actions/mediaCredentials';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';
import type { MediaPageDecision } from '@/lib/mediaVisibility';

// 媒体連携のページの外枠 ——【フクエスリンク】（第60便で見た目を差し替え）。
//
// ★★★ なぜ別サイトの見た目にするか（2026-08-30・カッキーさんの決定）
//   媒体連携は、店舗にとって「フクエスの1機能」ではなく【他媒体をまとめる道具】。
//   ★ フクエスワーク・fukuX と同じく、別の名前と見た目を持たせる。
//   ★ 名前は「フクエスリンク」。色は紺（本体のピンクからも、ベンリーの青緑からも離す）。
//
// ★ 骨格はベンリーに寄せた（2026-08-30 の実物調査・設計メモ §152）:
//   左サイドバーで1画面1機能／いまどこにいるかが常に見える／地はグレー・カードは白。
//
// ★★ 中身の決めごとは変えていない。
//   状態を上に、説明は本文から追い出す、できないことは理由といっしょに出す。
// ★ 足場だった /mypage/media/all（全部入り）は第65便で畳んだ。
//   ★ 6つの画面すべてが、この外枠を被って同じ形で並ぶ。

// ★ 'all'（全部入り）は第65便で畳んだ。★ 型からも外して、行き先を作れなくする
// ★ 'matrix'（反映の早見表）は第299便で追加（ホームの折りたたみから独立）
export type MediaNavKey = 'home' | 'work' | 'diary' | 'news' | 'roster' | 'login' | 'log' | 'matrix';

const NAV: Array<{ key: MediaNavKey; label: string; href: string; group?: string }> = [
  { key: 'home',   label: 'ホーム',           href: '/mypage/media' },
  // ★★ ログイン情報はホームの次（カッキーさん・2026-09-03）。
  //   ★ ここが埋まらないと他の画面が何もできない＝【最初にやること】なので、いちばん近くに置く。
  //   ★ 以前は下の「設定・記録」に入れていたが、始めるときにいちばん探されるのがここだった。
  // ★ 第299便: 「ログイン情報」→「ログイン情報（ID・PW）」（カッキーさん）。
  //   ★ 何を入れる場所なのかを、開く前に見せる。★ ページの見出しも同じ言葉にそろえた。
  { key: 'login',  label: 'ログイン情報（ID・PW）', href: '/mypage/media/login' },
  // ★ セラピスト設定は【基本の情報】なので、送る作業より上に置く（カッキーさん・2026-08-30）
  // ★ 第298便: 名前を「セラピスト一覧」→「セラピスト設定」に（カッキーさんの添削）
  { key: 'roster', label: 'セラピスト設定',    href: '/mypage/media/therapists' },
  { key: 'work',   label: '出勤を送る',        href: '/mypage/media/work',       group: '送る・確かめる' },
  { key: 'diary',  label: '写メ日記の投稿先',   href: '/mypage/media/diary' },
  // ★ 新着情報（第158便）。★ 「送る」仲間なのでここに置く。
  //   ★★ 送る前に【枠の状態】を見せる画面でもある（2026-09-05 の実弾で、送ってから
  //     「公開ページに出ていない」と分かった。★ その順番を逆にするための画面）。
  // ★ 第206便（2026-09-07・カッキーさん）: 「新着情報を送る」→「駅ちかの新着情報」。
  //   ★ 出勤・写メ日記の「フクエスの内容を各サイトへ送る」仲間ではなく、駅ちか専用の書式で自動で回す別物。
  //     ★ read でも write でも出す（3つの設定に連動しない・設計メモ_写メ日記の入口をホームの設定に連動 §4）。
  { key: 'news',   label: '駅ちかの新着情報',     href: '/mypage/media/news' },
  // ★ 設定（ログイン情報）が上へ移ったので、この見出しは「記録」だけになった
  { key: 'log',    label: '連携の記録',        href: '/mypage/media/log',        group: '記録' },
  // ★ 反映の早見表（第299便・2026-09-12・カッキーさん）。★ ホームの下の折りたたみをやめて別ページに。
  //   ★ 置き場は「連携の記録」の下（カッキーさんの指示）。★ 記録と同じく【読むだけ】の画面なので同じ見出しの中。
  { key: 'matrix', label: '反映の早見表',      href: '/mypage/media/matrix' },
];

function NavIcon({ k }: { k: MediaNavKey }) {
  const p = {
    width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    className: 'flex-shrink-0',
  };
  switch (k) {
    case 'home':   return (<svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>);
    case 'work':   return (<svg {...p}><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>);
    case 'diary':  return (<svg {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>);
    case 'roster': return (
      <svg {...p}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    );
    case 'login':  return (<svg {...p}><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>);
    // ★ 吹き出し（お知らせ）。★ 写メ日記の封筒とも、出勤の矢印とも見分けがつく形
    case 'news':   return (<svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);
    // ★ 表（升目）。★ 早見表＝表なので、そのままの形にした（第299便）
    case 'matrix': return (<svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16" /></svg>);
    default:       return (<svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
  }
}

export function MediaShell({
  decision, loadError, salonId, salonName, title, current, toast, children,
}: {
  decision: MediaPageDecision;
  loadError: string;
  salonId: number | null;
  salonName?: string | null;
  title: string;
  current: MediaNavKey;
  toast?: string;
  children: React.ReactNode;
}) {
  const [alerts, setAlerts] = useState<MediaLinkAlert[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ★ 出す相手にしか取りに行かない（取りに行くこと自体が媒体連携の存在を明かすため）。
  //   ★ 失敗しても画面は止めない。警告が出せないことを「異常なし」と見せないだけ。
  useEffect(() => {
    if (decision !== 'show' || salonId == null) { setAlerts([]); return; }
    let alive = true;
    (async () => {
      const res = await getMediaLinkAlerts({ salonId });
      if (alive && res.ok) setAlerts(res.data);
    })();
    return () => { alive = false; };
  }, [decision, salonId]);

  // ★★ スマホの左ドロワー（第296便・2026-09-12・カッキーさんの指示）。
  //   ★ フクエスワーク（WorkShell）・公式HP管理（HpShell）と同じ作り。
  //   ★ 開いている間は後ろを動かさない／Esc で閉じる。
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [drawerOpen]);

  // ★★ 'show' 以外では【そもそも描かない】。hidden で隠すとページの中身から読めてしまう。
  if (decision === 'leave') return null;

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500 text-[16px] whitespace-pre-line text-center leading-relaxed px-6">{loadError}</p>
      </div>
    );
  }

  if (decision !== 'show') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-[16px]">読み込み中...</p>
      </div>
    );
  }

  // ★ サイドバーとドロワーで同じ並びを使う（第296便）。★ 片方だけ直す事故を起こさない。
  const navList = (onPick?: () => void) =>
    NAV.map((n) => {
      const on = n.key === current;
      return (
        <div key={n.key} className="contents">
          {n.group && (
            <div className="px-4 pt-3.5 pb-1 text-[13px] font-bold text-slate-400 tracking-wider">
              {n.group}
            </div>
          )}
          <Link
            href={n.href}
            onClick={onPick}
            aria-current={on ? 'true' : undefined}
            className={`relative flex items-center gap-2.5 whitespace-nowrap px-4 py-3 text-[15px] md:text-[16px] font-bold transition-colors ${
              on
                ? 'bg-gradient-to-r from-indigo-700 to-indigo-500 text-white'
                : 'text-slate-600 hover:bg-indigo-50'
            }`}
          >
            <span className={on ? 'text-white' : 'text-indigo-500'}><NavIcon k={n.key} /></span>
            {n.label}
            {/* ★ 選択中の右端に三角（ベンリーと同じ合図）。★ スマホでは出さない */}
            {on && (
              <span className="hidden md:block absolute -right-px top-1/2 -translate-y-1/2 w-0 h-0 border-y-[8px] border-y-transparent border-r-[8px] border-r-slate-100" />
            )}
          </Link>
        </div>
      );
    });

  // ★ 地の色（ブルーのテーマ壁紙）は layout.tsx が敷く。★ ここでは塗らない（★ 塗ると壁紙が隠れる）。
  return (
    <div className="min-h-screen md:flex">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-white border border-indigo-200 shadow-lg px-6 py-3 text-[16px] font-bold text-indigo-700">
          {toast}
        </div>
      )}

      {/* ── 左サイドバー（★ PCだけ。スマホは三本線→ドロワー・第296便）───────── */}
      <aside className="hidden md:block bg-white md:border-r border-slate-200 md:w-[288px] md:flex-none md:min-h-screen md:sticky md:top-0 md:self-start">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-100">
          <span className="w-9 h-9 flex-none grid place-items-center text-white bg-gradient-to-br from-indigo-700 to-indigo-500">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <b className="text-[18px] font-black text-slate-800 tracking-tight">フクエスリンク</b>
        </div>

        {salonName && (
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-[12.5px] font-bold text-slate-400 tracking-wider">店舗</div>
            <div className="text-[15.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
          </div>
        )}

        <nav aria-label="画面" className="flex flex-col py-2">{navList()}</nav>

        <p className="px-4 py-3.5 mt-2 border-t border-slate-100 text-[13.5px] text-slate-400 leading-relaxed">
          駅ちか・エステラブ・エステ魂・全国エステランキングとの連携をまとめて扱います。
        </p>
      </aside>

      {/* ── 右側 ───────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          {/* ★ スマホの頭の帯（第296便）。★ 押すとホームへ戻る（フクエスワーク・公式HP管理と同じ作法）。 */}
          <Link
            href="/mypage/media"
            aria-label="ホームへ"
            className="md:hidden flex w-full items-center gap-2.5 px-4 py-2.5 text-left bg-gradient-to-r from-indigo-700 to-indigo-500"
          >
            <span className="w-7 h-7 flex-none grid place-items-center bg-white text-indigo-600">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <b className="text-[16px] font-black text-white tracking-tight">フクエスリンク</b>
            {salonName && (
              <span className="ml-auto text-[11.5px] font-bold text-white/85 truncate max-w-[45%]">{salonName}</span>
            )}
          </Link>

          <div className="px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {/* ★ スマホだけ: 画面名の【左】に三本線。 */}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-label="メニューを開く"
                aria-expanded={drawerOpen}
                className="md:hidden -ml-1 p-1 text-indigo-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <h1 className="text-[17px] font-black text-slate-800 truncate">{title}</h1>
            </div>
            <Link href="/mypage" className="flex-none text-[13.5px] font-bold text-slate-400 hover:text-indigo-600 transition-colors whitespace-nowrap">
              マイページへ戻る
            </Link>
          </div>

          {alerts.length > 0 && (
            <div className="px-4 md:px-6 pb-2.5">
              {alerts.map((a) => (
                <div
                  key={a.watch + ':' + a.reason + ':' + a.provider + '#' + a.slot}
                  className="mb-2 border border-rose-300 bg-rose-50 px-3 py-2.5"
                >
                  <p className="text-[14px] font-bold text-rose-700">
                    {a.watch === 'import' ? '駅ちかからの取り込みが止まっています' : '媒体連携が止まっています'}
                  </p>
                  <p className="mt-1 text-[14px] leading-relaxed text-rose-900">{a.message}</p>
                </div>
              ))}
            </div>
          )}
        </header>

        {/* ★★ 中身（メイン）だけ 1.2倍（第296便・2026-09-12・カッキーさんの指示）。
            ★ フクエスワーク（WorkShell）・公式HP管理（HpShell）と同じ大きさに揃えた。
            ★ zoom を使う。★ transform: scale だと場所だけ元の大きさのままで、
              右や下に余白・はみ出しが出る（レイアウトが付いてこない）。
            ★ かかるのは中身だけ。★ 左サイドバー・上の帯・見出しの行は元の大きさのまま。
            ★ 幅は max-w-3xl のまま＝見た目では 768×1.2 ≒ 920px 相当になる。
          ★★★ 第312便（2026-09-12・カッキーさんの指示）: スマホは等倍に戻した。
            ★ 1.2倍のままだと、360〜420px しかない画面の【横幅を2割削る】ことになっていた。
            ★ 倍率は globals.css の .link-zoom が持つ（★ 正は1か所）。★ 768px以上だけ 1.2倍。 */}
        <main className="link-zoom px-4 md:px-6 py-4 md:py-5 max-w-3xl w-full">{children}</main>
      </div>

      {/* ── スマホの左ドロワー（第296便）───────────────────────────
          ★ 背面を押す・× を押す・Esc で閉じる。★ 行き先を選んでも閉じる。 */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <nav
            aria-label="フクエスリンクのメニュー"
            className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-white shadow-2xl overflow-y-auto overscroll-contain pb-24 [padding-bottom:calc(6rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
              <Link
                href="/mypage/media"
                onClick={() => setDrawerOpen(false)}
                aria-label="ホームへ"
                className="flex items-center gap-2.5 min-w-0"
              >
                <span className="w-7 h-7 flex-none grid place-items-center text-white bg-gradient-to-br from-indigo-700 to-indigo-500">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <b className="text-[16px] font-black text-slate-800 tracking-tight truncate">フクエスリンク</b>
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="閉じる"
                className="flex-none p-1 text-slate-400 hover:text-slate-600"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {salonName && (
              <div className="px-4 py-2.5 border-b border-slate-100">
                <div className="text-[12px] font-bold text-slate-400 tracking-wider">店舗</div>
                <div className="text-[14.5px] font-bold text-slate-600 mt-0.5 leading-snug break-words">{salonName}</div>
              </div>
            )}

            <div className="flex flex-col py-1.5">{navList(() => setDrawerOpen(false))}</div>

            <Link
              href="/mypage"
              onClick={() => setDrawerOpen(false)}
              className="mt-2 flex items-center gap-2.5 px-4 py-3 border-t border-slate-100 text-[14.5px] font-bold text-slate-500"
            >
              マイページへ戻る
            </Link>

            <p className="px-4 py-4 border-t border-slate-100 text-[12px] text-slate-400 leading-relaxed">
              駅ちか・エステラブ・エステ魂・全国エステランキングとの連携をまとめて扱います。
            </p>
          </nav>
        </div>
      )}
    </div>
  );
}
