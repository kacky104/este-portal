// フクエスCRM「グループ・提携店で共有するNG・要注意リスト」の決まり（第1324便・2026-10-09）。★ 純粋関数だけ。通信もDBも触らない。
//   設計は 設計メモ_グループで共有するNG・要注意リスト_2026-10-09.md。表は 追加SQL_第1324便。
//
// ★★★ 線引き（カッキーさんの決定）
//   ・まったく知らない店どうしの共有は作らない。グループ（親会社・子会社）と、実際にお客様を案内し合っている提携店だけ。
//   ・グループは運営だけが作る。全部の店のサインがそろった契約書を受け取ってから、運営が店を入れる。
//   ・1店が入れるグループは1つだけ（グループの店は、全員がお互いに相手を知っている1つの輪）。
//   ・共有するのは、セラピストや店への危害だけ。★ 無断キャンセル・料金のもめごとは共有しない（別法人どうしで共有する根拠が弱い）。
// ★★★ どの店とどの店が同じグループか（提携しているか）は、秘密の情報。
//   ★ コード・コメント・コミットの文・追加SQL・番人・画面の見本に、実在の店の組み合わせを書かない（DB の中にだけ持つ）。
//   ★ 店舗様の画面（受付・スケジュール）には、出した店の名前を出さない。「グループ・提携店でNG」とだけ出す。

/** お客様に見える所で、共有の相手をどう呼ぶか（既定）。★ 店の名前は入れない */
export const CRM_GROUP_PUBLIC_LABEL = '当店のグループ店舗・提携店舗';
/** 店舗様の画面で、共有リストに当たったときの呼び方。★ 出した店の名前は付けない */
export const CRM_GROUP_ALERT_SOURCE_LABEL = 'グループ・提携店';

export const CRM_GROUP_NAME_MAX = 40;
export const CRM_GROUP_NOTE_MAX = 500;
export const CRM_GROUP_CORP_NAME_MAX = 80;

/** 段。★ ng＝受けない／caution＝受けるが気をつける */
export const CRM_GROUP_LEVELS = [
  { key: 'ng', label: 'NG' },
  { key: 'caution', label: '要注意' },
] as const;
export type CrmGroupLevel = (typeof CRM_GROUP_LEVELS)[number]['key'];

/**
 * 分類。★ セラピストや店への危害だけ。★ DB の check（crm_group_alerts.kind）と同じ並び。
 *   ★ 「無断キャンセル」「料金のもめごと」は入れない（上の線引き）。足すときは、追加SQL で check も直すこと。
 */
export const CRM_GROUP_KINDS = [
  { key: 'violence', label: '暴力・脅し' },
  { key: 'theft', label: '盗み' },
  { key: 'stalking', label: 'つきまとい・待ち伏せ' },
  { key: 'voyeur', label: '盗撮・録音' },
  { key: 'coercion', label: 'サービス外の行為の強要' },
  { key: 'intoxicated', label: '泥酔・薬物' },
  { key: 'other', label: 'そのほか（セラピストや店への危害）' },
] as const;
export type CrmGroupKind = (typeof CRM_GROUP_KINDS)[number]['key'];

export function isCrmGroupLevel(v: unknown): v is CrmGroupLevel {
  return CRM_GROUP_LEVELS.some((x) => x.key === v);
}
export function isCrmGroupKind(v: unknown): v is CrmGroupKind {
  return CRM_GROUP_KINDS.some((x) => x.key === v);
}

export type CrmGroupCheck = { ok: true } | { ok: false; error: string };

/** グループの名前（運営の覚え書き）。★ 店舗様・お客様には見せない */
export function checkCrmGroupName(name: unknown): CrmGroupCheck {
  const s = typeof name === 'string' ? name.trim() : '';
  if (s.length === 0) return { ok: false, error: 'グループの名前を入れてください' };
  if (s.length > CRM_GROUP_NAME_MAX) return { ok: false, error: 'グループの名前は' + CRM_GROUP_NAME_MAX + '文字までです' };
  return { ok: true };
}

/** YYYY-MM-DD の、実在する日付か */
export function isISODate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * 店をグループへ入れるときの検査。
 * ★★ 法人名と「契約書を受け取った日」が無ければ入れない（サインをもらう前に入れない）。
 * ★ 受け取った日が今日より先なら入れない（まだ受け取っていない）。
 * @param todayISO 今日（JST の YYYY-MM-DD）。★ このファイルは時計を持たない
 */
