import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { runImasuguForSalon } from '@/app/lib/conecf/imasuguRun';

// コネックエフ「今すぐ一括」の自動更新の周（第401便・1e・2026-09-17）。
//
// ★ 対象: conecf_imasugu_settings.enabled = true の店（★ 切り替え済み・非表示でない店だけ runImasuguForSalon が通す）
// ★ やること: 店ごとに runImasuguForSalon（出勤中の人から N 人を今すぐに・回す）
// ★ 駅ちかの即ヒメ・エステ魂の即セラへは sokuhime-push / sokusera-push がそのまま送る（★ ここでは送らない）
//
// crontab（VPS・10分ごと。★ 即ヒメの周 8-59/10 の少し前に回す）:
//   6-59/10 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/conecf-imasugu --oauth2-bearer $CRON_SECRET -H 'Content-Type: application/json' -d '{"apply":true}' >> /root/import.log 2>&1
// ★ apply を付けなければ試し（何も書かない・選ぶ人だけ返す）

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く＝試し */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const { data: rows, error } = await svc.from('conecf_imasugu_settings').select('salon_id').eq('enabled', true).order('salon_id');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];
  let changed = false;
  for (const r of rows ?? []) {
    try {
      const res = await runImasuguForSalon(svc, Number(r.salon_id), apply);
      results.push(res);
      if (apply && !res.skipped && (res.on.length > 0 || res.off > 0)) changed = true;
    } catch (e) {
      results.push({ salonId: Number(r.salon_id), error: e instanceof Error ? e.message : String(e) });
    }
  }
  if (changed) {
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/therapist/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
    revalidatePath('/area/[slug]', 'page');
    revalidatePath('/');
  }
  return NextResponse.json({ ok: true, apply, at: new Date().toISOString(), results });
}
