import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { centeredMainCrop, isPhotoSlot, isValidThumbRect, THUMB_DEFAULT_RECT, PHOTO_SLOT_MAX } from '@/lib/ekichikaPhoto';
import { resolveTherapistPhotoFile, type TherapistPhotoFile } from '@/app/lib/media/therapistPhotoFile';

// ── 駅ちかへ写真を1枚送る（第107便・運営だけの口）─────────────────────────
//   POST /api/admin/photo-push  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, imageSetId, slot?: 1, path?: string, apply?: boolean,
//           thumbRect?: {x,y,w,h}, mainRect?: {x,y,w,h},
//           probe?: boolean, top?: boolean }   ★ 第248便
//
// ★★★★★ 【第248便】足した2つ
//   probe=true … **読むだけ**。★ login → 編集ページ → 枠の形を記録して終わり。★ 1文字も書かない。
//                ★ imageSetId も写真も要らない。★ apply とは一緒に使えない。
//   top=true   … **枠1（トップ画像）へ入れてよい**という明示（★ imageSetId=1 のときだけ）。
//                ★★ 明示しても通るのは **8枠すべて空き**のときだけ（＝登録直後の方・壊せる写真が無い方）。
//                ★ その確認は中継が編集ページを読み直してから（slot1_not_blank）。★ DB では分からない。
//
// ★★★ この口がすること: 中継ジョブ（login）を1件積むだけ。★ 実際に送るのは VPS の周。
//   login → read_photo_page → upload_photo → read_photo_page → crop_photo → read_photo_page → crop_photo
//
// ★★ apply 既定 false（試し打ち）。★ 何を・どの枠へ・どの範囲で送るつもりかを返すだけ。
//   ★ 初回の実弾は【空き枠】に1枚 → 駅ちかの画面で目で見る → 人が削除（設計メモ §7・§10）。
//
// ★★★ 枠1（トップ画像）は送らない（★ 第248便で `top=true` のときだけ例外・上の説明）。
// ★★★★★★ 【第246便】さらに、**枠1が空きの方にも送らない**（VPS 側の read_photo_page で止まる）。
//   ★★★★★★ 【第251便・実測】**駅ちかは指名した枠を守る。★ 詰めない。**
//     ★ `10000000` の方へ **枠8** を指名して **枠8** に入った（`10000001`）。★ 最小の空き（枠2）は空きのまま。
//     ★ 第107便の記録からの**推定**が、枠の一覧つきの実測になった（設計メモ 追記 N・引き継ぎメモ 第251便）。
//   ★★★ **それでも枠1が空きの方への止めは残す**（2026-09-10・カッキーさんの決め）。★ 費用がほぼゼロだから。
//   ★★ エステ魂は**詰める**（第244便・実測）。★ 媒体で作法が違う。★ ここの前提を他媒体へ持ち出さない。
// ★★★★★★ 【第246便】最後に**読み直して照合**する。★ それまでの ok は送った枠番号の書き写しでしかなかった。
// ★★ 送るのは【フクエスに店舗様が上げた写真】だけ（therapist-photos）。★ 他所の画像は指せない。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Rect = { x: number; y: number; w: number; h: number };

