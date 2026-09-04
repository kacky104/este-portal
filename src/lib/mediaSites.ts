// 連携する媒体サイトの一覧と、その見せ方の判定（第63便・㉞ その5）。
//
// ★★★ この表が【1か所】であること自体が要点。
//   サイトが4つに増えると、「どのサイトに何が送れるか」が画面のあちこちに書き散らされる。
//   ★ 散らばると、5つ目が増えたときに必ず書き漏らす。
//   → サイトの性質はここだけに書き、画面はここを読む。
//
// ★★ なぜ「送れるもの（can）」を持つか（2026-08-30・カッキーさんの要望）
//   「このサイトには何の情報が送れるのか」が、店舗にとっていちばん知りたいこと。
//   ★ 写メ日記が駅ちかとエステラブにしか無いことを、店舗が探して回らずに済むようにする。
//
// ★ provider の文字列は、いまここでしか決まっていない（DBに行がまだ無いサイトばかり）。
//   ★ 行が入ったあとで変えると移行が要る。増える前のいまなら、変えるのは自由。

/** 各サイトへ送れるもの。★ 増えるときはここに足す（画面には触らない） */
export type MediaCapability = 'work' | 'therapist' | 'diary' | 'sokuhime' | 'sokusera';

export type MediaSite = {
  provider: string;
  name: string;
  /** 送れるもの。★ 画面に出す順でもある */
  can: readonly MediaCapability[];
  /** 掲載枠の数（同じ店が複数掲載を持つことがある） */
  slots: number;
  /**
   * 向こうから【取り込む】か（出勤などを媒体側から読んでフクエスに入れるか）。
   *
   * ★★★ 2026-08-31 訂正 —— これは「ログインしても一覧が見えない」という意味ではない。
   *   §156 で「エステラブは向こうを読めないので送るボタンしか置けない」と書いたが、
   *   ㉟ で実物を見たら **セラピスト一覧も出勤フォームも id つきで読めた**（追記46 §246）。
   *   ★ 「読めない」のではなく「取り込みをしないと決めていた」だけだった。
   *   → **送る前に名簿を読んで突き合わせることは、false のサイトでもできる**（する）。
   *     それをしないと、同名でもう一度登録して黙って2人になる（エステラブで実測）。
   * ★★ いまも取り込みをするのは駅ちかだけ（2026-08-30・カッキーさんの決定）。そこは変えない。
   */
  readable: boolean;
  /**
   * ログイン情報の登録を受け付けているか。
   * ★★★ false のあいだは、預かっても【送る先が無い】。
   *   ★ 送れないのに鍵だけ預かるのは、店舗から見れば「連携したつもり」になる。
   *     それは §185 の「できないことを、できない理由といっしょに出す」の逆。
   *   ★ 送る仕組みができた便で true にする。変えるのはこの1行だけ。
   */
  accepting: boolean;
  /** 受け付けていない理由。★ accepting が false のときだけ画面に出す */
  notYet: string;
  /**
   * ★★★ 受け付けていない【種類】（第117便・2026-09-03）。★ accepting が false のときだけ意味がある。
   *   'preparing' … これから作る（全国エステランキング）
   *   'blocked'   … ★ 作ったが【相手が受け付けない】（エステラブ・/admin が 403・第82便）
   *
   * ★★★ なぜ分けたか（カッキーさん・2026-09-03）
   *   どちらも「未登録＋準備中」の同じ見た目だった。★ でも店舗にとっては別のこと:
   *     準備中     … 待てば使えるようになる
   *     接続できない … ★ 待っても使えない（こちらから直せない）
   *   → 札の言葉・色・並び順の3つで分ける。★ 分ける根拠はこの1か所。
   */
  notYetKind: '' | 'preparing' | 'blocked';
  /**
   * ★★ いまどこまでできるか。★ accepting が true のときだけ画面に出す（第80便）。
   *   空文字なら出さない（＝ひととおりできる、という意味）。
   *
   * ★★★ なぜ要るか
   *   accepting を true にした瞬間、店舗から見れば「連携できる」に見える。
   *   ★ だが段階を踏んで作っている途中は、できることが限られている。
   *   ★ 黙って開けると『連携したつもり』になる —— それは §185 の逆。
   *   → 開ける代わりに、**いまどこまでできるかを同じ行に書く**。
   */
  stageNote: string;
  /**
   * ★★ ログインID欄の呼び名（第116便・2026-09-03）。空なら「ログインID」。
   *
   * ★★★ なぜ要るか —— エステ魂は【メールアドレス】でログインする（2026-09-02 実測）。
   *   ★ 画面が「ログインID」としか書けなかったので、第109便では stageNote に
   *     「ログインID欄にはメールアドレスを入れてください」と**注意書きで補っていた**。
   *   ★ 注意書きで補うと、読み飛ばした店舗様は必ず店舗IDを入れて詰まる。
   *   → 欄の名前そのものを媒体に合わせる。★ 画面に直接書かず、ここ1か所で決める。
   */
  loginIdLabel: string;
  /**
   * ★★ 店舗ID をこちらで預かるか（第81便）。
   *
   * ★★★ なぜ足したか —— カッキー様の指摘「店舗オーナーはここで？になります」
   *   エステラブのログインは login_id と login_password の2つだけ（追記53 §286・実測）。
   *   ★ 店舗ID は【ログインに使わない】。★ 出すと「何を入れるのか」で必ず止まる。
   *
   * ★★★ しかも紛らわしい二重の意味がある:
   *   ログインID     shop837865   ← 画面で入れるもの
   *   出勤の shop_id 37865        ← 出勤を送るときに要る番号（掲載ページ /shop/37865）
   *   ★ 別物なのに、どちらも「店舗ID」と呼べてしまう。
   *   → 入れさせない。★ 出勤の shop_id は【向こうの出勤ページから読む】（hidden に入っている）。
   *     「読めるものを人に入れさせない」。§260 の「推測で埋めない」と同じ筋。
   *
   * ★ 駅ちかも実はログインに使っていない（email + password の2つ）が、
   *   いま登録済みの店舗が居るので **この便では触らない**（true のまま）。
   * ★ エステ魂・全国は実物を見ていないので決めない。見たときに直す。
   */
  /**
   * ★★ 写メ日記の投稿先アドレスを、どう手に入れるか（第84便）。
   *   'read'   … 管理画面から読み取れる（駅ちか /admin/maillist/・第53便）
   *   'manual' … ★ 手で入力してもらう（★ こちらから読めない）
   *   'none'   … そもそも写メ日記を受け取れない
   *
   * ★★★ なぜ要るか
   *   エステラブは /admin へ到達できない（403・追記61 §333）。★ 読み取れない。
   *   ★ それなのに画面は「ログイン情報を登録すると読み取れます」と書いていた。
   *     ★ 登録もできない（第82便で閉じた）ので、**二重に嘘**になっていた。
   *   → サイトごとの手の入れ方を、ここ1か所に書く。★ 画面はここを読む。
   */
  diaryAddressSource: 'read' | 'manual' | 'none';
  /**
   * ★★★ 写メ日記を【どうやって送るか】（第141便・2026-09-04）。
   *
   * ★★ なぜ足したか: 点検にこういう見張りがあった——
   *   「can に diary があるサイトは、必ずアドレスの入手手段がある
   *     （★ 送れると書いて手が無い状態を作らない）」
   *   ★ エステ魂に 'diary' を足したら、この見張りが落ちた。★ 正しく働いた。
   *   ★★★ ただしエステ魂は【手が無い】のではなく【手が違う】。
   *     ★ メールの口が無いので、**ご本人のアカウントへ代理ログインして投稿する**。
   *   → 見張りを緩めるのではなく、**送り方を型に書く**。
   *
   *   'mail'  … 投稿用メールアドレスへ送る（駅ちか・エステラブ）
   *   'proxy' … ★★ ご本人のアカウントへ代理ログインして投稿する（エステ魂）
   *   'none'  … 送る手段が無い
   */
  diaryPostMethod: 'mail' | 'proxy' | 'none';
  needsShopId: boolean;
  /** ★ needsShopId が true のときだけ使う */
  idLabel: string;
  idHint: string;
};

