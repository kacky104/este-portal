import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { postCocoaForSalon } from '@/app/lib/conecf/cocoaPost';
import { shouldPostCocoa, pickCocoaTemplate, type CocoaTemplate } from '@/lib/conecfCocoa';

// ココア店長ブログの自動投稿の周（第404便・1日1回）。
//
// crontab（VPS・10分ごとに見て、店ごとの割り当て時刻を過ぎていて今日まだなら1本）:
//   4-59/10 * * * * . /root/import.env; /usr/bin/curl -sS -X POST "https://fukues.com/api/admin/conecf-cocoa?apply=1" --oauth2-bearer $CRON_SECRET >> /root/import.log 2>&1
// ★ apply=1 で送信。★ 付けなければ試し（送らず、出す予定を返す）。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const apply = new URL(req.url).searchParams.get('apply') === '1';
  const now = new Date();
  const svc = createServiceClient();

  const { data: sts, error } = await svc
    .from('conecf_cocoa_settings')
    .select('salon_id, enabled, last_auto_day, salons!inner(is_hidden, conecf_enabled_at)')
    .eq('enabled', true)
    .eq('salons.is_hidden', false);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const results = [];
  for (const s of sts ?? []) {
    const rel = (s as unknown as { salons?: { conecf_enabled_at?: string | null } | Array<{ conecf_enabled_at?: string | null }> }).salons;
    const s0 = Array.isArray(rel) ? rel[0] : rel;
    if (!s0?.conecf_enabled_at) { results.push({ salonId: Number(s.salon_id), skipped: 'conecf-not-enabled' }); continue; }
    const salonId = Number(s.salon_id);
    const { data: temps } = await svc.from('conecf_cocoa_templates').select('*').eq('salon_id', salonId).eq('is_active', true);
    const active = (temps ?? []).map((r): CocoaTemplate => ({
      id: Number(r.id), title: String(r.title ?? ''), body: String(r.body ?? ''),
      imageUrl: (r.image_url as string | null) ?? null, isActive: r.is_active !== false,
      sortOrder: Number(r.sort_order ?? 0), lastPostedAt: (r.last_posted_at as string | null) ?? null,
    }));
    const judged = shouldPostCocoa({ now, salonId, enabled: true, activeCount: active.length, lastAutoDay: (s.last_auto_day as string | null) ?? null });
    if (!judged.post) { results.push({ salonId, skipped: judged.reason }); continue; }
    if (!apply) { results.push({ salonId, would_post: pickCocoaTemplate(active)?.title ?? '' }); continue; }
    try {
      results.push(await postCocoaForSalon(svc, salonId, true, true, now));
    } catch (e) {
      results.push({ salonId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, apply, at: now.toISOString(), results });
}
