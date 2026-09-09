import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { toEsutamaTypeIds, explainBadgeMapping } from '@/lib/mediaBadgeMap';
import { parseBodyType } from '@/lib/bodyType';

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
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3・2026-09-09 カッキーさんの決定）。
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

  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つからない' }, { status: 404 });

  const { data: th, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, feature_badges, is_active')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!th) return NextResponse.json({ ok: false, error: 'セラピストが見つからない' }, { status: 404 });

  // ★★★ 他店の人を送らない。★ ここを外すと、店舗を取り違えて登録する事故になる
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return NextResponse.json({ ok: false, error: 'そのセラピストはこの店舗の在籍ではありません' }, { status: 400 });

  // ★★★ すでに番号が結びついていたら積まない（★ 二重掲載を自分で作らない）
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('external_cast_id')
    .eq('provider', 'esutama').eq('slot', slot).eq('therapist_id', therapistId)
    .maybeSingle();
  const linkedCastId = link ? String((link as { external_cast_id?: string }).external_cast_id ?? '') : '';
  if (linkedCastId) {
    return NextResponse.json({
      ok: false,
      error: 'この方はすでにエステ魂の cast_id ' + linkedCastId + ' と結びついています。★ 登録しません',
    }, { status: 409 });
  }

  // ── 送る内容を組み立てる ─────────────────────────────────
  const name = String((th as { name?: string }).name ?? '').trim();
  if (!name) return NextResponse.json({ ok: false, error: '名前が空のセラピストは送れません' }, { status: 400 });
  // ★★ 相手は10文字以内。★ **黙って切り詰めない**（切り詰めた名前で登録されると誰か分からなくなる）
  if ([...name].length > 10)
    return NextResponse.json({
      ok: false,
      error: 'エステ魂の名前は10文字以内です（「' + name + '」は ' + [...name].length + '文字）。★ フクエス側の表示名を短くしてから送ってください',
    }, { status: 400 });

  const badges = sanitizeBadges((th as { feature_badges?: unknown }).feature_badges);
  const typeIds = toEsutamaTypeIds(badges);
  const mapping = explainBadgeMapping(badges);

  const size = parseBodyType(String((th as { body_type?: string | null }).body_type ?? '') || null);
  const ageRaw = (th as { age?: number | null }).age;
  const age = ageRaw !== null && ageRaw !== undefined && /^\d{1,2}$/.test(String(ageRaw)) ? String(ageRaw) : null;
  const cupRaw = String(size?.cup ?? '').toUpperCase();
  const sizeCup = /^[A-L]$/.test(cupRaw) ? cupRaw : null;

  const values = {
    name,
    typeIds,
    age,
    tall: size?.height ?? null,
    sizeB: size?.bust ?? null,
    sizeW: size?.waist ?? null,
    sizeH: size?.hip ?? null,
    sizeCup,
    // ★ フクエスに「スタイル」に当たる欄が無いので送らない（相手のフォームの既定＝未選択のまま）
    bodyStyle: null,
  };

  const warnings: string[] = [];
  // ★★★ 相手の画面の注記:「※3サイズのB(バスト)が未入力の場合、表示されません」（2026-09-09 実測）
  if (!values.sizeB) warnings.push('★ バスト(B)が空です。★ このまま登録すると **エステ魂の公開ページに出ません**');
  if (mapping.esutama.usedDefault) warnings.push('★ 送れる特徴が1つも無いので、既定の「新人」を入れます。★ エステ魂の新人は自動では消えません');
  if (mapping.esutama.overflowBadges.length > 0)
    warnings.push('★ 特徴は4つまでなので、' + mapping.esutama.overflowBadges.join('・') + ' は送りません');
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です。★ エステ魂には**即公開**で載ります');

  const plan = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'esutama', slot, therapistId,
    values,
    badges,
    steps: ['login', 'esutama_cast_list（在籍確認）', 'esutama_cast_form（65部品を読む）', 'esutama_cast_create', 'esutama_cast_list（照合＋cast_id回収）'],
    notSent: ['写真（送り方が未調査）', 'set_up_limit（保存と同時に上位表示・残り回数あり）', 'キャッチ・紹介文'],
    warnings,
  };

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
    castCreate: { therapistId, values },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=create_cast）で見えます',
  });
}