export const MEDIA_SITES: readonly MediaSite[] = [
  {
    provider: 'ekichika',
    name: '駅ちか',
    /**
     * ★★★ 2026-09-04（第142便）: 'therapist' を外した（カッキーさんの判断）。
     *
     * ★★ なぜ外したか
     *   画面には「送れるもの： 出勤 セラピスト 写メ日記 即ヒメ」と出ていたが、
     *   ★ 'therapist' が何を指すのか **コードのどこにも書いていなかった**。
     *   ★★ 調べたら、実際にできるのは【運営が手で写真を1枚送る】だけだった:
     *     ・/api/admin/photo-push … ★ 運営だけの口。★ 店舗の画面にボタンは無い
     *     ・★ 枠1（トップ画像）は送らない（★ 店舗様の顔になる画像を変えない）
     *     ・★ 既定は試し打ち。★ 初回は空き枠に1枚 → 目で見て → 人が削除
     *   → **店舗様が画面から使えるものではない。**
     *
     * ★★★ 「送れるもの」は、店舗様が【いま使えるもの】を並べる欄。
     *   ★ 将来できることを先に並べると、聞かれたときに言い訳になる。
     *   ★★ 同じ物差しを 2026-09-04 にエステ魂へ当てた:
     *     **動いてから 'diary' を足した**（★ 先に足さなかった）。★ 駅ちかにも同じ物差しを当てる。
     *
     * ★ 店舗の画面から写真を送れるようになった便で、そのとき足すこと。
     */
    can: ['work', 'diary', 'sokuhime'],
    slots: 3,
    readable: true,
    accepting: true,
    notYet: '',
    notYetKind: '',
    stageNote: '',
    // ★ 駅ちかの画面も「ログインID」と書いてある。★ 既定のまま
    loginIdLabel: '',
    // ★ /admin/maillist/ から読み取れる（第53便）
    diaryAddressSource: 'read',
    diaryPostMethod: 'mail',
    // ★★★ 2026-09-03（第117便）で false にした（カッキーさん）。
    //   ★ 実物の登録はログインIDと同じ番号だった（37168 / 37168）。★ ベンリーにも店舗IDの欄は無い。
    //   ★★ そして駅ちかのログインでも【送っていない】（relayFlow.buildLoginRequest の頭）:
    //     shopid は hidden だが <form> の外にあり、ブラウザも送っていない。
    //   → 入れてもらう意味が無い欄だった。★ 欄を出すと「何の番号か」で必ず止まる（第81便と同じ理由）。
    // ★ すでに入っている shop_id は消さない（保存時に空で上書きしない）。
    needsShopId: false,
    idLabel: '',
    idHint: '',
  },
  {
    provider: 'esulove',
    name: 'エステラブ',
    can: ['work', 'diary'],
    slots: 2,
    readable: false,
    // ★★★ 2026-08-31（第80便）で開けたが、【第82便で閉じ直した】。
    //   ★ 実弾を打ったら 403。エステラブは /admin を手前のエッジ（via: 1.1 google）で
    //     保護していて、こちらのサーバからは **ページを開くことすらできない**（追記61 §333）。
    //     ・eslove.jp/            200
    //     ・eslove.jp/admin/login 403   ← ここだけ
    //   ★ 店舗の回線からは開ける。★ IPごとの遮断ではなく /admin だけの保護。
    //
    // ★★ 閉じ直した理由：**登録できるのに送れない**状態を残さないため（§185 の逆）。
    //   ★ 鍵だけ預かって送り先が無いのは、店舗から見れば「連携したつもり」になる。
    //
    // ★ 作ったもの（esuloveRequests / esuloveTherapistParse / esuloveWork / esulovePlan /
    //   relayFlow の2段）は **消していない**。道が開けば、この1行を true に戻すだけで動く。
    accepting: false,
    notYet:
      'エステラブは、フクエスのサーバからの接続を受け付けていませんでした。' +
      'そのため出勤を送ることができません。写メ日記の転送（メール）は、これまでどおりお使いいただけます。',
    // ★★★ 待っても使えない側（相手の /admin が 403）。★ 準備中と同じ札にしない
    notYetKind: 'blocked',
    stageNote: '',
    // ★ エステラブは login_id。★ 既定のまま
    loginIdLabel: '',
    // ★★ /admin が 403 なので読み取れない。★ 手で入れてもらう（第84便）
    diaryAddressSource: 'manual',
    diaryPostMethod: 'mail',
    // ★★ エステラブのログインは login_id と login_password の2つだけ。店舗IDは使わない
    needsShopId: false,
    idLabel: '',
    idHint: '',
  },
  {
    provider: 'esutama',
    name: 'エステ魂',
    // ★★★ 2026-09-04（第141便）: 'diary' を足した。
    //   ★ 同日 18:01、フクエスで書いた写メ日記が【自動で】エステ魂へ載ったのを実測した。
    //   ★★ メールで投稿できない媒体なので、**ご本人のアカウントへ代理ログインして投稿する**。
    //     ★ だから diaryAddressSource は 'none' のまま（★ アドレスは要らない・預からない）。
    //     ★ 投稿先の画面（DiaryTargets）は DIARY_PROVIDERS で並べているので、
    //       ここに 'diary' を足してもアドレス欄は出ない（★ 実装を読んで確かめた）。
    //
    // ★★★ 2026-09-04（第146便）: 'sokusera' を足した。
    //   ★ 同日 21:56、フクエスの「今すぐ」からサラさんの即セラが ON になったのを実測し、
    //     22:03 に5分ごとの自動化まで入れた。★ **動いてから足した**（第141便と同じ物差し）。
    //   ★★ OFF は打たない（相手が60分で切る）。★ そこは店舗様に説明する所であって、
    //     「送れるもの」に書くことではない。
    can: ['work', 'diary', 'sokusera'],
    slots: 2,
    readable: false,
    // ★★ 2026-09-02（第109便）: 仕組みができた（ログイン → 名簿 → 出勤表 → 保存 → 照合）。
    //   ★ VPS から estama.jp が開けることを確かめてから開けた（/login/ 200・/admin/ 307。エステラブの 403 とは違う）。
    //   ★ 実弾（work_push）はまだ運営の口からだけ。無人の自動反映は esutamaFlow.ESUTAMA_AUTO_WRITE_ENABLED（false）が止めている。
    accepting: true,
    notYet: '',
    notYetKind: '',
    // ★★ 第116便で「ログインID欄には…」の1文を落とし、第117便で残り（名簿の結び）も落とした。
    //   ★ 結びは【セラピスト一覧】の画面にその場で書いてある。★ ログイン情報の画面で先に言う話ではない。
    //   ★ 段の断りが要るときは、ここに1行入れれば画面に出る（仕組みは残してある）。
    stageNote: '',
    // ★★★ エステ魂はメールアドレスでログインする（2026-09-02 実測）。★ 欄の名前を合わせる
    loginIdLabel: 'メールアドレス',
    // ★ メールでの投稿ができない（画面にもそう書いてある）
    diaryAddressSource: 'none',
    // ★★★ エステ魂だけ代理ログイン。★ 2026-09-04 18:01 に自動で載ったのを実測
    diaryPostMethod: 'proxy',
    // ★★ 実測（2026-09-02・設計メモ_エステ魂の出勤書き込み §2）: ログインはメールアドレスとパスワードの2つだけ。店舗IDは無い
    //   ★ 画面の「ログインID」欄にメールアドレスを入れてもらう（欄の名前を変えるのは別便）
    needsShopId: false,
    idLabel: '',
    idHint: '',
  },
  {
    provider: 'zenkoku',
    name: '全国エステランキング',
    can: ['work'],
    slots: 2,
    readable: false,
    accepting: false,
    notYet: '全国エステランキングへ送る仕組みを準備しています。できあがるまで、ログイン情報はお預かりしません。',
    // ★ これから作る側。★ 待てば使えるようになる
    notYetKind: 'preparing',
    stageNote: '',
    // ★ 実物を見ていないので決めない（受け付けていないので画面にも出ない）
    loginIdLabel: '',
    // ★ 写メ日記そのものが無い
    diaryAddressSource: 'none',
    diaryPostMethod: 'none',
    // ★ 実物を見ていないので決めない。★ 受け付けていないので画面には出ない
    needsShopId: true,
    idLabel: '店舗ID',
    idHint: '全国エステランキングの管理画面にログインするときの店舗IDです。',
  },
];

