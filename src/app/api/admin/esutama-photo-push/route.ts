import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { ESUTAMA_PHOTO_FIT } from '@/lib/esutamaPhoto';
// ★★★★★★ 【第267便】写真の検査は therapistPhotoFile.ts に寄せた（★ 登録の流れ castCreatePlan.ts と同じ1か所）。
//   ★ 振る舞いは同じ（在処・形・実在・空・20MB）。★ 2か所に書くと片方だけ緩む（第255便(2)）。
import { resolveEsutamaPhotoFile, THERAPIST_PHOTO_BUCKET } from '@/app/lib/media/therapistPhotoFile';

// ── エステ魂のセラピストに写真を1枚 送る（第243便・運営だけの口）────────────────
//   POST /api/admin/esutama-photo-push  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, path?: string, apply?: boolean }
//
// ★★★★★★ 第245便（2026-09-10 実弾3発）: **写真の枠は指名できない。**
//   ★ エステ魂は `cast_icon_<枠>-imgupload` の枠番号を見ておらず、**いちばん小さい空き枠へ詰める**。
//   ★ `photoSlot` と `replace` は 400 で断る（★ 受け付けたまま残すと、次に触る人が必ず踏む）。
//
// ★★★★★ 2段構え（設計メモ §25-1・実測）。★ 仮置きへ上げただけでは写真は付かない。
//   login → 編集ページを読む → 仮置きへ multipart → 読み直す → 保存 → 読み直して照合
//
// ★★★ 作法（駅ちかの写真＝第107便とそろえてある）:
//   ① 相手は therapistId で1人だけ。★ 「まとめて送る」は作らない
//   ② apply の既定は false（試し打ち）。★ **送る中身を返すだけで、1枚も送らない**
//   ③ ★★ **空き枠にだけ送る。** ★ 店舗様がご自分で入れた写真を上書きしない
//     ★★ 差し替え（replace）は **できない**（第245便）。★ 相手が詰めるので差し替えにならない
//   ④ 枠は**相手が決める**（いちばん小さい空き枠）。★ こちらは指名しない・できない（第245便）
//   ⑤ 寸法は取りに来た口で 357×556 に合わせる（第241便）。★ 相手のブラウザと同じ形
//
// ★★ 送るのは【フクエスに店舗様が上げた写真】だけ（therapist-photos）。★ 他所の画像は指せない。
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = THERAPIST_PHOTO_BUCKET;

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
  if (o.replace === 'true') o.replace = true;
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
  const replace = body.replace === true;

  if (!Number.isFinite(salonId) || salonId <= 0)
    return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!Number.isFinite(therapistId) || therapistId <= 0)
    return NextResponse.json({ ok: false, error: 'therapistId が要る（フクエスのセラピストID）' }, { status: 400 });

  // ★★★★★★ 第245便（2026-09-10 実弾3発）: **枠は指名できない。**
  //   ★ エステ魂は `cast_icon_<枠>-imgupload` の枠番号を見ておらず、**いちばん小さい空き枠へ詰める**。
  //     ★ 枠6を指名した2発が、実際には枠4・枠5に入った（★ 照合は枠6を見て not_saved と申告した）。
  //   → ★★ 受け付けたまま残すと、次に触る人が必ず踏む。★ **ここで断る。**
  if (body.photoSlot !== undefined && body.photoSlot !== '') {
    return NextResponse.json({
      ok: false,
      error: 'エステ魂は空き枠へ詰めるため、写真の枠は指名できません（photoSlot は使えません）。'
        + '★ 枠は画面から選ばれます（いちばん小さい空き枠）',
    }, { status: 400 });
  }
  // ★★★ 差し替えも同じ理由でできない。★ 埋まった枠は差し替わらず、空き枠が1つ埋まるだけ
  if (replace) {
    return NextResponse.json({
      ok: false,
      error: 'エステ魂は空き枠へ詰めるため、写真の差し替えはできません（replace は使えません）。'
        + '★ 差し替えは店舗様の画面から',
    }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つからない' }, { status: 404 });

  const { data: th, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, profile_image_url, is_active')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!th) return NextResponse.json({ ok: false, error: 'セラピストが見つからない' }, { status: 404 });
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return NextResponse.json({ ok: false, error: 'そのセラピストはこの店舗の在籍ではありません' }, { status: 400 });

  // ── エステ魂の cast_id（★ 先に登録されていること） ──
  const { data: mid } = await svc
    .from('therapist_media_ids').select('external_cast_id')
    .eq('therapist_id', therapistId).eq('provider', 'esutama').eq('slot', slot).maybeSingle();
  const castId = String((mid as { external_cast_id?: string } | null)?.external_cast_id ?? '');
  if (!/^\d{1,12}$/.test(castId)) {
    return NextResponse.json({
      ok: false,
      error: 'この方のエステ魂の cast_id が登録されていません。★ 先に /api/admin/media-cast-create で登録してください',
    }, { status: 400 });
  }

  // ── 写真の在処と実在（★ フクエスの therapist-photos だけ・中身は見ない） ──
  //   ★★ 第267便: 検査は therapistPhotoFile.ts の1か所（★ 登録の流れと同じ物）
  const got = await resolveEsutamaPhotoFile(svc, {
    profileImageUrl: (th as { profile_image_url?: string | null }).profile_image_url ?? null,
    ...(typeof body.path === 'string' && body.path ? { path: body.path } : {}),
  });
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: got.status });
  const { path, bytes } = got.file;

  const warnings: string[] = [];
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です（★ エステ魂側の表示はエステ魂の設定に従います）');

  const plan = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'esutama', slot, therapistId,
    therapistName: String((th as { name?: string }).name ?? ''),
    castId,
    file: { bucket: BUCKET, path, bytes },
    // ★★★ 第245便: 枠は指名できない。★ 相手が「いちばん小さい空き枠」へ詰める
    photoSlot: '（指名できません：エステ魂がいちばん小さい空き枠へ詰めます）',
    size: '★ 取りに来た口で ' + ESUTAMA_PHOTO_FIT.width + '×' + ESUTAMA_PHOTO_FIT.height
      + ' を覆うように縮小し、左上を基準に切り取って JPEG にします（★ 相手のブラウザと同じ形）',
    steps: [
      'login',
      'esutama_photo_form（枠の状態と ctk を読む）',
      'esutama_photo_tmp（仮置きへ multipart）',
      'esutama_photo_form（新しい ctk と65部品を取り直す）',
      'esutama_photo_save（写真の1組を足して保存）',
      'esutama_photo_form（照合）',
    ],
    rules: [
      '★ 空き枠にだけ送ります（店舗様の写真を上書きしません）',
      '★★ エステ魂は枠番号を見ずに、いちばん小さい空き枠へ詰めます（第245便・実弾で確定）',
      '★ 仮置きだけでは付きません。保存まで通って初めて写真になります',
      '★ 成否は読み直して照合します（応答では判定しません）',
    ],
    warnings,
  };

  if (!apply) {
    return NextResponse.json({
      ok: true, applied: false, plan,
      note: '試し打ち。★ 1枚も送っていません。★ apply:true で中継ジョブを積みます',
    });
  }

  const r = await startRelayFlow({
    salonId, provider: 'esutama', slot,
    intent: 'cast_photo',
    actor: 'admin:esutama-photo-push',
    // ★★★ 第245便: 枠も差し替えも渡さない（★ 上で断ってある）。★ 送り先は流れが画面から選ぶ
    castPhoto: { therapistId, castId, file: { bucket: BUCKET, path } },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=push_photo / read_photo_page）で見えます',
  });
}
