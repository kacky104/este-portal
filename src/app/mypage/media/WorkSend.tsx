'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMediaBrand } from './mediaBrand';
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
import { bulkDoneText, WORK_FIRST_APPROVAL_NOTE } from '@/lib/mediaOverview';
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
function AutoNote({ title, kirari, children }: { title: string; kirari?: boolean; children?: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-1.5">
      {/* ★★★ 第336便（2026-09-13・カッキーさん）: 「いま動いている」ものは見出しをキラリと光らせる。
          ★ 光り方は globals.css の .link-live-kirari（紺→インディゴ→水色が1回通って休む）。
          ★ 素の文字色は --lk-base（slate-800）が持つので、text-slate-700 は当てない（二重に決めない）。 */}
      <h3 className={'text-[16px] font-bold ' + (kirari === true ? 'link-live-kirari' : 'text-slate-700')}>{title}</h3>
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
  const brand = useMediaBrand();
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
  // ★ 第471便（カッキーさん）: コネックエフだけ、エステ魂の右に「フクエス」のタブ。★ 選ぶとサイトの枠の代わりにフクエスの2枚を出す
  const [fukuesOn, setFukuesOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
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
  /**
   * ★★★★ 第393便（2026-09-15・カッキーさんの指示）: 確認が届いたあと、続けて何をするか。
   *   'make_auto' … 「出勤を自動更新にする」から。★ 変わるところが0件なら、そのまま自動にする
   *   'push_now'  … 自動更新中の「いますぐ更新する」から。★ 変わるところがあれば、その場で送る
   * ★ 画面に出す値ではないので state にしない（★ 待っている最中の描き直しを増やさない）。
   *   ★ 待ちの文言は s.autoOn で分かる（自動更新中＝いますぐ更新／それ以外＝自動更新の準備）。
   */
  const afterCheck = useRef<Record<string, 'make_auto' | 'push_now'>>({});
  /**
   * ★★★ 送ったあと、自動に切り替わるのを待っている枠（第393便）。
   *   ★★ 送った直後には write_auto にできない。★ 条件は「1回でも反映が成功していること」（§54）で、
   *     反映は中継が動き終わってから成立する。★ だから【終わったのを見てから】切り替える。
   */
  const [autoWaiting, setAutoWaiting] = useState<Set<string>>(new Set());

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
  const setAuto = useCallback(async (provider: string, slot: number, toAuto: boolean) => {
    if (salonId == null) return;
    const k = keyOf(provider, slot);
    setSwitching(k);
    const res = await setMediaLinkMode({ salonId, provider, slot, mode: toAuto ? 'write_auto' : 'write' });
    setSwitching(null);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    // ★ 第393便: ボタンの名前と同じ言葉で返す（★ 押したものと起きたことを同じ名前にする）
    onToast(toAuto
      ? '自動更新になりました'
      : '自動更新をやめました。これからはこの画面で更新します');
  }, [salonId, load, onToast]);

  /**
   * 送り先を書き換える唯一の場所（★ ここだけが実際に媒体へ書く）。
   * ★ thenAuto … 送り終わったら自動更新に切り替える（第393便の「更新して自動にする」）。
   *   ★★ その場では切り替えない。★ 送り終わるのを待ってから（autoWaiting）。
   */
  const doPush = useCallback(async (provider: string, slot: number, fingerprint: string, thenAuto: boolean) => {
    if (salonId == null) return;
    const k = keyOf(provider, slot);
    setBusy(k);
    try {
      const res = await startMediaWorkPush({ salonId, provider, slot, fingerprint });
      if (!res.ok) { onToast(res.error); return; }
      if (thenAuto) {
        setAutoWaiting((w) => new Set([...w, k]));
        onToast('更新を送りました。終わりしだい自動更新にします');
      } else {
        onToast('更新しました。結果は「連携の記録」に出ます');
      }
      await load();
    } finally {
      setBusy(null);
    }
  }, [salonId, load, onToast]);

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
          const got = res.data;
          setPlans((p) => ({ ...p, [k]: got }));
          setWaiting((w) => { const n = { ...w }; delete n[k]; return n; });

          // ★★★★ 第393便: 届いたら【押したボタンの続き】をここでやる。
          //   ★ 「確かめる」で終わらせない。★ 店舗様が押したのは「自動更新にする」なので、
          //     0件ならそのまま自動まで行く。★ 差分があるときだけ、もう一度だけ手を借りる。
          const act = afterCheck.current[k];
          delete afterCheck.current[k];
          if (act === 'make_auto') {
            if (got.sendable !== true) {
              onToast('自動更新にできませんでした。この画面に理由を出しています');
            } else if (got.changeCount === 0) {
              await setAuto(provider, Number(slotStr), true);   // ★ ここで「自動更新になりました」が出る
            } else {
              onToast(`${got.changeCount}件変わります。内容をご確認のうえ「更新して自動にする」を押してください`);
            }
          } else if (act === 'push_now') {
            if (got.sendable !== true) {
              onToast('いまは更新できません。この画面に理由を出しています');
            } else if (got.changeCount > 0) {
              await doPush(provider, Number(slotStr), got.fingerprint, false);
            } else {
              onToast('変わるところはありませんでした');
            }
          } else {
            onToast('内容ができました（まだ更新していません）');
          }
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
  }, [waiting, salonId, onToast, setAuto, doPush]);

  /**
   * ★★★ 送り終わるのを待って自動に切り替える（第393便）。
   *   ★ 見に行くのは「自動にしてよいか」（getMediaAutoEligible）。★ これが立つ＝1回目の反映が成功した。
   *   ★ 10分待っても立たなければ待つのをやめる。★ 黙って回し続けない（第207便と同じ作法）。
   *   ★★ ここで「自動にしました」とは言わない。★ 言うのは setAuto（★ 2か所で言い方をずらさない）。
   */
  useEffect(() => {
    if (autoWaiting.size === 0 || salonId == null) return;
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      (async () => {
        const el = await getMediaAutoEligible({ salonId });
        if (!el.ok) return;
        const okSet = new Set(el.data.filter((r) => r.eligible).map((r) => keyOf(r.provider, r.slot)));
        for (const k of Array.from(autoWaiting)) {
          if (!okSet.has(k)) continue;
          const [provider, slotStr] = k.split('#');
          setAutoWaiting((w) => { const next = new Set(w); next.delete(k); return next; });
          await setAuto(provider, Number(slotStr), true);
        }
      })();
      if (n >= POLL_MAX) {
        setAutoWaiting(new Set());
        onToast('更新は送りましたが、終わったことをまだ確かめられていません。結果は「連携の記録」に出ます');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [autoWaiting, salonId, onToast, setAuto]);

  const onCheck = async (s: Site, act: 'make_auto' | 'push_now') => {
    if (salonId == null) return;
    const k = keyOf(s.provider, s.slot);
    setBusy(k);
    try {
      const res = await startMediaWorkDryRun({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      afterCheck.current[k] = act;   // ★ 届いたときの続きを覚えておく（第393便）
      // ★ 押した時点の作成時刻を覚える。★ 計画そのものが無いときは空文字（できたら必ず変わる）
      setWaiting((w) => ({ ...w, [k]: plans[k]?.createdAt ?? '' }));
      setGaveUp((g) => { const n = new Set(g); n.delete(k); return n; });
      setTick(0);   // ★ 経過時間は押した瞬間から（effect の中で触らない・lint の作法）
      onToast(act === 'make_auto'
        ? '自動更新の準備をしています。この画面のままお待ちください'
        : 'いまの内容を確かめています。この画面のままお待ちください');
    } finally {
      setBusy(null);
    }
  };

  /**
   * ★★★ 「出勤を自動更新にする」（第393便）。
   *   ★ すでに1回確かめてあって、いまの内容と一致しているなら、待たせずそのまま自動にする。
   *   ★ それ以外は、まず確かめに行く（★ 続きは afterCheck が持つ）。
   */
  const onMakeAuto = (s: Site) => {
    const k = keyOf(s.provider, s.slot);
    const plan = plans[k];
    if (autoEligible.has(k) && plan && plan.sendable === true && plan.changeCount === 0) {
      void setAuto(s.provider, s.slot, true);
      return;
    }
    void onCheck(s, 'make_auto');
  };

  if (salonId == null) return null;

  // ★ 第471便: 画面に出すサイト（★ フクエスのタブを選んでいるときは無し）
  const view = fukuesOn ? null : site;

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
          <Link href={brand.link('login')} className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline">
            ログイン情報へ
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sites.map((x) => {
            const k = keyOf(x.provider, x.slot);
            const on = !fukuesOn && site != null && keyOf(site.provider, site.slot) === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => { setSite(x); setFukuesOn(false); }}
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
          {/* ★ 第471便: フクエスのタブ（コネックエフだけ）。★ フクエスへはコネックエフで入れた時点で入るので、設定は無い */}
          {brand.isConecf && (
            <button
              type="button"
              onClick={() => setFukuesOn(true)}
              aria-pressed={fukuesOn}
              className={`flex items-center gap-2 px-3.5 py-2 border text-[14.5px] font-bold transition-colors ${
                fukuesOn
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span
                aria-hidden
                className={`w-6 h-6 flex-none grid place-items-center text-[13px] font-black ${
                  fukuesOn ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                フ
              </span>
              フクエス
            </button>
          )}
        </div>
      )}

      {/* ★ 第471便: フクエスのタブの中身（★ 見出しだけ。駅ちか・エステ魂と同じ形の2枚） */}
      {!loading && !error && brand.isConecf && fukuesOn && (
        <>
          <AutoNote title="出勤 自動更新中" kirari />
          <AutoNote title="今すぐ自動設定中" kirari />
        </>
      )}

      {/* ── ★ 送れないサイトのタブ（第322便）。★ 理由と、そこからできることを1枚で ── */}
      {!loading && !error && view && view.direction !== 'write' && (
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">{view.label}は、いま更新できません。</b>{' '}
            {view.direction === 'read'
              // ★ 第319便: 「変えると◯◯からの反映は止まります。」は書かない（押したときの問いが言う）
              ? brand.text(`いまは${view.label}から反映しています。更新するには「フクエスから反映」に変えてください。`)
              : view.direction === 'off'
                ? (brand.isConecf ? 'いまはこのサイトを更新していません。更新するには、ホームでこのサイトの「更新する」を押してください。' : '「反映しない」を選んでいます。更新するには「フクエスから反映」に変えてください。')
                // ★ 鍵はあるが向きが決まっていない枠と、鍵がまだ無い枠を書き分ける（第87便・§223 の作法）
                : view.hasCredential
                  ? brand.text('まだ反映の向きが決まっていません。「フクエスから反映」にすると更新できます。')
                  : 'ログイン情報を登録すると始められます。'}
          </p>
          {view.hasCredential ? (
            <button
              type="button"
              onClick={() => void onSwitchToWrite()}
              disabled={switching !== null}
              className="mt-2 px-3 py-1.5 border border-sky-300 bg-white text-[14px] font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-40"
            >
              {switching === BULK_KEY ? '変えています…' : brand.isConecf ? '更新する' : 'フクエスに変える'}
            </button>
          ) : (
            <Link
              href={brand.link('login')}
              className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline"
            >
              ログイン情報へ
            </Link>
          )}
          {/* ★ 押すと全サイトが変わる（第320便）。★ 押す前に、それが分かるようにしておく */}
          {view.hasCredential && readSite && (
            <p className="mt-2 text-[12.5px] text-slate-400 leading-relaxed">
              {brand.text('登録済みのサイトがまとめて「フクエスから反映」になります。')}
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
      {!loading && !error && view && view.direction === 'write' && !view.autoOn
        && !autoEligible.has(keyOf(view.provider, view.slot)) && (
        <p className="text-[13.5px] text-slate-500 leading-relaxed border border-slate-200 bg-slate-50 px-3 py-2">
          {WORK_FIRST_APPROVAL_NOTE}
        </p>
      )}

      {/* ── 開いているサイトの内容（第322便）──────────────────────────
          ★ 中身は今までのまま。★ 1つの枠だけを描くために、1件の並びとして回す
            （★ 中の書き方を変えずにタブへ移すため）。 */}
      {(!loading && !error && view && view.direction === 'write' ? [view] : []).map((s) => {
        const k = keyOf(s.provider, s.slot);
        const plan = plans[k];
        const isWaiting = k in waiting;
        const isBusy = busy === k;

        return (
          <div key={k} className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-3">
            {/* ★★★★ 第393便（2026-09-15・カッキーさんの指示）: 見出しが【いまの状態】を言う。
                ★ 自動更新中なら「出勤 自動更新中」（キラリ）。★ まだなら、これから何をするかを見出しにする。
                ★ 第342便で下の別枠に出していた「出勤 自動更新中」を、ここへ引き上げた（★ 見出しは1枚に1つ）。 */}
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className={'text-[16px] font-bold ' + (s.autoOn ? 'link-live-kirari' : 'text-slate-700')}>
                {s.autoOn ? '出勤 自動更新中' : `${s.label}の出勤を自動更新にする`}
              </h3>
              {plan && !isWaiting && !gaveUp.has(k) && (
                <span className="text-[13px] text-slate-400">{fmt(plan.createdAt)} に確認</span>
              )}
            </div>

            {isWaiting ? (
              /* ★★★ 第207便（2026-09-07・カッキーさん）: 待っている最中を【動いて見える】形に。
                  ★ 文字だけだと、自動で見に行っていること（15秒ごと）が伝わらず、リロードされていた。
                  ★ ホームの「反映中」と同じゆっくりした点滅＋経過時間。★ 「この画面のまま」と言い切る
                  ★★ 第393便: 文言を【何のために待っているか】に変えた（「内容を確かめています」→ 準備）。 */
              <div className="border border-indigo-200 bg-indigo-50 px-4 py-3">
                <p
                  className="text-[15px] font-bold text-indigo-700 animate-pulse"
                  style={WAIT_BLINK_STYLE}
                >
                  {s.autoOn
                    ? 'いまの内容を確かめています。しばらくお待ちください…'
                    : '自動更新の準備をしています。しばらくお待ちください…'}
                </p>
                <p className="mt-1 text-[13px] text-indigo-900/70 leading-relaxed">
                  できあがると、この画面のまま自動で続きます（ふつう1〜3分）。
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
            ) : (
              <>
                {/* ★ 自動更新中の枠。★ 第210便の文言のまま（周期は AUTO_PUSH_INTERVAL_MIN から出す） */}
                {s.autoOn && (
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    変わったところだけを、{AUTO_PUSH_INTERVAL_MIN}分以内に承認なしで{s.label}を更新します。更新できないときは止めて、ここに出します。
                  </p>
                )}

                {/* ★★★ 第393便: まだ一度も確かめていない枠。
                    ★★ 画面のいちばん上の帯（WORK_FIRST_APPROVAL_NOTE）が「押すと確かめてから自動になる」を
                      もう言っている。★ ここでは【言っていないこと】だけを足す（★ 二度言わない・第341便）。 */}
                {!s.autoOn && !plan && (
                  <p className="text-[14px] text-slate-500 leading-relaxed">
                    変わるところがあるときだけ、更新の前に一度おたずねします。
                  </p>
                )}

                {/* ★ 突き合わせ0人は「一致」ではない。ここを最初に出す（第43便-b §26） */}
                {plan && plan.targets === 0 && (
                  <p className="text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                    {s.label}の出勤表と結びつく方が1人も見つかりませんでした。内容を比べられていません。
                  </p>
                )}

                {/* ★★★★ 第393便: 「更新できる人／更新する範囲／変わるところ」の3つの数字カードを消した。
                    ★ この画面は【誰の・いつの分を選ばせない】のが取り柄（駅ちかは全員×7日の一発送信）。
                      ★ 選べないのに数字が3つ並んでも、店舗様は何も決められない（カッキーさん）。
                    ★ 消したのは【表示】だけ。★ 計画（plan）の中身も送る仕組みも変えていない。 */}

                {/* ★★★★ 第393便（2026-09-16 00:34 の実データ）: 止めた理由が【1つも無い】まま
                    「自動更新にできません」になることがあった（エステ魂の sendable の取り違え）。
                    ★ 元は直した（esutamaFlow）。★ そのうえで、**理由の無い不可を作らない**ための受け皿を置く。
                    ★ 設計メモ §173:「押せないときは、その理由を書く」。★ 黙って押せなくしない。 */}
                {plan && plan.sendable !== true && plan.blockers.length === 0 && plan.targets > 0 && (
                  <p className="text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                    いまは自動更新にできませんでした。少し時間をおいて、もう一度お試しください。
                    続くようでしたら「連携の記録」の時刻を添えて運営にお知らせください。
                  </p>
                )}

                {/* 止めた理由 → 伝えること の順。★ 「◯名は連携していないため更新できません」はここ（残す） */}
                {plan && plan.blockers.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.blockers.map((b, i) => (
                      <li key={`b-${i}`} className="text-[14px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                        {b.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {plan && plan.notes.length > 0 && (
                  <ul className="space-y-1.5">
                    {plan.notes.map((n, i) => (
                      <li key={`n-${i}`} className="text-[14px] text-slate-500 bg-slate-50 px-3 py-2 leading-relaxed">
                        {n.detail}
                      </li>
                    ))}
                  </ul>
                )}

                {/* ★★★ 第393便: 差分があるときだけ出る一段。★ ここが「更新して自動にする」を押す場面。
                    ★ 表は畳んでおく。★ 読みたい人だけ開く（★ 選ばせないので、ふだんは読む必要がない）。 */}
                {!s.autoOn && plan && plan.sendable === true && plan.changeCount > 0 && (
                  <>
                    <p className="text-[15px] font-bold text-indigo-700 leading-relaxed">
                      {s.label}の出勤が{plan.changeCount}件変わります。更新してから自動更新にします。
                    </p>
                    <details className="border border-slate-200">
                      <summary className="cursor-pointer select-none px-3 py-2 text-[13.5px] font-bold text-slate-500">
                        変わるところを見る（{plan.changeCount}件）
                      </summary>
                      <div className="px-3 pb-3 space-y-2">
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
                    </details>
                  </>
                )}

                {/* ── ボタン ──────────────────────────────────────
                    ★★★★ 第393便: この枠のボタンは【いつでも1つの道】になるようにした。
                      ・自動更新中        … いますぐ更新する ／ 自動をやめる
                      ・差分あり          … 更新して自動にする（★ 1回で終わり。確認をもう一段はさまない）
                      ・それ以外          … 出勤を自動更新にする
                    ★ 「一致しています」（押せないボタンの跡地）は消した。★ 押せない文字を置かない。 */}
                <div className="flex flex-wrap gap-2 justify-end pt-1">
                  {autoWaiting.has(k) ? (
                    /* ★★ 送ってから自動になるまでの間（★ 送り終わるまで write_auto にできない・§54） */
                    <span
                      className="px-2 py-2 text-[14px] font-bold text-indigo-600 self-center animate-pulse"
                      style={WAIT_BLINK_STYLE}
                    >
                      更新しています。終わりしだい自動更新にします…
                    </span>
                  ) : s.autoOn ? (
                    <>
                      {/* ★★★ 第393便: 「内容を確かめ直す」→「いますぐ更新する」。
                          ★ 自動更新中の店舗が手で押したい場面は「いますぐ反映させたい」だけ。
                          ★ 押すと、確かめてから【変わるところがあればその場で送る】（★ 名前どおりに動く）。 */}
                      <button
                        onClick={() => void onCheck(s, 'push_now')}
                        disabled={isBusy}
                        className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-600 disabled:opacity-50"
                      >
                        いますぐ更新する
                      </button>
                      <button
                        onClick={() => void setAuto(s.provider, s.slot, false)}
                        disabled={switching === k}
                        className="px-3 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        {switching === k ? '切り替えています…' : '自動をやめる'}
                      </button>
                    </>
                  ) : plan && plan.sendable === true && plan.changeCount > 0 ? (
                    <button
                      onClick={() => void doPush(s.provider, s.slot, plan.fingerprint, true)}
                      disabled={isBusy}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                    >
                      {isBusy ? '更新しています…' : '更新して自動にする'}
                    </button>
                  ) : (
                    <button
                      onClick={() => onMakeAuto(s)}
                      disabled={isBusy || switching === k}
                      className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                    >
                      {switching === k ? '切り替えています…' : '出勤を自動更新にする'}
                    </button>
                  )}
                </div>
              </>
            )}
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
      {!loading && !error && view && view.provider === 'ekichika' && view.direction === 'write' && (
        // ★★★ 第336便: 見出し「駅ちかの即ヒメ」を消し、状態そのもの（即ヒメ自動設定中）を見出しにした。
        //   ★ 見出しが【いま何が起きているか】を言う。★ 場所の名前（駅ちかの…）はタブで分かる。
        <AutoNote title="即ヒメ自動設定中" kirari>
          {/* ★★★ 第329便（2026-09-13・カッキーさんの添削）: 4行を1行にした。
              ★ 「長いので店舗様は読まない」。★ 読まれない正確さより、読まれる1行を選ぶ。
              ★★ 「10分ごと」と書かない。★ 「今すぐを押しても10分待たされる」と読まれる
                （実際は周が10分ごとに回るだけで、押した直後の周で上がる）。★ だから「数分以内」。 */}
          {/* ★ 第471便（カッキーさん）: 説明の1行「『今すぐ』のセラピストを数分以内に即ヒメにします。」は外した（見出しだけ） */}
        </AutoNote>
      )}

      {/* ── ★★★ エステ魂の即セラ（第322便・カッキーさんの質問から）──────────
          ★ 即セラには【スイッチが無い】。★ 周（sokusera-push・5分ごと）が拾う条件は
            「エステ魂がフクエスから反映で、連携が有効」だけ（src/app/api/admin/sokusera-push）。
          ★★ 駅ちかの即ヒメは「自動にする」を押さないと上がらない。★ 同じ画面に2つの決まりが並ぶので、
            **違うほうを書いておく**（★ カッキーさんが実際に取り違えた）。
          ★ ONだけ打ってOFFは打たない（★ 60分で向こうが切る）。★ 1周で1人だけ。
          ★ 駅ちかの即ヒメは第327便で【10分ごと・1周6人まとめて】になったが、即セラは5分ごと1人のまま。 */}
      {!loading && !error && view && view.provider === 'esutama' && view.direction === 'write' && (
        // ★ 第336便: 即ヒメと同じ形に揃えた（見出し＝状態・キラリ）
        <AutoNote title="即セラ自動設定中" kirari>
          {/* ★ 第330便: 駅ちかの即ヒメと同じ1行に揃えた（カッキーさん）。★ 周の分数は書かない */}
          {/* ★ 第471便: 説明の1行は外した（即ヒメと同じ） */}
        </AutoNote>
      )}
    </div>
  );
}