const CAPABILITY_LABEL: Record<string, string> = {
  work: '出勤',
  therapist: 'セラピスト',
  diary: '写メ日記',
  sokuhime: '即ヒメ',
  sokusera: '即セラ',
};

/** ★ 知らない種別は空文字。★ 「その他」と書かない（何が送れるか分からないものを送れると見せない） */
export function capabilityLabel(c: string): string {
  return CAPABILITY_LABEL[c] ?? '';
}

/** 画面に出す「送れるもの」の並び。★ 知らない種別は落とす */
export function siteCapabilityLabels(site: { can: readonly string[] }): string[] {
  return site.can.map(capabilityLabel).filter((s) => s.length > 0);
}

/** ★ 知らない provider は null。★ 既定のサイトに読み替えない */
export function findMediaSite(provider: string): MediaSite | null {
  if (typeof provider !== 'string' || provider.length === 0) return null;
  return MEDIA_SITES.find((s) => s.provider === provider) ?? null;
}

/** 枠の番号。★ slots が壊れていても最低1枠は出す（登録の口を消さない） */
/**
 * ログインID欄の見出し。★ 空なら「ログインID」。
 * ★★ 画面はこの関数だけを呼ぶ。★ 「エステ魂なら…」を画面に書かない（媒体が増えるたび書き漏らす）
 */
