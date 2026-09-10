import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { ESUTAMA_PHOTO_FIT, ESUTAMA_PHOTO_SLOT_MAX } from '@/lib/esutamaPhoto';

// ── エステ魂のセラピストに写真を1枚 送る（第243便・運営だけの口）────────────────
//   POST /api/admin/esutama-photo-push  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, photoSlot?: 1〜6, path?: string,
//           apply?: boolean, replace?: boolean }
//
// ★★★★★ 2段構え（設計メモ §25-1・実測）。★ 仮置きへ上げただけでは写真は付かない。
//   login → 編集ページを読む → 仮置きへ multipart → 読み直す → 保存 → 読み直して照合
//
// ★★★ 作法（駅ちかの写真＝第107便とそろえてある）:
//   ① 相手は therapistId で1人だけ。★ 「まとめて送る」は作らない
//   ② apply の既定は false（試し打ち）。★ **送る中身を返すだけで、1枚も送らない**
//   ③ ★★ **空き枠にだけ送る。** ★ 店舗様がご自分で入れた写真を上書きしない
//     ★ 差し替えたいときだけ replace:true（★ そのとき何を上書きしたかが記録に残る）
//   ④ 枠は**画面から選ぶ**。★ photoSlot を省けば、いちばん小さい空き枠へ
//   ⑤ 寸法は取りに来た口で 357×556 に合わせる（第241便）。★ 相手のブラウザと同じ形
//
// ★★ 送るのは【フクエスに店舗様が上げた写真】だけ（therapist-photos）。★ 他所の画像は指せない。
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUCKET = 'therapist-photos';
/** ★ 相手の画面の注記は 10MB。★ こちらの取り出し口で縮めるので、元は大きくてよい */
const MAX_BYTES = 20 * 1024 * 1024;

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

  // ★ 枠を指名したいときだけ。★ 省けば空き枠を画面から選ぶ
  let photoSlot: number | undefined;
  if (body.photoSlot !== undefined && body.photoSlot !== '') {
    const n = Number(body.photoSlot);
    if (!Number.isInteger(n) || n < 1 || n > ESUTAMA_PHOTO_SLOT_MAX) {
      return NextResponse.json({ ok: false, error: 'photoSlot は 1〜' + ESUTAMA_PHOTO_SLOT_MAX + ' の整数' }, { status: 400 });
    }
    photoSlot = n;
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

  // ── 写真の在処（★ フクエスの therapist-photos だけ） ──
  let path = typeof body.path === 'string' ? body.path : '';
  if (!path) {
    const url = String((th as { profile_image_url?: string | null }).profile_image_url ?? '');
    const i = url.indexOf('/' + BUCKET + '/');
    if (i < 0) {
      return NextResponse.json({ ok: false, error: 'この方のプロフィール写真が therapist-photos にありません（path を指定してください）' }, { status: 400 });
    }
    path = url.slice(i + BUCKET.length + 2).split('?')[0];
  }
  if (!/^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/.test(path) || path.includes('..') || path.includes('//')) {
    return NextResponse.json({ ok: false, error: 'path の形が不正' }, { status: 400 });
  }

  // ── 実在と大きさだけ確かめる（★ 中身は見ない） ──
  const { data: blob, error: dlErr } = await svc.storage.from(BUCKET).download(path);
  if (dlErr || !blob) return NextResponse.json({ ok: false, error: '写真を Storage から読めません: ' + (dlErr?.message ?? '') }, { status: 404 });
  const bytes = (await blob.arrayBuffer()).byteLength;
  if (bytes === 0) return NextResponse.json({ ok: false, error: '写真が空' }, { status: 400 });
  if (bytes > MAX_BYTES) return NextResponse.json({ ok: false, error: '写真が大きすぎます（20MB まで）' }, { status: 400 });

  const warnings: string[] = [];
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です（★ エステ魂側の表示はエステ魂の設定に従います）');
  if (replace) warnings.push('★ ★ replace:true が指定されています。★ 既に入っている写真を上書きします');
  if (photoSlot) warnings.push('★ 枠' + photoSlot + 'を指名しています（★ 空きでなければ止まります）');

  const plan = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'esutama', slot, therapistId,
    therapistName: String((th as { name?: string }).name ?? ''),
    castId,
    file: { bucket: BUCKET, path, bytes },
    photoSlot: photoSlot ?? '（指名なし：いちばん小さい空き枠へ）',
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
    castPhoto: {
      therapistId, castId, file: { bucket: BUCKET, path },
      ...(photoSlot ? { photoSlot } : {}),
      ...(replace ? { replace: true } : {}),
    },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=push_photo / read_photo_page）で見えます',
  });
}
