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
export type MediaCapability = 'work' | 'therapist' | 'diary' | 'sokuhime';

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
  idLabel: string;
  idHint: string;
};

export const MEDIA_SITES: readonly MediaSite[] = [
  {
    provider: 'ekichika',
    name: '駅ちか',
    can: ['work', 'therapist', 'diary', 'sokuhime'],
    slots: 3,
    readable: true,
    accepting: true,
    notYet: '',
    stageNote: '',
    idLabel: '店舗ID（shopid）',
    idHint:
      '駅ちかのログイン画面で入力している「店舗ID」です。掲載ページのURLに出ている番号とは別の番号なのでご注意ください。分からない場合はお知らせください、こちらでお調べします。',
  },
  {
    provider: 'esulove',
    name: 'エステラブ',
    can: ['work', 'diary'],
    slots: 2,
    readable: false,
    // ★★ 2026-08-31（第80便）で開けた。★ ただし、まだ出勤は送れない。
    //   駅ちかで踏んだ順番（第43便 試し打ち → 第46便 送信）を、エステラブでも踏む。
    //   ★ 試し打ちにもログイン情報が要るので、ここを先に開ける必要があった。
    accepting: true,
    notYet: '',
    stageNote:
      'いまできるのは、エステラブの名簿を読んで「送るとこうなる」を確かめるところまでです。' +
      '出勤を実際に送る機能は、続けて作っています。',
    idLabel: '店舗ID',
    idHint: 'エステラブの管理画面にログインするときの店舗IDです。',
  },
  {
    provider: 'esutama',
    name: 'エステ魂',
    can: ['work'],
    slots: 2,
    readable: false,
    accepting: false,
    notYet: 'エステ魂へ送る仕組みを準備しています。できあがるまで、ログイン情報はお預かりしません。',
    stageNote: '',
    idLabel: '店舗ID',
    idHint: 'エステ魂の管理画面にログインするときの店舗IDです。',
  },
  {
    provider: 'zenkoku',
    name: '全国エステランキング',
    can: ['work'],
    slots: 2,
    readable: false,
    accepting: false,
    notYet: '全国エステランキングへ送る仕組みを準備しています。できあがるまで、ログイン情報はお預かりしません。',
    stageNote: '',
    idLabel: '店舗ID',
    idHint: '全国エステランキングの管理画面にログインするときの店舗IDです。',
  },
];

const CAPABILITY_LABEL: Record<string, string> = {
  work: '出勤',
  therapist: 'セラピスト',
  diary: '写メ日記',
  sokuhime: '即ヒメ',
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
export type SiteLoginStatus = 'unknown' | 'unregistered' | 'enabled' | 'disabled';

export function siteLoginStatus(input: {
  known: boolean;
  rows: ReadonlyArray<{ isEnabled: boolean }>;
}): SiteLoginStatus {
  if (input.known !== true) return 'unknown';
  const rows = Array.isArray(input.rows) ? input.rows : [];
  if (rows.length === 0) return 'unregistered';
  return rows.some((r) => r.isEnabled === true) ? 'enabled' : 'disabled';
}

export function loginStatusLabel(s: string): string {
  if (s === 'enabled') return '連携中';
  if (s === 'disabled') return '停止中';
  if (s === 'unregistered') return '未登録';
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
}): { enabled: number; disabled: number; unregistered: number } | null {
  if (input.known !== true) return null;
  const list = Array.isArray(input.statuses) ? input.statuses : [];
  return {
    enabled: list.filter((s) => s === 'enabled').length,
    disabled: list.filter((s) => s === 'disabled').length,
    unregistered: list.filter((s) => s === 'unregistered').length,
  };
}

// ────────────────────────────────────────────────
// 連携の向き（このページでの見せ方）
// ────────────────────────────────────────────────

/**
 * ★★ 'send_only' は【向きの選択肢ではない】。読む口が無いサイトの事実。
 *   ★ link_mode に何が入っていても、読めないサイトを read と見せてはいけない。
 */
export type LoginDirection = 'send_only' | 'read' | 'write' | 'unset';

export function loginDirection(input: { readable: boolean; linkMode: string | null }): LoginDirection {
  if (input.readable !== true) return 'send_only';
  if (input.linkMode === 'read') return 'read';
  if (input.linkMode === 'write' || input.linkMode === 'write_auto') return 'write';
  return 'unset';
}

export function loginDirectionText(d: string, siteName: string): { title: string; desc: string } {
  if (d === 'send_only') {
    return {
      title: 'このサイトへは、送るだけです',
      desc: `フクエスの内容を${siteName}へ書き込みます。${siteName}から読み取ることはありません。読み取りができるのは駅ちかだけです。`,
    };
  }
  if (d === 'read') {
    return {
      title: `${siteName}から取り込んでいます`,
      desc: `出勤・プロフィール・即ヒメを${siteName}から読み取って、フクエスに反映しています。フクエスから${siteName}へは書き込みません。`,
    };
  }
  if (d === 'write') {
    return {
      title: `フクエスから${siteName}へ反映します`,
      desc: `フクエスの内容を${siteName}へ書き込みます。この向きのあいだ、${siteName}からの取り込みは行いません。`,
    };
  }
  // ★ unset。★ 「連携しません」と言い切らない（まだ決まっていないだけ）
  return {
    title: '連携の向きが、まだ決まっていません',
    desc: 'ログイン情報を登録すると、こちらで向きを設定します。それまで、このサイトへは何も送りません。',
  };
}

/** ★ 受け付けていないサイトでは、保存の口そのものを出さない */
export function canRegisterSite(site: { accepting: boolean }): boolean {
  return site.accepting === true;
}
