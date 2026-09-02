import { createServiceClient } from '@/app/lib/supabase/service';

// ── 中継役が画像を取りに来る口（第106便・案B）────────────────────────────
//   GET /api/relay/file?bucket=<bucket>&path=<path>  (Authorization: Bearer <CRON_SECRET>)
//   → 画像そのもの（Content-Type 付き）
//
// ★★★ なぜ要るか
//   駅ちかへ写真を送るとき、ジョブには【画像の場所】だけ載せ、VPS がここへ取りに来る。
//   ★ 画像を base64 で DB に通さない（案A）。★ VPS が話す相手を Supabase まで広げない。
//   ★ VPS の relay.sh は fukues.com の【この口だけ】から取る（scripts/relay.sh FILE_HOSTS / FILE_PATH）。
//
// ★★★ 気をつけること
//   1. CRON_SECRET が無ければ何も返さない（★ 公開の画像でも、口は閉じておく）
//   2. バケットは【決めた2つ】だけ。★ path に .. や先頭の / を通さない
//   3. ★ 中身は読まない。Supabase Storage から取って、そのまま返すだけ
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** 取りに来てよいバケット。★ 店舗様がフクエスに上げた写真の置き場だけ */
const ALLOWED_BUCKETS: readonly string[] = ['therapist-photos', 'diary-images'];
const SAFE_PATH = /^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const bucket = url.searchParams.get('bucket') ?? '';
  const path = url.searchParams.get('path') ?? '';

  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return Response.json({ ok: false, error: '取りに来てよいバケットではない' }, { status: 400 });
  }
  if (!SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) {
    return Response.json({ ok: false, error: 'path の形が不正' }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc.storage.from(bucket).download(path);
  if (error || !data) {
    // ★ 無いものは無いと言う（★ 空の画像を返さない）
    return Response.json({ ok: false, error: '画像が見つからない: ' + (error?.message ?? '') }, { status: 404 });
  }

  const buf = Buffer.from(await data.arrayBuffer());
  if (buf.byteLength === 0) {
    return Response.json({ ok: false, error: '画像が空' }, { status: 404 });
  }
  const contentType = data.type && data.type !== '' ? data.type : 'application/octet-stream';
  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buf.byteLength),
      'Cache-Control': 'no-store',
    },
  });
}
