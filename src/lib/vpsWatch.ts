// ───────── VPS の見張り（第1339便・2026-10-09・純粋関数）─────────
//
// ★★★ なぜ要るか（カッキーさんとの相談・10/9）
//   定期の処理（出勤・写メ日記の取り込み／媒体への送信／自動投稿）は、全部 VPS の crontab から動いている。
//   VPS が止まる（落ちる・ディスクがいっぱい・crontab を壊す・ConoHa の契約が切れる）と、
//   ログにも書けず、だまって止まる。今ある見張り（取り込み・写メ日記・書き込み）は画面を開いたときにしか見えない。
//   → 「VPS から○分連絡が無い」を、VPS の外（Vercel の定期実行）で見て、運営にメールする。
//
// ★ 流れ
//   VPS の crontab（5分ごと）→ POST /api/relay/heartbeat（動いています・ディスク%・メモリ残り）→ vps_heartbeat の1行
//   Vercel Cron（10分ごと）  → GET  /api/cron/vps-watch → ここ（planVpsWatch）で決めて、メールを出す
//
// ★★ 見張りを VPS に置かない。VPS と一緒に止まる。
// ★ このファイルは通信も DB も触らない。時刻も引数で受ける（Date.now() を中で呼ばない＝点検で「止まった状態」を作れる）。

/** 何分連絡が無かったら知らせるか（カッキーさん決定・10/9）。★ 短くすると、VPS の再起動でも鳴る */
export const VPS_DOWN_MINUTES = 20;
/** 止まったまま・ディスクが高いままのとき、何時間ごとにもう一度知らせるか */
export const VPS_REMIND_HOURS = 24;
/** ディスクが何%以上で知らせるか */
export const VPS_DISK_ALERT_PCT = 80;
/** vps_heartbeat の行の名前（VPS は1台。増えたら名前で分ける） */
export const VPS_HEARTBEAT_NAME = 'main';

export type VpsHeartbeatRow = {
  lastSeenAt: string | null;
  diskPct: number | null;
  memAvailMb: number | null;
  downAlertedAt: string | null;
  diskAlertedAt: string | null;
};

export type VpsWatchMail = {
  kind: 'down' | 'down_reminder' | 'recovered' | 'disk';
  subject: string;
  lines: string[];
};

export type VpsWatchPlan = {
  /** never＝まだ1回も連絡が無い（crontab の行を足す前）／alive＝来ている／down＝止まっている */
  state: 'never' | 'alive' | 'down';
  silentMinutes: number | null;
  mails: VpsWatchMail[];
  /** DB に書く分（キーが無い列は触らない。null は「空に戻す」） */
  patch: { down_alerted_at?: string | null; disk_alerted_at?: string | null };
  note: string;
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** 日本時間の「10/09 19:20」。★ 読めない時刻は「不明」（何かの時刻のふりをしない） */
export function jstStamp(iso: string | null | undefined): string {
  const t = ms(iso);
  if (t === null) return '不明';
  const d = new Date(t + 9 * 3600 * 1000);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return p2(d.getUTCMonth() + 1) + '/' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
}

function resources(row: VpsHeartbeatRow): string {
  const disk = row.diskPct === null ? 'ディスク 不明' : 'ディスク ' + row.diskPct + '%';
  const mem = row.memAvailMb === null ? 'メモリ残り 不明' : 'メモリ残り ' + row.memAvailMb + 'MB';
  return disk + '・' + mem;
}

/**
 * VPS から届いた体（JSON）を読む。★ 数字でないもの・範囲の外は null（0 や 100 のふりをさせない）。
 * ★ 届いたこと自体が「動いている」の印なので、数字が読めなくても連絡としては受け取る。
 */
export function parseHeartbeatBody(body: unknown): { diskPct: number | null; memAvailMb: number | null } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const n = Math.round(v);
    return n >= min && n <= max ? n : null;
  };
  return { diskPct: num(b.diskPct, 0, 100), memAvailMb: num(b.memAvailMb, 0, 4 * 1024 * 1024) };
}

/**
 * いまの1行と時刻から、出すメールと DB に書く分を決める。
 *
 * ★ まだ1回も連絡が無い（行が無い・時刻が空）ときは、何も知らせない（crontab の行を足す前に鳴らさない）。
 * ★ 止まっているあいだは、ディスクを見ない（最後に来たときの古い数字で鳴らさない）。
 * ★ 戻ったメールは、止まったことを知らせたあとにだけ出す。
 */