export function loginIdLabelOf(site: { loginIdLabel?: string } | null): string {
  const v = site?.loginIdLabel ?? '';
  return v.trim() === '' ? 'ログインID' : v;
}

export function mediaSiteSlots(site: { slots: number }): number[] {
  const n = Number.isFinite(site.slots) ? Math.trunc(site.slots) : 1;
  const count = n < 1 ? 1 : n > 20 ? 20 : n;
  return Array.from({ length: count }, (_, i) => i + 1);
}

// ────────────────────────────────────────────────
// サイトごとの状態
// ────────────────────────────────────────────────

/**
 * ★★★ 'unknown' と 'unregistered' を混ぜない（引き継ぎメモ 3-5・設計メモ §186）。
 *   読み込めていないのか、登録が無いのかは別のこと。
 *   ★ 混ぜると「未登録です」と言い切ってしまい、店舗が二重に登録しに行く。
 */
export type SiteLoginStatus =
  | 'unknown'
  | 'unregistered'
  | 'enabled'
  | 'disabled'
  /**
   * ★★★ サイト側の都合で使えない（第83便）。
   *   登録は残っているが、こちらから送れない（accepting: false）。
   *
   * ★★ なぜ足したか —— カッキー様の指摘で見つかった
   *   第82便でエステラブを閉じ直したあと、画面に【連携中】と【準備中】が**同時に出た**。
   *   ★ 「連携中」は登録済みの行があるかだけで決めていて、accepting を見ていなかった。
   *   ★ **送れないのに「連携中」**。★ §185 の逆で、いちばん悪い形。
   * ★ 'disabled'（店舗が止めた）と混ぜないこと。★ こちらの都合で止まっているのは別のこと。
   */
  | 'site_closed';

