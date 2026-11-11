import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { postCocoaForAccount } from '@/app/lib/conecf/cocoaPost';
import { shouldPostCocoaAccount, normalizeCocoaSchedule } from '@/lib/conecfCocoa';

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

  // ★★ 第1833便: A・B・C の3アカウント（conecf_cocoa_accounts）。アカウントごとに「時刻＋テンプレート」の行で送る。
  const accs = await svc.from('conecf_cocoa_accounts')
    .select('salon_id, slot, schedule, last_due_at, salons!inner(is_hidden, conecf_enabled_at)')
    .eq('enabled', true).eq('salons.is_hidden', false);
  // ★ 第1960便（総点検の整理）: 追加SQL_第1833便は流してある（11/12 確認）。前の作り（1店1つ・1日1回）へ落ちる道は消した。
  //   ★ 読めなかった回は何も送らずに返す（前は、読めないと前の作りで送りに行っていた）
  if (accs.error) return NextResponse.json({ ok: false, error: accs.error.message }, { status: 500 });
  {
    const results = [];
    for (const a of accs.data ?? []) {
      const rel = (a as unknown as { salons?: { conecf_enabled_at?: string | null } | Array<{ conecf_enabled_at?: string | null }> }).salons;
      const s0 = Array.isArray(rel) ? rel[0] : rel;
      const salonId = Number(a.salon_id);
      const slot = Number(a.slot);
      if (!s0?.conecf_enabled_at) { results.push({ salonId, slot, skipped: 'conecf-not-enabled' }); continue; }
      const judged = shouldPostCocoaAccount({ now, salonId, schedule: normalizeCocoaSchedule(a.schedule), lastDueAt: (a.last_due_at as string | null) ?? null });
      if (!judged.post) { results.push({ salonId, slot, skipped: judged.reason }); continue; }
      try {
        results.push(await postCocoaForAccount(svc, salonId, slot, judged.templateId, apply, apply ? judged.dueAt : null, now));
      } catch (e) {
        results.push({ salonId, slot, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ ok: true, apply, at: now.toISOString(), accounts: true, results });
  }

}
