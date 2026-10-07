import type { SupabaseClient } from '@supabase/supabase-js';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';
import {
  mixedUntilFromStart, extendMixedUntil, isMixedPeriodOpen, mixedLastDayLabel, mixedDaysLeft, diaryMixedRuns, mixedSinceWhenMissing,
} from '@/lib/diaryMixedPeriod';

// コネックエフの店の、写メ日記の「移行期間」（第1265便・2026-10-07・カッキーさんの決定）。★ サーバー専用（service_role で DB を触る）。
//   ・切り替えたとき … 30日の移行期間を始める（startDiaryMixedOnSwitch）
//   ・店舗様が「14日間延長する」を押したとき … 期限を延ばす（extendDiaryMixedPeriod）
//   ・画面に出す状態 … readDiaryMixedState（★ 取り込みの周 /api/admin/diary-import と同じ条件で「回るか」を言う）
// ★ 決めごと（日数・期限の数え方・回す条件）は src/lib/diaryMixedPeriod.ts（純粋関数・番人 check:diarymixed）。ここは読んで書くだけ。
// ★ 列: salons.diary_mixed_since（第1140便）・salons.diary_mixed_until（追加SQL_第1265便）。
//   ★ diary_mixed_until は新しい列なので、ほかの列と【別の問い合わせ】で読む（列が無くても、ほかの読みを巻き込まない）。

type Svc = SupabaseClient;

export type DiaryMixedWhy = 'not_switched' | 'not_started' | 'expired' | 'no_key' | 'not_write' | 'unreadable';

export type DiaryMixedState = {
  /** コネックエフに切り替え済みか */
  switched: boolean;
  /** 期限の日（◯/◯）。期限が入っていなければ null */
  lastDay: string | null;
  /** 期間中か */
  open: boolean;
  /** 期限の日まであと何日（今日が期限の日なら 0）。期限が無ければ null */
  daysLeft: number | null;
  /** ★ いま実際に、駅ちかの写メ日記を取り込む状態か（取り込みの周と同じ条件） */
  running: boolean;
  /** 取り込まない理由（running が true なら null） */
  why: DiaryMixedWhy | null;
};

async function readPeriod(svc: Svc, salonId: number): Promise<
  | { ok: true; switched: boolean; switchedAt: string | null; source: string; since: string | null; until: string | null }
  | { ok: false; error: string }
> {
  const { data: salon, error } = await svc
    .from('salons').select('conecf_enabled_at, diary_source, diary_mixed_since').eq('id', salonId).maybeSingle();
  if (error || !salon) return { ok: false, error: error?.message ?? '店舗が見つかりません' };
  const { data: u, error: uErr } = await svc.from('salons').select('diary_mixed_until').eq('id', salonId).maybeSingle();
  if (uErr) return { ok: false, error: uErr.message };
  return {
    ok: true,
    switched: !!(salon as { conecf_enabled_at?: string | null }).conecf_enabled_at,
    // ★ 第1292便: 切り替えた時刻（始まりが空の店が延長したときの、始まりの材料）
    switchedAt: ((salon as { conecf_enabled_at?: string | null }).conecf_enabled_at) ?? null,
    source: String((salon as { diary_source?: string | null }).diary_source ?? ''),
    since: ((salon as { diary_mixed_since?: string | null }).diary_mixed_since) ?? null,
    until: ((u as { diary_mixed_until?: string | null } | null)?.diary_mixed_until) ?? null,
  };
}

/** 画面に出す状態。★ 読めなかったときは「取り込んでいる」と言わない（why: 'unreadable'） */
export async function readDiaryMixedState(svc: Svc, salonId: number, nowISO: string = new Date().toISOString()): Promise<DiaryMixedState> {
  const p = await readPeriod(svc, salonId);
  if (!p.ok) {
    console.error('[conecf] 写メ日記の移行期間を読めなかった', salonId, p.error);
    return { switched: false, lastDay: null, open: false, daysLeft: null, running: false, why: 'unreadable' };
  }
  const base = {
    switched: p.switched,
    lastDay: mixedLastDayLabel(p.until),
    open: isMixedPeriodOpen(p.until, nowISO),
    daysLeft: mixedDaysLeft(p.until, nowISO),
  };
  if (!p.switched) return { ...base, running: false, why: 'not_switched' };
  if (!p.since || !p.until) return { ...base, running: false, why: 'not_started' };
  if (!base.open) return { ...base, running: false, why: 'expired' };

  // ★ ここから下は取り込みの周と同じ見方: ID・PW が有効で同意済みの枠 ＋ その枠が「フクエスから反映」で止められていない
  const { data: creds, error: cErr } = await svc
    .from('salon_media_credentials').select('slot, consent_version')
    .eq('salon_id', salonId).eq('provider', 'ekichika').eq('is_enabled', true);
  const { data: srcs, error: sErr } = await svc
    .from('salon_import_sources').select('slot, link_mode, is_enabled')
    .eq('salon_id', salonId).eq('provider', 'ekichika');
  if (cErr || sErr) return { ...base, running: false, why: 'unreadable' };
  const keySlots = new Set(
    (creds ?? []).filter((c) => typeof (c as { consent_version?: string | null }).consent_version === 'string').map((c) => Number(c.slot ?? 1)),
  );
  if (keySlots.size === 0) return { ...base, running: false, why: 'no_key' };
  const runs = (srcs ?? []).some((r) =>
    keySlots.has(Number(r.slot ?? 1)) &&
    diaryMixedRuns({ switched: true, linkMode: (r.link_mode as string | null) ?? null, slotEnabled: r.is_enabled !== false, until: p.until, nowISO }));
  // ★ 入口が fukues でなければ周は回さない（駅ちかが「フクエスから反映」で鍵があれば、入口は fukues に導かれる）
  if (!runs || p.source !== 'fukues') return { ...base, running: false, why: 'not_write' };
  return { ...base, running: true, why: null };
}