export function siteLoginStatus(input: {
  known: boolean;
  rows: ReadonlyArray<{ isEnabled: boolean }>;
  /** ★ サイトが受け付けているか（mediaSites の accepting）。省略時は true 扱い */
  accepting?: boolean;
}): SiteLoginStatus {
  if (input.known !== true) return 'unknown';
  const rows = Array.isArray(input.rows) ? input.rows : [];
  // ★★ 受け付けていないサイト。★ 登録が無ければ今までどおり「未登録」（エステ魂・全国）。
  //   ★ 登録が残っているときだけ「使えません」と言う。★ 「連携中」と言わない
  if (input.accepting === false) return rows.length === 0 ? 'unregistered' : 'site_closed';
  if (rows.length === 0) return 'unregistered';
  return rows.some((r) => r.isEnabled === true) ? 'enabled' : 'disabled';
}

export function loginStatusLabel(s: string): string {
  if (s === 'enabled') return '連携中';
  if (s === 'disabled') return '停止中';
  if (s === 'unregistered') return '未登録';
  // ★ 「停止中」と分ける。停止中は【店舗が止めた】。こちらは【サイト側の都合】
  if (s === 'site_closed') return '使えません';
  return 'まだ分かりません';
}

/**
 * 上に出す3つの数。
 * ★★★ 読み込めていないときは null を返す。★ 0 と書かない。
 *   「未登録 4サイト」と「まだ読めていない」を、同じ 0 の見た目にしない。
 */
