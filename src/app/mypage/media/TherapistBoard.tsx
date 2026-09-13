'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSalonTherapists,
  getMediaRoster,
  getMediaOverview,
  getMediaLinkPairs,
  linkTherapistMediaId,
  unlinkTherapistMediaId,
  startMediaRosterRead,
  startMediaTherapistCreate,
  startMediaTherapistCreatePush,
} from '@/app/actions/mediaCredentials';
import type { RosterResult } from '@/lib/mediaRoster';
import { therapistSiteState, therapistSiteLabel, type TherapistSiteState } from '@/lib/mediaOverview';
import { findDuplicateNames, duplicateNotice } from '@/lib/therapistDuplicates';
import { canLink, strengthLabel, type LinkPairs } from '@/lib/mediaLinkPairs';

// セラピスト設定（第62便・㉞ その4）。
//
// ★★★ 主役はフクエスに登録されているセラピスト。各サイトはその【出先】（設計メモ §180）。
//   ★ 「フクエスで登録した子だけが設定できます」と画面に書く。
//     フクエスを直せば各サイトに揃う、という運営の形を、画面から伝えるため。
//
// ★★★★ 【第302便】画面の骨格を作り替えた（2026-09-12・カッキーさん）。
//   ★ 店舗オーナー様が「ごちゃごちゃして分からない」と、**見た瞬間に操作をあきらめていた**。
//   ★★ いちばんの原因は上のタブだった:
//     ・「どのサイトに出ているか」／「媒体側の登録と結びつける」
//     ・★ 後者は第三者に**意味が通じない**（"媒体"も"結びつける"もこちらの言葉）。
//     ・★ 同じ人の話が2つのタブに割れていて、どちらを見ればよいか決められない。
//   → ★★★ タブを【サイト】にした（駅ちか／エステ魂）。★ 1つのタブには、そのサイトの話だけを出す。
//   → ★★★ 「結びつける」画面は畳んで、**1人1行**に溶かした。
//     ★ 「確かめられません」の行に、その場で「『れみ』と結ぶ」「一覧から選ぶ」「◯◯へ登録」が並ぶ。
//     ★ 状態と、その状態でできることが、同じ行に載る（★ 画面を移動して覚えておく必要が無くなる）。
//   ★ RosterLinkBoard.tsx（旧・2つ目のタブ）は第314便で消した（★ 2日使って形が落ち着いたため）。
//
// ★★ 【第309便】画面の「結ぶ／結びつき」を【連携】に言い換えた（2026-09-12・カッキーさん）。
//   ★ 「結ぶ」はこの画面だけの言い方で、他の画面（連携の記録・連携中）と語が揃っていなかった。
//   ★ 中の名前（therapist_media_ids・linkTherapistMediaId・canLink）は変えていない。★ 画面の言葉だけ。
//
// ★★★ 「いません」と書いてよい場面を狭くしている（mediaOverview.therapistSiteState）。
//   番号が結びついていない人 … 「確かめられません」（★ いない、ではない）
//   向こうを読めていないとき  … 「まだ読んでいません」（★ います、でもない）

type Therapist = {
  id: string; name: string; age: string | null; imageUrl: string | null;
  isNewFace: boolean; newFaceSince: string | null; isActive: boolean;
};
type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };
/**
 * ★★★ 第303便（2026-09-12・カッキーさん）: 「すべて」をやめ、その場所を【連携済み】にした。
 *   ★ 「すべて」は選び方ではなく【選ばない】の意味で、押しても何も起きない場所を1つ占めていた。
 *   ★★ 連携済み と 確かめられていない方 で、全員がどちらか片方に必ず入る（★ 見落とす人が出ない）。
 */
type Filter = 'done' | 'todo' | 'new';

/**
 * ★★ 【登録】を出す媒体（第264便でエステ魂を足した）。
 *   ★★ サーバー側 mediaCredentials.ts の THERAPIST_CREATE_PROVIDERS と**同じ組**にすること
 *     （★ 'use server' のファイルから定数は import できない・第178便の見張り）。
 *   ★ 片方だけ足すと「ボタンは出るのに押すと止まる」か「押せるのにボタンが無い」になる。
 */
const CREATE_PROVIDERS = ['ekichika', 'esutama'];

/**
 * ★★ サイトの印（第302便）。★ タブを絵で見分けられるようにする（★ 文字だけだと並びが読み飛ばされる）。
 *   ★ 相手のロゴは使わない。★ こちらで作った1文字の印にする（★ 向こうの商標を持ち込まない）。
 *   ★ 知らない媒体はサイト名の1文字目に落ちる（★ 印が無くて崩れる、を起こさない）。
 */
const SITE_MARK: Record<string, string> = {
  ekichika: '駅',
  esutama: '魂',
  esulove: 'ラ',
  esran: '全',
};
function siteMark(s: Site): string {
  return SITE_MARK[s.provider] ?? (s.label.slice(0, 1) || '？');
}

/** ★ 出せる枠（ログイン情報がある／読むだけで見られる）。★ 同じ枠を二度並べない */
function pickCols(sites: Site[]): Site[] {
  const out: Site[] = [];
  for (const x of sites) {
    if (!(x.hasCredential || x.direction === 'read')) continue;
    if (out.some((c) => c.provider === x.provider && c.slot === x.slot)) continue;
    out.push(x);
  }
  return out;
}

