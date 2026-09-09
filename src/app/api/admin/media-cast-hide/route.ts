import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// ── エステ魂で1人だけ非表示にする（第229便・運営だけの口）───────────────────────
//   POST /api/admin/media-cast-hide  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, castId, slot?: 1, apply?: boolean }
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。★ 実際に押すのは VPS の周。
//   login → esutama_cast_list（在籍確認＋使い捨てトークン）→ esutama_cast_hide → esutama_cast_list（照合）
//
// ★★ 駅ちかの削除（/api/admin/media-girl-delete）との違い:
//   ★ こちらは **戻せる**。★ エステ魂の管理画面で「表示する」を押せば元に戻る。
//   ★ ただし押した瞬間に公開ページからは消える（2026-09-09 実測・/cast/<id>/ が 404）。
//   ★★ 「非表示」と「表示に戻す」は口が別（cast_disabled / cast_enable）。★ トグルではない。
//     ★ この口は **非表示にする側だけ**。★ 戻す側は作っていない。
//
// ★ 作法は削除とそろえてある:
//   ① 相手は cast_id で1人だけ。★ 「まとめて非表示」は作らない
//   ② apply の既定は false（試し打ち）。★ 何をするつもりかを返すだけで、1件も押さない
//   ③ 押す前にセラピスト設定を読み、その cast_id が居ること・まだ表示中であることを確かめる（relayFlow 側）
//   ④ 押したあともう一度読み直し、本当に disabled が付いたかを照合する（relayFlow 側）
//
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3・2026-09-09 カッキーさんの決定）。
//   ★ 登録は店舗様・非表示は運営だけ。
//
// ★★★ フクエス側の therapists は【触らない】。
//   ★ ここは「媒体側で見えなくする」だけの口。★ フクエス側の公開／非公開はマイページで別に決める。
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
    return NextResponse.json({ ok: false, error: 'castId が要る（エステ魂の cast_id・数字だけ）' }, { status: 400 });

  const svc = createServiceClient();

  // ── 店舗（★ 名前を記録に残すため。★ 無い店舗IDで積ませない） ──
  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つからない' }, { status: 404 });

  // ── ★★ その castId がフクエスの誰かに結びついていないか（第229便）──
  //   ★ 結びついていたら、非表示にすると【フクエス側からの送り先が見えなくなる】。
  //   ★ 止めはしない（運営が意図してやることもある）が、**必ず返して目に入れる**。
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('therapist_id')
    .eq('provider', 'esutama').eq('slot', slot).eq('external_cast_id', castId)
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
    provider: 'esutama',
    slot,
    castId,
    linkedTherapist,
    steps: ['login', 'esutama_cast_list（在籍確認＋トークン）', 'esutama_cast_hide', 'esutama_cast_list（照合）'],
    reversible: '★ エステ魂の管理画面「表示する」で元に戻せます（口が別なので、この処理が戻すことはありません）',
    warning: linkedTherapist
      ? '★ この cast_id はフクエスの「' + linkedTherapist.name + '」さん（id ' + linkedTherapist.id + '）に結びついています。'
        + '非表示にすると、その方の出勤・写メ日記がエステ魂の公開ページに出なくなります'
      : null,
  };

  if (!apply) {
    return NextResponse.json({
      ok: true, applied: false, plan,
      note: '試し打ち。★ 1件も押していません。★ apply:true で中継ジョブを積みます'
        + '（★ 相手が一覧に居ない／すでに非表示なら、そこで何もせず終わります）',
    });
  }

  const r = await startRelayFlow({
    salonId, provider: 'esutama', slot,
    intent: 'cast_hide',
    actor: 'admin:cast-hide',
    castHide: { castId },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=hide_cast）で見えます',
  });
}
