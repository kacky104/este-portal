'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSalonTherapists,
  getMediaRoster,
  getMediaOverview,
  startMediaRosterRead,
  startMediaTherapistCreate,
  startMediaTherapistCreatePush,
} from '@/app/actions/mediaCredentials';
import type { RosterResult } from '@/lib/mediaRoster';
import { therapistSiteState, therapistSiteLabel, type TherapistSiteState } from '@/lib/mediaOverview';
import { findDuplicateNames, duplicateNotice } from '@/lib/therapistDuplicates';

// セラピスト一覧（第62便・㉞ その4）。
//
// ★★★ 主役はフクエスに登録されているセラピスト。各サイトはその【出先】（設計メモ §180）。
//   ★ 「フクエスに登録されている方だけを出しています」と画面に書く。
//     フクエスを直せば各サイトに揃う、という運営の形を、画面から伝えるため。
//
// ★★★ 【第260便】「出す」を付けた（★ 駅ちかだけ・1人ずつ・設計メモ_セラピスト登録を店舗様の画面から §5 ②）。
//   ★ 第62便〜第259便まで「出す・消す」を付けなかった理由は2つあった:
//     ① §81 の順番（削除が先・登録は最後）    … ★ 解消。削除（第228便）→ 登録（第235便）の順で実弾が通った
//     ② ㉟ エステラブの二重登録の挙動が未確認 … ★ 駅ちかにだけ出すので残らない（媒体ごとに口を開ける）
//   ★★ 「消す」は付けない（設計メモ §4 A）。★ フクエスの口から消せるのは運営だけ。
//     ★ 店舗様は駅ちかの管理画面に直接ログインすれば、いつでも消せる（★ ログイン情報はご自身のもの）。
//   ★★ 押す前に【試し打ちの結果】を1枚見せ、人が「登録する」を押してから送る（設計メモ §4 B）。
//     ★ 指紋は無い。★ 送るのは1人だけ・名指しなので、押した時点の最新を送るのが正しい。
//   ★★★ 【第262便】mediaSites.can の駅ちかに 'therapist' を足した（★ §5 ③④の実弾が通ってから・第142便の物差し）。
//   ★★ 【第264便】エステ魂の列にも出す（CREATE_PROVIDERS）。★ エステ魂の 'therapist' は実弾が通ってから。
//   ★★ 【第262便】「いません」の方には【登録】を出さず、「結びつきを外すと登録できます」の案内（設計メモ 追記A・案 b）。
//
// ★★★ 「いません」と書いてよい場面を狭くしている（mediaOverview.therapistSiteState）。
//   番号が結びついていない人 … 「まだ結びついていません」（★ いない、ではない）
//   向こうを読めていないとき  … 「まだ確かめていません」（★ います、でもない）

type Therapist = {
  id: string; name: string; age: string | null; imageUrl: string | null;
  isNewFace: boolean; newFaceSince: string | null; isActive: boolean;
};
type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };
type Filter = 'all' | 'todo' | 'new';

/**
 * ★★ 【登録】を出す媒体（第264便でエステ魂を足した）。
 *   ★★ サーバー側 mediaCredentials.ts の THERAPIST_CREATE_PROVIDERS と**同じ組**にすること
 *     （★ 'use server' のファイルから定数は import できない・第178便の見張り）。
 *   ★ 片方だけ足すと「ボタンは出るのに押すと止まる」か「押せるのにボタンが無い」になる。
 *   ★ mediaSites.can の 'therapist' は【実弾が通ってから】足す（第142便の物差し）ので、ここの元にはしない。
 */
const CREATE_PROVIDERS = ['ekichika', 'esutama'];

/**
 * ★ 試し打ちの結果（1人ぶん）。★ どの行・どの列の下に開いているかを持つ。
 * ★ `plan` は運営の curl の試し打ちと同じ物（girlCreatePlan.ts）。★ 画面に出すのは下の summarizeCreatePlan で選ぶ。
 */