/**
 * ★ 試し打ちの結果（1人ぶん）。★ どの行の下に開いているかを持つ。
 * ★ `plan` は運営の curl の試し打ちと同じ物（girlCreatePlan.ts）。★ 画面に出すのは下の summarizeCreatePlan で選ぶ。
 */
type CreateView = { tid: string; plan: Record<string, unknown>; warnings: string[] };

/**
 * ★★ サーバーの文言から、運営向けの印（★）と強調（**）を剥がす（第260便・第262便）。
 *   ★ 注意（warnings）も止めの文（error）も、同じ文を運営の curl でも読むので**サーバー側は触らない**。★ 画面で剥がす。
 */
function plainText(s: string): string {
  return s.replace(/★+\s*/g, '').replace(/\*\*/g, '');
}

/**
 * ★★ 試し打ちの `plan` から、店舗様に見せる行だけを取り出す（第260便）。
 *   ★ 出すのは 名前・年齢・サイズ・特徴・写真（設計メモ §4 B）。★ `plan` 全部は並べない（steps や guards は仕組みの言葉）。
 */
function summarizeCreatePlan(plan: Record<string, unknown>): Array<{ k: string; v: string }> {
  const v = (plan.values && typeof plan.values === 'object' ? plan.values : {}) as Record<string, unknown>;
  const s = (x: unknown) => (x === null || x === undefined || x === '' ? '' : String(x));
  const rows: Array<{ k: string; v: string }> = [];
  rows.push({ k: '名前', v: s(v.name) || '（空）' });
  rows.push({ k: '年齢', v: s(v.age) ? `${s(v.age)}歳` : '送りません（未設定）' });
  // ★ 第264便: 欄の名前が媒体で違う（駅ちか bust/waist/hip/cup ／ エステ魂 sizeB/sizeW/sizeH/sizeCup）。★ どちらでも読む
  const bust = s(v.bust) || s(v.sizeB), waist = s(v.waist) || s(v.sizeW), hip = s(v.hip) || s(v.sizeH), cup = s(v.cup) || s(v.sizeCup);
  const size = [s(v.tall) ? `T${s(v.tall)}` : '', bust ? `B${bust}` : '', waist ? `W${waist}` : '', hip ? `H${hip}` : '']
    .filter(Boolean).join(' ');
  rows.push({ k: 'サイズ', v: (size || '送りません（未設定）') + (cup ? `（${cup}カップ）` : '') });
  const badges = Array.isArray(plan.badges) ? (plan.badges as unknown[]).map(s).filter(Boolean) : [];
  rows.push({ k: '特徴', v: badges.length > 0 ? badges.join('・') : 'なし' });
  // ★ 写真は「送るか」だけ。★ 在処（bucket/path）は店舗様に意味が無い
  const hasPhoto = !!(plan.photo && typeof plan.photo === 'object');
  const photoNote = '送りません' + (s(plan.photoSkipped) ? `（${s(plan.photoSkipped)}）` : '');
  rows.push({ k: '写真', v: hasPhoto ? '1枚送ります（フクエスの1枚目・トップ画像になります）' : photoNote });
  return rows;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
    .format(new Date(t));
}

/** 「9/12 21:04」。★ 読めない値は空文字（"Invalid Date" を店舗に見せない） */
function fmtAt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

const STATE_CLASS: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missing: 'bg-rose-50 text-rose-700 border-rose-200',
  unlinked: 'bg-white text-slate-400 border-slate-200',
  unknown: 'bg-white text-slate-400 border-slate-200',
};

function Photo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // ★ next/image を使わない。★ 店舗が外部URLを入れている場合があり、
    //   remotePatterns に無いホストだと実行時に落ちる。★ ここは管理画面なので素の img で足りる
    return (
      <span className="w-[46px] h-[58px] flex-none overflow-hidden border border-slate-200 bg-slate-100 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} loading="lazy" className="w-full h-full object-cover" />
      </span>
    );
  }
  // ★ 空白にしない。★ 写真が無いのか読み込めていないのか、空白では分からない
  return (
    <span className="w-[46px] h-[58px] flex-none border border-slate-200 bg-slate-100 grid place-items-center text-[11px] font-bold leading-tight text-slate-400 text-center">
      写真<br />なし
    </span>
  );
}

