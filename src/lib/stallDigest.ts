// ───────── 全店の「止まっているもの・うまくいっていないもの」を1つの一覧にする（第1340便・2026-10-09・純粋関数）─────────
//
// ★★★ なぜ要るか（カッキーさんとの相談・10/9）
//   止まりの見張りは前からある（出勤の取り込み・書き込み・写メ日記の巡回・ログインの連続失敗）。
//   でも出る場所が、店ごとの画面の赤い帯・VPS のログ・連携の記録で、運営がまとめて見る場所が無かった。
//   VPS が動いていても（lib/vpsWatch.ts の見張りは鳴らない）、駅ちか側のエラーで止まっていることがある。
//   → まず全店ぶんを1つの一覧で【見るだけ】（POST /api/admin/stall-overview）。
//     一覧を見て、鳴らすものを決めてから、メールにつなぐ（次の便）。
//
// ★ 新しい基準は作らない。「止まり」の線は、今ある見張りのもの:
//   取り込み … lib/importStall.ts（当日 16周・最短4時間／週間 48時間）
//   書き込み … lib/mediaLinkStall.ts（出勤を変えたのに24時間送れていない）
//   写メ日記 … lib/diaryStall.ts（16周・最短4時間）
//   うまくいっていないこと … lib/workProblem.ts（ログインに続けて失敗・反映できていない・自動が止まった など）
//
// ★ このファイルは通信も DB も触らない（集めるのは app/lib/media/stallOverview.ts）。

export type StallWatch = 'import' | 'write' | 'diary' | 'problem';

export type StallItem = {
  /** 同じ止まりを、次の回にも同じものと分かるための名前（知らせ済みを覚えるのに使う・次の便） */
  key: string;
  salonId: number;
  salonName: string;
  provider: string;
  slot: number;
  /** サイトの呼び名（「駅ちか（枠1）」） */
  siteLabel: string;
  watch: StallWatch;
  /** 見張りごとの理由の名前（list_stale・never_sent・login など）。表示と記録のためだけ */
  reason: string;
  /** 何時間たっているか。分からないものは null（0 のふりをさせない） */
  elapsedHours: number | null;
  /** 運営が読む1行 */
  message: string;
};

export type StallOverview = {
  items: StallItem[];
  /** 見た数（0件のとき「見ていない」と「止まっていない」を混ぜないため） */
  checked: { salons: number; credentials: number; diarySlots: number; diaryQuiet: number };
  /** 読めなかったもの。★ 読めなかった店を「止まっていない」に数えない */
  errors: string[];
};

export const STALL_WATCH_LABEL: Record<StallWatch, string> = {
  import: '出勤の取り込み',
  write: '出勤の書き込み',
  diary: '写メ日記の巡回',
  problem: 'うまくいっていないこと',
};

export function stallKey(i: { watch: StallWatch; salonId: number; provider: string; slot: number; reason: string }): string {
  return i.watch + ':' + i.salonId + ':' + i.provider + ':' + i.slot + ':' + i.reason;
}

/** 店ごとにまとめた、人が読む形（VPS の画面・メールの本文に使う）。★ 店の番号の小さい順・同じ店の中は見張りの順 */
export function formatStallOverview(o: StallOverview): string[] {
  const lines: string[] = [];
  const c = o.checked;
  lines.push(
    '止まっているもの・うまくいっていないもの: ' + o.items.length + ' 件' +
    '（見た数: 店 ' + c.salons + '・ログイン情報 ' + c.credentials + '・写メ日記の枠 ' + c.diarySlots +
    (c.diaryQuiet > 0 ? '〔うち見張っていない枠 ' + c.diaryQuiet + '〕' : '') + '）',
  );
  const order: StallWatch[] = ['import', 'write', 'diary', 'problem'];
  const bySalon = new Map<number, StallItem[]>();
  for (const it of o.items) {
    const a = bySalon.get(it.salonId) ?? [];
    a.push(it);
    bySalon.set(it.salonId, a);
  }
  for (const salonId of Array.from(bySalon.keys()).sort((a, b) => a - b)) {
    const items = (bySalon.get(salonId) ?? []).slice().sort(
      (a, b) => order.indexOf(a.watch) - order.indexOf(b.watch) || a.provider.localeCompare(b.provider) || a.slot - b.slot,
    );
    lines.push('');
    lines.push('■ ' + (items[0].salonName || '（名前なし）') + '（店 ' + salonId + '）');
    for (const it of items) {
      const hours = it.elapsedHours === null ? '' : '〔約' + Math.round(it.elapsedHours) + '時間〕';
      lines.push('  ・' + it.siteLabel + '［' + STALL_WATCH_LABEL[it.watch] + '］' + it.message + hours + '  <' + it.reason + '>');
    }
  }
  if (o.errors.length > 0) {
    lines.push('');
    lines.push('★ 読めなかったもの（止まっていない、とは言えない）: ' + o.errors.length + ' 件');
    for (const e of o.errors.slice(0, 20)) lines.push('  ・' + e);
  }
  return lines;
}