type CreateView = { tid: string; colKey: string; plan: Record<string, unknown>; warnings: string[] };

/**
 * ★ サーバーの文言から、運営向けの印（★）と強調（**）を剥がす（第260便・第262便）。
 *   ★ 注意（warnings）も止めの文（error）も、同じ文を運営の curl でも読むので**サーバー側は触らない**。★ 画面で剥がす。
 */
function plainText(s: string): string {
  return s.replace(/★+\s*/g, '').replace(/\*\*/g, '');
}

/**
 * ★★ 試し打ちの `plan` から、店舗様に見せる行だけを取り出す（第260便）。
 *   ★ 出すのは 名前・年齢・サイズ・特徴・写真（設計メモ §4 B）。★ `plan` 全部は並べない（steps や guards は仕組みの言葉）。
 *   ★ 形が違っても落ちないように、1つずつ確かめて読む（★ `plan` は Record<string, unknown>）。
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
  // ★ 第264便で「エステ魂は登録のあとに別に送ります」と書いていたが、★★★ 第269便でエステ魂も登録のあと写真まで送るようになった（第267便で貫通）。
  //   ★ 媒体で分けない。★ 送らないときは理由を書く（★ 「送りません」だけだと写真が無いのかと読める）。★ 理由はサーバー（photoSkipped）が作る
  const photoNote = '送りません' + (s(plan.photoSkipped) ? `（${s(plan.photoSkipped)}）` : '');
  // ★ 駅ちかは枠1を指名して入れる（第248便）。★ エステ魂は指名できず空き枠へ詰める（第245便）が、登録直後は全枠空きなので同じく枠1＝トップ画像
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

export function TherapistBoard({ salonId, onToast, children }: {
  salonId: number | null;
  onToast: (m: string) => void;
  /**
   * ★ 2つ目のタブの中身（媒体側の登録と結びつける）。★ 第119便でタブにした（縦に長すぎたため）。
   * ★★ タブが選ばれるまで**描かない**ので、開くまで読みに行かない（無駄な問い合わせを増やさない）。
   */
  children?: React.ReactNode;
}) {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [roster, setRoster] = useState<RosterResult[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // ★ 第197便: どの枠を読みに行っているか（provider#slot）。★ 空なら読んでいない
  const [reading, setReading] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<'list' | 'link'>('list');
  // ★ 第260便: 開いている「この内容で登録します」（★ 1度に1人だけ。★ まとめて登録は作らない）
  const [createView, setCreateView] = useState<CreateView | null>(null);
  // ★ 第260便: 試し打ち中／送信中の行と列（therapistId#provider#slot）。★ 空なら何もしていない
  const [createBusy, setCreateBusy] = useState('');

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
    setSites(ov.ok ? ov.data.sites : []);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const onRead = async (s: Site) => {
    if (salonId == null) return;
    setReading(s.provider + '#' + s.slot);
    try {
      const res = await startMediaRosterRead({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast(`${s.label}の名簿を読みに行きました。数分後にこの画面を開き直すと反映されます`);
    } finally {
      setReading('');
    }
  };

  /**
   * ★★ 第260便: 試し打ち。★ 媒体へは1文字も送らない・読みもしない（★ サーバー側で材料を組むだけ）。
   *   ★ 結果を「この内容で登録します」として、その行の下に開く。
   */
  const onCreateDryRun = async (t: Therapist, c: Site) => {
    if (salonId == null) return;
    const k = t.id + '#' + c.provider + '#' + c.slot;
    setCreateBusy(k);
    setCreateView(null);
    try {
      const res = await startMediaTherapistCreate({ salonId, provider: c.provider, slot: c.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      setCreateView({ tid: t.id, colKey: c.provider + '#' + c.slot, plan: res.data.plan, warnings: res.data.warnings });
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
    const k = t.id + '#' + c.provider + '#' + c.slot;
    setCreateBusy(k);
    try {
      const res = await startMediaTherapistCreatePush({ salonId, provider: c.provider, slot: c.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      onToast(`${c.label}へ登録を送りました。結果は「連携の記録」に出ます。数分後に「${c.label}の名簿を読み直す」を押すと、この一覧にも反映されます`);
      setCreateView(null);
    } finally {
      setCreateBusy('');
    }
  };

  if (salonId == null) return null;

  // ★ 「フクエスにいないのに残っている方」と上の数字は、駅ちか（正本）を主にする（第197便でもここは変えない）
  const readSite = sites.find((s) => s.direction === 'read') ?? null;
  const rosterOf = readSite
    ? roster.find((x) => x.provider === readSite.provider && x.slot === readSite.slot) ?? null
    : null;

  /**
   * ★★★ 第197便（2026-09-07・カッキーさん）: 表の列を【ログイン情報のあるサイトごと】にする。
   *   ★ これまでは「駅ちかから反映中」の1サイトだけを描いていた。★ エステ魂の名簿は
   *     「媒体側の登録と結びつける」がすでに読んで写しを残している（esutama_roster）のに、一覧に出ていなかった。
   *   ★ 読める（read）サイトは鍵が無くても列に入れる（公開ページを読むだけ・siteDirection の決めごと）。
   *   ★ 並びはホームと同じ（getMediaOverview の順）。
   */
  const key = (x: { provider: string; slot: number }) => x.provider + '#' + x.slot;
  const cols: Site[] = [];
  for (const x of sites) {
    if (!(x.hasCredential || x.direction === 'read')) continue;
    if (cols.some((c) => key(c) === key(x))) continue;
    cols.push(x);
  }
  const rosterFor = (c: Site) => roster.find((x) => x.provider === c.provider && x.slot === c.slot) ?? null;

  // ★ サイトごとの判定。★ 「いません」と言ってよい場面は mediaOverview.therapistSiteState が狭めている
  const stateOfAt = (t: Therapist, c: Site): TherapistSiteState => {
    const r = rosterFor(c);
    return therapistSiteState({
      isUnlinked: (r?.unlinked ?? []).some((p) => String(p.id) === t.id),
      isMissing: (r?.missingOnMedia ?? []).some((p) => String(p.id) === t.id),
      known: r?.missingOnMediaKnown === true,
    });
  };
  // ★ どれか1つのサイトで「います」でない人。★ 列が無ければ誰も該当しない（0件と分からないを混ぜないため、下の箱は別に出す）
  const isTodo = (t: Therapist) => cols.some((c) => stateOfAt(t, c) !== 'present');

  // ★ 同じ名前で公開中の方（★ 0件なら空文字が返り、何も出さない）
  const dupNotice = duplicateNotice(findDuplicateNames(therapists));
  const todoCount = therapists.filter(isTodo).length;
  const filtered = therapists.filter((t) => {
    if (filter === 'new') return t.isNewFace;
    if (filter === 'todo') return isTodo(t);
    return true;
  });
  const shown = showAll ? filtered : filtered.slice(0, 10);

  // ★ フクエスにいないのに媒体側に残っている名前。★ 読めていないときは空＝「分からない」
  const onlyOnMedia = rosterOf?.onlyOnMediaKnown === true ? (rosterOf?.onlyOnMedia ?? []) : [];
  const onlyKnown = rosterOf?.onlyOnMediaKnown === true;

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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[19px] font-black text-slate-800">
                  フクエスのセラピスト {therapists.length}名
                </p>
                {/* ★★ 第119便（カッキーさん・2026-09-03）: 「ここが元になります」だけでは、
                    ★ 新人さんが各サイトに出ないときに【何をすればよいか】が分からなかった。
                    ★ 出るのはフクエスに登録した方だけ＝**登録が入口**、と言い切る。 */}
                {/* ★ 第196便（2026-09-07・カッキーさん）: 56字 → 43字。★ 「転送」「必要です」を消し、
                    ★ 「出るのは登録した方だけ」と事実で言う。★ 意味は変えていない */}
                <p className="mt-0.5 text-[14px] text-slate-500 leading-relaxed">
                  各サイトに出るのは、フクエスに登録した方だけです。
                  新しく入った方は、先に<b className="font-bold text-slate-700">フクエスで登録</b>してください。{' '}
                  {/* ★ 「登録してください」で終わらせない。★ 探しに戻らせず、その場から行ける道を置く */}
                  <Link href="/mypage" className="font-bold text-indigo-600 underline">
                    ⇨ マイページのセラピストを開く
                  </Link>
                </p>
              </div>

            </div>

            {/* ★★★ 同じ名前で公開中の方がいたら知らせる（第119便・カッキーさん）。
                ★ フクエスは【受け取る側】にもなった（外から登録が入る）。★ 二重に作られることがある。
                ★★ ここは【気づかせるだけ】。★ 消さない・止めない・原因を決めつけない
                  （他社名を書かない。★ 店舗様がご自身で窓口に確かめられればよい）。 */}
            {dupNotice && (
              <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[14px] leading-relaxed text-slate-700">{dupNotice}</p>
                <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
                  同じ方であれば、どちらか一方を非公開にしてください。別の方であればそのままで問題ありません。
                </p>
              </div>
            )}

            <dl className="mt-3.5 grid grid-cols-3 border border-slate-200">
              <div className="px-3 py-2.5 border-r border-slate-200">
                <dt className="text-[12.5px] font-bold text-slate-400">フクエスの登録</dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {therapists.length}<span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="px-3 py-2.5 border-r border-slate-200">
                <dt className="text-[12.5px] font-bold text-slate-400">
                  {/* ★ 第197便: 列が2つ以上なら「どこかのサイトで」。★ 数え方（isTodo）と同じ範囲を言う */}
                  {cols.length > 1 ? 'どこかのサイトで確かめられていない' : cols.length === 1 ? `${cols[0].label}で確かめられていない` : '確かめられていない'}
                </dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {todoCount}<span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="px-3 py-2.5">
                <dt className="text-[12.5px] font-bold text-slate-400">
                  {readSite ? `${readSite.label}に残っている` : '媒体に残っている'}
                </dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {/* ★ 読めていないときに 0 と書かない */}
                  {onlyKnown ? onlyOnMedia.length : '—'}
                  {onlyKnown && <span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>}
                </dd>
              </div>
            </dl>

            <p className="mt-2.5 text-[13.5px] text-slate-400 leading-relaxed">
              各サイトへの掲載の内容、名前やプロフィールの変更などもフクエスを直せば揃います。
            </p>
          </>
        )}
      </div>

      {/* ── ★ タブ（第119便・カッキーさん）───────────────────
          ★ 縦に長くなりすぎたので、2つの塊を切り替えにした。
          ★★ 見出しはタブが兼ねる（同じ言葉を2回出さない）。 */}
      {!loading && !error && (
        <div className="flex flex-wrap gap-2">
          {([['list', 'どのサイトに出ているか'], ['link', '媒体側の登録と結びつける']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`px-3.5 py-2 border text-[14.5px] font-bold transition-colors ${
                tab === k
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── 一覧 ──────────────────────────────────── */}
      {tab === 'list' && !loading && !error && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2">
              {/* ★ 第119便: 「10 / 37名中」→「37 / 37名中」。★ いま何行見えているかではなく、
                  ★ 【選び方で何名が対象か】を出す。★ 「残り27名を見る」を押すまで数が動く必要はない */}
              <span className="text-[13px] font-bold text-slate-400 tabular-nums">
                {filtered.length} / {therapists.length}名中
              </span>
              {/* ★ 第197便: 読み直すボタンはサイトごとに1つ。
                  ★ 第198便: 「反映しない」のサイトは押せない（受け口が鍵を使わない・第45便）。★ 理由は下の1行で言う */}
              {cols.map((c) => (
                <button
                  key={key(c)}
                  onClick={() => onRead(c)}
                  disabled={reading !== '' || c.direction === 'off'}
                  title={c.direction === 'off' ? `${c.label}は「反映しない」にしているため、名簿を読みに行きません` : undefined}
                  className="text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 disabled:opacity-50"
                >
                  {reading === key(c) ? '読みに行っています…' : `${c.label}の名簿を読み直す`}
                </button>
              ))}
            </div>
          </div>

          {/* ★ 第198便: 押せないボタンには理由を添える（§185・できないことは理由といっしょに）。★ 写しはそのまま使える */}
          {cols.some((c) => c.direction === 'off') && (
            <p className="mb-3 text-[13px] text-slate-400 leading-relaxed">
              {cols.filter((c) => c.direction === 'off').map((c) => c.label).join('・')}は「反映しない」にしているため、名簿を読みに行きません（前に読んだ写しはそのまま出ています）。
              読むには、ホームで「フクエスから反映」にしてください。
            </p>
          )}
          <div className="flex flex-wrap gap-2 mb-3">
            {([['all', 'すべて'], ['todo', '確かめられていない方'], ['new', '新人']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setFilter(k); setShowAll(false); }}
                aria-pressed={filter === k}
                className={`px-3 py-1.5 border text-[14px] font-bold transition-colors ${
                  filter === k ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200">
            <table className="w-full text-[14.5px] min-w-[520px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="font-bold text-[12.5px] text-slate-400 px-3 py-2">セラピスト</th>
                  {/* ★ 第197便: サイトごとに1列。★ 見出しはサイト名だけ（カッキーさん・2026-09-07）。
                      ★ 「向こうを読んだ結果」は外した。★ この列の意味（送った記録ではなく名簿にいるか）は
                        表の下の4行が言っている。★ 見出しで二度言わない */}
                  {cols.map((c) => (
                    <th key={key(c)} className="font-bold text-[12.5px] text-slate-400 px-3 py-2 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  {/* ★★★ 第148便（2026-09-04）で「送った記録」の列を【外した】。
                      ★ 全員に「まだ送っていません」と出すだけで、**何も読んでいなかった**。
                      ★★ サラさんには写メ日記（16:42・18:01）も即セラ（21:56）も送っている。
                        つまり画面が嘘をついていた。★ 見出しが「記録」なので、なお悪い。
                      ★ 人ごとの送信記録は、あとで salon_media_audit から作って戻す。
                        → そのときは【送った人には送った日時を出す】。★ 空欄で誤魔化さない。 */}
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  // ★ 第260便: この行の下に「この内容で登録します」が開いているか
                  const view = createView && createView.tid === t.id ? createView : null;
                  const viewCol = view ? cols.find((c) => key(c) === view.colKey) ?? null : null;
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
                          </span>
                        </span>
                      </td>
                      {cols.map((c) => {
                        const st = stateOfAt(t, c);
                        // ★★★ 第260便: 「登録」を出す条件（設計メモ §3・§4 D）
                        //   ★ 駅ちかの列だけ（★ エステ魂は材料の切り出しが先・第259便 §3-1）
                        //   ★ ログイン情報がある枠だけ（★ 無ければ向こうに入れない）
                        //   ★ 状態が「確かめられません」（番号が無い＝新しい方）だけ
                        //     ★ 「います」（もう居る）と「まだ読んでいません」（読んでいないのに送らない）には出さない
                        //   ★ 向きが「フクエスから反映」でないときは、サーバーが切り替え先のボタン名を返す（★ 文言を2か所に持たない）
                        // ★★★ 【第262便】「いません」には**出さない**（設計メモ 追記A・カッキーさんの決め b）。
                        //   ★ 「いません」＝番号（castId）は結びついているのに向こうの名簿に無い。
                        //   ★ 材料づくりは「結びついていれば積まない」（二重登録を自分で作らない・第234便）ので、押しても**必ず止まる**。
                        //   ★ 2026-09-11 10:42 に実際に踏んだ（ラビリンス様ひより・castId 5692371）。
                        //   → ★ 代わりに「結びつきを外すと登録できます」の案内を出す。★ 自動では外さない（第49便の作法）。
                        // ★ 第264便: 駅ちか決め打ちをやめ、CREATE_PROVIDERS（★ サーバーと同じ組）で見る
                        const colOk = CREATE_PROVIDERS.includes(c.provider) && c.hasCredential;
                        const canCreate = colOk && st === 'unlinked';
                        const needUnlink = colOk && st === 'missing';
                        const busyKey = t.id + '#' + c.provider + '#' + c.slot;
                        return (
                          <td key={key(c)} className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-[13px] font-bold px-2.5 py-0.5 border ${STATE_CLASS[st]}`}>
                              {therapistSiteLabel(st)}
                            </span>
                            {needUnlink && (
                              <span className="block mt-1.5 text-[12.5px] leading-snug text-slate-500">
                                結びつきを外すと登録できます
                                <br />
                                →{' '}
                                <button type="button" onClick={() => setTab('link')} className="font-bold text-indigo-600 underline">
                                  媒体側の登録と結びつける
                                </button>
                              </span>
                            )}
                            {canCreate && (
                              <button
                                type="button"
                                onClick={() => onCreateDryRun(t, c)}
                                disabled={createBusy !== ''}
                                className="block mt-1.5 text-[13px] font-bold px-2.5 py-1 border border-indigo-200 bg-indigo-50 text-indigo-700 disabled:opacity-50"
                              >
                                {createBusy === busyKey && !view ? '確かめています…' : `${c.label}へ登録`}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* ── ★★★ 第260便: この内容で登録します（★ 押す前に1枚見せる・設計メモ §4 B）──
                        ★ 行の真下にインラインで開く（★ 重ねる窓にしない。★ 誰の話かが上の行で見えたまま）。
                        ★ 1度に1人だけ。★ 別の行の「登録」を押すと、こちらは閉じる。 */}
                    {view && viewCol && (
                      <tr className="border-t border-indigo-100 bg-indigo-50/40">
                        <td colSpan={1 + cols.length} className="px-3 py-3">
                          <div className="max-w-[640px] whitespace-normal">
                            <p className="text-[15px] font-black text-slate-800">
                              {t.name || '（名前なし）'} を {viewCol.label} へ、この内容で登録します
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
                                {/* ★ 運営向けの印（★）と強調（**）は店舗様に見せない */}
                                {view.warnings.map((w, i) => (
                                  <li key={i} className="text-[13.5px] leading-relaxed text-slate-700">{plainText(w)}</li>
                                ))}
                              </ul>
                            )}
                            {/* ★★ 消し方はここに書く（設計メモ §4 A）。★ フクエスの口から消せるのは運営だけ */}
                            <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">
                              登録は{viewCol.label}に<b className="font-bold text-slate-700">すぐ公開</b>されます。
                              消すときは、{viewCol.label}の管理画面から直接消してください（この画面からは消せません）。
                              同じ名前の方が{viewCol.label}にすでにいる場合は、登録されずに終わります。
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
                                onClick={() => onCreatePush(t, viewCol)}
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

          {filtered.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-3 text-[14px] font-bold text-slate-500 underline">
              残り{filtered.length - shown.length}名を見る
            </button>
          )}

          {/* ★ 言い方の意味を書く。★ 「いません」と「まだ結びついていません」は別 */}
          {/* ★★★ 第119便: 「状態の説明」から【次にすること】へ書き換えた（カッキーさん）。
              ★ こちらの言葉（番号・結びつき）を店舗様に読ませない。
              ★ 4つは減らさない。★ 出ない理由が違えば、やることも違う。 */}
          {/* ★ 第199便（2026-09-07・カッキーさん）: 短く端的に。★ 4つは減らさない（理由が違えばやることも違う・第119便） */}
          <div className="mt-3 space-y-1 text-[13px] text-slate-400 leading-relaxed">
            <p><b className="font-bold text-emerald-700">います</b>　名簿にいました</p>
            <p>
              <b className="font-bold text-rose-700">いません</b>　
              名簿にいませんでした（退店やお名前の変更かもしれません）
            </p>
            <p>
              <b className="font-bold text-slate-500">確かめられません</b>　
              どの登録の方か分かりません
              {/* ★ タブをまたぐ案内なので、その場で切り替えられるようにする（第119便） */}
              　→{' '}
              <button
                type="button"
                onClick={() => setTab('link')}
                className="font-bold text-indigo-600 underline"
              >
                媒体側の登録と結びつける
              </button>
              <span className="text-slate-400">　で結ぶと分かります</span>
            </p>
            <p>
              <b className="font-bold text-slate-500">まだ読んでいません</b>　
              名簿をまだ読んでいません
              <span className="text-slate-400">　→ 上の「名簿を読み直す」を押してください</span>
            </p>
            {/* ★ 第260便: ボタンの意味も同じ並びで1行。★ 第264便: 登録できる列ごとに1行（★ 駅ちか・エステ魂） */}
            {cols.filter((c) => CREATE_PROVIDERS.includes(c.provider) && c.hasCredential).map((c) => (
              <p key={key(c)}>
                {/* ★ 第261便: 他の4行と同じく、太字のあとに全角スペース（★ 改行だけだと JSX は詰める） */}
                <b className="font-bold text-indigo-700">{c.label}へ登録</b>　
                フクエスの内容で{c.label}に新しく登録します
                <span className="text-slate-400">　→ 押すと、先に送る内容を確かめられます（すぐには送りません）</span>
              </p>
            ))}
          </div>

          <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
            写真はフクエスに登録したものです。無い方は「写真なし」と出ます。
          </p>

          {/* ★ 第199便（2026-09-07・カッキーさん）: 「この画面は見るだけです。各サイトへ出す・消すは、まだ付けていません…」の
              青い箱を【外した】。★ 運営の開発メモであって、店舗様がすることは何も無い。★ 作ったときに知らせればよい。
              ★ 「出す・消す」を付けない経緯（§81 の順番・㉟ エステラブの二重登録が未確認）は、このファイルの先頭コメントに残っている。 */}
        </div>
      )}

      {/* ── フクエスにいないのに、媒体に残っている方 ───────────── */}
      {tab === 'list' && !loading && !error && readSite && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[15.5px] font-bold text-slate-700">
              フクエスにいないのに、{readSite.label}に残っている方
            </h3>
            <span className="text-[13px] font-bold px-2.5 py-0.5 border bg-white text-slate-400 border-slate-200 tabular-nums">
              {onlyKnown ? `${onlyOnMedia.length}名` : '—'}
            </span>
          </div>

          {!onlyKnown ? (
            /* ★ 読めていないことを「0名」と書かない */
            <p className="text-[14px] text-slate-500 leading-relaxed">
              {readSite.label}の名簿をまだ読めていないので、分かりません。
              上の「{readSite.label}の名簿を読み直す」を押すと確かめられます。
            </p>
          ) : onlyOnMedia.length === 0 ? (
            <p className="text-[14px] text-slate-500">ありません。</p>
          ) : (
            <>
              <ul className="border border-slate-200 divide-y divide-slate-100">
                {onlyOnMedia.map((n) => (
                  <li key={n} className="px-3 py-2.5 text-[15px] text-slate-700">{n}</li>
                ))}
              </ul>
              <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
                フクエスを辞めた方が、{readSite.label}側に残っていることがあります。
                フクエスにいない方なので上の一覧には出ません。ここだけ別に出しています。
              </p>
            </>
          )}
        </div>
      )}

      {tab === 'list' && !loading && !error && cols.length === 0 && (
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

      {/* ★ 2つ目のタブ。★ 選ばれるまで描かない（開くまで読みに行かない） */}
      {tab === 'link' && !loading && !error && children}
    </div>
  );
}
