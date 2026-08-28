import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';
import {
  isDueForAutoPush,
  shouldGiveUpAuto,
  AUTO_GIVE_UP_STREAK,
  type PushOutcome,
} from '@/lib/mediaLinkMode';

// ── 自動反映の周（第48便・設計メモ 追記14）─────────────────────────────
//   POST /api/admin/media-auto-push  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★★★ この周は【link_mode='write_auto' の枠】だけを見る。
//   その状態にできるのは「いまの向きになってから1回でも反映が成功している枠」だけ（§54）。
//   ★ 実弾が0回のあいだは対象が0件。**このエンドポイントを置いても何も起きない。**
//
// ★★ apply 既定 false（試し打ち）。何件やるつもりかだけ返す。
//   relay-purge・取り込みと同じ作法。★ 最初は apply なしで数を見ること。
//
// ★ 送るのはこの周ではない。ここは中継ジョブを積むだけで、実際に駅ちかを叩くのは
//   毎分の relay.sh（VPS）。★ だから VPS 側に新しい実装は要らない。**crontab に1行だけ。**
//
// crontab（VPS・30分ごと。周期の意味は §57）:
//   5,35 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/media-auto-push -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = { salon_id: number; provider: string; slot: number };

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

  const { data: sources, error } = await svc
    .from('salon_import_sources')
    .select('salon_id, provider, slot')
    .eq('is_enabled', true)
    .eq('link_mode', 'write_auto');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (sources ?? []) as Row[];
  const started: string[] = [];
  const skipped: Array<{ target: string; why: string }> = [];
  const gaveUp: string[] = [];

  for (const r of rows) {
    const target = `${r.salon_id}/${r.provider}#${r.slot}`;

    // ★ この枠の直近の書き込みまわりの記録。★ 新しい箱は作らない（§54）
    const { data: audit } = await svc
      .from('salon_media_audit')
      .select('event, outcome, created_at')
      .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', r.slot)
      .in('event', ['plan_work', 'write_work'])
      .order('created_at', { ascending: false })
      .limit(20);

    const list = audit ?? [];
    // ★ 「前回いつ試したか」は plan_work / write_work のどちらでもよい。
    //   止まった回も【試した回】として数える。数えないと3分ごとに再挑戦してしまう。
    const lastAttemptAt = list.length > 0 ? String(list[0].created_at) : null;

    // ★★★ 連続で送れていないなら自動を切る（§56・第38便 relay_gave_up と同じ作法）。
    //   ★ 判定材料は write_work だけ。plan_work は「組んだ」であって「送った」ではない。
    const outcomes = list
      .filter((a) => a.event === 'write_work')
      .map((a) => String(a.outcome) as PushOutcome);
    if (shouldGiveUpAuto(outcomes)) {
      gaveUp.push(target);
      if (apply) {
        // ★★★ 向きは変えない。自動だけ切る（§56）。
        //   ★ 勝手に 'read' へ戻すと、次の取り込みで店舗が入れた出勤が
        //     駅ちかの内容で上書きされて消える（§11-4）。**それは事故。**
        await svc.from('salon_import_sources')
          .update({ link_mode: 'write', updated_at: now.toISOString() })
          .eq('salon_id', r.salon_id).eq('provider', r.provider).eq('slot', r.slot);
        await recordMediaAudit({
          salonId: r.salon_id, provider: r.provider, slot: r.slot,
          event: 'link_mode_changed', outcome: 'stopped',
          summary:
            AUTO_GIVE_UP_STREAK + '回続けて反映できなかったため、自動をやめて' +
            '「毎回ご承認」に戻しました。画面で内容をご確認ください',
          detail: { mode: 'write', from: 'write_auto', reason: 'auto_gave_up' },
          actor: 'system:auto-push',
        });
      }
      continue;
    }

    if (!isDueForAutoPush({ lastAttemptAt, now })) {
      skipped.push({ target, why: 'まだ周期が来ていない' });
      continue;
    }

    if (!apply) { started.push(target); continue; }

    try {
      // ★ 指紋は渡さない。人が見た内容が存在しないので照合しない（§53）
      const r2 = await startRelayFlow({
        salonId: r.salon_id, provider: r.provider, slot: r.slot,
        intent: 'work_auto',
        actor: 'system:auto-push',
      });
      if (r2.ok) started.push(target);
      else skipped.push({ target, why: r2.note });
    } catch (e) {
      skipped.push({ target, why: (e as Error).message.slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    autoSlots: rows.length,
    started: started.length,
    gaveUp: gaveUp.length,
    detail: { started, gaveUp, skipped },
  });
}