export function loginTally(input: {
  known: boolean;
  statuses: readonly string[];
}): { enabled: number; disabled: number; unregistered: number; closed: number } | null {
  if (input.known !== true) return null;
  const list = Array.isArray(input.statuses) ? input.statuses : [];
  return {
    enabled: list.filter((s) => s === 'enabled').length,
    disabled: list.filter((s) => s === 'disabled').length,
    unregistered: list.filter((s) => s === 'unregistered').length,
    // ★★ 4つ目を足した（第83便）。★ 「停止中」に混ぜない。
    //   ★ 混ぜると「店舗が止めた」と読める。★ 数えないと合計がサイト数に足りなくなる
    //     （それは「数えた範囲を言う」§210 の逆）。★ だから足す。
    closed: list.filter((s) => s === 'site_closed').length,
  };
}

// ────────────────────────────────────────────────
// 連携の向き（このページでの見せ方）
// ────────────────────────────────────────────────

/**
 * ★★ 'send_only' は【向きの選択肢ではない】。読む口が無いサイトの事実。
 *   ★ link_mode に何が入っていても、読めないサイトを read と見せてはいけない。
 */
export type LoginDirection = 'send_only' | 'read' | 'write' | 'off' | 'unset';

export function loginDirection(input: { readable: boolean; linkMode: string | null }): LoginDirection {
  // ★★ 'none' は【選んだ結果】。★ 未設定と混ぜない（第87便・mediaOverview と揃える）
  // ★★★ 第111便（2026-09-02）で【媒体の性質より先に】見るようにした。
  //   ★ 書くだけの媒体にも「反映しない」を選べるようにしたため（mediaOverview.switchChoices）。
  //   ★ ここを直さないと、選んで止めた店の画面に「このサイトへは、送るだけです」と出たままになる。
  //     ★★ 送っていないのに送っていると書くことになる（§223 の逆）。
  if (input.linkMode === 'none') return 'off';
  if (input.readable !== true) return 'send_only';
  if (input.linkMode === 'read') return 'read';
  if (input.linkMode === 'write' || input.linkMode === 'write_auto') return 'write';
  return 'unset';
}

/**
 * ★★★ 第91便（カッキーさんが実機で見つけた）: ここに「取り込」が残っていた。
 *   ★ §351 で画面から消したはずの言葉。★ ホームだけ直して、この画面を直し忘れていた。
 *   ★★ 文言を消すと決めたら、【同じ言葉を使っている場所を全部】数えること。
 *
 * ★★ ホームの homeHeadline とは【別の関数のまま】にしてある。
 *   ★ ホームは全サイトをまとめた1行、ここは1サイトぶんなので、書ける内容が違う。
 *   ★ 代わりに「取り込」を書かないことを、両方の点検で見張る。
 */
