import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { shouldBumpNow, type BumpSetting } from '@/lib/ekichikaBump';

// ── 駅ちかの上位表示を自動で押す周（第1305便・2026-10-08）────────────────
//   POST /api/admin/ekichika-bump  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }   … ★ apply 既定 false（試し打ち）＝誰に押しに行くつもりかを返すだけ。中継ジョブを積まない
//
// ★★★ 見るのは【自動が入っている駅ちかの枠】だけ（salon_import_sources.bump_auto = true）。既定は false。
//   ★ crontab に足しても、店舗様が入れるまで（ラビリンス様は追加SQL_第1305便で入れる）何も起きない。
// ★ 押すかどうかは src/lib/ekichikaBump.ts の shouldBumpNow（純粋関数・番人あり）。ここは DB を読んで渡し、結果のとおりに流れを始めるだけ。
//   ★ 流れの中でもう一度、駅ちかの管理画面トップの最終更新日で決め直す（店舗様が駅ちかで手で押した直後なら押さない）。
// ★ 入口の検査（コネックエフの文への同意・切り替え済み・セットの契約・「反映しない」・ログインに続けて失敗）は startRelayFlow がする。
//
// ★ 間隔がいちばん短くて10分なので、周は5分ごと。★ 区切り（例: 10:00・10:20…）の4分後に回るよう、分をずらしてある。
//   crontab（VPS）:
//   4-59/5 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/ekichika-bump -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/ekichika-bump.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = {
  salon_id: number;
  slot: number | null;
  bump_start_min: number | null;
  bump_end_min: number | null;
  bump_interval_min: number | null;
  bump_last_at: string | null;
  bump_remaining: number | null;
  bump_read_at: string | null;
  bump_auto_at: string | null;
};

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const now = new Date();
  const { data, error } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot, bump_start_min, bump_end_min, bump_interval_min, bump_last_at, bump_remaining, bump_read_at, bump_auto_at')
    .eq('provider', 'ekichika')
    .eq('bump_auto', true);
  // ★ 列が無い（追加SQL_第1305便が未適用）ときもここで返す。★ 何もしない
  if (error) return NextResponse.json({ ok: false, error: '自動の上位表示の設定を読めなかった: ' + error.message }, { status: 500 });

  const results: Array<{ salonId: number; slot: number; reason: string; started?: boolean; note?: string }> = [];
  for (const r of (data ?? []) as Row[]) {
    const slot = Number(r.slot ?? 1);
    const setting: BumpSetting = {
      enabled: true,
      startMin: Number(r.bump_start_min),
      endMin: Number(r.bump_end_min),
      intervalMin: Number(r.bump_interval_min),
    };
    const judge = shouldBumpNow({
      now, setting,
      state: { lastAt: r.bump_last_at, remaining: r.bump_remaining, readAt: r.bump_read_at, autoAt: r.bump_auto_at },
    });
    if (!judge.bump || !apply) { results.push({ salonId: r.salon_id, slot, reason: judge.reason }); continue; }

    // ★ 始める前に「始めた時刻」を書く（同じ枠を立て続けに始めない）。★ 書けなければ始めない（二重に押しに行かない側）
    const { error: aErr } = await svc.from('salon_import_sources')
      .update({ bump_auto_at: now.toISOString() })
      .eq('salon_id', r.salon_id).eq('provider', 'ekichika').eq('slot', slot);
    if (aErr) { results.push({ salonId: r.salon_id, slot, reason: 'mark_failed', note: aErr.message }); continue; }

    try {
      const f = await startRelayFlow({
        salonId: r.salon_id, provider: 'ekichika', slot,
        intent: 'bump_auto', actor: 'cron:ekichika-bump',
        bump: { setting },
      });
      results.push({ salonId: r.salon_id, slot, reason: 'ok', started: f.ok, note: f.note });
    } catch (e) {
      console.error('[ekichika-bump] 流れを始められなかった', r.salon_id, slot, e instanceof Error ? e.message : 'unknown');
      results.push({ salonId: r.salon_id, slot, reason: 'start_failed' });
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    target: results.length,
    started: results.filter((x) => x.started).length,
    results,
    note: apply ? '自動の上位表示の周' : '試し打ち（何も積んでいない）',
  });
}
