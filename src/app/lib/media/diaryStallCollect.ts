import type { createServiceClient } from '@/app/lib/supabase/service';
import { readDiarySource, importsDiaryFromEkichika } from '@/lib/diarySource';
import { judgeDiaryStall, type DiaryStallFinding } from '@/lib/diaryStall';

// 写メ日記の巡回が止まっていないかの【材料集め】（第1340便・2026-10-09）。
//
// ★ もとは src/app/api/admin/diary-stall/route.ts の中身（第100便）。読む表・見送る理由・判定は変えずにここへ移した
//   （変えたのは、失敗の返し方を NextResponse から { ok: false, error } にしたことと、now を引数にしたことだけ）。
// ★ なぜ分けたか: 全店の「止まっているもの」をまとめて見る口（/api/admin/stall-overview）が、同じ計算を呼ぶため。
//   ★ 同じ判定を2か所に書かない。判定そのものは src/lib/diaryStall.ts の純粋関数。
// ★ 'use server' ではない（画面から直接は呼べない。呼ぶのは CRON_SECRET で守った口だけ）。

type Svc = ReturnType<typeof createServiceClient>;

export type DiaryStallRow = { salonId: number; salonName: string; slot: number } & DiaryStallFinding;
export type DiaryHealthyRow = { salonId: number; salonName: string; slot: number; queuedAt: string | null; listedAt: string | null; lastNote: string | null };
export type DiaryQuietRow = { salonId: number; salonName: string; slot: number; reason: string };

export type DiaryStallCollected =
  | { ok: true; checked: number; stalled: DiaryStallRow[]; healthy: DiaryHealthyRow[]; quiet: DiaryQuietRow[] }
  | { ok: false; error: string };

export async function collectDiaryStall(svc: Svc, now: Date): Promise<DiaryStallCollected> {
  // ★ 鍵をお預かりしている枠を全部見る（★ 止めてある枠も引く。理由を言うため）
  const { data: creds, error } = await svc
    .from('salon_media_credentials')
    .select('salon_id, provider, slot, is_enabled, consent_version, created_at')
    .eq('provider', 'ekichika');
  if (error) return { ok: false, error: error.message };

  const rows = creds ?? [];
  if (rows.length === 0) {
    return { ok: true, checked: 0, stalled: [], healthy: [], quiet: [] };
  }

  const salonIds = Array.from(new Set(rows.map((c) => Number((c as { salon_id: number }).salon_id))));

  // ★ 入口（第99便の一本線）。★ 引けなければ見張らない。「分からない」を「正常」と読まない
  const { data: salonRows, error: salonErr } = await svc
    .from('salons').select('id, name, diary_source').in('id', salonIds);
  if (salonErr) return { ok: false, error: salonErr.message };
  const sourceOf = new Map<number, string>();
  const nameOf = new Map<number, string>();
  for (const r of salonRows ?? []) {
    const id = Number((r as { id: number }).id);
    sourceOf.set(id, readDiarySource((r as { diary_source: unknown }).diary_source));
    nameOf.set(id, String((r as { name: unknown }).name ?? ''));
  }

  // ★ 心拍。★ 行が無い枠もある（まだ一度も回っていない）。★ 無いことを「新しい」と読まない
  const { data: watch, error: wErr } = await svc
    .from('salon_diary_watch')
    .select('salon_id, provider, slot, queued_at, listed_at, last_note')
    .in('salon_id', salonIds);
  if (wErr) return { ok: false, error: wErr.message };
  const key = (s: number, p: string, sl: number) => s + '#' + p + '#' + sl;
  const watchOf = new Map<string, { queued_at: string | null; listed_at: string | null; last_note: string | null }>();
  for (const w of watch ?? []) {
    watchOf.set(
      key(Number((w as { salon_id: number }).salon_id), String((w as { provider: string }).provider), Number((w as { slot: number }).slot)),
      {
        queued_at: ((w as { queued_at: string | null }).queued_at) ?? null,
        listed_at: ((w as { listed_at: string | null }).listed_at) ?? null,
        last_note: ((w as { last_note: string | null }).last_note) ?? null,
      },
    );
  }

  const stalled: DiaryStallRow[] = [];
  const healthy: DiaryHealthyRow[] = [];
  const quiet: DiaryQuietRow[] = [];

  for (const c of rows) {
    const salonId = Number((c as { salon_id: number }).salon_id);
    const slot = Number((c as { slot: number }).slot ?? 1);
    const salonName = nameOf.get(salonId) ?? '';
    const source = sourceOf.get(salonId) ?? null;
    const isEnabled = (c as { is_enabled: unknown }).is_enabled === true;
    const hasConsent = typeof (c as { consent_version?: unknown }).consent_version === 'string';
    const w = watchOf.get(key(salonId, 'ekichika', slot)) ?? { queued_at: null, listed_at: null, last_note: null };

    // ★★ 見張らない理由を、値ごとに別の言葉で言う（★ 一緒くたにしない）
    if (!importsDiaryFromEkichika(source)) {
      quiet.push({ salonId, salonName, slot, reason: '入口が ekichika ではない（いまは ' + (source ?? '引けなかった') + '）ため見張らない' });
      continue;
    }
    if (!isEnabled) { quiet.push({ salonId, salonName, slot, reason: 'ログイン情報が止めてあるため見張らない' }); continue; }
    if (!hasConsent) { quiet.push({ salonId, salonName, slot, reason: 'ご同意が未登録のため見張らない' }); continue; }

    const found = judgeDiaryStall({
      provider: 'ekichika', slot,
      diarySource: source,
      isEnabled, hasConsent,
      queuedAt: w.queued_at,
      listedAt: w.listed_at,
      intervalMin: null,
      createdAt: ((c as { created_at: string | null }).created_at) ?? null,
      now,
    });

    if (found.length === 0) {
      healthy.push({ salonId, salonName, slot, queuedAt: w.queued_at, listedAt: w.listed_at, lastNote: w.last_note });
      continue;
    }
    for (const f of found) stalled.push({ salonId, salonName, slot, ...f });
  }

  return { ok: true, checked: rows.length, stalled, healthy, quiet };
}