export function TherapistBoard({ salonId, onToast }: {
  salonId: number | null;
  onToast: (m: string) => void;
}) {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [roster, setRoster] = useState<RosterResult[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('done');
  // ★ 第197便: どの枠を読みに行っているか（provider#slot）。★ 空なら読んでいない
  const [reading, setReading] = useState('');
  const [showAll, setShowAll] = useState(false);
  // ★★★ 第302便: タブは【サイト】。★ 'list' / 'link' の2枚は畳んだ
  const [site, setSite] = useState<Site | null>(null);
  // ★ 第260便: 開いている「この内容で登録します」（★ 1度に1人だけ。★ まとめて登録は作らない）
  const [createView, setCreateView] = useState<CreateView | null>(null);
  // ★ 第260便: 試し打ち中／送信中の行（therapistId）。★ 空なら何もしていない
  const [createBusy, setCreateBusy] = useState('');
  // ★★ 第302便: 結び（旧 RosterLinkBoard の中身）。★ いま開いているサイトのぶんだけ持つ
  const [pairs, setPairs] = useState<LinkPairs | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [linkBusy, setLinkBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const [t, r, ov] = await Promise.all([
      getSalonTherapists({ salonId }),
      getMediaRoster({ salonId }),
      getMediaOverview({ salonId }),
    ]);
    if (!t.ok) { setError(t.error); setLoading(false); return; }
    setTherapists(t.data);
    // ★ 名簿が取れなかったら黙って空にする。★ ここで「0人」と出すと揃っているように見える
    setRoster(r.ok ? r.data : []);
    const list = ov.ok ? (ov.data.sites as Site[]) : [];
    setSites(list);
    // ★ 最初に開くのは1つ目のサイト。★ すでに選んでいるものは動かさない（読み直しのたびに戻さない）
    const c = pickCols(list);
    setSite((prev) => prev ?? c[0] ?? null);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  // ★★ 開いているサイトの【結び】を読む。★ サイトを変えたら読み直す
  useEffect(() => {
    if (salonId == null || !site) { setPairs(null); return; }
    let live = true;
    void (async () => {
      const r = await getMediaLinkPairs({ salonId, provider: site.provider, slot: site.slot });
      // ★ 切り替えたあとに古い返事が届くことがある。★ 古いほうで上書きしない
      if (!live) return;
      if (!r.ok) { setPairs(null); setReadAt(null); return; }
      setPairs(r.data.pairs);
      setReadAt(r.data.readAtISO);
      setPick({});
    })();
    return () => { live = false; };
  }, [salonId, site, reloadKey]);

  const reloadPairs = () => setReloadKey((k) => k + 1);

  const onRead = async (s: Site) => {
    if (salonId == null) return;
    setReading(s.provider + '#' + s.slot);
    try {
      const res = await startMediaRosterRead({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast(`${s.label}の名簿を更新しています。数分後にこの画面を開き直すと反映されます`);
    } finally {
      setReading('');
    }
  };

  /**
   * ★★ 結ぶ（旧 RosterLinkBoard）。★ 押す前にも同じ関数で確かめる（サーバでも必ずもう一度確かめている）。
   *   ★ 番号は【選ぶ】もので、打つものではない（打ち間違いは他人の欄への書き込みになる）。
   */
  const onLink = async (t: Therapist, castId: string) => {
    if (salonId == null || !site || !pairs) return;
    const verdict = canLink(pairs, Number(t.id), castId);
    if (!verdict.ok) { onToast(verdict.error); return; }
    setLinkBusy(true);
    try {
      const res = await linkTherapistMediaId({
        salonId, provider: site.provider, slot: site.slot, therapistId: Number(t.id), castId,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast('連携しました。次に送るときから、この登録へ反映します');
      reloadPairs();
      void load();
    } finally { setLinkBusy(false); }
  };

  /** ★ 結んだものは必ず外せる（「戻せます」と書いた画面には戻すボタンがあること） */
  const onUnlink = async (t: Therapist) => {
    if (salonId == null || !site) return;
    setLinkBusy(true);
    try {
      const res = await unlinkTherapistMediaId({
        salonId, provider: site.provider, slot: site.slot, therapistId: Number(t.id),
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast((t.name || 'この方') + 'の連携を外しました');
      reloadPairs();
      void load();
    } finally { setLinkBusy(false); }
  };

  /**
   * ★★ 第260便: 試し打ち。★ 媒体へは1文字も送らない・読みもしない（★ サーバー側で材料を組むだけ）。
   *   ★ 結果を「この内容で登録します」として、その行の下に開く。
   */
  const onCreateDryRun = async (t: Therapist, c: Site) => {
    if (salonId == null) return;
    setCreateBusy(t.id);
    setCreateView(null);
    try {
      const res = await startMediaTherapistCreate({ salonId, provider: c.provider, slot: c.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      setCreateView({ tid: t.id, plan: res.data.plan, warnings: res.data.warnings });
    } finally {
      setCreateBusy('');
    }
  };

  /**
   * ★★★ 第260便: 実行。**相手に人が1人増える。** ★ 押せるのは「この内容で登録します」を見たあとだけ。
   *   ★ 結果はその場では返らない（中継が引き取る）。★ 「連携の記録」と、名簿を読み直したときに分かる。
   */
  const onCreatePush = async (t: Therapist, c: Site) => {
    if (salonId == null) return;
    setCreateBusy(t.id);
    try {
      const res = await startMediaTherapistCreatePush({ salonId, provider: c.provider, slot: c.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      onToast(`${c.label}へ登録を送りました。結果は「連携の記録」に出ます。数分後に「${c.label}の名簿を更新する」を押すと、この一覧にも反映されます`);
      setCreateView(null);
    } finally {
      setCreateBusy('');
    }
  };

  if (salonId == null) return null;

  const key = (x: { provider: string; slot: number }) => x.provider + '#' + x.slot;
  const cols = pickCols(sites);
  const rosterOf = site ? roster.find((x) => x.provider === site.provider && x.slot === site.slot) ?? null : null;

  /**
   * ★★★ 第303便その3（カッキーさん）: そのサイトの名簿を一度でも読めているか。
   *   ★ 読めていないと全員が「まだ読んでいません」になり、赤い数字が【40】になる。
   *   ★ 嘘ではないが、初めて開いた店舗様には「40人ぶん間違っている」に見える。
   *   → ★ 未読のあいだは数を出さず、代わりに【まず何をするか】を1行で言う。
   *   ★ 判定の元は札（stateOf）と同じもの。★ 別の元にすると、札と数字がずれる。
   */
  const rosterKnown = rosterOf?.missingOnMediaKnown === true;

  // ★ サイトごとの判定。★ 「いません」と言ってよい場面は mediaOverview.therapistSiteState が狭めている
  const stateOf = (t: Therapist): TherapistSiteState =>
    therapistSiteState({
      isUnlinked: (rosterOf?.unlinked ?? []).some((p) => String(p.id) === t.id),
      isMissing: (rosterOf?.missingOnMedia ?? []).some((p) => String(p.id) === t.id),
      known: rosterOf?.missingOnMediaKnown === true,
    });

  // ★ 同じ名前で公開中の方（★ 0件なら空文字が返り、何も出さない）
  const dupNotice = duplicateNotice(findDuplicateNames(therapists));
  const isTodo = (t: Therapist) => site != null && stateOf(t) !== 'present';
  /**
   * ★★★ 第303便その2（カッキーさん）: 「確かめられていない方」の札に【数】を出す。
   *   ★ 既定は「連携済み」のままにして、手当てが要る人がいることだけを数で知らせる。
   *   ★ 0のときは何も出さない（★ 「0」を出すと、いつも何か残っているように見える）。
   *   ★ 名簿をまだ読めていないサイトでは全員がここに入る（★ それも事実なので、そのまま数える）。
   */
  const todoCount = therapists.filter(isTodo).length;
  const filtered = therapists.filter((t) => {
    if (filter === 'new') return t.isNewFace;
    if (filter === 'todo') return isTodo(t);
    // ★ 第303便: 「連携済み」＝そのサイトの名簿にいた方だけ（★ 確かめられていない方の裏返し）
    return site != null && stateOf(t) === 'present';
  });
  /**
   * ★★★ 第304便（2026-09-12・カッキーさん）: 「連携済み」だけは【写真の一覧】にする。
   *   ★ ここに出るのは、そのサイトに出ているのが確定した方だけ。★ 全員の札が同じ言葉になる。
   *   ★ 同じ言葉が40回並ぶのは、確かめる助けにならない（★ 列ごと落とした）。
   *   ★ 空いた幅で1行に何人も並べる。★ 顔と名前だけ。★ 年齢は落とす（カッキーさん）。
   *   ★ することがある画面（確かめられていない方・新人）は、いままでどおり表のまま。
   *     ★ 行ごとにボタンが要るので、写真の一覧では収まらない。
   */
  const asPhotos = filter === 'done';
  const shown = showAll ? filtered : filtered.slice(0, asPhotos ? 24 : 10);

  // ★ フクエスにいないのに媒体側に残っている名前。★ 読めていないときは空＝「分からない」
  const onlyKnown = rosterOf?.onlyOnMediaKnown === true;
  const onlyOnMedia = onlyKnown ? (rosterOf?.onlyOnMedia ?? []) : [];

  // ★ 読めている名簿だけを持つ（★ known=false のときの空配列を「いません」と読ませない）
  const kp = pairs && pairs.known ? pairs : null;
  const unlinkedOf = (t: Therapist) => kp?.unlinked.find((p) => String(p.therapistId) === t.id) ?? null;
  const linkedOf = (t: Therapist) => kp?.linked.find((p) => String(p.therapistId) === t.id) ?? null;
  const busy = linkBusy || createBusy !== '';

  return (
    <div className="space-y-3">

      {/* ── いまの状態 ─────────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[14px] text-rose-600 leading-relaxed">
            セラピストを読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : (
          <>
            <p className="text-[19px] font-black text-slate-800">
              フクエスのセラピスト {therapists.length}名
            </p>
            {/* ★ 第300便（カッキーさん）: 2文を1文に。★ 「登録してください」で終わらせず、その場から行ける道を置く。
                ★ 別ウインドウで開く（★ 設定の途中でこの画面を閉じさせない） */}
            <p className="mt-0.5 text-[14px] text-slate-500 leading-relaxed">
              {/* ★★ 第307便（2026-09-12・カッキーさん）: 「登録した子だけ」→「登録している子のみ」。
                  ★ 駅ちかの取り込みから始めた店舗様は、フクエスで【登録した】覚えが無い。
                  ★ 取り込みで入った子も、いまフクエスに居れば設定できる。★ そこを誤解させない言い方にした。 */}
              フクエスで登録している子のみ設定できます。{' '}
              <Link
                href="/mypage?tab=profile"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-indigo-600 underline"
              >
                ⇨ セラピストを登録する
              </Link>
            </p>

            {/* ★★★ 同じ名前で公開中の方がいたら知らせる（第119便・カッキーさん）。
                ★★ ここは【気づかせるだけ】。★ 消さない・止めない・原因を決めつけない */}
            {dupNotice && (
              <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[14px] leading-relaxed text-slate-700">{dupNotice}</p>
                <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
                  同じ方であれば、どちらか一方を非公開にしてください。別の方であればそのままで問題ありません。
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── ★★★ サイトのタブ（第302便・カッキーさん）───────────────
          ★ 1つのタブには、そのサイトの話だけを出す。★ 印（駅・魂）はこちらで作った1文字（相手のロゴは使わない）。 */}
      {!loading && !error && cols.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cols.map((c) => {
            const on = site != null && key(site) === key(c);
            return (
              <button
                key={key(c)}
                type="button"
                onClick={() => { setSite(c); setFilter('done'); setShowAll(false); setCreateView(null); }}
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
                  {siteMark(c)}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── 一覧（開いているサイトのぶんだけ）─────────────────── */}
      {!loading && !error && site && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          {/* ★ いつ時点の話かを、読み直すボタンの隣に置く（★ 押す意味がここで分かる） */}
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <button
              type="button"
              onClick={() => onRead(site)}
              disabled={reading !== '' || site.direction === 'off'}
              className="text-[13.5px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 disabled:opacity-50"
            >
              {/* ★★ 第308便（2026-09-12・カッキーさん）: 「読み直す」→「更新する」。
                  ★ 「読む」はこちら側の動き（向こうの画面を読みに行く）で、第三者には何が起きるか伝わらない。
                  ★ 店舗様から見れば、この画面の中身が新しくなること＝更新。★ 画面中の言い方を全部そろえた。 */}
              {reading === key(site) ? '更新しています…' : `${site.label}の名簿を更新する`}
            </button>
            {/* ★ 第303便その3: 読めているときだけ出す。★ 未読のことは下の1行が言う（同じことを2回言わない） */}
            {kp && (
              <span className="text-[13px] text-slate-400 tabular-nums">
                {/* ★★ 第306便（カッキーさん）: 名簿に【載っている】件数を出す。
                    ★ 前は free + takenCastIds だった。★ taken には「名簿から消えた登録に結んだままの分」も入るので、
                      ★ 実際の名簿より多い数（ラビリンス様は 38件の名簿が 39件）になっていた。
                    ★ 空いている数 ＋ 名簿で確かめられた結び＝いま名簿に載っている数。 */}
                {site.label}の登録 {kp.free.length + kp.linked.filter((l) => l.onMedia).length}件{readAt ? `／最終確認 ${fmtAt(readAt)}` : ''}
              </span>
            )}
          </div>

          {/* ★ 第198便: 押せないボタンには理由を添える（§185・できないことは理由といっしょに）。★ 写しはそのまま使える */}
          {site.direction === 'off' && (
            <p className="mb-3 text-[13px] text-slate-400 leading-relaxed">
              現在「反映しない」設定のため、名簿の更新不可。
              更新するには、ホームで「フクエスから反映」にしてください。
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[13px] font-bold text-slate-400 tabular-nums mr-1">
              {filtered.length} / {therapists.length}名中
            </span>
            {([['done', '連携済み'], ['todo', '確かめられていない方'], ['new', '新人']] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => { setFilter(k); setShowAll(false); }}
                aria-pressed={filter === k}
                className={`inline-flex items-center px-3 py-1.5 border text-[14px] font-bold transition-colors ${
                  filter === k ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {label}
                {/* ★ 第303便その2: 手当てが要る人数の札。★ 押す前に、何人いるかが分かる */}
                {k === 'todo' && rosterKnown && todoCount > 0 && (
                  <span
                    // ★ 読み上げにも意味が通るようにする（★ 数字だけだと何の数か分からない）
                    aria-label={`${todoCount}名`}
                    className="ml-1.5 inline-block min-w-[20px] px-1 text-[12px] font-black text-center bg-rose-600 text-white"
                  >
                    {todoCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ★★ 第303便その3: 未読のあいだは【まず何をするか】だけ言う（カッキーさん）。
              ★ 数（バッジ）は出さない。★ 全員が「まだ読んでいません」なので、数えても手当ての量にならない。
              ★ 「反映しない」のサイトでは出さない（★ すぐ上に、読みに行かない理由と直し方が出ている）。 */}
          {!rosterKnown && site.direction !== 'off' && (
            <div className="mb-3 border border-sky-200 bg-sky-50 px-3 py-2.5">
              <p className="text-[14px] leading-relaxed text-slate-600">
                <b className="font-bold text-sky-700">{site.label}の名簿をまだ読んでいません。</b>{' '}
                まず上の「{site.label}の名簿を更新する」を押してください（数分かかります）。
                読むまでは、どなたが{site.label}に出ているか分かりません。
              </p>
            </div>
          )}

          {asPhotos ? (
            /* ── ★★★ 連携済み（第304便）── 顔と名前だけ。★ 札も列も出さない（全員同じなので） */
            shown.length === 0 ? (
              <p className="text-[14px] text-slate-500">
                {site.label}と連携できている方は、まだいません。
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                {shown.map((t) => (
                  <div key={t.id} className="min-w-0">
                    <div className="w-full aspect-[3/4] border border-slate-200 bg-slate-100 overflow-hidden">
                      {t.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.imageUrl} alt={t.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        // ★ 空白にしない。★ 写真が無いのか読み込めていないのか、空白では分からない
                        <span className="w-full h-full grid place-items-center text-[12px] font-bold text-slate-400">
                          写真なし
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[13.5px] font-bold text-slate-700 leading-snug break-words text-center">
                      {t.name || '（名前なし）'}
                    </p>
                    {/* ★ 非公開の方は出勤を送る相手ではない。★ 顔だけ並ぶ画面でも、そこは黙らない */}
                    {!t.isActive && (
                      <p className="text-center">
                        <span className="inline-block text-[11.5px] font-bold px-1.5 py-px border border-slate-200 bg-slate-50 text-slate-400">
                          非公開
                        </span>
                      </p>
                    )}
                  </div>
                ))}
                {/* ★★★ 第304便その2（カッキーさん）: 続きは【最後のマス】で知らせる。
                    ★ 下の「残り○名を見る」の文字リンクは、写真の列の下に沈んで見逃されていた。
                    ★ 並びの続きの場所に、同じ大きさのマスで置く（★ 目が動く先にある）。
                    ★ 押すと全員出る（★ ここから先はもう畳まない）。 */}
                {!showAll && filtered.length > shown.length && (
                  <button
                    type="button"
                    onClick={() => setShowAll(true)}
                    className="min-w-0 text-left group"
                  >
                    <span className="w-full aspect-[3/4] border border-dashed border-indigo-300 bg-indigo-50 grid place-items-center text-center px-2 group-hover:bg-indigo-100 transition-colors">
                      <span>
                        <span className="block text-[22px] font-black text-indigo-700 tabular-nums leading-none">
                          ＋{filtered.length - shown.length}
                        </span>
                        <span className="block mt-1.5 text-[12.5px] font-bold text-indigo-600 leading-snug">
                          残りの方も<br />見る
                        </span>
                      </span>
                    </span>
                  </button>
                )}
              </div>
            )
          ) : (
          <div className="overflow-x-auto border border-slate-200">
            {/* ★★ 第312便: スマホでは下限幅を外す（★ 520px だと 360px の画面で必ず横スクロールになる）。
                ★ 中身（選ぶ箱・ボタン）は折り返せるので、狭いなりに縦へ伸びる。★ PCは今までどおり。 */}
            <table className="w-full text-[14.5px] sm:min-w-[520px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  {/* ★ 第301便: 幅を決めて、印を名前のすぐ右に寄せた（★ 決めないと余りが配られて間延びする） */}
                  <th className="font-bold text-[12.5px] text-slate-400 px-3 py-2 w-[130px] sm:w-[190px]">セラピスト</th>
                  <th className="font-bold text-[12.5px] text-slate-400 px-3 py-2">{site.label}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const st = stateOf(t);
                  const up = unlinkedOf(t);
                  const lp = linkedOf(t);
                  // ★★★ 「登録」を出す条件（設計メモ §3・§4 D）。★ 「確かめられません」（番号が無い＝新しい方）だけ。
                  //   ★ 「います」（もう居る）と「まだ読んでいません」（読んでいないのに送らない）には出さない。
                  //   ★★★ 【第262便】「いません」にも出さない。★ 材料づくりが「結びついていれば積まない」ので必ず止まる。
                  const canCreate = CREATE_PROVIDERS.includes(site.provider) && site.hasCredential && st === 'unlinked';
                  const view = createView && createView.tid === t.id ? createView : null;
                  return (
                    <Fragment key={t.id}>
                      <tr className="border-t border-slate-100 align-top">
                        <td className="px-3 py-2.5">
                          <span className="flex gap-2.5 items-start">
                            <Photo url={t.imageUrl} name={t.name} />
                            <span className="min-w-0">
                              <b className="block text-[15px] font-bold text-slate-800 break-words">{t.name || '（名前なし）'}</b>
                              {t.age && <span className="block text-[13px] text-slate-400">{t.age}歳</span>}
                              {t.isNewFace && (
                                <span className="inline-block mt-1 text-[12px] font-bold px-1.5 py-px border border-rose-200 bg-rose-50 text-rose-700">
                                  新人{t.newFaceSince ? ` ${fmtDate(t.newFaceSince)}` : ''}
                                </span>
                              )}
                              {/* ★ 非公開の方は出勤を送る相手ではない。★ 隠さずに、そう書く */}
                              {!t.isActive && (
                                <span className="inline-block mt-1 text-[12px] font-bold px-1.5 py-px border border-slate-200 bg-slate-50 text-slate-400">
                                  非公開
                                </span>
                              )}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-block text-[13px] font-bold px-2.5 py-0.5 border ${STATE_CLASS[st]}`}>
                            {therapistSiteLabel(st)}
                          </span>

                          {/* ★★★ 第302便: 状態でできることを【同じ行に】出す（★ 別のタブへ行かせない）。
                              ★ 確かめられません（番号が無い）… 結ぶ／一覧から選ぶ／新しく登録
                              ★ いません（番号はあるのに名簿に無い）… 外す
                              ★ います・まだ読んでいません … 何も出さない（することが無い） */}
                          {up && (
                            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {/* ★★★ 第306便（カッキーさん）: 空いている登録が1つも無いときは、
                                  ★ 選ぶ箱と「結ぶ」を出さない。★ 押せそうに見えて何も選べない形になっていた。
                                  ★ 空いていない＝その方は向こうにまだ居ない、ということ。★ することは【新しく登録】だけ。
                                  ★ 候補（…と結ぶ）も空いている登録からしか作らないので、ここでは必ず0件になる。 */}
                              {(kp?.free.length ?? 0) === 0 ? (
                                <span className="text-[12.5px] leading-snug text-slate-500">
                                  {site.label}に空いている登録はありません（まだ{site.label}にいない方です）
                                </span>
                              ) : (
                              <>
                              {/* ★ 候補は強い順。★ 「読みが同じ」は弱い根拠だと分かるように書く */}
                              {up.candidates.map((c) => (
                                <button
                                  key={c.castId}
                                  type="button"
                                  onClick={() => onLink(t, c.castId)}
                                  disabled={busy}
                                  className="text-[13px] font-bold px-2.5 py-1 border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-50"
                                >
                                  「{c.mediaName}」と連携する
                                  <span className="ml-1 font-bold text-[11.5px] text-emerald-600">
                                    {strengthLabel(c.strength)}
                                  </span>
                                </button>
                              ))}
                              {/* ★ 番号は選ぶもの。★ 手で打たせない */}
                              <select
                                value={pick[t.id] ?? ''}
                                onChange={(e) => setPick({ ...pick, [t.id]: e.target.value })}
                                className="text-[13px] border border-slate-200 px-2 py-1 max-w-[190px]"
                              >
                                <option value="">{site.label}の一覧から選ぶ…</option>
                                {(kp?.free ?? []).map((e) => (
                                  <option key={e.castId} value={e.castId}>{e.name || '（名前なし）'}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => onLink(t, pick[t.id] ?? '')}
                                disabled={busy || !pick[t.id]}
                                className="text-[13px] font-bold px-2.5 py-1 border border-slate-200 text-slate-600 disabled:opacity-40"
                              >
                                連携する
                              </button>
                              </>
                              )}
                              {canCreate && (
                                <button
                                  type="button"
                                  onClick={() => onCreateDryRun(t, site)}
                                  disabled={busy}
                                  className="text-[13px] font-bold px-2.5 py-1 border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
                                >
                                  {createBusy === t.id && !view ? '確かめています…' : `${site.label}へ新しく登録`}
                                </button>
                              )}
                            </span>
                          )}

                          {st === 'missing' && lp && (
                            <span className="mt-1.5 flex flex-wrap items-center gap-2">
                              <span className="text-[12.5px] leading-snug text-slate-500">
                                {lp.mediaName ? `「${lp.mediaName}」と連携しています` : '連携した名簿がみつかりません'}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUnlink(t)}
                                disabled={busy}
                                className="text-[13px] font-bold px-2.5 py-1 border border-slate-200 text-slate-600 disabled:opacity-50"
                              >
                                連携を外す
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* ── ★★★ 第260便: この内容で登録します（★ 押す前に1枚見せる・設計メモ §4 B）──
                          ★ 行の真下にインラインで開く（★ 重ねる窓にしない。★ 誰の話かが上の行で見えたまま）。 */}
                      {view && (
                        <tr className="border-t border-indigo-100 bg-indigo-50/40">
                          <td colSpan={2} className="px-3 py-3">
                            <div className="max-w-[640px] whitespace-normal">
                              <p className="text-[15px] font-black text-slate-800">
                                {t.name || '（名前なし）'} を {site.label} へ、この内容で登録します
                              </p>
                              <dl className="mt-2 border border-slate-200 bg-white divide-y divide-slate-100">
                                {summarizeCreatePlan(view.plan).map((r) => (
                                  <div key={r.k} className="flex gap-3 px-3 py-1.5 text-[14px]">
                                    <dt className="w-[52px] flex-none font-bold text-slate-400">{r.k}</dt>
                                    <dd className="min-w-0 text-slate-700 break-words">{r.v}</dd>
                                  </div>
                                ))}
                              </dl>
                              {/* ★ 注意はサーバーが作った文言をそのまま（★ 写真が無い／特徴が当たらない／フクエスでは非公開 など） */}
                              {view.warnings.length > 0 && (
                                <ul className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                                  {view.warnings.map((w, i) => (
                                    <li key={i} className="text-[13.5px] leading-relaxed text-slate-700">{plainText(w)}</li>
                                  ))}
                                </ul>
                              )}
                              {/* ★★ 消し方はここに書く（設計メモ §4 A）。★ フクエスの口から消せるのは運営だけ */}
                              <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">
                                登録は{site.label}に<b className="font-bold text-slate-700">すぐ公開</b>されます。
                                消すときは、{site.label}の管理画面から直接消してください（この画面からは消せません）。
                                同じ名前の方が{site.label}にすでにいる場合は、登録されずに終わります。
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setCreateView(null)}
                                  disabled={createBusy !== ''}
                                  className="px-4 py-2 border border-slate-200 text-[14px] font-bold text-slate-500 disabled:opacity-50"
                                >
                                  やめる
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onCreatePush(t, site)}
                                  disabled={createBusy !== ''}
                                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[14px] font-bold shadow-sm disabled:opacity-50"
                                >
                                  {createBusy !== '' ? '送っています…' : '登録する'}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* ★ 第304便その2: 写真の一覧では、最後のマスが同じ役をする（★ 二度出さない） */}
          {!asPhotos && filtered.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 text-[14px] font-bold text-slate-500 underline">
              残り{filtered.length - shown.length}名を見る
            </button>
          )}

          {/* ★★ 候補は候補でしかない（旧 RosterLinkBoard の警告）。★ 連携するボタンが1つでも出るときだけ出す。
              ★★★ 第317便（2026-09-13・カッキーさん）: 判定を【いま出している人】に狭めた。
                ★ それまではサイト全体を見ていたので、「連携済み」を開いているとき——
                  ★ 画面に候補ボタンが1つも無いのに——注意書きだけが出ていた。
                ★ 見えている先を残さず絞り込みも数えるので、10人目より下に候補があっても出る。 */}
          {filtered.some((t) => (unlinkedOf(t)?.candidates.length ?? 0) > 0) && (
            <div className="mt-3 border border-sky-200 bg-sky-50 px-3 py-2.5">
              <p className="text-[14px] leading-relaxed text-slate-600">
                <b className="font-bold text-sky-700">「読みが同じ」は候補にすぎません。</b>{' '}
                別の方が同じ読みのこともあるので、{site.label}の管理画面で確かめてから連携してください。
                間違えて連携すると、その方の出勤が別の方の欄に入ります。
              </p>
            </div>
          )}

          {/* ★★★ 第305便（2026-09-12・カッキーさん）: 説明を【いま出ている札のぶんだけ】にした。
              ★ 4つ並べていたが、文字の塊を見た時点で読む気が失せる（★ 店舗オーナー様の反応）。
              ★★ 減らしたのは【出ていない札の説明】。★ 4つの札そのものは減らしていない（第119便の決めごとは生きている）。
              ★ 言葉の正は therapistSiteLabel（★ 札とここで違う言い方をしない）。
              ★ 1行は【状態 → やること】まで。★ 理由の言い換えは書かない（★ 札がすでに言っている）。
              ★ 「連携済み」は説明しない（★ 言葉のとおり。★ 写真の一覧では札そのものが無い）。
              ★★ 太字のあとは全角スペース（第261便）。★ 改行だけだと JSX が詰めて「いません名簿に」と繋がる。
              ★ 「写真はフクエスに登録したものです…」は外した（★ 「写真なし」と出ていれば分かる）。 */}
          {(() => {
            const seen = new Set(filtered.map((t) => stateOf(t)));
            const rows = ([
              ['missing', 'text-rose-700', '「連携を外す」と、登録し直せます'],
              ['unlinked', 'text-slate-500', '「連携する」か「新しく登録」を押してください'],
              ['unknown', 'text-slate-500', '上の「名簿を更新する」を押してください'],
            ] as const).filter(([k]) => seen.has(k));
            if (rows.length === 0) return null;
            return (
              <div className="mt-3 space-y-1 text-[13px] text-slate-400 leading-relaxed">
                {rows.map(([k, cls, todo]) => (
                  <p key={k}>
                    <b className={`font-bold ${cls}`}>{therapistSiteLabel(k)}</b>
                    　→ {todo}
                  </p>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── フクエスにいないのに、そのサイトに残っている方 ─────────────
          ★★ 第307便（カッキーさん）: 0名のときは【箱ごと出さない】。
            ★ 見出しと「0名」だけの空の箱は、画面を1つぶん重くするだけだった。
            ★★ 消してよいのは【読めていて0名】のときだけ。
              ★ 名簿を読めていないときは箱を出す（★ 分からないことを「無い」と見せない・第119便の決めごと）。 */}
      {!loading && !error && site && !(onlyKnown && onlyOnMedia.length === 0) && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[15.5px] font-bold text-slate-700">
              フクエスにいないのに、{site.label}に残っている方
            </h3>
            <span className="text-[13px] font-bold px-2.5 py-0.5 border bg-white text-slate-400 border-slate-200 tabular-nums">
              {onlyKnown ? `${onlyOnMedia.length}名` : '—'}
            </span>
          </div>

          {!onlyKnown ? (
            /* ★ 読めていないことを「0名」と書かない */
            <p className="text-[14px] text-slate-500 leading-relaxed">
              {site.label}の名簿をまだ読めていないので、分かりません。
              上の「{site.label}の名簿を更新する」を押すと確かめられます。
            </p>
          ) : (
            <>
              <ul className="border border-slate-200 divide-y divide-slate-100">
                {onlyOnMedia.map((n) => (
                  <li key={n} className="px-3 py-2.5 text-[15px] text-slate-700">{n}</li>
                ))}
              </ul>
              <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
                フクエスを辞めた方が、{site.label}側に残っていることがあります。
                フクエスにいない方なので上の一覧には出ません。ここだけ別に出しています。
              </p>
            </>
          )}
        </div>
      )}

      {!loading && !error && cols.length === 0 && (
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">向こうの名簿を読めるサイトがありません。</b>{' '}
            ログイン情報を登録するか、駅ちかから反映するようにすると、だれがどのサイトに出ているかを確かめられます。
          </p>
          <Link href="/mypage/media" className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline">
            ホームで確かめる
          </Link>
        </div>
      )}
    </div>
  );
}
