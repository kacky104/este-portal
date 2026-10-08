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
