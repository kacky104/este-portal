import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// ── 即セラの周（第143便・2026-09-04）───────────────────────────────────
//   POST /api/admin/sokusera-push  (Authorization: Bearer <CRON_SECRET>)
//   body(form): apply=true                 … ★ 自動（周から）
//   body(form): salonId=6 therapistId=14   … ★ 運営が1人だけ試す
//
// ★★★ フクエスの「今すぐ」がONの人の、エステ魂の即セラをONにする。
//   ★★ OFFは打たない（★ 60分で相手が勝手に切る）。
//     ★ 業界の風習として、誰も手動でOFFを打たない（★ 流しっぱなしが好まれる）。
//
// ★★★ **1回のフローでONにするのは1人だけ。** ★ 「全員にまとめて」は作らない。
//   ★ 相手のアカウントを触る操作なので、1人ずつ・確かめながら進む。
//
// ★ 「今すぐ」は30分で切れる。★ 周は5分ごと。★ 取りこぼしは次の周が拾う。
//
// crontab（VPS・5分ごと。★ 日記の周と1分ずらす）:
//   1-59/5 * * * * . /root/import.env; /usr/bin/curl -sS -X POST https://fukues.com/api/admin/sokusera-push --oauth2-bearer $CRON_SECRET -d apply=true >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDER = 'esutama';
/** ★ 1周で積む店舗の上限。★ 一度に走らせすぎない */
const MAX_SALONS_PER_RUN = 5;

async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const v = JSON.parse(text) as unknown;
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x);
    } catch { /* 空のまま */ }
    return o;
  }
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const apply = body.apply === 'true' || body.apply === '1';
  const oneSalon = Number(body.salonId);
  const oneTherapist = Number(body.therapistId);

  // ★★ 運営が1人だけ試す道（★ 相手を名指しする）
  if (Number.isFinite(oneSalon) && oneSalon > 0 && Number.isFinite(oneTherapist) && oneTherapist > 0) {
    const r = await startRelayFlow({
      salonId: oneSalon, provider: PROVIDER, slot: 1,
      intent: 'sokusera_push',
      sokusera: { therapistId: oneTherapist },
      actor: 'admin:sokusera-push',
    });
    return NextResponse.json({ ...r, salonId: oneSalon, therapistId: oneTherapist, intent: 'sokusera_push' });
  }

  const svc = createServiceClient();
  // ★ エステ魂へ「書く」向きの枠だけ
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('salon_id, slot')
    .eq('provider', PROVIDER).eq('is_enabled', true)
    .in('link_mode', ['write', 'write_auto']);
  if (srcErr) return NextResponse.json({ ok: false, error: srcErr.message }, { status: 500 });

  const rows = (sources ?? []) as Array<{ salon_id: number; slot: number }>;
  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];

  for (const r of rows) {
    const target = r.salon_id + '/' + PROVIDER + '#' + r.slot;
    if (started.length >= MAX_SALONS_PER_RUN) { skipped.push({ target, why: '今回の上限に達したので次の周へ' }); continue; }
    if (!apply) { started.push(target); continue; }
    try {
      const res = await startRelayFlow({
        salonId: Number(r.salon_id), provider: PROVIDER, slot: Number(r.slot),
        intent: 'sokusera_auto', actor: 'cron:sokusera-push',
      });
      // ★ 枠が塞がっている（busy）のは【正常】。★ 次の周が拾う
      if (!res.ok) { skipped.push({ target, why: res.note }); continue; }
      started.push(target);
    } catch (e) {
      skipped.push({ target, why: '開始できなかった: ' + (e instanceof Error ? e.message : 'unknown') });
    }
  }

  return NextResponse.json({
    ok: true, apply, targets: rows.length, started, skipped,
    見かた: apply
      ? '中継ジョブを積みました。結果は各店舗の「連携の記録」に出ます（★ 即セラは読み返して確かめます）'
      : '★ 数えただけです。1件もONにしていません',
  });
}
