import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { shouldAutoBump, bumpRemaining, minuteLabel } from '@/lib/bumpAuto';

// ── 上位表示（bump）の自動実行の周（第385便・2026-09-15）────────────────
//   POST /api/admin/bump-auto  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★★★ この周が見るのは【自動実行の元栓が入っている店】だけ。
//   元栓（salons.bump_auto_enabled）は既定 false なので、誰も入れていないあいだは対象0件。
//   ★ crontab に足しても、店舗様が入れるまで何も起きない。
//
// ★★ apply 既定 false（試し打ち）。何件やるつもりかだけ返す。
//   announce-auto・article-auto・work-news-auto と同じ作法。★ 最初は apply なしで数を見ること。
//
// ★ 判定は src/lib/bumpAuto.ts の shouldAutoBump（純粋関数・自己点検あり）。
//   ここは【DBを読んで渡し、結果のとおりに押す】だけ。判断をこのファイルに書かない。
//
// ★★★ 押すのは SQL の RPC（salon_bump_auto_run）。★ ここから salons を直接 UPDATE しない。
//   ★ 回数の管理（20回／ワーク掲載店40回・朝6時リセット）は RPC の中だけが持つ（第385便で1本化）。
//   ★ ガードトリガも直接 UPDATE を弾く。
//
// ★ 間隔がいちばん短くて10分なので、周は5分ごと。
//   crontab（VPS）:
//   2-59/5 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/bump-auto -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = {
  id: number;
  jobs_enabled: boolean | null;
  bumped_at: string | null;
  bump_day: string | null;
  bump_used: number | null;
  bump_auto_enabled: boolean | null;
  bump_auto_start_min: number | null;
  bump_auto_end_min: number | null;
  bump_auto_interval_min: number | null;
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

  // ★ 元栓の入った、表に出ている店だけを見る。
  //   ★ 非表示の店は外す。押しても表に現れないのに回数だけ減るのは、戻せない損
  const { data: rows, error } = await svc
    .from('salons')
    .select('id, jobs_enabled, bumped_at, bump_day, bump_used, bump_auto_enabled, bump_auto_start_min, bump_auto_end_min, bump_auto_interval_min')
    .eq('bump_auto_enabled', true)
    .eq('is_hidden', false)
    .order('id', { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const targets = (rows ?? []) as Row[];

  const bumped: string[] = [];
  const skipped: Array<{ salonId: number; why: string }> = [];
  const failed: Array<{ salonId: number; why: string }> = [];

  for (const row of targets) {
    const salonId = Number(row.id);

    // ★★ 残り回数は営業日（朝6時区切り）で数え直す。★ 読めなければ null が返り、押さない側に倒れる
    const remaining = bumpRemaining({
      now,
      jobsEnabled: row.jobs_enabled === true,
      bumpDay: row.bump_day ?? null,
      bumpUsed: typeof row.bump_used === 'number' ? row.bump_used : null,
    });

    const judged = shouldAutoBump({
      now,
      enabled: row.bump_auto_enabled === true,
      startMin: row.bump_auto_start_min ?? -1,
      endMin: row.bump_auto_end_min ?? -1,
      intervalMin: row.bump_auto_interval_min ?? -1,
      lastBumpAt: row.bumped_at ?? null,
      remaining,
    });

    if (!judged.bump) { skipped.push({ salonId, why: judged.reason }); continue; }
    if (!apply) { bumped.push(String(salonId)); continue; }

    // ★★★ 押すのは RPC だけ。★ 回数の上限はここではなく RPC が最後の砦（同時に2周走っても越えない）
    const { data: res, error: rpcErr } = await svc.rpc('salon_bump_auto_run', { p_salon_id: salonId });
    if (rpcErr) { failed.push({ salonId, why: rpcErr.message.slice(0, 200) }); continue; }
    const out = (res ?? null) as { ok?: boolean; error?: string; remaining?: number } | null;
    // ★★ RPC が断ったときは【失敗として数える】。★ 押せたことにしない
    if (!out?.ok) { failed.push({ salonId, why: (out?.error ?? '押せませんでした').slice(0, 200) }); continue; }

    bumped.push(`${salonId}(残${out.remaining ?? '?'})`);
  }

  // ★ 押したときだけ、見えている場所を作り直す。
  //   ★ 実URLの revalidatePath は効かない（第25便）。雛形指定にすること
  //   ★ 上位表示が効くのは TOP と地域ページの2つだけ（withBumpedFirst を使っている場所）
  if (apply && bumped.length > 0) {
    revalidatePath('/');
    revalidatePath('/area/[slug]', 'page');
  }

  return NextResponse.json({
    ok: true,
    apply,
    salons: targets.length,
    bumped: bumped.length,
    failed: failed.length,
    detail: {
      bumped, failed, skipped,
      // ★ 参考：この周が見た店の設定（★ なぜ押されないかを、答えだけで分かるように）
      windows: targets.map((r) => ({
        salonId: Number(r.id),
        from: minuteLabel(r.bump_auto_start_min ?? -1),
        to: minuteLabel(r.bump_auto_end_min ?? -1),
        every: r.bump_auto_interval_min ?? null,
      })),
    },
  });
}
