import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { isBotUA } from '@/lib/hpStats';

// ★ 第2012便（2026-11-13・オイルクエスト様のご要望・全店）: 求人ページの「LINEで応募する」ボタンと LINE の QR の通り道。
//   ★ ここで1行記録してから、お店の LINE（salon_jobs.apply_line_url）へ 302 で飛ばす。
//   ★ ?v=qr のときは QR の読み取り、それ以外はボタン。★ 記録は job_line_taps（追加SQL_第2012便）。
//   ★ 記録に失敗しても（表がまだ無い等）、お客様は必ず LINE へ飛ぶ（数えられないだけ）。
//   ★ 公開中の求人（is_active・店が非表示でない）で、LINE の URL が入っているときだけ飛ぶ。無ければ求人ページへ戻す。
//   ★ ボット・リンクのプレビュー・HEAD は数えない。

export const dynamic = 'force-dynamic';

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const jobId = Number(raw);
  if (!Number.isInteger(jobId) || jobId <= 0) return noStore(NextResponse.redirect(new URL('/jobs', req.url), 302));
  const back = noStore(NextResponse.redirect(new URL(`/jobs/${jobId}`, req.url), 302));

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_jobs')
    .select('id, salon_id, apply_line_url, salons!inner(is_hidden)')
    .eq('id', jobId)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .maybeSingle();
  if (error || !data) return back;

  const lineUrl = String((data.apply_line_url as string | null) ?? '').trim();
  try {
    const u = new URL(lineUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return back;
  } catch {
    return back;
  }

  if (req.method === 'GET' && !isBotUA(req.headers.get('user-agent') ?? '')) {
    const via = req.nextUrl.searchParams.get('v') === 'qr' ? 'qr' : 'btn';
    const { error: insErr } = await svc
      .from('job_line_taps')
      .insert({ salon_id: Number(data.salon_id), job_id: jobId, via });
    if (insErr) console.error('[job-line] 記録できなかった', jobId, insErr.message);
  }

  return noStore(NextResponse.redirect(lineUrl, 302));
}
