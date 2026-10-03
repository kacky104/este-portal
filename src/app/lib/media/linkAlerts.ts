import type { createServiceClient } from '@/app/lib/supabase/service';
import { judgeWriteStall, stallMessage, mediaSlotLabel, type MediaLinkAlert } from '@/lib/mediaLinkStall';
import { judgeImportStall } from '@/lib/importStall';
import { isWriteDirection } from '@/lib/mediaLinkMode';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { findMediaSite } from '@/lib/mediaSites';

// 「止まっている連携」の赤帯の材料集め（第1117便・2026-10-03）。
//
// ★ もとは src/app/actions/mediaCredentials.ts の getMediaLinkAlerts の中身（第47便〜第224便）。
//   ★ コネックエフの外枠（getConecfShellState）が、店舗の権限確認を二重にせずに同じ計算を呼べるよう、
//     「権限を確かめる」と「集めて判定する」を分けた。★ 判定そのものは src/lib/mediaLinkStall.ts と importStall.ts の純粋関数。
// ★ 'use server' ではない（★ 画面から直接は呼べない。呼ぶのは権限を確かめた server action だけ）。
// ★★ 第1117便で変えたこと（読む中身は同じ）:
//   1. 4本の読み（枠・記録・鍵・セラピスト）を同時に出す（★ 1本ずつ待っていた）。
//   2. 記録は detail（JSON 丸ごと）を読まず、detail->>mode だけ読む（★ 要るのは mode だけ）。
//   3. 読む向きの枠の salon_import_runs も、枠ごとに同時に出す。

type Svc = ReturnType<typeof createServiceClient>;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

type AuditRow = { provider: unknown; slot: unknown; event: unknown; outcome: unknown; created_at: unknown; mode: unknown };

