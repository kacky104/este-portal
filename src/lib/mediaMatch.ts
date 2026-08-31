// 媒体へ送る前の突き合わせ（第72便・設計メモ 追記46 §244〜§247）。
//
// ★★★ なぜ要るか —— ㉟ で実物を見て分かったこと
//   エステラブは、同じ名前でもう一度登録すると **黙って2人になる**（2026-08-31 実測）。
//     エラーも出ない。上書きにもならない。★ 出勤情報の画面にも2行出る。
//   → 名前だけを持って「送る」作りは、そのままでは成立しない。送るたびに人が増える。
//
// ★★★ そして、もう1つ分かったこと —— **向こうは読める**
//   §156 は「エステラブは向こうを読めないので送るボタンしか置けない」と書いていたが、
//   ★ セラピスト一覧も出勤フォームも id つきで読めた。「読めない」ではなく
//     「取り込みをしないと決めていた」だけだった（mediaSites.ts の readable の意味）。
//   → **送る前に読んで、突き合わせられる。** この判定はそのためにある。
//
// ★★★ このファイルは通信もDBも触らない。名簿と名前を受け取って、答えを返すだけ。
//   mediaRoster.ts（ズレを見せる）とは役割が違う。★ こちらは【送ってよいか】を決める。

/** 媒体側の名簿の1人。★ castId は媒体側のID（エステラブなら 696450 のような番号）。 */
export type MediaRosterEntry = { castId: string; name: string };

export type NameMatch =
  /** ★ 名簿が読めていない。「居ない」と混ぜない（作法3-5）。送ってはいけない */
  | { kind: 'unknown' }
  /** 向こうに居ない → 新しく登録してよい */
  | { kind: 'absent' }
  /** ちょうど1人 → その castId へ送る（★ 新規登録しない） */
  | { kind: 'single'; castId: string }
  /** ★★ 2人以上居る → 送らない。どちらへ送るか機械には決められない */
  | { kind: 'ambiguous'; castIds: string[] };

/**
 * 名前を突き合わせる形に整える。
 *
 * ★★★ 揃えるのは【空白】と【全角・半角】だけ。
 *   ・前後の空白を落とし、間の連続した空白を1つにする
 *   ・全角の英数字・記号・半角カナを、NFKC で普通の形にする（「ﾐｷ」→「ミキ」「Ａ」→「A」）
 *
 * ★★★ 読みが同じでも、別の文字なら【別人として扱う】。
 *   「あい」「アイ」「愛」は揃えない。★ 揃えると、実際に別人の3人を1人と見なして
 *     出勤を他人の欄に入れる事故になる。**間違えたときに取り返しがつかないほうへ倒さない。**
 *   ★ 逆に、同じ人を別人と見なした場合は「居ない → 登録する」に倒れる。
 *     それも困るが、★ 突き合わせの結果は人に見せるので、気づける。
 */
export function normalizeName(name: string): string {
  if (typeof name !== 'string') return '';
  return name.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

/**
 * 1人ぶんの突き合わせ。
 * @param roster 媒体側の名簿。★ null は【読めていない】。空配列（0人）とは別物
 */
export function matchTherapistByName(
  roster: readonly MediaRosterEntry[] | null,
  name: string,
): NameMatch {
  if (roster === null) return { kind: 'unknown' };
  const key = normalizeName(name);
  // ★ 名前が空なら突き合わせられない。★ 「居ない」と答えて登録させない
  if (key.length === 0) return { kind: 'unknown' };

  const hits = roster.filter((r) => normalizeName(r.name) === key);
  if (hits.length === 0) return { kind: 'absent' };
  if (hits.length === 1) return { kind: 'single', castId: hits[0].castId };
  return { kind: 'ambiguous', castIds: hits.map((h) => h.castId) };
}

// ─────────────────────────────────────────────────────────
// まとめて計画する
// ─────────────────────────────────────────────────────────

export type MatchTarget = { therapistId: number; name: string };

export type WritePlan = {
  /** 向こうに居ないので、新しく登録する人 */
  toRegister: MatchTarget[];
  /** 向こうに1人だけ居るので、その castId へ送る人 */
  toUse: Array<MatchTarget & { castId: string }>;
  /** ★★ 送らない人と、その理由。★ 黙って飛ばさない——必ず画面に出す */
  blocked: Array<MatchTarget & { reason: 'ambiguous' | 'unknown'; castIds: string[] }>;
};

/**
 * 送る相手をまとめて決める。
 *
 * ★★★ 「送れない人が居ても、送れる人だけ送る」形にしてある。
 *   全部止めると、1人の重複のせいで店舗全員の出勤が止まる。★ それは害のほうが大きい。
 *   ★ ただし **送らなかった人は必ず返す**。数だけ合わせて黙るのがいちばん悪い（§26）。
 *
 * ★ 名簿が読めていない（roster が null）ときは【1人も送らない】。
 *   ★ このときだけは全部止める。読めていないのに登録すると、全員ぶん重複を作る。
 */
export function planRosterWrite(
  roster: readonly MediaRosterEntry[] | null,
  targets: readonly MatchTarget[],
): WritePlan {
  const plan: WritePlan = { toRegister: [], toUse: [], blocked: [] };
  for (const t of targets) {
    const m = matchTherapistByName(roster, t.name);
    switch (m.kind) {
      case 'unknown':
        plan.blocked.push({ ...t, reason: 'unknown', castIds: [] });
        break;
      case 'ambiguous':
        plan.blocked.push({ ...t, reason: 'ambiguous', castIds: m.castIds });
        break;
      case 'absent':
        plan.toRegister.push({ ...t });
        break;
      case 'single':
        plan.toUse.push({ ...t, castId: m.castId });
        break;
    }
  }
  return plan;
}

/** 送らなかった1人を、店舗が読んで分かる1行にする。 */
export function blockedMessage(b: { name: string; reason: 'ambiguous' | 'unknown'; castIds: string[] }): string {
  if (b.reason === 'unknown') {
    return b.name + 'さんは、媒体側の名簿を読み取れなかったため送っていません';
  }
  return (
    b.name + 'さんは、媒体側に同じ名前で' + b.castIds.length + '人登録されているため送っていません。' +
    '媒体の管理画面で重複を整理してください'
  );
}

/**
 * 送る前に画面へ出す1行。★ 何をするつもりかを、送る前に言葉にする。
 * ★ 0件のときに「変更なし」と言わない（§26）。数えた中身をそのまま言う。
 */
export function planSummary(plan: WritePlan): string {
  const parts: string[] = [];
  if (plan.toUse.length > 0) parts.push('登録済み ' + plan.toUse.length + '人へ反映');
  if (plan.toRegister.length > 0) parts.push('新しく ' + plan.toRegister.length + '人を登録');
  if (plan.blocked.length > 0) parts.push('★ ' + plan.blocked.length + '人は送りません');
  if (parts.length === 0) return '送る相手が1人もいません';
  return parts.join(' / ');
}

/** 送るものが1人も無ければ true。★ 呼び出し側は、これを見て「送った」と言わないこと。 */
export function planIsEmpty(plan: WritePlan): boolean {
  return plan.toRegister.length === 0 && plan.toUse.length === 0;
}