/**
 * ★ コネックエフに切り替えた直後に呼ぶ。30日の移行期間を始める。
 *   ・始まりの時刻（diary_mixed_since）が入っていれば、そのまま使う
 *     （フクエスリンクで「フクエスで書く」にしていた店＝すでにフクエスで書いている方の線を動かさない）。無ければ【いま】。
 *   ・期限（diary_mixed_until）は、今日から30日後の日の終わり。
 * ★ 失敗しても切り替えそのものは止めない（呼ぶ側は結果を見ない）。★ ただし黙らない: 連携の記録に「設定できませんでした」を残す。
 *   そのときは、写メ日記転送の画面の「14日間延長する」で始められる。
 */
export async function startDiaryMixedOnSwitch(svc: Svc, salonId: number, actor: string): Promise<void> {
  const nowISO = new Date().toISOString();
  const until = mixedUntilFromStart(nowISO);
  let failed: string | null = null;
  try {
    const { data: cur, error: curErr } = await svc.from('salons').select('diary_mixed_since').eq('id', salonId).maybeSingle();
    if (curErr || !until) {
      failed = curErr?.message ?? '期限を決められなかった';
    } else {
      const since = ((cur as { diary_mixed_since?: string | null } | null)?.diary_mixed_since) ?? null;
      const { error } = await svc.from('salons')
        .update({ diary_mixed_until: until, ...(since ? {} : { diary_mixed_since: nowISO }) })
        .eq('id', salonId);
      if (error) failed = error.message;
    }
  } catch (e) {
    failed = e instanceof Error ? e.message : String(e);
  }
  if (failed) console.error('[conecf] 写メ日記の移行期間を始められなかった', salonId, failed);
  await recordMediaAudit({
    salonId, provider: 'ekichika', slot: 1,
    event: 'diary_mixed_period', outcome: failed ? 'failed' : 'ok',
    detail: { kind: 'started', lastDay: mixedLastDayLabel(until) ?? '' },
    actor,
  });
}

/**
 * ★ 店舗様が「14日間延長する」を押した。何回でも押せる（押すたびに連携の記録に残す）。
 *   ・期間中 … いまの期限に14日足す ／ 期限切れ・未設定 … 押した日から14日
 *   ・始まりの時刻が入っていない店（切り替えのときに始められなかった店）は、ここで入れる。
 *     ★ 第1292便: 【いま】ではなく【切り替えた時刻】（読めなければいま）。理由は lib/diaryMixedPeriod.ts の mixedSinceWhenMissing。
 * ★ 権限（自分の店か・切り替え済みか・止めている店でないか）は呼ぶ側（actions/conecfDiaryMixed.ts）が見る。
 */
export async function extendDiaryMixedPeriod(svc: Svc, salonId: number, actor: string): Promise<
  { ok: true; state: DiaryMixedState } | { ok: false; error: string }
> {
  const p = await readPeriod(svc, salonId);
  if (!p.ok) return { ok: false, error: '移行期間の設定を読めませんでした。時間をおいてお試しください' };
  const nowISO = new Date().toISOString();
  const next = extendMixedUntil(p.until, nowISO);
  if (!next) return { ok: false, error: '期限を決められませんでした。時間をおいてお試しください' };
  const wasOpen = isMixedPeriodOpen(p.until, nowISO);
  const { error } = await svc.from('salons')
    .update({ diary_mixed_until: next, ...(p.since ? {} : { diary_mixed_since: mixedSinceWhenMissing(p.switchedAt, nowISO) }) })
    .eq('id', salonId);
  if (error) {
    await recordMediaAudit({
      salonId, provider: 'ekichika', slot: 1,
      event: 'diary_mixed_period', outcome: 'failed',
      detail: { kind: 'extended', lastDay: '' },
      actor,
    });
    return { ok: false, error: '延長できませんでした。時間をおいてお試しください' };
  }
  await recordMediaAudit({
    salonId, provider: 'ekichika', slot: 1,
    event: 'diary_mixed_period', outcome: 'ok',
    // ★ fromDay: 押す前の期限の日／resumed: 期限切れ（または未設定）から押したか
    detail: { kind: 'extended', lastDay: mixedLastDayLabel(next) ?? '', fromDay: mixedLastDayLabel(p.until) ?? '', resumed: !wasOpen },
    actor,
  });
  return { ok: true, state: await readDiaryMixedState(svc, salonId) };
}