export function loginDirectionText(d: string, siteName: string): { title: string; desc: string } {
  if (d === 'send_only') {
    return {
      title: 'このサイトへは、送るだけです',
      desc: `フクエスの内容を${siteName}へ反映します。${siteName}からフクエスへ反映することはありません。それができるのは駅ちかだけです。`,
    };
  }
  if (d === 'read') {
    return {
      title: `${siteName}の情報をフクエスに反映中`,
      desc: `出勤・プロフィール・即ヒメが、${siteName}からフクエスへ反映されます。フクエスから${siteName}へは何も送りません。`,
    };
  }
  if (d === 'write') {
    return {
      title: `フクエスの情報を${siteName}に反映中`,
      desc: `フクエスに入れた内容を${siteName}へ反映します。このあいだ、${siteName}からフクエスへの反映は止まります。`,
    };
  }
  if (d === 'off') {
    return {
      // ★ ボタンの文字（反映しない）と同じ言葉にする（第90便・§358）
      title: '「反映しない」を選んでいます',
      // ★★ 選んで止めているのだから、失敗のようにも「使えていない」ようにも書かない（§223）
      desc: `出勤はフクエスに入力します。${siteName}をはじめ、どのサイトへも送りません。${siteName}からフクエスへの反映もしません。ホームでいつでも変えられます。`,
    };
  }
  // ★ unset。★ 「連携しません」と言い切らない（まだ決まっていないだけ）
  return {
    title: '出勤を入力する場所が、まだ決まっていません',
    desc: 'ログイン情報を登録すると、こちらで入力する場所を決めます。それまで、このサイトへは何も送りません。',
  };
}

/** ★ 受け付けていないサイトでは、保存の口そのものを出さない */
/**
 * 受け付けていないサイトの札の言葉。★ 受け付けているサイトでは空。
 * ★★ 「準備中」と「接続できません」を分ける。★ 待てば使えるのか、待っても使えないのかは別のこと。
 */
export function notYetLabel(site: { accepting: boolean; notYetKind?: string }): string {
  if (site.accepting === true) return '';
  return site.notYetKind === 'blocked' ? '接続できません' : '準備中';
}

/**
 * ログイン情報の画面に出す並び（第117便・カッキーさん）。
 *
 * ★★★ 使えるサイトを上、使えないサイトを下。★ その中でも【接続できない】がいちばん下。
 *   ★ 上から順に用事があるように並べる。★ 待っても使えないサイトを真ん中に置かない。
 * ★★ MEDIA_SITES そのものは並べ替えない（表の順は他の画面も使う）。★ 並びは【出すときに決める】。
 * ★ 同じ組の中では元の並びのまま（安定）。
 */
export function sortSitesForLogin<T extends { accepting: boolean; notYetKind?: string }>(
  sites: readonly T[],
): T[] {
  const rank = (s: T): number => (s.accepting === true ? 0 : s.notYetKind === 'blocked' ? 2 : 1);
  return [...sites]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map((x) => x.s);
}

/**
 * ★★★ そのサイトへ【いま】送れるもの（第117便・2026-09-03）。
 *
 * ★★ can（もともと送れるもの）と分ける理由:
 *   エステラブは can に出勤と写メ日記を持っているが、出勤は送れない（/admin が 403・第82便）。
 *   ★ 一方で **写メ日記はメールなので送れる**（相手のサーバを叩かない）。
 *   → 「全部だめ」でも「全部いける」でもない。★ 送れるものだけを出す。
 *
 * ★ 受け付けているサイト … can そのまま
 * ★ 接続できないサイト   … ログインが要らない道（メールの写メ日記）だけ
 * ★ 準備中のサイト       … まだ何も送れない（空）
 */
export function sendableCapabilities(site: {
  accepting: boolean;
  notYetKind?: string;
  can: readonly string[];
  diaryAddressSource?: string;
}): string[] {
  const can = Array.isArray(site.can) ? [...site.can] : [];
  if (site.accepting === true) return can;
  if (site.notYetKind !== 'blocked') return [];
  // ★ メールで届く写メ日記だけは生きている。★ 投稿先を手で入れてもらう形（第84便）
  return can.filter((c) => c === 'diary' && site.diaryAddressSource !== 'none');
}

export function canRegisterSite(site: { accepting: boolean }): boolean {
  return site.accepting === true;
}
