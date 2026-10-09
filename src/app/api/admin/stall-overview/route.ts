import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { collectStallOverview } from '@/app/lib/media/stallOverview';
import { formatStallOverview } from '@/lib/stallDigest';

// ── 全店の「止まっているもの・うまくいっていないもの」を見る（第1340便・2026-10-09）──────────
//   POST /api/admin/stall-overview  (Authorization: Bearer <CRON_SECRET>)
//   ?text=1 を付けると、人が読む形（文字だけ）で返す。付けなければ JSON。
//
// ★ 見るだけ。DB に書かない・相手サイトへ行かない・メールを出さない。
// ★ なぜ要るか・どの見張りの線を使うかは lib/stallDigest.ts の頭。集め方は app/lib/media/stallOverview.ts。
// ★ 次の便で、ここで見えたものの中から「鳴らすもの」を決めて、メールにつなぐ（そのとき、知らせ済みを覚える表を足す）。
//
// VPS から見る（★ 予定には入れない。見たいときに手で打つ）:
//   ( set -a; . /root/import.env; curl -s -m 60 -X POST "https://fukues.com/api/admin/stall-overview?text=1" -H "Authorization: Bearer $CRON_SECRET"; echo )
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const started = Date.now();
  try {
    const overview = await collectStallOverview(createServiceClient(), new Date());
    const tookMs = Date.now() - started;
    if (new URL(req.url).searchParams.get('text') === '1') {
      const lines = formatStallOverview(overview);
      lines.push('');
      lines.push('（調べるのにかかった時間: ' + (tookMs / 1000).toFixed(1) + '秒）');
      return new Response(lines.join('\n') + '\n', { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return NextResponse.json({ ok: true, tookMs, ...overview });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : '理由不明' }, { status: 500 });
  }
}