/**
 * ★ JSON でも form（-d salonId=6 -d therapistId=41 …）でも受ける。
 *   ★ PowerShell → ssh → curl と渡すと JSON の " が壊れる（第106便で踏んだ）。
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
  // ★ 文字の true を真偽に（form では文字で来る）。★ 第248便で probe / top を足した
  for (const k of ['apply', 'probe', 'top', 'all']) if (o[k] === 'true') o[k] = true;
  for (const k of ['thumbRect', 'mainRect']) {
    // ★ JSON なら開く。★ "60,0,180,180" の形は readRect が読むのでそのまま残す
    if (typeof o[k] === 'string' && /^\s*[{[]/.test(o[k] as string)) {
      try { o[k] = JSON.parse(o[k] as string); } catch { delete o[k]; }
    }
  }
  return o;
}
function readRect(v: unknown): Rect | null {
  // ★ "60,0,180,180" の形でも受ける（★ PowerShell → ssh で JSON の " が壊れるため。第107便の実弾で要った）
  if (typeof v === 'string' && /^\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*$/.test(v)) {
    const [x, y, w, h] = v.split(',').map((t) => Number(t.trim()));
    return { x, y, w, h };
  }
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  const n = (k: string) => Number(r[k]);
  if (![n('x'), n('y'), n('w'), n('h')].every((x) => Number.isInteger(x) && x >= 0)) return null;
  return { x: n('x'), y: n('y'), w: n('w'), h: n('h') };
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);

  const salonId = Number(body.salonId);
  const therapistId = Number(body.therapistId);
  const imageSetId = Number(body.imageSetId);
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const apply = body.apply === true;
  // ★★★★★ 第248便: 読むだけ（★ 編集ページを開いて枠の形を見るだけ。★ 1文字も書かない）
  const probe = body.probe === true;
  // ★★★★★★ 第248便: 枠1（トップ画像）へ入れてよいという明示
  const top = body.top === true;
  // ★★★★★★ 第253便: profile_images の2枚目以降を **枠2〜5** へまとめて送る
  const all = body.all === true;

  if (!Number.isFinite(salonId) || salonId <= 0) return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!Number.isFinite(therapistId) || therapistId <= 0) return NextResponse.json({ ok: false, error: 'therapistId が要る' }, { status: 400 });
  if (probe && apply) {
    // ★★ 一緒に書かせない。★ 「読むだけのつもりが送っていた」を作らない
    return NextResponse.json({ ok: false, error: 'probe は読むだけ。apply と一緒には使わない' }, { status: 400 });
  }
  // ★★★★★★ 第253便: `all` は【まとめて送る】ための合図。★ 混ぜられない相手を先に断る
  if (all && probe) {
    return NextResponse.json({ ok: false, error: 'probe は読むだけ。all と一緒には使わない' }, { status: 400 });
  }
  if (all && top) {
    // ★★★ 枠1（top）が通るのは **8枠すべて空き**のときだけ（第248便）。★ 1枚目を入れた時点でその条件は壊れる。
    //   → ★★ 新規の方は「登録（既定で枠1・第250便）」＋「all で枠2〜5」の**2発**で足りる。★ 混ぜない。
    return NextResponse.json({ ok: false, error: 'all=true と top=true は一緒に使わない（★ 枠1は登録の流れで入る）' }, { status: 400 });
  }
  if (!probe && !all) {
    if (!isPhotoSlot(imageSetId)) return NextResponse.json({ ok: false, error: 'imageSetId は 1〜' + PHOTO_SLOT_MAX }, { status: 400 });
    // ★★★ 枠1はトップ画像。★ 既定では送らない（設計メモ §7「枠1はトップ画像なので触らない」・第142便）
    // ★★★★★★ 【第248便】ただし `top=true` を明示したときだけ通す（設計メモ 追記 K）。
    //   ★ 通してよいのは【登録直後の方】＝ **8枠すべてが空き**で、壊せる写真が1枚も無い方だけ。
    //   ★★ その確認は **DB では分からない**。★ 中継が編集ページを読み直してから決める（slot1_not_blank）。
    //   ★ §3-1 ④「新規登録の子は別扱いにする」はカッキーさん承認済み（2026-09-09）。
    if (imageSetId === 1 && !top) {
      return NextResponse.json({ ok: false, error: '枠1（トップ画像）へは送らない。2〜8 を指定する（★ 登録直後の方に限り top=true）' }, { status: 400 });
    }
    if (top && imageSetId !== 1) {
      // ★ top は枠1のためだけの合図。★ 他の枠に効かせない（設計メモ 追記 K-5 の3）
      return NextResponse.json({ ok: false, error: 'top=true は imageSetId=1 のときだけ使う' }, { status: 400 });
    }
  }

  const svc = createServiceClient();

  // ── セラピスト（★ その店の子であること） ──
  const { data: th, error: thErr } = await svc
    // ★ 第253便: `profile_images`（★ 配列・text[]）も読む。★ 2枚目以降の材料
    .from('therapists').select('id, salon_id, name, profile_image_url, profile_images').eq('id', therapistId).maybeSingle();
  if (thErr) return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });
  if (!th) return NextResponse.json({ ok: false, error: 'セラピストが見つからない' }, { status: 404 });
  if (Number((th as { salon_id: number }).salon_id) !== salonId) {
    return NextResponse.json({ ok: false, error: 'そのセラピストは指定した店舗の子ではない' }, { status: 400 });
  }

  // ── 駅ちかの girl_id（castId） ──
  const { data: mid } = await svc
    .from('therapist_media_ids').select('external_cast_id')
    .eq('therapist_id', therapistId).eq('provider', 'ekichika').eq('slot', slot).maybeSingle();
  const girlId = String((mid as { external_cast_id?: string } | null)?.external_cast_id ?? '');
  if (!/^\d{1,12}$/.test(girlId)) {
    return NextResponse.json({ ok: false, error: 'この子の駅ちかの castId（girl_id）が登録されていない' }, { status: 400 });
  }

  // ── ★★★★★ 読むだけ（第248便）──────────────────────────────────────────
  //   ★ 中継ジョブは積むが、送るものは何も無い（login → 編集ページを読む → 枠の形を記録 → 終わり）。
  //   ★★ 設計メモ §8 ④「登録直後の子にも同じ画像枠が使えるか」を、実弾ゼロで測るための口。
  if (probe) {
    const r = await startRelayFlow({
      salonId, provider: 'ekichika', slot,
      intent: 'photo_push',
      actor: 'admin:photo-push:probe',
      photo: { girlId, probe: true },
    });
    const probePlan = {
      salonId, slot, therapistId, therapistName: String((th as { name?: string }).name ?? ''),
      girlId,
      steps: ['login', 'read_photo_page'],
      note: '★ 読むだけ。★ 写真は1枚も送りません（★ 枠の指定も要りません）',
    };
    if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan: probePlan, reason: r.reason, note: r.note }, { status: 409 });
    return NextResponse.json({
      ok: true, applied: false, probe: true, plan: probePlan, jobId: r.jobId, flowId: r.flowId,
      note: r.note + ' ★ 結果は salon_media_audit（event=read_photo_page・detail の shape / blank）で見えます',
    });
  }

  // ── ★★★★★★ 第253便: 2枚目以降をまとめて送る（`all=true`）──────────────────
  //   ★★★ 対応づけは【番号固定】… `profile_images` の N枚目 → 駅ちかの枠N（設計メモ §0 ①）。
  //     ★ 詰めない。★ ずらさない。★ その枠が既に埋まっていたら **その1枚だけ飛ばす**（中継が読んでから決める）。
  //   ★★ **枠1には触らない。** ★ 1枚目は登録の流れ（第250便の既定）で入る。★ ここは枠2から。
  //   ★★★★★ 何度打っても同じ結果になる … 入っている枠は飛ばされ、**止まった枠から続きが入る**（設計メモ §6）。
  if (all) {
    const rawImages = (th as { profile_images?: string[] | null }).profile_images;
    const images = (Array.isArray(rawImages) ? rawImages : []).filter((u) => typeof u === 'string' && u !== '');
    if (images.length < 2) {
      return NextResponse.json(
        { ok: false, error: 'この方のお写真が1枚しかありません（★ 2枚目以降が無いので送るものがありません）' },
        { status: 400 },
      );
    }

    // ★ 2枚目（index 1）から。★ 枠は index+1 ＝ 番号固定。★ 駅ちかの枠の上限を超えない
    const queue: Array<{ slot: number; file: TherapistPhotoFile; mainRect: Rect; thumbRect: Rect }> = [];
    const notReady: Array<{ slot: number; reason: string }> = [];
    for (let i = 1; i < images.length && i + 1 <= PHOTO_SLOT_MAX; i++) {
      const wantSlot = i + 1;
      const one = await resolveTherapistPhotoFile(svc, { therapistId, imageSetId: wantSlot, profileImageUrl: images[i] });
      if (!one.ok) {
        // ★ 用意できない1枚は**飛ばして先へ**。★ ただし理由は必ず返す（★ 黙って落とさない・第250便 §2）
        notReady.push({ slot: wantSlot, reason: one.error });
        continue;
      }
      queue.push({
        slot: wantSlot,
        file: one.file,
        mainRect: centeredMainCrop(one.file.width, one.file.height),
        thumbRect: { ...THUMB_DEFAULT_RECT },
      });
    }
    if (queue.length === 0) {
      return NextResponse.json(
        { ok: false, error: '送れる写真が1枚もありませんでした', notReady },
        { status: 400 },
      );
    }

    const [first, ...rest] = queue;
    const allPlan = {
      salonId, slot, therapistId, therapistName: String((th as { name?: string }).name ?? ''),
      girlId,
      all: true,
      slots: queue.map((q) => q.slot),
      files: queue.map((q) => ({ slot: q.slot, path: q.file.path, filename: q.file.filename, width: q.file.width, height: q.file.height, bytes: q.file.bytes })),
      ...(notReady.length > 0 ? { notReady } : {}),
      steps: ['login', '（枠ごとに）read_photo_page → upload_photo → crop_photo → read_photo_page → verify'],
      verify: '★★ 1枚ごとに読み直して照合します（★ まとめて送って最後に1回、ではありません）',
      guards: [
        '★★ 枠1（トップ画像）には送りません（★ 1枚目は登録の流れで入ります）',
        '★★ 枠1が空きの方には送りません（slot1_empty・第246便）',
        '★★★ 既に写真が入っている枠は【その1枚だけ飛ばします】（★ 番号はずらしません・第253便）',
        '★★★ 照合が外れたらそこで止めます。★ 残りは送りません（第253便）',
      ],
    };

    if (!apply) {
      return NextResponse.json({ ok: true, applied: false, plan: allPlan, note: '試し打ち。★ apply:true で中継ジョブを積みます（★ 埋まっている枠は VPS 側で飛ばされます）' });
    }

    const r = await startRelayFlow({
      salonId, provider: 'ekichika', slot,
      intent: 'photo_push',
      actor: 'admin:photo-push:all',
      photo: {
        girlId,
        slot: first.slot,
        file: { bucket: first.file.bucket, path: first.file.path, filename: first.file.filename, contentType: first.file.contentType, width: first.file.width, height: first.file.height },
        mainRect: first.mainRect,
        thumbRect: first.thumbRect,
        multi: true,
        queue: rest.map((q) => ({
          slot: q.slot,
          file: { bucket: q.file.bucket, path: q.file.path, filename: q.file.filename, contentType: q.file.contentType, width: q.file.width, height: q.file.height },
          mainRect: q.mainRect,
          thumbRect: q.thumbRect,
        })),
      },
    });
    if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan: allPlan, reason: r.reason, note: r.note }, { status: 409 });
    return NextResponse.json({
      ok: true, applied: true, plan: allPlan, jobId: r.jobId, flowId: r.flowId,
      note: r.note + ' ★ 進み具合は salon_media_audit（event=read_photo_page / push_photo）で見えます',
    });
  }

  // ── 写真の在処と寸法（★ フクエスの therapist-photos だけ） ──
  // ★★★ 【第249便】ここの検査は `therapistPhotoFile.ts` に寄せた。
  //   ★ 登録の口（media-girl-create）でも同じ検査を通すため。★ 2か所に書くと片方だけ緩くなる。
  const got = await resolveTherapistPhotoFile(svc, {
    therapistId, imageSetId,
    profileImageUrl: (th as { profile_image_url?: string | null }).profile_image_url ?? null,
    path: typeof body.path === 'string' ? body.path : undefined,
  });
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: got.status });
  const { path, filename } = got.file;
  const size = { width: got.file.width, height: got.file.height, type: got.file.contentType };

  const mainRect = readRect(body.mainRect) ?? centeredMainCrop(size.width, size.height);
  const thumbRect = readRect(body.thumbRect) ?? { ...THUMB_DEFAULT_RECT };
  if (!isValidThumbRect(thumbRect)) return NextResponse.json({ ok: false, error: 'thumbRect が 300×400 の正方形に収まっていない' }, { status: 400 });

  const plan = {
    salonId, slot, therapistId, therapistName: String((th as { name?: string }).name ?? ''),
    girlId, imageSetId,
    file: { ...got.file },
    mainRect, thumbRect,
    steps: ['login', 'read_photo_page', 'upload_photo', 'read_photo_page', 'crop_photo(3:4)', 'read_photo_page', 'crop_photo(1:1)', 'read_photo_page', 'verify'],
    // ★★★★ 第246便: 最後に読み直して照合する。★ ここまでの応答では成否を名乗らない
    verify: '★★ 送ったあと編集ページを読み直し、指名した枠に入ったか・他の枠が変わっていないかを確かめます',
    ...(top ? { top: true } : {}),
    guards: top
      ? [
          // ★★★★★★ 第248便: 枠1へ入れる指定のときの止め（★ 上の3つとは別物）
          '★★★ 8枠すべてが空きでなければ送りません（slot1_not_blank・第248便）',
          '★ 枠1以外を指名していたら送りません（top_not_slot1・第248便）',
          '★★★ 指名した枠と違う枠に入っていたら failed で申告します（slot_mismatch・第246便）',
        ]
      : [
          '★ 枠が空きでなければ送りません（slot_occupied）',
          '★★ 枠1（トップ画像）が空きの方には送りません（slot1_empty・第246便）',
          '★★★ 指名した枠と違う枠に入っていたら failed で申告します（slot_mismatch・第246便）',
        ],
  };

  if (!apply) {
    return NextResponse.json({ ok: true, applied: false, plan, note: '試し打ち。★ apply:true で中継ジョブを積みます（★ 枠が空きでなければ VPS 側で止まります）' });
  }

  const r = await startRelayFlow({
    salonId, provider: 'ekichika', slot,
    intent: 'photo_push',
    actor: 'admin:photo-push',
    photo: {
      girlId, slot: imageSetId,
      file: { bucket: got.file.bucket, path: got.file.path, filename: got.file.filename, contentType: got.file.contentType, width: got.file.width, height: got.file.height },
      mainRect, thumbRect,
      // ★★★★★★ 第248便: 枠1へ入れてよいという合図。★ 最後の判断は中継が編集ページを読んでから
      ...(top ? { top: true } : {}),
    },
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 進み具合は salon_media_audit（event=read_photo_page / push_photo）で見えます',
  });
}
