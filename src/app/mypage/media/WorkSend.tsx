'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getMediaOverview,
  getMediaAutoEligible,
  getMediaWorkPlan,
  setMediaLinkMode,
  setAllLinkModes,
  startMediaWorkDryRun,
  startMediaWorkPush,
  type WorkPlanView,
} from '@/app/actions/mediaCredentials';
import { pushAvailability, pushButtonLabel, bulkDoneText, WORK_FIRST_APPROVAL_NOTE } from '@/lib/mediaOverview';
import { siteMark } from '@/lib/mediaSites';
import { AUTO_PUSH_INTERVAL_MIN } from '@/lib/mediaLinkMode';

// 出勤を送る（第57便・㉞ その2）。
//
// ★★★ この画面で【選ばせない】理由（設計メモ §169）
//   駅ちかの出勤POSTは「全員 × 7日」をまとめて送る一発で、部分更新の口が無い
//   （src/lib/workPlan.ts の冒頭コメント）。
//   ★ だから「だれの」「いつのぶんを」を選ばせる画面は作れない。
//     選べるように見せると、選んだとおりには送れない。
//   ★★ そして選ばせないことは、この機能のいちばんの取り柄でもある。
//     他社は毎回「どの女性を・どのサイトに」を選ばせている。
//     フクエスは出勤をもう持っているので、選ぶ手間そのものが要らない。
//
// ★ 問いかけは1つだけ:「どのサイトへ送りますか？」
//   ★ はじめから全部にチェック。ふだんはまとめて送るため（カッキーさん・2026-08-30）。
//
// ★★ 送る仕組みは第43〜46便のまま。ここは画面だけ。
//   確かめる（work_dryrun）→ 計画が保存される → 指紋を添えて送る（work_push）。
//   ★ 指紋が変わっていたら送らずに止まる。だから「見たものと送るもの」がずれない。

type Site = {
  provider: string; slot: number; label: string;
  direction: string; statusLabel: string; hasCredential: boolean;
  /** ★ いま自動で反映しているか（第65便・㉞ その7 で /all から移した） */
  autoOn: boolean;
};

const keyOf = (p: string, s: number) => p + '#' + s;

/**
 * ★★ 「押さなくても動くもの」の説明カード（第324便）。
 *   ★ 即ヒメ（駅ちか）と即セラ（エステ魂）は、どちらも【フクエスから反映なら自動】。★ 同じ形で並べる。
 *   ★ ボタンは持たない。★ ここに設定は無い、と分かることがこのカードの仕事。
 */
function AutoNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-1.5">
      <h3 className="text-[16px] font-bold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}
/**
 * ★ 「フクエスに変える」を押しているあいだの印（第320便）。
 *   ★ 枠ごとの鍵（provider#slot）とは別物なので、枠には使えない名前にしておく（★ 取り違え防止）。
 */
const BULK_KEY = '*bulk*';

/** 「8/30 06:13」。★ 読めない値は空文字（"Invalid Date" を店舗に見せない）。 */
function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

/** 確かめた結果が届くのを待つ間隔と回数。★ 10分で待つのをやめる（永久に回さない）。★ 第207便で5分→10分 */
const POLL_MS = 15000;
const POLL_MAX = 40;
/** ★ 待っている最中の点滅（ホームの「反映中」と同じ速さ・第90便）。★ 速い点滅は異常に見える */
const WAIT_BLINK_STYLE = { animationDuration: '2.5s' } as const;