export function checkCrmGroupMember(input: { salonId: unknown; corpName: unknown; agreedOn: unknown }, todayISO: string): CrmGroupCheck {
  const salonId = Number(input.salonId);
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗を選んでください' };
  const corp = typeof input.corpName === 'string' ? input.corpName.trim() : '';
  if (corp.length === 0) return { ok: false, error: '法人名（個人なら屋号かお名前）を入れてください' };
  if (corp.length > CRM_GROUP_CORP_NAME_MAX) return { ok: false, error: '法人名は' + CRM_GROUP_CORP_NAME_MAX + '文字までです' };
  if (!isISODate(input.agreedOn)) return { ok: false, error: '契約書を受け取った日を入れてください' };
  if (isISODate(todayISO) && input.agreedOn > todayISO) return { ok: false, error: '契約書を受け取った日が、今日より先になっています' };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 第1325便（2026-10-09）: 共有の登録（顧客台帳）と、受付・スケジュールでの表示。
//
// ★★★ カッキーさんの決定（10/9）
//   ・受付の帯には「何をされたか」の文まで出す（受付の人が、その場で事情を分かったうえで断れるように）。
//   ・店舗様の画面では、【どこにも】出した店の名前を出さない（受付・スケジュール・共有リストのページ・台帳のどれにも）。
//     フクエスCRM のログインは店ごとに1つで、受付のスタッフも同じ画面を使うため。
//     どの店が出したかを知りたいときは、オーナー様どうしで聞いてもらう。
//   ★ だから、画面へ返す形（CrmGroupHit・CrmGroupListRow）には、店の番号も名前も【入れない】。入れるのは「自店の分か」だけ。
//   ・当たっても、予約を自動で断らない（電話番号の持ち主が変わった別人のことがある）。出すだけ。断るかは店が決める。

/** 確かさ。★ DB の check（crm_group_alerts.certainty）と同じ並び */
export const CRM_GROUP_CERTAINTIES = [
  { key: 'confirmed', label: '確認済み' },
  { key: 'suspected', label: '疑い' },
] as const;
export type CrmGroupCertainty = (typeof CRM_GROUP_CERTAINTIES)[number]['key'];
export function isCrmGroupCertainty(v: unknown): v is CrmGroupCertainty {
  return CRM_GROUP_CERTAINTIES.some((x) => x.key === v);
}

export const CRM_GROUP_WHAT_MAX = 300;
export const CRM_GROUP_CHECKED_HOW_MAX = 100;
/** 1件の共有に付けられる電話番号の数（台帳の上限と同じ） */
export const CRM_GROUP_PHONES_MAX = 5;

/**
 * 受付・スケジュール・台帳に出す「当たり」1件。
 * ★★★ 出した店の番号・名前は入れない（上の決定）。mine＝自店が出した分か、だけ。
 */
export type CrmGroupHit = {
  id: number;
  level: CrmGroupLevel;
  kind: CrmGroupKind;
  certainty: CrmGroupCertainty;
  /** YYYY-MM-DD */
  happenedOn: string;
  what: string;
  /** 共有したときの、お客様の名前（人ちがいに気づくため） */
  shownName: string;
  mine: boolean;
};

export function crmGroupLevelLabel(level: unknown): string {
  return CRM_GROUP_LEVELS.find((x) => x.key === level)?.label ?? '';
}
/** 分類の短い呼び方（「そのほか（…）」は「そのほか」） */
export function crmGroupKindLabel(kind: unknown): string {
  const l = CRM_GROUP_KINDS.find((x) => x.key === kind)?.label ?? '';
  return l.replace(/（.*$/, '');
}
export function crmGroupCertaintyLabel(c: unknown): string {
  return CRM_GROUP_CERTAINTIES.find((x) => x.key === c)?.label ?? '';
}
/** 2026-10-08 → 2026/10/8 */
export function crmGroupDateLabel(iso: unknown): string {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? m[1] + '/' + Number(m[2]) + '/' + Number(m[3]) : '';
}

/**
 * 帯の見出し。例:「グループ・提携店でNG（盗み・2026/10/8・確認済み）」
 * ★★★ 出した店の名前は付けない。★ 自店が出した分は「自店からグループ・提携店に共有中：NG（…）」。
 */
export function crmGroupHitTitle(hit: Pick<CrmGroupHit, 'level' | 'kind' | 'certainty' | 'happenedOn' | 'mine'>): string {
  const tail = '（' + [crmGroupKindLabel(hit.kind), crmGroupDateLabel(hit.happenedOn), crmGroupCertaintyLabel(hit.certainty)].filter((x) => x !== '').join('・') + '）';
  const lv = crmGroupLevelLabel(hit.level);
  return hit.mine
    ? '自店から' + CRM_GROUP_ALERT_SOURCE_LABEL + 'に共有中：' + lv + tail
    : CRM_GROUP_ALERT_SOURCE_LABEL + 'で' + lv + tail;
}

/**
 * 予約カードに付ける印。★ ほかの店が出した分だけを数える（自店の分は、自店の台帳の分類・要注意で分かる）。
 * ★ NG が1件でもあれば 'ng'。要注意だけなら 'caution'。無ければ null。
 */
export function crmGroupBadge(hits: ReadonlyArray<Pick<CrmGroupHit, 'level' | 'mine'>> | null | undefined): CrmGroupLevel | null {
  const others = (hits ?? []).filter((h) => !h.mine);
  if (others.some((h) => h.level === 'ng')) return 'ng';
  if (others.some((h) => h.level === 'caution')) return 'caution';
  return null;
}
export const CRM_GROUP_BADGE_LABEL: Readonly<Record<CrmGroupLevel, string>> = { ng: 'グループNG', caution: 'グループ要注意' };

/** 並べ方: NG が先、同じ段なら新しい日付が先 */
export function sortCrmGroupHits<T extends Pick<CrmGroupHit, 'level' | 'happenedOn' | 'id'>>(hits: ReadonlyArray<T>): T[] {
  const rank = (l: CrmGroupLevel) => (l === 'ng' ? 0 : 1);
  return [...hits].sort((a, b) => rank(a.level) - rank(b.level) || (a.happenedOn < b.happenedOn ? 1 : a.happenedOn > b.happenedOn ? -1 : b.id - a.id));
}

export type CrmGroupAlertInput = {
  level: unknown; kind: unknown; certainty: unknown; happenedOn: unknown; what: unknown; checkedHow: unknown; phones: unknown;
};
export type CrmGroupAlertClean = {
  level: CrmGroupLevel; kind: CrmGroupKind; certainty: CrmGroupCertainty; happenedOn: string; what: string; checkedHow: string; phones: string[];
};

/**
 * 共有を登録・直すときの検査。通れば、保存する形（前後の空白を落としたもの）を返す。
 * ★★★ 分類は、危害の7つだけ（無断キャンセル・料金のもめごとは、ここで断る。DB の check も同じ）。
 * ★ 電話番号が1つも無ければ断る（電話番号で照らし合わせる仕組みなので、番号の無い共有は当たらない）。
 * ★ 日付が今日より先なら断る（まだ起きていないことは書けない）。
 * @param todayISO 今日（JST の YYYY-MM-DD）。★ このファイルは時計を持たない
 */
export function checkCrmGroupAlert(input: CrmGroupAlertInput, todayISO: string): { ok: true; value: CrmGroupAlertClean } | { ok: false; error: string } {
  if (!isCrmGroupLevel(input.level)) return { ok: false, error: 'NG か要注意かを選んでください' };
  if (!isCrmGroupKind(input.kind)) return { ok: false, error: '分類を選んでください（無断キャンセル・料金のもめごとは共有できません）' };
  if (!isCrmGroupCertainty(input.certainty)) return { ok: false, error: '確認済みか、疑いかを選んでください' };
  if (!isISODate(input.happenedOn)) return { ok: false, error: '起きた日を入れてください' };
  if (isISODate(todayISO) && input.happenedOn > todayISO) return { ok: false, error: '起きた日が、今日より先になっています' };
  const what = typeof input.what === 'string' ? input.what.trim() : '';
  if (what.length === 0) return { ok: false, error: '何をされたかを書いてください（事実だけ）' };
  if (what.length > CRM_GROUP_WHAT_MAX) return { ok: false, error: '何をされたかは' + CRM_GROUP_WHAT_MAX + '文字までです' };
  const checkedHow = typeof input.checkedHow === 'string' ? input.checkedHow.trim() : '';
  if (checkedHow.length > CRM_GROUP_CHECKED_HOW_MAX) return { ok: false, error: '確かめ方は' + CRM_GROUP_CHECKED_HOW_MAX + '文字までです' };
  const raw = Array.isArray(input.phones) ? input.phones : [];
  const phones: string[] = [];
  for (const p of raw) {
    if (typeof p !== 'string' || !/^[0-9]{10,13}$/.test(p)) return { ok: false, error: '電話番号の形が正しくありません' };
    if (!phones.includes(p)) phones.push(p);
  }
  if (phones.length === 0) return { ok: false, error: '共有する電話番号を1つ以上選んでください' };
  if (phones.length > CRM_GROUP_PHONES_MAX) return { ok: false, error: '電話番号は' + CRM_GROUP_PHONES_MAX + '件までです' };
  return { ok: true, value: { level: input.level, kind: input.kind, certainty: input.certainty, happenedOn: input.happenedOn, what, checkedHow, phones } };
}

// ─────────────────────────────────────────────────────────────────────────────
// 第1327便（2026-10-09）: お客様の同意書に足す文（グループ・提携店で共有する店が、同意書に入れる文の例）。
//   ★ 文はカッキーさんが決めた案1。弁護士の確認前の下書き（載せる前に確認を通すこと）。
//   ★ 店が自分で直した同意書を、こちらで勝手に書き換えない。設定の画面のボタンを店が押したときだけ足す（そのあと店が保存する）。
//   ★ 相手は「当店のグループ店舗・提携店舗」とだけ書く。店の名前は出さない。

/** 同意書に、共有の文がもう入っているかの目印 */
export const CRM_GROUP_CONSENT_MARK = 'グループ店舗・提携店舗';

/** 同意書に足す文（番号は付けていない。足すときに、同意書の番号の続きを付ける） */
export const CRM_GROUP_CONSENT_CLAUSE =
  'お客様が、暴力・脅迫、窃盗、つきまとい・待ち伏せ、盗撮・録音、サービス外の行為の強要など、セラピストまたは当店に危害や損害を与える行為をされた場合、'
  + '当店は、セラピストの安全を守り、同じ被害を防ぐ目的で、お客様のお名前・電話番号・その行為のあった日と内容を、当店のグループ店舗・提携店舗に知らせ、共有することがあります。'
  + '共有した店舗でも、以後のご利用をお断りする場合があります。';

/** ひな形の「個人情報は〜のみに使用します」の文。★ このままだと、共有の文と食い違うので直す */
export const CRM_GROUP_CONSENT_PURPOSE_OLD = 'お預かりした個人情報は、ご予約とご来店の管理のためにのみ使用します。';

export type CrmGroupConsentResult =
  | { ok: true; body: string; /** 足した項目の番号（番号つきの同意書のとき） */ number: number | null; /** 「〜のみに使用します」の文を直したか */ fixedPurpose: boolean }
  | { ok: false; reason: 'already' | 'too_long' };

/**
 * 同意書の本文に、グループ・提携店との共有の文を足す。
 * ・もう入っていれば何もしない（already）。
 * ・番号つき（「10. …」）の同意書なら、最後の番号の次の番号で、その項目のあとに足す。
 * ・番号が無ければ、「以上…」で始まる結びの前（無ければ最後）に足す。
 * ・ひな形の「個人情報は〜のみに使用します」が残っていれば、食い違わない文に直す。
 * ・長さの上限をこえるなら足さない（too_long）。
 */
export function addCrmGroupConsentClause(body: unknown, maxLen = 8000): CrmGroupConsentResult {
  const text = (typeof body === 'string' ? body : '').replace(/\r\n?/g, '\n');
  if (text.includes(CRM_GROUP_CONSENT_MARK)) return { ok: false, reason: 'already' };
  const toHalf = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const lines = text.split('\n');
  const numRe = /^\s*([0-9０-９]{1,3})\s*[.．、)）]/;
  let last = -1;
  let lastNo = 0;
  lines.forEach((l, i) => {
    const m = numRe.exec(l);
    if (m) { last = i; lastNo = Number(toHalf(m[1])); }
  });

  let out: string[];
  let number: number | null = null;
  if (last >= 0) {
    number = lastNo + 1;
    let end = last;
    while (end + 1 < lines.length && lines[end + 1].trim() !== '') end++; // その項目の続きの行
    out = [...lines.slice(0, end + 1), '', number + '. ' + CRM_GROUP_CONSENT_CLAUSE, ...lines.slice(end + 1)];
  } else {
    let closing = -1;
    lines.forEach((l, i) => { if (/^\s*以上/.test(l)) closing = i; });
    if (closing >= 0) out = [...lines.slice(0, closing), CRM_GROUP_CONSENT_CLAUSE, '', ...lines.slice(closing)];
    else out = [...(text.trim() === '' ? [] : [...lines, '']), CRM_GROUP_CONSENT_CLAUSE];
  }
  let next = out.join('\n');
  const fixedPurpose = next.includes(CRM_GROUP_CONSENT_PURPOSE_OLD);
  if (fixedPurpose) {
    next = next.replace(
      CRM_GROUP_CONSENT_PURPOSE_OLD,
      number != null
        ? 'お預かりした個人情報は、ご予約とご来店の管理のため、および次の' + number + 'の目的のために使用します。'
        : 'お預かりした個人情報は、ご予約とご来店の管理のため、および下記の共有の目的のために使用します。',
    );
  }
  if (next.length > maxLen) return { ok: false, reason: 'too_long' };
  return { ok: true, body: next, number, fixedPurpose };
}
