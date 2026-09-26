// 写メ日記の入口（salons.diary_source）を、今の向き・鍵から導いて書く（第205便で作り、第669便でここへ移した）。
// ★★★ 第669便（2026-09-22）: ラビリンス様の写メ日記の取り込みが 9/17 から5日止まっていた。
//   ★ 原因: 向き（link_mode）を SQL Editor で直接 read に戻したため、この同期が走らず diary_source が 'benry' のまま残った。
//   ★ 直し: 取り込みの周（/api/admin/diary-import・15分ごと）の頭でも、鍵のある店についてこれを呼ぶ。
//     ★ どこから向きを変えても（画面・運営の SQL）、15分以内に入口が向きと揃う。
// ★ 判断は src/lib/diarySource.ts の deriveDiarySource（純粋関数・番人あり）。★ ここは読んで書くだけ。変わったときだけ書いて監査に残す。

import { createServiceClient } from '@/app/lib/supabase/service';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';
import { needsConsent } from '@/lib/mediaConsent';
import { deriveDiarySource, readDiarySource } from '@/lib/diarySource';
import { siteDirection } from '@/lib/mediaOverview';

/**
 * ★★★ 写メ日記の入口（salons.diary_source）を、ホームの設定から導いて書く（第205便・2026-09-07）。
 *
 * ★ 判断は src/lib/diarySource.ts の deriveDiarySource（純粋関数・番人あり）。★ ここは読んで書くだけ。
 * ★ 読み方は getMediaOverview と同じ（siteDirection / hasCredential / needsConsent）。★ 決め方を2つ持たない。
 * ★ 呼ぶ場所: applyLinkMode の最後（1枠も一括もここを通る）／鍵を保存・削除・停止・再開した最後。
 * ★★ 変わったときだけ書く＋監査に残す（★ 5分周のように積まない）。
 * ★ 失敗しても呼び元の結果は変えない（★ 向きは変わっている。黙らず console.error）。
 */
export async function syncDiarySource(svc: ReturnType<typeof createServiceClient>, salonId: number, actor: string): Promise<void> {
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources').select('provider, slot, link_mode, is_enabled').eq('salon_id', salonId);
  const { data: creds, error: crErr } = await svc
    .from('salon_media_credentials').select('provider, slot, is_enabled, password_enc, consent_version').eq('salon_id', salonId);
  if (srcErr || crErr) { console.error('[media] diary_source を導けなかった（読めない）', salonId, srcErr?.message ?? crErr?.message); return; }

  const key = (p: string, sl: number) => p + '#' + sl;
  const credOf = new Map<string, { hasCredential: boolean; needsConsent: boolean }>();
  for (const c of creds ?? []) {
    credOf.set(key(String(c.provider), Number(c.slot ?? 1)), {
      hasCredential: c.is_enabled !== false && Boolean(c.password_enc),
      needsConsent: needsConsent((c.consent_version as string | null) ?? null),
    });
  }
  const keys = new Set<string>([...(sources ?? []).map((x) => key(String(x.provider), Number(x.slot ?? 1))), ...credOf.keys()]);
  const sites = [...keys].map((k) => {
    const [provider, slotStr] = k.split('#');
    const src = (sources ?? []).find((x) => key(String(x.provider), Number(x.slot ?? 1)) === k);
    const cred = credOf.get(k);
    const direction = siteDirection({
      provider, slot: Number(slotStr),
      linkMode: (src?.link_mode as string | null) ?? null,
      sourceEnabled: src ? src.is_enabled === true : true,
      hasCredential: cred?.hasCredential === true,
    });
    return { provider, direction, hasCredential: cred?.hasCredential === true, needsConsent: cred?.needsConsent === true };
  });

  // ★ 第895便: 店舗オーナーの選択（写メ日記はフクエスで書く）も見る
  const { data: salon } = await svc.from('salons').select('diary_source, diary_write_pref').eq('id', salonId).maybeSingle();
  const next = deriveDiarySource(sites, (salon as { diary_write_pref?: string | null } | null)?.diary_write_pref ?? 'auto');
  const cur = readDiarySource((salon?.diary_source as string | null) ?? null);
  if (cur === next) return;

  const { error } = await svc.from('salons').update({ diary_source: next }).eq('id', salonId);
  if (error) { console.error('[media] diary_source を書けなかった', salonId, error.message); return; }
  await recordMediaAudit({
    salonId, provider: 'ekichika', slot: 1,
    event: 'diary_source_synced', outcome: 'ok',
    detail: { from: String(cur), to: next, by: 'sync' },
    actor,
  });
}



/**
 * ★ 第897便（2026-09-26・カッキーさん・案B）: はじめて駅ちかの写メ日記を取り込めるようになった店は、過去60日ぶんを自動で遡る。
 * ★ 条件: 入口が 'ekichika' になった ＋ まだ1件も取り込み記録が無い ＋ 遡りの列が空。
 *   ★ 既存の店（取り込み記録がある店）は対象外。★ 一度入りきったら列は空に戻る（relayFlow の planDiaryList）。
 * ★ 失敗しても呼び元は止めない。
 */
export const DIARY_BACKFILL_DAYS = 60;

export async function maybeStartDiaryBackfill(svc: ReturnType<typeof createServiceClient>, salonId: number, actor: string): Promise<void> {
  try {
    const { data: salon } = await svc.from('salons').select('diary_source, diary_backfill_since').eq('id', salonId).maybeSingle();
    if (!salon || readDiarySource((salon.diary_source as string | null) ?? null) !== 'ekichika') return;
    if ((salon as { diary_backfill_since?: string | null }).diary_backfill_since) return;
    const { count } = await svc
      .from('salon_diary_imports').select('external_diary_id', { count: 'exact', head: true })
      .eq('salon_id', salonId).eq('provider', 'ekichika');
    if ((count ?? 0) > 0) return;
    const since = new Date(Date.now() - DIARY_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await svc.from('salons').update({ diary_backfill_since: since, diary_backfill_until: null }).eq('id', salonId);
    if (error) { console.error('[media] 遡りを始められなかった', salonId, error.message); return; }
    await recordMediaAudit({
      salonId, provider: 'ekichika', slot: 1,
      event: 'diary_backfill_started', outcome: 'ok',
      detail: { since, days: DIARY_BACKFILL_DAYS },
      actor,
    });
  } catch (e) {
    console.error('[media] 遡りの確認に失敗', salonId, e instanceof Error ? e.message : e);
  }
}