export function planVpsWatch(row: VpsHeartbeatRow | null, nowIso: string): VpsWatchPlan {
  const now = ms(nowIso);
  const seen = row ? ms(row.lastSeenAt) : null;
  if (!row || seen === null || now === null) {
    return { state: 'never', silentMinutes: null, mails: [], patch: {}, note: 'まだ VPS から1回も連絡が無い（crontab の行がまだ・または追加SQL がまだ）' };
  }

  const silentMinutes = Math.max(0, Math.floor((now - seen) / 60000));
  const remindMs = VPS_REMIND_HOURS * 3600 * 1000;
  const mails: VpsWatchMail[] = [];
  const patch: VpsWatchPlan['patch'] = {};

  // ── 止まっている ──
  if (silentMinutes >= VPS_DOWN_MINUTES) {
    const alerted = ms(row.downAlertedAt);
    const first = alerted === null;
    if (first || now - (alerted as number) >= remindMs) {
      mails.push({
        kind: first ? 'down' : 'down_reminder',
        subject: '【フクエス】VPS から連絡がありません（最後は ' + jstStamp(row.lastSeenAt) + '）' + (first ? '' : '※まだ止まっています'),
        lines: [
          'VPS（取り込み・中継）からの連絡が、' + silentMinutes + '分 止まっています。',
          '最後に来たのは ' + jstStamp(row.lastSeenAt) + '（そのとき: ' + resources(row) + '）。',
          '',
          '止まっているあいだ動かないもの:',
          '・出勤、写メ日記の取り込み',
          '・駅ちか、エステ魂などへの送信（出勤・即ヒメ・写メ日記・新着情報）',
          '・自動投稿（fukuX など）',
          '',
          '見るところ:',
          '1) ConoHa の管理画面で、サーバーが起動中か（契約の期限も）',
          '2) SSH で入れるか',
          '3) 入れたら  df -h /  （ディスク）と  crontab -l | head  （予定が残っているか）',
          '',
          '連絡が戻ったら、もう一度メールします。止まったままなら ' + VPS_REMIND_HOURS + '時間ごとに知らせます。',
        ],
      });
      patch.down_alerted_at = nowIso;
    }
    return { state: 'down', silentMinutes, mails, patch, note: silentMinutes + '分 連絡が無い' + (mails.length ? '（知らせた）' : '（知らせ済み）') };
  }

  // ── 来ている ──
  if (ms(row.downAlertedAt) !== null) {
    mails.push({
      kind: 'recovered',
      subject: '【フクエス】VPS からの連絡が戻りました（' + jstStamp(nowIso) + '）',
      lines: [
        'VPS からの連絡が戻りました。',
        '止まったと知らせたのは ' + jstStamp(row.downAlertedAt) + '、いま最後に来たのは ' + jstStamp(row.lastSeenAt) + '（' + resources(row) + '）。',
        '止まっていたあいだの取り込み・送信は、次の周から順に流れます。',
      ],
    });
    patch.down_alerted_at = null;
  }

  if (row.diskPct !== null && row.diskPct >= VPS_DISK_ALERT_PCT) {
    const alerted = ms(row.diskAlertedAt);
    if (alerted === null || now - alerted >= remindMs) {
      mails.push({
        kind: 'disk',
        subject: '【フクエス】VPS のディスクが ' + row.diskPct + '% です',
        lines: [
          'VPS のディスクの使用率が ' + row.diskPct + '% です（' + VPS_DISK_ALERT_PCT + '% 以上で知らせています）。',
          'いっぱいになると、ログにも書けず、取り込み・送信がだまって止まります。',
          '',
          '見るところ（VPS で）:',
          '  du -sh /root /var/log /tmp',
          '  ls -lhS /root/*.log*',
          '',
          VPS_DISK_ALERT_PCT + '% を下回るまで、' + VPS_REMIND_HOURS + '時間ごとに知らせます。',
        ],
      });
      patch.disk_alerted_at = nowIso;
    }
  } else if (row.diskPct !== null && ms(row.diskAlertedAt) !== null) {
    // ★ 下回ったら印を外す（次に超えたとき、すぐ知らせるため）。メールは出さない
    patch.disk_alerted_at = null;
  }

  return { state: 'alive', silentMinutes, mails, patch, note: '来ている（' + silentMinutes + '分前・' + resources(row) + '）' };
}
