import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { enqueueRelayJob } from '@/app/lib/media/relayQueue';
import { openResponse, unpackBody } from '@/lib/relayJob';

// ── 中継の疎通確認（第38便）───────────────────────────────────────
//   POST /api/admin/relay-selftest  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId: number, apply?: boolean }        ※ apply 既定 false ＝ 積むだけ
//   GET  /api/admin/relay-selftest?jobId=...          ※ 結果を見る
//
// ★★★ 認証情報を一切使わない。投げるのは
//     GET https://ranking-deli.jp/admin      → 302 → /admin/login（200・ログイン画面）
//   だけ。**どのアカウントも狙わない**ので、何度流しても店舗に影響が無い。
//
// ★ 第37便の段階投入（試し打ち → 実弾）と同じ考え方。
//   実弾の前に「運び方そのもの」が通っているかを、影響ゼロで1回確かめる。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SELFTEST_URL = 'https://ranking-deli.jp/admin';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

function unauthorized(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  return null;
}

export async function POST(req: Request) {
  const ng = unauthorized(req);
  if (ng) return ng;

  let body: { salonId?: unknown; apply?: unknown } = {};
  try { body = (await req.json()) as { salonId?: unknown; apply?: unknown }; } catch { /* 既定で動く */ }

  const salonId = Number(body.salonId);
  if (!Number.isFinite(salonId)) {
    return NextResponse.json({ ok: false, error: 'salonId が要る（どの店舗の枠として積むか）' }, { status: 400 });
  }

  const plan = {
    method: 'GET',
    url: SELFTEST_URL,
    note: '認証情報なし・どのアカウントも狙わない。302→/admin/login が返るはず',
  };
  if (body.apply !== true) {
    // ★ 既定は試し打ち。何を積むつもりかを返すだけで、積まない
    return NextResponse.json({ ok: true, apply: false, plan });
  }

  const r = await enqueueRelayJob({
    salonId,
    provider: 'ekichika',
    slot: 1,
    purpose: 'selftest',
    method: 'GET',
    url: SELFTEST_URL,
    headers: { 'user-agent': UA },
  });
  if (!r.ok) return NextResponse.json({ ok: false, reason: r.reason, note: r.detail });
  return NextResponse.json({ ok: true, apply: true, jobId: r.jobId, plan });
}

export async function GET(req: Request) {
  const ng = unauthorized(req);
  if (ng) return ng;

  const jobId = new URL(req.url).searchParams.get('jobId') ?? '';
  if (!jobId) return NextResponse.json({ ok: false, error: 'jobId が要る' }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('media_relay_jobs')
    .select('id, purpose, status, attempts, http_status, bytes, error, response_enc, created_at, updated_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: '知らない jobId' }, { status: 404 });

  // ★ 本文そのものは返さない。中身の様子だけ（title と長さ）を返す。
  //   秘密が入りうるものを、確認の便利さのために外へ出さない。
  let peek: { length: number; title: string | null } | null = null;
  if (data.response_enc) {
    try {
      const res = openResponse(data.response_enc, jobId);
      const html = unpackBody(res.bodyPacked);
      const m = /<title>([^<]*)<\/title>/.exec(html);
      peek = { length: html.length, title: m ? (m[1] ?? '').slice(0, 60) : null };
    } catch (e) {
      peek = { length: -1, title: '(復号できない: ' + (e as Error).message.slice(0, 40) + ')' };
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: data.id,
      purpose: data.purpose,
      status: data.status,
      attempts: data.attempts,
      httpStatus: data.http_status,
      bytes: data.bytes,
      error: data.error,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
    peek,
  });
}
