import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { readDiarySource, importsDiaryFromEkichika } from '@/lib/diarySource';
import { judgeDiaryStall, type DiaryStallFinding } from '@/lib/diaryStall';

// ── 写メ日記の巡回が止まっていないか見る（第100便）───────────────────────
//   POST /api/admin/diary-stall  (Authorization: Bearer <CRON_SECRET>)
//   body: なし
//
// ★★★ なぜ要るか —— 2026-09-01 深夜に「最後の取り込みが19:03。いま22:51」を見て、
//   ・新着が無かっただけ  ・巡回そのものが止まっている
//   の【どちらなのか言えなかった】。★ その日のうちに作った口（引き継ぎメモ 第99便 §9①）。
//
// ★★ 見せる相手は【運営だけ】（2026-09-01・カッキーさんの判断）。
//   ★ 原因（crontab・relay.sh・ログイン）はすべてこちら側で、店舗様には直せない。
//   ★ 店舗様の画面には出さない。★ 直せないことを知らせても不安になるだけ。
//
// ★★★ 判定そのものは src/lib/diaryStall.ts の純粋関数。★ ここは値を集めるだけ。
//   ★ now も向こうへ渡す。★ 判定の中で時刻を取らない＝点検で「4時間止まった状態」を作れる。
//
// ★★ 「0件」の理由が読める形で返す（作法 3-5）。★ 見張っていない枠を黙って消さない:
//   stalled … 止まっている（★ ここが空でも、見張れているとは限らない）
//   healthy … 見張っていて、正常
//   quiet   … 見張っていない枠と、その理由
//
// crontab（VPS・1日4回で十分。★ 15分ごとに見ても、しきい値は4時間なので意味がない）:
//   50 */6 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/diary-stall -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const svc = createServiceClient();

  // ★ 鍵をお預かりしている枠を全部見る（★ 止めてある枠も引く。理由を言うため）
  const { data: creds, error } = await svc
    .from('salon_media_credentials')
    .select('salon_id, provider, slot, is_enabled, consent_version, created_at')
    .eq('provider', 'ekichika');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = creds ?? [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, stalled: [], healthy: [], quiet: [] });
  }

  const salonIds = Array.from(new Set(rows.map((c) => Number((c as { salon_id: number }).salon_id))));

  // ★ 入口（第99便の一本線）。★ 引けなければ見張らない。「分からない」を「正常」と読まない
  const { data: salonRows, error: salonErr } = await svc
    .from('salons').select('id, name, diary_source').in('id', salonIds);
  if (salonErr) return NextResponse.json({ ok: false, error: salonErr.message }, { status: 500 });
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
  if (wErr) return NextResponse.json({ ok: false, error: wErr.message }, { status: 500 });
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

  const now = new Date();
  const stalled: Array<{ salonId: number; salonName: string; slot: number } & DiaryStallFinding> = [];
  const healthy: Array<{ salonId: number; salonName: string; slot: number; queuedAt: string | null; listedAt: string | null; lastNote: string | null }> = [];
  const quiet: Array<{ salonId: number; salonName: string; slot: number; reason: string }> = [];

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

  // ★ 止まっているものがあれば、VPS のログ（/root/import.log）でも目に入るように1行足す
  if (stalled.length > 0) {
    console.error('[diary-stall] 止まっている枠が ' + stalled.length + ' 件', stalled.map((s) => s.salonId + '#' + s.slot + ' ' + s.clock).join(' / '));
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    stalled,
    healthy,
    quiet,
    note: stalled.length === 0
      ? '止まっている枠はありません（★ quiet に、見張っていない枠と理由が出ます）'
      : '★ 止まっている枠があります。hint の場所を見てください',
  });
}
