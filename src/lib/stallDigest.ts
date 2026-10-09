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

/** 店ごとにまとめた行（店の番号の小さい順・同じ店の中は見張りの順）。★ 一覧にもメールにも同じ並べ方を使う */
export function formatStallItems(list: ReadonlyArray<StallItem>): string[] {
  const lines: string[] = [];
  const order: StallWatch[] = ['import', 'write', 'diary', 'problem'];
  const bySalon = new Map<number, StallItem[]>();
  for (const it of list) {
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
  return lines;
}

function errorLines(errors: ReadonlyArray<string>): string[] {
  if (errors.length === 0) return [];
  const lines = ['', '★ 読めなかったもの（止まっていない、とは言えない）: ' + errors.length + ' 件'];
  for (const e of errors.slice(0, 20)) lines.push('  ・' + e);
  return lines;
}

/** 人が読む形（VPS の画面で見る一覧）。★ 0件でも、見た数を必ず出す */
export function formatStallOverview(o: StallOverview): string[] {
  const c = o.checked;
  return [
    '止まっているもの・うまくいっていないもの: ' + o.items.length + ' 件' +
    '（見た数: 店 ' + c.salons + '・ログイン情報 ' + c.credentials + '・写メ日記の枠 ' + c.diarySlots +
    (c.diaryQuiet > 0 ? '〔うち見張っていない枠 ' + c.diaryQuiet + '〕' : '') + '）',
    ...formatStallItems(o.items),
    ...errorLines(o.errors),
  ];
}

// ────────────────────────────────────────────────────────────
// メールにつなぐ（第1341便・2026-10-09・カッキーさん決定）
// ────────────────────────────────────────────────────────────
//
// ★ 決まり（10/9）
//   ・4種類ぜんぶ知らせる（一覧を見たとき、止まりは0件だった。うるさければ、あとから外す）。
//   ・見るのは30分ごと（Vercel の定期実行 → GET /api/cron/stall-watch）。
//   ・新しく止まったら、すぐ1通。
//   ・「うまくいっていないこと」だけは、2回続けて見えたとき（30分以上続いたとき）に知らせる。次の周で直るものでは鳴らさない。
//   ・止まったままなら、毎朝9時（日本時間）に、残っているものをまとめて1通。
//   ・知らせていたものが全部なくなったら「全部直りました」を1通（1件ずつは出さない）。
//
// ★★ 読めなかった店がある回（overview.errors がある回）は、「消えた」と決めつけない:
//   覚えている行を消さない・「全部直りました」を出さない。★ 読めなかっただけで、直ったというメールを出さない。
// ★ 覚える表は ops_stall_alerts（追加SQL_第1341便）。行は「いま止まっているもの」だけ（直ったら消す）。
//   毎朝のまとめを出した時刻は、同じ表の1行（key = STALL_DIGEST_META_KEY）に置く。

/** 「うまくいっていないこと」は、何回続けて見えたら知らせるか */
export const STALL_PROBLEM_MIN_SEEN = 2;
/** 毎朝のまとめを出す時刻（日本時間の時）。その時刻を過ぎた最初の回で出す */
export const STALL_DIGEST_HOUR_JST = 9;
/** 毎朝のまとめを出した時刻を置く行の名前 */
export const STALL_DIGEST_META_KEY = 'meta:digest';

export type StallKnownRow = { key: string; firstSeenAt: string; seenCount: number; alertedAt: string | null };

export type StallAlertRow = {
  key: string;
  watch: StallWatch;
  salon_id: number;
  provider: string;
  slot: number;
  reason: string;
  first_seen_at: string;
  last_seen_at: string;
  seen_count: number;
  alerted_at: string | null;
};

export type StallMail = { kind: 'new' | 'digest' | 'cleared'; subject: string; lines: string[] };

export type StallAlertPlan = {
  mails: StallMail[];
  /** いま止まっているもの（足す・上書きする行） */
  upserts: StallAlertRow[];
  /** 直ったもの（消す行の名前）。★ 読めなかった店がある回は空 */
  deleteKeys: string[];
  /** 毎朝のまとめの印を、この時刻に入れ直す。null は触らない */
  digestAt: string | null;
  note: string;
};

/** 日本時間の日付（YYYY-MM-DD）と時。読めない時刻は null */
function jstParts(iso: string | null | undefined): { day: string; hour: number } | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 9 * 3600 * 1000);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return { day: d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()), hour: d.getUTCHours() };
}

const WHERE_TO_LOOK = '見る場所: その店のコネックエフ（または媒体連携）の「更新結果」。全店ぶんは VPS で /api/admin/stall-overview?text=1。';