export async function computeMediaLinkAlerts(svc: Svc, salonId: number): Promise<Result<MediaLinkAlert[]>> {
  // ★★ 第51便から【全部の枠】を読む。向きで担当が分かれる:
  //   書く向き（write / write_auto）… judgeWriteStall（第47便）
  //   読む向き・未設定               … judgeImportStall（第51便）
  //   ★ 以前は書く向きだけを読んでいた。★ 読む向きの停止を誰も見張っていなかった（追記20 §91）
  const [srcRes, auRes, crRes, lastChangeAt] = await Promise.all([
    svc
      .from('salon_import_sources')
      .select('id, provider, slot, link_mode, is_enabled, last_run_at, import_interval_min, created_at')
      .eq('salon_id', salonId),
    // ★ 監査ログは追記専用で消えない（migration のとおり）。新しい順に少しだけ読む。
    //   ★ 枠ごとに問い合わせを分けない（枠が増えるほど往復が増える形にしない）。
    //   ★ 第1117便: detail は mode だけ取り出す（write_work の detail は大きいことがある）。
    svc
      .from('salon_media_audit')
      .select('provider, slot, event, outcome, created_at, mode:detail->>mode')
      .eq('salon_id', salonId)
      .in('event', ['link_mode_changed', 'write_work'])
      .order('created_at', { ascending: false })
      .limit(200),
    // ★★★ 鍵が使えない枠で「反映していない」を止まりと呼ばない（第87便で見つけた食い違い）。
    //   ★ ログイン情報の「このログイン情報を使わない」は salon_media_credentials の旗を倒すだけで、
    //     salon_import_sources.link_mode は 'write' のまま残る。
    //     ★ すると judgeWriteStall が24時間後から鳴り続けた。
    //     ★★ 店舗が自分で選んだ結果を、毎日「止まっています」と届けていたことになる（§223）。
    //   ★ 送るのをやめる正しい口は link_mode = 'none'（ホームの「フクエスだけで使う」）。
    svc
      .from('salon_media_credentials')
      .select('provider, slot, is_enabled, password_enc')
      .eq('salon_id', salonId),
    loadLastScheduleChangeAt(svc, salonId),
  ]);

  if (srcRes.error) return { ok: false, error: '連携の状態を確認できませんでした' };
  const sources = srcRes.data ?? [];
  if (sources.length === 0) return { ok: true, data: [] };
  if (auRes.error) return { ok: false, error: '連携の記録を確認できませんでした' };
  const audit = (auRes.data ?? []) as unknown as AuditRow[];

  const key = (p: string, s: number) => p + '#' + s;
  const switchedAt = new Map<string, string>();
  // ★★★ 最後に【読む向きに戻した】時刻（第147便）。★ 取り込みの時計の起点の床にする
  const switchedToReadAt = new Map<string, string>();
  const lastOkAt = new Map<string, string>();
  for (const r of audit) {
    const k = key(String(r.provider), Number(r.slot));
    const at = String(r.created_at);
    if (r.event === 'write_work' && r.outcome === 'ok') {
      if (!lastOkAt.has(k)) lastOkAt.set(k, at);          // 新しい順なので最初の1件が最新
    } else if (r.event === 'link_mode_changed') {
      const mode = r.mode;
      if (mode === 'write' && !switchedAt.has(k)) switchedAt.set(k, at);
      // ★ 新しい順に読んでいるので、最初に見つけた1件が最新
      if (mode === 'read' && !switchedToReadAt.has(k)) switchedToReadAt.set(k, at);
    }
  }

  const usableCred = new Set<string>();
  for (const c of crRes.data ?? []) {
    // ★ getMediaOverview の hasCredential と同じ判定にする（2か所でずらさない）
    if (c.is_enabled !== false && Boolean(c.password_enc)) {
      usableCred.add(key(String(c.provider), Number(c.slot ?? 1)));
    }
  }

  // ★ 読む向きの枠だけ salon_import_runs を見る（★ 書く向きの枠では取り込みは止まっていて当然）。
  //   ★ full が走ったかは salon_import_runs にしか残らない（ingest-list は書かない）。★ 枠ごとに同時に読む。
  const readSources = sources.filter((s) => !isWriteDirection((s.link_mode as string | null) ?? null));
  const runRows = await Promise.all(
    readSources.map((s) =>
      svc
        .from('salon_import_runs')
        .select('started_at')
        .eq('source_id', Number(s.id))
        .order('started_at', { ascending: false })
        .limit(1)
        .then((r) => ((r.data ?? [])[0] ? String((r.data ?? [])[0].started_at) : null)),
    ),
  );
  const fullLastRunAtBySource = new Map<number, string | null>();
  readSources.forEach((s, i) => fullLastRunAtBySource.set(Number(s.id), runRows[i] ?? null));

  const now = new Date();
  const alerts: MediaLinkAlert[] = [];
  for (const s of sources) {
    const provider = String(s.provider);
    const slot = Number(s.slot);
    const k = key(provider, slot);
    const linkMode = (s.link_mode as string | null) ?? null;

    // ── 書く向き: 押したまま送っていないか（第47便）─────────────────
    if (isWriteDirection(linkMode)) {
      // ★★ 鍵が使えないなら、そもそも送れない。★ それは「止まった」ではなく「送らない設定」
      if (!usableCred.has(k)) continue;
      const verdict = judgeWriteStall({
        linkMode,
        switchedToWriteAt: switchedAt.get(k) ?? null,
        lastWriteOkAt: lastOkAt.get(k) ?? null,
        lastChangeAt,
        now,
      });
      // ★ 送り先の呼び名と、読める媒体かを渡す（第133-6便）。★ 文言に媒体名を決め打ちしない
      const site = findMediaSite(provider);
      const message = stallMessage(verdict, mediaSlotLabel(provider, slot), {
        ...(site?.name ? { name: site.name } : {}),
        canRead: site?.readable === true,
      });
      if (verdict.stalled && message) {
        alerts.push({
          provider, slot, watch: 'write',
          reason: verdict.reason, elapsedHours: verdict.elapsedHours, message,
        });
      }
      continue;   // ★ 書く向きの枠では取り込みは止まっていて当然。二重に鳴らさない
    }

    // ── 読む向き: 取り込みが止まっていないか（第51便）───────────────
    //   ★★ 時計は2本。★ どちらか片方だけを見ると、2026-08-29 の事故は捕まらない:
    //     当日の周（list・15分ごと）は正常なのに、週間の周（full・1日1回）が3日止まっていた。
    for (const f of judgeImportStall({
      provider, slot,
      linkMode,
      isEnabled: s.is_enabled === true,
      listLastRunAt: (s.last_run_at as string | null) ?? null,
      fullLastRunAt: fullLastRunAtBySource.get(Number(s.id)) ?? null,
      intervalMin: (s.import_interval_min as number | null) ?? null,
      createdAt: (s.created_at as string | null) ?? null,
      // ★★★ 書く向きだった間は数えない（第147便）。★ 戻した直後に6時間ぶんを出さない
      switchedToReadAt: switchedToReadAt.get(k) ?? null,
      now,
    })) {
      alerts.push({
        provider, slot, watch: 'import',
        reason: f.clock + '_' + f.reason,     // ★ 'list_stale' / 'full_never' …
        elapsedHours: f.elapsedHours,
        message: f.message,
      });
    }
  }
  return { ok: true, data: alerts };
}

/**
 * ★★★ フクエス側の出勤が最後に変わった時刻（第139便）。
 *   ★★ 「送っていない」ではなく「**変えたのに送っていない**」を見るために要る。
 *   ★ 今日より前の日付を変えても意味が無いので、今日以降だけを見る。
 *   ★ 読めなかったら null＝**鳴らさない**（★ 嘘の警告より黙るほうがまし）。
 */
async function loadLastScheduleChangeAt(svc: Svc, salonId: number): Promise<string | null> {
  const { data: ths } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const ids = (ths ?? []).map((t) => Number(t.id));
  if (ids.length === 0) return null;
  // ★ 2026-09-09（第224便）: `new Date().toISOString()` は【UTCの今日】で、
  //   JST の 0:00〜9:00 の間だけ前日になり、出勤表を1日ぶん広く拾っていた。JST の暦日に揃える。
  const today = getCalendarDateJST();
  const { data: sch, error: schErr } = await svc
    .from('therapist_schedules')
    .select('updated_at')
    .in('therapist_id', ids)
    .gte('schedule_date', today)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (schErr || !sch || sch.length === 0) return null;
  return (sch[0].updated_at as string | null) ?? null;
}