export function WorkSend({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [plans, setPlans] = useState<Record<string, WorkPlanView | null>>({});
  /**
   * ★★★★ 第322便（2026-09-13・カッキーさんの指示）: 【サイトのタブ】にした（セラピスト設定と同じ形）。
   *   ★ それまでは「どのサイトへ送りますか？」のチェックで、外したサイトを off に覚えていた。
   *     ★ チェックを外しても送り先の設定は変わらない（画面から隠すだけ）ので、
   *       「外したのに送られる／送られない」が読み取れなかった。
   *   ★ タブなら【いま見ているのは1サイト】がはっきりする。★ 送れないサイトも、その中で理由を言える。
   */
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPush, setConfirmPush] = useState<string | null>(null);
  /**
   * ★★ 自動にしてよい枠（1回は人が承認した枠）。
   *   ★ 承認が1回も無いうちは、自動のボタンそのものを出さない（設計メモ §32 の作法）。
   *     「立てられない状態を作ってから禁じる」をしない。
   */
  const [autoEligible, setAutoEligible] = useState<Set<string>>(new Set());
  const [switching, setSwitching] = useState<string | null>(null);
  /** ★ 確かめた結果を待っている枠。値は押した時点の作成時刻（変わったら届いた合図） */
  const [waiting, setWaiting] = useState<Record<string, string>>({});
  const pollCount = useRef(0);
  /** ★ 第207便: 待ち始めてからの経過を画面に出すための刻み（15秒ごとに増える） */
  const [tick, setTick] = useState(0);
  /** ★ 第207便: 10分待っても届かなかった枠。★ 黙って「まだ確かめていません」に戻さず、「いま見る」を出す */
  const [gaveUp, setGaveUp] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (salonId == null) return;
    const ov = await getMediaOverview({ salonId });
    if (!ov.ok) { setError(ov.error); setLoading(false); return; }
    setSites(ov.data.sites);
    // ★ 第322便: 開くタブを決める。★ すでに開いていれば【同じサイトの新しい中身】に差し替える
    //   （★ 向きを変えた直後に、そのタブの中身が古いままにならない）。
    //   ★ 初回は「送れるサイト」を優先。★ 無ければ1つ目（そこに理由が書いてある）。
    setSite((prev) => {
      const list = ov.data.sites as Site[];
      if (prev) return list.find((x) => keyOf(x.provider, x.slot) === keyOf(prev.provider, prev.slot)) ?? list[0] ?? null;
      return list.find((x) => x.direction === 'write') ?? list[0] ?? null;
    });

    // ★ 反映の向きになっている枠だけ、計画を読む。★ 読む向きの枠には計画が無くて当たり前
    const targets = ov.data.sites.filter((s) => s.direction === 'write');
    const got = await Promise.all(
      targets.map((s) => getMediaWorkPlan({ salonId, provider: s.provider, slot: s.slot }))
    );
    const next: Record<string, WorkPlanView | null> = {};
    targets.forEach((s, i) => {
      const r = got[i];
      next[keyOf(s.provider, s.slot)] = r.ok ? r.data : null;
    });
    setPlans(next);

    // ★ 自動にしてよい枠。★ 失敗しても画面は止めない（自動のボタンが出ないだけ）
    const el = await getMediaAutoEligible({ salonId });
    setAutoEligible(el.ok
      ? new Set(el.data.filter((r) => r.eligible).map((r) => keyOf(r.provider, r.slot)))
      : new Set());

    setLoading(false);
  }, [salonId]);

  /**
   * 自動の入り切り。
   * ★★★ 押しても送り先へは何も送らない。次からの【承認の要否】が変わるだけ。
   * ★ write_auto から read へは直接戻さない（まず自動をやめてもらう）。
   *   ★ 一度に2つ変えると「どちらのつもりで押したのか」が分からなくなる。
   */
  const onSwitchAuto = async (site: Site, toAuto: boolean) => {
    if (salonId == null) return;
    const k = keyOf(site.provider, site.slot);
    setSwitching(k);
    const res = await setMediaLinkMode({
      salonId, provider: site.provider, slot: site.slot,
      mode: toAuto ? 'write_auto' : 'write',
    });
    setSwitching(null);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast(toAuto
      ? '自動にしました。30分ごとに、変わったところだけを更新します'
      : '自動をやめました。これからは毎回この画面で更新します');
  };

  /**
   * ★★★ その場でフクエスに変える（第86便その2・カッキーさん）。
   * ★ ここまで来た人は「送りたい」と分かっている。★ ログイン情報の画面へ回さない。
   *
   * ★★★★ 【第320便】（2026-09-13・カッキーさんの指示）: 変えるのを【登録済みの全サイト】にした。
   *   ★ それまでは駅ちか1枠だけを write にしていたので、押しても
   *     エステ魂は「反映なし」のまま＝送り先が1つも増えない、ということが起きた。
   *   ★ 押した人の気持ちは「フクエスから送れるようにしたい」であって「駅ちかだけ」ではない。
   *   ★★ 使う受け口はホームの大きなボタンと**同じ** setAllLinkModes（第192便）。
   *     ★ 順番も断り方（自動のままの枠は飛ばす等）も、あちらと1つの決まりで動く。
   *     ★ 途中で止まったら、どこまで変わったかを bulkDoneText が文で返す。★ 黙って続けない。
   */
  const onSwitchToWrite = async () => {
    if (salonId == null) return;
    setSwitching(BULK_KEY);
    const res = await setAllLinkModes({ salonId, to: 'write' });
    setSwitching(null);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast(bulkDoneText(res.data));
  };

  useEffect(() => { void load(); }, [load]);

  // ★★ 確かめた結果は中継が動いたあとに届く（その場では返ってこない）。
  //   ★ 「数分後に開き直してください」で終わりにせず、こちらで見に行く。
  //   ★ 5分待って届かなければ、待つのをやめてそう伝える（黙って回し続けない）。
  useEffect(() => {
    const keys = Object.keys(waiting);
    if (keys.length === 0 || salonId == null) return;
    pollCount.current = 0;
    const timer = setInterval(() => {
      pollCount.current += 1;
      setTick(pollCount.current);
      (async () => {
        for (const k of Object.keys(waiting)) {
          const [provider, slotStr] = k.split('#');
          const res = await getMediaWorkPlan({ salonId, provider, slot: Number(slotStr) });
          if (!res.ok || !res.data) continue;
          if (res.data.createdAt === waiting[k]) continue;   // ★ まだ前の計画のまま
          setPlans((p) => ({ ...p, [k]: res.data }));
          setWaiting((w) => { const n = { ...w }; delete n[k]; return n; });
          onToast('内容ができました。更新の前にご確認ください（まだ更新していません）');
        }
      })();
      if (pollCount.current >= POLL_MAX) {
        // ★ 第207便: 諦めた枠を覚えて「いま見る」を出す（★ リロードさせない）
        setGaveUp((g) => new Set([...g, ...Object.keys(waiting)]));
        setWaiting({});
        onToast('確認の結果がまだ届きません。時間がかかっています。「いま見る」で読み直せます');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, salonId, onToast]);

  const onDryRun = async (s: Site) => {
    if (salonId == null) return;
    const k = keyOf(s.provider, s.slot);
    setBusy(k);
    try {
      const res = await startMediaWorkDryRun({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      // ★ 押した時点の作成時刻を覚える。★ 計画そのものが無いときは空文字（できたら必ず変わる）
      setWaiting((w) => ({ ...w, [k]: plans[k]?.createdAt ?? '' }));
      setGaveUp((g) => { const n = new Set(g); n.delete(k); return n; });
      setTick(0);   // ★ 経過時間は押した瞬間から（effect の中で触らない・lint の作法）
      onToast('内容を確かめています。できあがるとこの画面に出ます（まだ更新していません）');
    } finally {
      setBusy(null);
    }
  };

  const onPush = async (s: Site) => {
    if (salonId == null) return;
    const k = keyOf(s.provider, s.slot);
    const plan = plans[k];
    if (!plan) return;
    setBusy(k);
    try {
      const res = await startMediaWorkPush({
        salonId, provider: s.provider, slot: s.slot, fingerprint: plan.fingerprint,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast('更新しました。結果は「連携の記録」に出ます');
      setConfirmPush(null);
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (salonId == null) return null;

  // ★ いま読み取りに使っているサイト。★ 居なければ「変える」ボタンを出さない
  const readSite = sites.find((s) => s.direction === 'read') ?? null;

  return (
    <div className="space-y-3">

      {/* ── ★★★ サイトのタブ（第322便・カッキーさんの指示）───────────────
          ★ セラピスト設定と同じ形。★ 1つのタブには、そのサイトの話だけを出す。
          ★ 送れないサイトもタブに出す。★ 押せば【なぜ送れないか】と直し方がその中にある。
          ★ 印（駅・魂）は mediaSites.siteMark（★ セラピスト設定と同じ1文字）。 */}
      {loading ? (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        </div>
      ) : error ? (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
          <p className="text-[14px] text-rose-600 leading-relaxed">
            連携の状態を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        </div>
      ) : sites.length === 0 ? (
        /* ★ 枠が1つも無い＝ログイン情報がまだ無い。★ ホームと同じ言い方（第119便） */
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">更新できるサイトがありません。</b>{' '}
            ログイン情報を登録すると始められます。
          </p>
          <Link href="/mypage/media/login" className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline">
            ログイン情報へ
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sites.map((x) => {
            const k = keyOf(x.provider, x.slot);
            const on = site != null && keyOf(site.provider, site.slot) === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSite(x)}
                aria-pressed={on}
                className={`flex items-center gap-2 px-3.5 py-2 border text-[14.5px] font-bold transition-colors ${
                  on
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden
                  className={`w-6 h-6 flex-none grid place-items-center text-[13px] font-black ${
                    on ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {siteMark(x.provider, x.label)}
                </span>
                {x.label}
                {/* ★ 送れない枠は、タブの時点でそう分かるようにする（★ 開いてから知る、にしない） */}
                {x.direction !== 'write' && (
                  <span className="font-medium text-[12.5px] text-slate-400">
                    （{x.direction === 'read' ? '取り込み中' : x.direction === 'off' ? '反映なし' : '未設定'}）
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── ★ 送れないサイトのタブ（第322便）。★ 理由と、そこからできることを1枚で ── */}
      {!loading && !error && site && site.direction !== 'write' && (
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">{site.label}は、いま更新できません。</b>{' '}
            {site.direction === 'read'
              // ★ 第319便: 「変えると◯◯からの反映は止まります。」は書かない（押したときの問いが言う）
              ? `いまは${site.label}から反映しています。更新するには「フクエスから反映」に変えてください。`
              : site.direction === 'off'
                ? '「反映しない」を選んでいます。更新するには「フクエスから反映」に変えてください。'
                // ★ 鍵はあるが向きが決まっていない枠と、鍵がまだ無い枠を書き分ける（第87便・§223 の作法）
                : site.hasCredential
                  ? 'まだ反映の向きが決まっていません。「フクエスから反映」にすると更新できます。'
                  : 'ログイン情報を登録すると始められます。'}
          </p>
          {site.hasCredential ? (
            <button
              type="button"
              onClick={() => void onSwitchToWrite()}
              disabled={switching !== null}
              className="mt-2 px-3 py-1.5 border border-sky-300 bg-white text-[14px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-40"
            >
              {switching === BULK_KEY ? '変えています…' : 'フクエスに変える'}
            </button>
          ) : (
            <Link
              href="/mypage/media/login"
              className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline"
            >
              ログイン情報へ
            </Link>
          )}
          {/* ★ 押すと全サイトが変わる（第320便）。★ 押す前に、それが分かるようにしておく */}
          {site.hasCredential && readSite && (
            <p className="mt-2 text-[12.5px] text-slate-400 leading-relaxed">
              登録済みのサイトがまとめて「フクエスから反映」になります。
            </p>
          )}
        </div>
      )}

      {/* ★★★ 第208便: 「フクエスから反映」にしただけでは自動にならない、をこの画面の入口で言う。
          ★ 文は mediaOverview.WORK_FIRST_APPROVAL_NOTE（ホームの一括の確認文と同じ）。★ 2か所でずらさない。
          ★★ 第322便: すでに自動になっている枠には出さない（★ もう済んだ話を毎回読ませない）。
          ★★★★ 第332便（2026-09-13・カッキーさん）: **まだ自動にできない枠にだけ**出す。
            ★ もう自動にできる枠にも出し続けていて、読む必要のない文が画面のいちばん上を占めていた。
            ★ 帯が出ている＝「まだやることがある」の合図にする。★ そのほうが読まれる。 */}
      {!loading && !error && site && site.direction === 'write' && !site.autoOn
        && !autoEligible.has(keyOf(site.provider, site.slot)) && (
        <p className="text-[13.5px] text-slate-500 leading-relaxed border border-slate-200 bg-slate-50 px-3 py-2">
          {WORK_FIRST_APPROVAL_NOTE}
        </p>
      )}

      {/* ── 開いているサイトの内容（第322便）──────────────────────────
          ★ 中身は今までのまま。★ 1つの枠だけを描くために、1件の並びとして回す
            （★ 中の書き方を変えずにタブへ移すため）。 */}
      {(!loading && !error && site && site.direction === 'write' ? [site] : []).map((s) => {
        const k = keyOf(s.provider, s.slot);
        const plan = plans[k];
        const isWaiting = k in waiting;
        const isBusy = busy === k;

        return (
          <div key={k} className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className="text-[16px] font-bold text-slate-700">{s.label}を更新する内容</h3>
              {plan && <span className="text-[13px] text-slate-400">{fmt(plan.createdAt)} に確認</span>}
            </div>

            {/* ★★ この画面でいちばん誤解が起きやすい場所。**まだ送っていない**を繰り返し書く。
                ★ 第210便: 出すのは【確かめた内容がある】ときだけ。★ 確かめる前・待っている最中は、
                  下の文が同じことを言うので二度言わない（カッキーさんの添削・2026-09-07） */}
            {plan && !isWaiting && !gaveUp.has(k) && (
              <p className="text-[13px] font-bold text-indigo-600">
                これは「更新するとこうなる」という内容です。まだ更新していません。
              </p>
            )}

            {isWaiting ? (
              /* ★★★ 第207便（2026-09-07・カッキーさん）: 待っている最中を【動いて見える】形に。
                  ★ 文字だけだと、自動で見に行っていること（15秒ごと）が伝わらず、リロードされていた。
                  ★ ホームの「反映中」と同じゆっくりした点滅＋経過時間。★ 「この画面のまま」と言い切る */
              <div className="border border-indigo-200 bg-indigo-50 px-4 py-3">
                <p
                  className="text-[15px] font-bold text-indigo-700 animate-pulse"
                  style={WAIT_BLINK_STYLE}
                >
                  内容を確かめています。しばらくお待ちください…
                </p>
                <p className="mt-1 text-[13px] text-indigo-900/70 leading-relaxed">
                  できあがると、この画面のまま自動でここに出ます（ふつう1〜3分）。
                  {tick > 0 && `　待ち時間 ${Math.floor((tick * POLL_MS) / 60000)}分${Math.floor(((tick * POLL_MS) % 60000) / 1000)}秒`}
                </p>
              </div>
            ) : gaveUp.has(k) ? (
              /* ★ 第207便: 10分待っても届かなかった。★ 黙って戻さず、その場で読み直せる道を出す */
              <div className="border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-[14px] font-bold text-amber-900">確認に時間がかかっています。</p>
                <p className="mt-1 text-[13px] text-amber-900/80 leading-relaxed">
                  中継が混み合っているのかもしれません。「いま見る」を押すと、届いていれば出ます。
                </p>
                <button
                  type="button"
                  onClick={() => { setGaveUp((g) => { const n = new Set(g); n.delete(k); return n; }); void load(); }}
                  className="mt-2 text-[13.5px] font-bold px-3 py-1.5 border border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                >
                  いま見る
                </button>
              </div>
            ) : !plan ? (
              <>
                {/* ★ 第210便: 1文に。★ 「まだ送りません」はここで言う（上の藍色の1行は確かめたあとにだけ出る） */}
                <p className="text-[14px] text-slate-500">
                  「内容を確かめる」を押すと、更新するとどうなるかをここに出します（まだ更新しません）。
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => onDryRun(s)}
                    disabled={isBusy}
                    className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-600 disabled:opacity-50"
                  >
                    内容を確かめる
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* ★ 突き合わせ0人は「一致」ではない。ここを最初に出す（第43便-b §26） */}
                {plan.targets === 0 ? (
                  <p className="text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                    {s.label}の出勤表と結びつく方が1人も見つかりませんでした。内容を比べられていません。
                  </p>
                ) : (
                  <>
                    <dl className="grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 overflow-hidden">
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[12px] font-bold text-slate-400">更新する人</dt>
                        <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                          {plan.targets}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
                        </dd>
                      </div>
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[12px] font-bold text-slate-400">更新する範囲</dt>
                        <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                          {plan.dateLabels.length || 7}<span className="text-[13px] font-bold text-slate-400 ml-0.5">日ぶん</span>
                        </dd>
                      </div>
                      <div className="bg-white px-3 py-2.5">
                        <dt className="text-[12px] font-bold text-slate-400">変わるところ</dt>
                        <dd className="text-[20px] font-black text-slate-800 tabular-nums">
                          {plan.changeCount}<span className="text-[13px] font-bold text-slate-400 ml-0.5">件</span>
                        </dd>
                      </div>
                    </dl>
                    {/* ★★ 選ばせない理由を、その場に書く。★ 「選べないのか」で終わらせない。★ 第210便で短く */}
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                      フクエスの出勤がそのまま{s.label}に載ります。更新したくない方は、先にフクエスの出勤を直してください。
                    </p>
                  </>
                )}

                {/* 止めた理由 → 伝えること → 差分の表 の順。★ 差分を先に出すと理由が読まれない */}
                {plan.blockers.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.blockers.map((b, i) => (
                      <li key={`b-${i}`} className="text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                        {b.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.notes.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.notes.map((n, i) => (
                      <li key={`n-${i}`} className="text-[14px] text-slate-500 bg-slate-50 px-3 py-2 leading-relaxed">
                        {n.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {plan.changeCount === 0 ? (
                  plan.targets > 0 && (
                    <p className="text-[14px] text-slate-500">
                      いまの{s.label}の内容と一致しています。変えるところはありません。
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <p className="text-[14px] font-bold text-slate-700">変わるところ（{plan.changeCount}件）</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[14px]">
                        <thead>
                          <tr className="text-slate-400 text-left">
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">日付</th>
                            <th className="font-medium py-1 pr-3 whitespace-nowrap">いまの{s.label}</th>
                            <th className="font-medium py-1 whitespace-nowrap">更新後</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.diff.map((d, i) => (
                            <tr key={`d-${i}`} className="border-t border-slate-100 align-top">
                              <td className="py-1.5 pr-3 text-slate-700 break-words">{d.name || d.girlId}</td>
                              <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                                {plan.dateLabels[d.dayIndex] ?? `日${d.dayIndex}`}
                              </td>
                              <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{d.before}</td>
                              <td className="py-1.5 text-indigo-700 font-bold whitespace-nowrap">{d.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[13px] text-slate-400">
                      同じ内容の行は出していません。{plan.dateLabels.length || 7}日ぶんのうち、変わる{plan.changeCount}件だけです。
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  <button
                    onClick={() => onDryRun(s)}
                    disabled={isBusy}
                    className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-600 disabled:opacity-50"
                  >
                    内容を確かめ直す
                  </button>

                  {/* ★★★ ここが送り先を書き換える唯一の場所。★ 確認を一段はさむ */}
                  {confirmPush === k ? (
                    <>
                      <button
                        onClick={() => setConfirmPush(null)}
                        className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-500"
                      >
                        やめる
                      </button>
                      <button
                        onClick={() => onPush(s)}
                        disabled={isBusy}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                      >
                        {isBusy ? '更新しています…' : 'この内容で更新（確定）'}
                      </button>
                    </>
                  ) : (() => {
                    // ★★ 押せないときは、ボタン自体に理由を書く（第58便・設計メモ §173）。
                    //   ★ 灰色にして終わりにしない。すぐ上に理由が書いてあっても、
                    //     ボタンが「押せない」としか言わないと、なぜ押せないかは伝わらない。
                    const av = pushAvailability({
                      hasPlan: true,
                      sendable: plan.sendable,
                      changeCount: plan.changeCount,
                      fingerprint: plan.fingerprint,
                    });
                    return (
                      <button
                        onClick={() => setConfirmPush(k)}
                        disabled={av !== 'ready'}
                        className={`px-4 py-2 text-[14px] font-bold shadow-sm ${
                          av === 'ready'
                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-700 text-white'
                            : 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed'
                        }`}
                      >
                        {pushButtonLabel(av)}
                      </button>
                    );
                  })()}
                </div>

                {/* ★ 第210便で短く（指紋の突き合わせ・第46便の説明） */}
                <p className="text-[13px] text-slate-400 text-right leading-relaxed">
                  更新の直前にもう一度確かめ、内容が変わっていたら更新せずに止まります。
                </p>
              </>
            )}

            {/* ── 毎回の承認をやめる ──────────────────────
                ★★★ 承認の話なので、置き場はこの画面（第65便・㉞ その7）。
                  第64便まで /mypage/media/all にあったものを移した。
                ★ 1回も承認していない枠には、ボタンそのものを出さない（設計メモ §32）。
                  ★ 押せないボタンを灰色で置くのは「立てられない状態を作ってから禁じる」形。 */}
            {s.autoOn ? (
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                {/* ★ 第210便: 「30分ごと・変わったところだけ」を言う（周期は media-auto-push の crontab・§57） */}
                <p className="text-[14px] font-bold text-indigo-700">
                  いまは自動で更新しています
                </p>
                <p className="text-[13px] text-slate-400 leading-relaxed">
                  30分ごとに、変わったところだけを承認なしで{s.label}を更新します。更新できないときは止めて、ここに出します。
                </p>
                <button
                  onClick={() => onSwitchAuto(s, false)}
                  disabled={switching === k}
                  className="px-3 py-1.5 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {/* ★ ホームの行のリンクと同じ言葉（「自動をやめる」） */}
                  {switching === k ? '切り替えています…' : '自動をやめる'}
                </button>
              </div>
            ) : autoEligible.has(k) ? (
              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                {/* ★ 第210便で短く。★ WORK_FIRST_APPROVAL_NOTE の続き。
                    ★★ 第332便: 「1回送ったので」を落とした。★ 第331便で【一致を確かめただけ】でもここに来る。
                    ★ 分数は AUTO_PUSH_INTERVAL_MIN から出す（★ 周を変えたときに文言だけ古くならない）。 */}
                <p className="text-[13px] text-slate-400 leading-relaxed">
                  これで自動にできます。変わったところを{AUTO_PUSH_INTERVAL_MIN}分以内に反映します。
                </p>
                <button
                  onClick={() => onSwitchAuto(s, true)}
                  disabled={switching === k}
                  className="px-3 py-1.5 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  {switching === k ? '切り替えています…' : '自動にする'}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {/* ── ★★★★ 駅ちかの即ヒメ（第324便・2026-09-13・カッキーさんの指示）──────────
          ★ 枠の写し（即ヒメ枠 0/5…）と「フクエスで『今すぐ』の方」の一覧を【まるごと外した】。
            ★ 第323便で自動が既定になり、この画面に設定が1つも無くなった。
            ★ 残っていたのは「見るだけの枠」と「急ぐとき用の手押し」で、即セラ側にはどちらも無い。
            ★★ 枠の数は店舗によって違う（★ ラビリンス様は5枠だが、10枠以上の店舗もある・カッキーさん）。
              ★ だからこの説明には【枠の数を書かない】。
          ★ 見えなくなったもの: 枠の空き具合と、1人ずつ押す道。★ 枠は駅ちかの管理画面で見られる。
          ★ SokuhimeSlots.tsx は第324便で消した。 */}
      {!loading && !error && site && site.provider === 'ekichika' && site.direction === 'write' && (
        <AutoNote title="駅ちかの即ヒメ">
          {/* ★★★ 第329便（2026-09-13・カッキーさんの添削）: 4行を1行にした。
              ★ 「長いので店舗様は読まない」。★ 読まれない正確さより、読まれる1行を選ぶ。
              ★★ 「10分ごと」と書かない。★ 「今すぐを押しても10分待たされる」と読まれる
                （実際は周が10分ごとに回るだけで、押した直後の周で上がる）。★ だから「数分以内」。 */}
          <p className="text-[13.5px] text-slate-500 leading-relaxed">
            <b className="font-bold text-slate-700">即ヒメ自動設定中。</b>
            「今すぐ」のセラピストを数分以内に即ヒメにします。
          </p>
        </AutoNote>
      )}

      {/* ── ★★★ エステ魂の即セラ（第322便・カッキーさんの質問から）──────────
          ★ 即セラには【スイッチが無い】。★ 周（sokusera-push・5分ごと）が拾う条件は
            「エステ魂がフクエスから反映で、連携が有効」だけ（src/app/api/admin/sokusera-push）。
          ★★ 駅ちかの即ヒメは「自動にする」を押さないと上がらない。★ 同じ画面に2つの決まりが並ぶので、
            **違うほうを書いておく**（★ カッキーさんが実際に取り違えた）。
          ★ ONだけ打ってOFFは打たない（★ 60分で向こうが切る）。★ 1周で1人だけ。
          ★ 駅ちかの即ヒメは第327便で【10分ごと・1周6人まとめて】になったが、即セラは5分ごと1人のまま。 */}
      {!loading && !error && site && site.provider === 'esutama' && site.direction === 'write' && (
        <AutoNote title="エステ魂の即セラ">
          {/* ★ 第330便: 駅ちかの即ヒメと同じ1行に揃えた（カッキーさん）。★ 周の分数は書かない */}
          <p className="text-[13.5px] text-slate-500 leading-relaxed">
            <b className="font-bold text-slate-700">即セラ自動設定中。</b>
            「今すぐ」のセラピストを数分以内に即セラにします。
          </p>
        </AutoNote>
      )}
    </div>
  );
}
