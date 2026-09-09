import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// ── 駅ちかから1人だけ削除する（第228便・運営だけの口）───────────────────────
//   POST /api/admin/media-girl-delete  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, castId, slot?: 1, apply?: boolean }
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。★ 実際に消すのは VPS の周。
//   login → read_girls（在籍確認＋使い捨てトークン）→ girl_delete → read_girls（照合）
//
// ★★★ **取り返しがつかない。** ★ 消したものは戻らない。だから作法を重ねてある:
//   ① 消す相手は castId で1人だけ。★ 「まとめて消す」は作らない
//   ② apply の既定は false（試し打ち）。★ 何を消すつもりかを返すだけで、1件も消さない
//   ③ 押す前に一覧を読み、その castId が本当に居ることを確かめる（relayFlow 側）
//   ④ 押したあともう一度一覧を読み、本当に消えたかを照合する（relayFlow 側）
//   ★ 個別の削除リンク（GET /admin/girls/delete/<castId>）は使わない。
//     ★ 確認ダイアログが無く、開いた瞬間に消える（2026-09-09 実測）。
//
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3・2026-09-09 カッキーさんの決定）。
//   ★ 登録は店舗様・削除は運営だけ。
//
// ★★★ フクエス側の therapists は【触らない】。
//   ★ ここは「媒体側の名簿から消す」だけの口。★ フクエス側の公開／非公開はマイページで別に決める。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * ★ JSON でも form（-d salonId=6 -d castId=…）でも受ける。
 *   ★ PowerShell → curl と渡すと JSON の " が壊れる（第106便で踏んだ）。
 *   ★ form なら引用符が1つも要らない。★ 運営だけの口なので、この緩さは許す。
 */
async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') ?? '';
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  if (ct.includes('application/json')) {
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; } catch { return {}; }
  }
  const o: Record<string, unknown> = {};
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  if (o.apply === 'true') o.apply = true;   // ★ form では文字で来る
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);

  const salonId = Number(body.salonId);
  const castId = String(body.castId ?? '').trim();
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const apply = body.apply === true;

  if (!Number.isFinite(salonId) || salonId <= 0)
    return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!/^\d{1,12}$/.test(castId))
    return NextResponse.json({ ok: false, error: 'castId が要る（駅ちかの番号・数字だけ）' }, { status: 400 });

  const svc = createServiceClient();

  // ── 店舗（★ 名前を記録に残すため。★ 無い店舗IDで積ませない） ──
  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つからない' }, { status: 404 });

  // ── ★★ その castId がフクエスの誰かに結びついていないか（第228便）──
  //   ★ 結びついていたら、消すと【フクエス側の送り先が消える】。
  //   ★ 止めはしない（運営が意図して消すこともある）が、**必ず返して目に入れる**。
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('therapist_id')
    .eq('provider', 'ekichika').eq('slot', slot).eq('external_cast_id', castId)
    .maybeSingle();
  let linkedTherapist: { id: number; name: string } | null = null;
  if (link) {
    const tid = Number((link as { therapist_id?: number }).therapist_id);
    const { data: th } = await svc.from('therapists').select('id, name, salon_id').eq('id', tid).maybeSingle();
    if (th) linkedTherapist = { id: Number((th as { id: number }).id), name: String((th as { name?: string }).name ?? '') };
  }

  const plan = {
    salonId,
    salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'ekichika',
    slot,
    castId,
    linkedTherapist,
    steps: ['login', 'read_girls（在籍確認＋トークン）', 'girl_delete', 'read_girls（照合）'],
    warning: linkedTherapist
      ? '★ この castId はフクエスの「' + linkedTherapist.name + '」さん（id ' + linkedTherapist.id + '）に結びついています。'
        + '消すと、その方への出勤・写真・即ヒメの送り先が無くなります'
      : null,
  };

  if (!apply) {
    return NextResponse.json({
      ok: true, applied: false, plan,
      note: '試し打ち。★ 1件も消していません。★ apply:true で中継ジョブを積みます'
        + '（★ 相手が一覧に居なければ、そこで何もせず終わります）',
    });
  }

  const r = await startRelayFlow({
    salonId, provider: 'ekichika', slot,
    intent: 'girl_delete',
    actor: 'admin:girl-delete',
    girlDelete: { castId },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=delete_girl）で見えます',
  });
}