export function planStallAlerts(input: {
  overview: StallOverview;
  known: ReadonlyArray<StallKnownRow>;
  lastDigestAt: string | null;
  nowIso: string;
}): StallAlertPlan {
  const { overview, nowIso } = input;
  const blind = overview.errors.length > 0;
  const knownOf = new Map<string, StallKnownRow>();
  for (const k of input.known) knownOf.set(k.key, k);

  // ★ 同じ名前のものが2つ来ても、1つとして数える（同じ行を2回書かない）
  const current = new Map<string, StallItem>();
  for (const it of overview.items) if (!current.has(it.key)) current.set(it.key, it);

  const upserts: StallAlertRow[] = [];
  const fresh: StallItem[] = [];        // この回で初めて知らせるもの
  const persisting: StallItem[] = [];   // 前の回までに知らせてあって、まだ止まっているもの
  for (const it of current.values()) {
    const k = knownOf.get(it.key);
    const seenCount = (k ? k.seenCount : 0) + 1;
    const need = it.watch === 'problem' ? STALL_PROBLEM_MIN_SEEN : 1;
    let alertedAt = k ? k.alertedAt : null;
    if (alertedAt !== null) persisting.push(it);
    else if (seenCount >= need) { alertedAt = nowIso; fresh.push(it); }
    upserts.push({
      key: it.key, watch: it.watch, salon_id: it.salonId, provider: it.provider, slot: it.slot, reason: it.reason,
      first_seen_at: k ? k.firstSeenAt : nowIso, last_seen_at: nowIso, seen_count: seenCount, alerted_at: alertedAt,
    });
  }

  // ★★ 読めなかった店がある回は、消えたと決めつけない
  const deleteKeys = blind ? [] : input.known.filter((k) => !current.has(k.key)).map((k) => k.key);

  const mails: StallMail[] = [];
  if (fresh.length > 0) {
    mails.push({
      kind: 'new',
      subject: '【フクエス】連携が止まっています（新しく ' + fresh.length + '件）',
      lines: [
        '新しく見つかった、止まっているもの・うまくいっていないもの: ' + fresh.length + ' 件',
        ...formatStallItems(fresh),
        '',
        ...(persisting.length > 0 ? ['前から知らせているもの: ' + persisting.length + ' 件（毎朝' + STALL_DIGEST_HOUR_JST + '時にまとめて知らせます）'] : []),
        WHERE_TO_LOOK,
        ...errorLines(overview.errors),
      ],
    });
  }

  // ── 毎朝のまとめ（日本時間の9時を過ぎた最初の回。★ その日の印は、出すものが無くても付ける）──
  let digestAt: string | null = null;
  const nowJ = jstParts(nowIso);
  const lastJ = jstParts(input.lastDigestAt);
  if (nowJ && nowJ.hour >= STALL_DIGEST_HOUR_JST && (lastJ === null || lastJ.day < nowJ.day)) {
    digestAt = nowIso;
    if (persisting.length > 0) {
      mails.push({
        kind: 'digest',
        subject: '【フクエス】止まったままの連携が ' + persisting.length + '件 あります（毎朝のまとめ）',
        lines: [
          '前から知らせていて、まだ止まっているもの: ' + persisting.length + ' 件',
          ...formatStallItems(persisting),
          '',
          WHERE_TO_LOOK,
          ...errorLines(overview.errors),
        ],
      });
    }
  }

  // ── 全部直った（★ 知らせていたものがあって、いま知らせているものが1つも無い。読めなかった回は出さない）──
  const hadAlerted = input.known.some((k) => k.alertedAt !== null);
  if (!blind && hadAlerted && persisting.length === 0 && fresh.length === 0) {
    mails.push({
      kind: 'cleared',
      subject: '【フクエス】止まっていた連携は、全部直りました',
      lines: [
        '知らせていた、止まっているもの・うまくいっていないものは、全部なくなりました。',
        '（見た数: 店 ' + overview.checked.salons + '・ログイン情報 ' + overview.checked.credentials + '・写メ日記の枠 ' + overview.checked.diarySlots + '）',
      ],
    });
  }

  return {
    mails, upserts, deleteKeys, digestAt,
    note: 'いま ' + current.size + ' 件（新しく知らせた ' + fresh.length + '・前から ' + persisting.length + '・直った ' + deleteKeys.length + '）' +
      (blind ? '・★ 読めなかったものがあるので、消えたとは決めつけていない' : ''),
  };
}
