import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
// ★★★★ 【第263便】送る材料の組み立ては `castCreatePlan.ts` に寄せた（★ 駅ちかの第257便と同じ）。
//   ★ これから **店舗様の画面から**も同じことをする（設計メモ_セラピスト登録を店舗様の画面から §5 ⑥）。
//   ★★ 2か所に書くと片方だけ漏れる（第255便(2)・`profile_images` の select）。
import { buildCastCreatePlan } from '@/app/lib/media/castCreatePlan';

// ── エステ魂にセラピストを1人 登録する（第232便・運営だけの口）─────────────────────
//   POST /api/admin/media-cast-create  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, apply?: boolean }
//
// ★★★ この口がすること: フクエスの1人ぶんを読んで「送る内容」を組み立て、中継ジョブを1件積む。
//   login → esutama_cast_list（もう居ないか＋いまの顔ぶれ）→ esutama_cast_form（65部品を読む）
//        → esutama_cast_create → esutama_cast_list（照合＋cast_id 回収）
//
// ★★★ **相手に人が増える。** ★ 作法を重ねてある:
//   ① 相手は therapistId で1人だけ。★ 「まとめて登録」は作らない
//   ② apply の既定は false（試し打ち）。★ **送る中身をそのまま返すだけで、1人も作らない**
//   ③ すでに cast_id が結びついている人は積まない（★ 二重掲載を自分で作らない）
//   ④ 同じ名前が向こうに居たら、中継の側で止まる（relayFlow・一覧を読んでから判断する）
//   ⑤ 押したあと読み直して照合し、**増えた1人の cast_id を therapist_media_ids に書く**
//
// ★★ 写真は送らない（相手の file 欄に name が無く、送り方が未調査・第231便 §9-3）。
// ★★ `set_up_limit`（保存と同時に上位表示・残り回数あり）は送らない（読み手と組み立ての二重の見張り）。
//
// ★★ 店舗様の画面のボタンは、駅ちかが先（第260便）。★ エステ魂は §5 ⑥（★ この切り出しのあと）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') ?? '';
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  if (ct.includes('application/json')) {
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; } catch { return {}; }
  }
  const o: Record<string, unknown> = {};
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  if (o.apply === 'true') o.apply = true;
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const salonId = Number(body.salonId);
  const therapistId = Number(body.therapistId);
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const apply = body.apply === true;

  if (!Number.isFinite(salonId) || salonId <= 0)
    return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!Number.isFinite(therapistId) || therapistId <= 0)
    return NextResponse.json({ ok: false, error: 'therapistId が要る（フクエスのセラピストID）' }, { status: 400 });

  const svc = createServiceClient();

  // ★★★★ 【第263便】ここから下の「送る材料づくり」は `castCreatePlan.ts` に移した。
  //   ★ この口がすることは【認証（CRON_SECRET）】と【受け取った値の解釈】だけになった。
  //   ★★ 同じ材料を、店舗様の画面（サーバーアクション）からも作る。★ 認証だけが違う。
  const built = await buildCastCreatePlan(svc, { salonId, therapistId, slot });
  if (!built.ok) return NextResponse.json({ ok: false, error: built.error }, { status: built.status });
  const { plan, relay } = built.data;

  if (!apply) {
    return NextResponse.json({
      ok: true, applied: false, plan,
      note: '試し打ち。★ 1人も作っていません。★ apply:true で中継ジョブを積みます'
        + '（★ 同じ名前が向こうに居れば、そこで何もせず終わります）',
    });
  }

  const r = await startRelayFlow({
    salonId, provider: 'esutama', slot,
    intent: 'cast_create',
    actor: 'admin:cast-create',
    ...relay,
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=create_cast）で見えます',
  });
}
