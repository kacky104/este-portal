import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { resolveTherapistPhotoFile, type TherapistPhotoFile } from '@/app/lib/media/therapistPhotoFile';
import { centeredMainCrop, THUMB_DEFAULT_RECT, PHOTO_SLOT_MAX } from '@/lib/ekichikaPhoto';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { toEkichikaGenreIds, explainBadgeMapping, EKICHIKA_DEFAULT_GENRE_ID } from '@/lib/mediaBadgeMap';
import { parseBodyType } from '@/lib/bodyType';

// ── 駅ちかにセラピストを1人 登録する（第234便・運営だけの口）─────────────────────
//   POST /api/admin/media-girl-create  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, apply?: boolean,
//           postTo?: 'action'|'fixed', rookie?: boolean,   ← ★ この2つは切り分け用（第235便）
//           withPhoto?: boolean }                          ← ★★ 第249便で追加・第250便で【既定 true】
//
// ★★★ 段: login → read_girls（もう居ないか＋顔ぶれ）→ girl_create_form（110部品を読む）
//            → girl_create → read_girls（照合＋castId 回収）
//
// ★★★ **相手に人が増える。** ★ 作法はエステ魂の登録（第232便）とそろえてある:
//   ① 相手は therapistId で1人だけ。★ 「まとめて登録」は作らない
//   ② apply の既定は false（試し打ち）。★ **送る中身をそのまま返すだけで、1人も作らない**
//   ③ すでに castId が結びついている人は積まない（★ 二重掲載を自分で作らない）
//   ④ 同じ名前が向こうに居たら、中継の側で止まる（一覧を読んでから判断する）
//   ⑤ 押したあと読み直して照合し、**増えた1人の castId を therapist_media_ids に書く**
//
// ★★★★ `rookie_flg=1`（新人・30日で自動的に消える）は **登録した全員に付く**（§6-1 の1）。
//   ★ フクエスの「新人」バッジの有無とは関係ない。★ 店舗様の運用に合わせた決め。
//
// ★★★★★★ 【第250便】**写真は既定で送る**（登録 → 枠1へ1枚。設計メモ 追記 K・L・M）。
//   ★ 登録フォームに写真の欄は無いので、登録が通ったあと編集ページへ回る（第249便）。
//   ★ `-d withPhoto=false` で切れる。
//   ★★★ 写真を用意できないとき:
//     `withPhoto=true` と**書いた**とき … 400 で止める（★ 送るつもりだったのに送れない）
//     何も書かないとき（既定）        … ★ **飛ばして登録だけする**。★ 理由は監査の `photoSkip` に残る
// ★★ 送らないもの: 優先タグ（p_genre・上位表示は店舗様の運用）／キャッチ・紹介文
//
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3）。
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
  // ★ 文字の true を真偽に。★ 第249便で withPhoto を足した
  // ★ 第255便で allPhotos を足した
  for (const k of ['apply', 'withPhoto', 'allPhotos']) if (o[k] === 'true') o[k] = true;
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
  // ★★★★★★ 【第249便】登録が通ったら、そのまま**枠1へ写真を1枚**送る。
  //   ★ 既定は無し ＝ 今までどおり登録だけ（★ 書かなければ振る舞いは1つも変わらない）。
  //   ★★ 枠1へ入れてよいかの最後の判断は、中継が編集ページを読み直してから（第248便・slot1_not_blank）。
  //   ★★★★★★ 【第250便】**既定で送る**ようになった（第249便までは書いたときだけ）。
  //   ★ `-d withPhoto=false` で切れる。
  //   ★★★ 写真を用意できないときの振る舞いが、明示と既定で違う（★ ここが第250便の芯）:
  //     明示（withPhoto=true と書いた）… **400 で止める**（★ 送るつもりで打ったのに送れないなら知らせる）
  //     既定（何も書かない）          … ★ **飛ばして登録だけする**（設計メモ §3-1 ④）。★ 理由は記録に残す
  const withPhoto = !(body.withPhoto === false || String(body.withPhoto ?? '') === 'false');
  const withPhotoAsked = body.withPhoto === true || String(body.withPhoto ?? '') === 'true';
  // ★★★★★★ 【第255便】2枚目以降（枠2〜5）も続けて送る。★ **明示したときだけ**。
  //   ★ 何も書かなければ今までどおり **枠1へ1枚**（第250便の既定）。★ 振る舞いは1つも変わらない。
  //   ★★★ 既定にしなかった理由（2026-09-10・カッキーさんの決め）… 相手へ送る枚数が **5倍**になる変更だから。
  //     ★ 第249便（明示）→ 第250便（既定）と同じ段取りで、まず明示で通してから既定を検討する。
  //   ★★ 対応づけは第253便と同じ【番号固定】（`profile_images` のN枚目 → 枠N）。★ 詰めない・ずらさない。
  const allPhotos = body.allPhotos === true;
  // ★★★★ 切り分け用の2つ（第235便・設計メモ §17-9）。★ **コードを直さずに試せるようにする。**
  //   postTo=fixed … これまでどおり決め打ちの URL へ送る（既定は action ＝ 読んだフォームの action）
  //   rookie=false … `rookie_flg=1` を混ぜない（★ §2-7b は1回だけの確認なので疑える口を開けた）
  const postTo: 'action' | 'fixed' = String(body.postTo ?? '') === 'fixed' ? 'fixed' : 'action';
  const rookie = !(body.rookie === false || String(body.rookie ?? '') === 'false');

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
    // ★★★★★★ 【第255便】`profile_images` を忘れない。★ 読まなければ **無いのと同じ**になる。
    //   ★ 2026-09-10 の実弾前に踏んだ: DBには3枚あるのに `alsoSlots` が出ず、
    //     「2枚目以降のお写真がありません」と言い続けた。★ 原因は **select に書いていなかった**だけ。
    //   ★★ `photo-push` には第253便で足したのに、こちらは足し忘れていた。★ 口が2つあると片方だけ漏れる。
    .select('id, salon_id, name, age, body_type, feature_badges, is_active, profile_image_url, profile_images')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
  if (!th) return NextResponse.json({ ok: false, error: 'セラピストが見つからない' }, { status: 404 });

  // ★★★ 他店の人を送らない
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return NextResponse.json({ ok: false, error: 'そのセラピストはこの店舗の在籍ではありません' }, { status: 400 });

  // ★★★ すでに番号が結びついていたら積まない（★ 二重掲載を自分で作らない）
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('external_cast_id')
    .eq('provider', 'ekichika').eq('slot', slot).eq('therapist_id', therapistId)
    .maybeSingle();
  const linkedCastId = link ? String((link as { external_cast_id?: string }).external_cast_id ?? '') : '';
  if (linkedCastId) {
    return NextResponse.json({
      ok: false,
      error: 'この方はすでに駅ちかの castId ' + linkedCastId + '（枠' + slot + '）と結びついています。★ 登録しません',
    }, { status: 409 });
  }

  // ── 送る内容を組み立てる ─────────────────────────────────
  const name = String((th as { name?: string }).name ?? '').trim();
  if (!name) return NextResponse.json({ ok: false, error: '名前が空のセラピストは送れません' }, { status: 400 });
  // ★★ 名前の文字数は【相手の画面の maxlength】で見る（中継の組み立て側・第233便）。
  //   ★ ここに数字を書き写さない。★ 書き写すと、相手が変えたときに古くなる。

  const badges = sanitizeBadges((th as { feature_badges?: unknown }).feature_badges);
  const genreIds = toEkichikaGenreIds(badges);
  const mapping = explainBadgeMapping(badges);

  const size = parseBodyType(String((th as { body_type?: string | null }).body_type ?? '') || null);
  const ageRaw = (th as { age?: number | null }).age;
  const age = ageRaw !== null && ageRaw !== undefined && /^\d{1,2}$/.test(String(ageRaw)) ? String(ageRaw) : null;
  const cupRaw = String(size?.cup ?? '').toUpperCase();

  const values = {
    name,
    genreIds,
    age,
    tall: size?.height ?? null,
    bust: size?.bust ?? null,
    waist: size?.waist ?? null,
    hip: size?.hip ?? null,
    // ★★ カップは1文字で渡す。★ 番号は中継側が【相手の選択肢のラベル】から引く（第233便）
    cup: /^[A-Z]$/.test(cupRaw) ? cupRaw : null,
  };

  // ── ★★★★★★ 【第249便】登録のあとに送る写真を、**送る前に**用意しておく ──────────
  //   ★ ここで用意できなければ **1人も作らない**。★ 「登録はしたが写真が無い」を作らない。
  //   ★★ 用意するだけで、送るかどうかは中継が編集ページを読んでから決める（第248便）。
  //   ★ 検査は photo-push と同じ1か所（therapistPhotoFile.ts）を通す。
  type Rect = { x: number; y: number; w: number; h: number };
  let photo: { file: TherapistPhotoFile; mainRect: Rect; thumbRect: Rect } | null = null;
  // ★★★★★ 第250便: 写真を送らなかった理由（★ 既定のときだけ入る）
  let photoSkip = '';
  if (withPhoto) {
    const got = await resolveTherapistPhotoFile(svc, {
      therapistId, imageSetId: 1,
      profileImageUrl: (th as { profile_image_url?: string | null }).profile_image_url ?? null,
    });
    if (!got.ok) {
      // ★★★★★★ 第250便: 明示されたときだけ止める。★ 既定なら飛ばして登録だけする
      if (withPhotoAsked) {
        return NextResponse.json({ ok: false, error: '写真を用意できないため登録しません: ' + got.error }, { status: got.status });
      }
      photoSkip = got.error;
    } else {
    photo = {
      file: got.file,
      // ★ 3:4 の範囲は実寸の中央（★ 既に 3:4 の写真なら丸ごと。★ その場合 to_thumb=1 で段が飛ぶ）
      mainRect: centeredMainCrop(got.file.width, got.file.height),
      // ★★ 正方形は【上寄せ】（2026-09-02 の決定・ekichikaPhoto.ts）。★ 全身写真で顔が外れないように
      thumbRect: { ...THUMB_DEFAULT_RECT },
    };
    }
  }

  // ── ★★★★★★ 【第255便】2枚目以降（枠2〜5）を続けて送る材料 ────────────────
  //   ★★★ **枠1が用意できていないときは作らない。** ★ 枠1が空きのまま枠2へ入れることはしない
  //     （★ 中継側も `slot1_empty` で止める。★ ここで作らないのは、そもそも積まないため）。
  //   ★ 用意できない1枚は飛ばして先へ。★ ただし理由は必ず返す（★ 黙って落とさない・第250便 §2）。
  const photoQueue: Array<{ slot: number; file: TherapistPhotoFile; mainRect: Rect; thumbRect: Rect }> = [];
  const photoQueueNotReady: Array<{ slot: number; reason: string }> = [];
  if (allPhotos && photo) {
    const rawImages = (th as { profile_images?: string[] | null }).profile_images;
    const images = (Array.isArray(rawImages) ? rawImages : []).filter((u) => typeof u === 'string' && u !== '');
    for (let i = 1; i < images.length && i + 1 <= PHOTO_SLOT_MAX; i++) {
      const wantSlot = i + 1;
      const one = await resolveTherapistPhotoFile(svc, { therapistId, imageSetId: wantSlot, profileImageUrl: images[i] });
      if (!one.ok) {
        photoQueueNotReady.push({ slot: wantSlot, reason: one.error });
        continue;
      }
      photoQueue.push({
        slot: wantSlot,
        file: one.file,
        mainRect: centeredMainCrop(one.file.width, one.file.height),
        thumbRect: { ...THUMB_DEFAULT_RECT },
      });
    }
  }

  const warnings: string[] = [];
  if (allPhotos && !photo) warnings.push('★★ 1枚目が用意できないので、2枚目以降も送りません（★ 枠1が空きのまま枠2へは入れません）');
  if (allPhotos && photo && photoQueue.length === 0) warnings.push('★ 2枚目以降のお写真がないので、枠1の1枚だけ送ります');
  if (photoSkip) warnings.push('★★ 写真は送りません（' + photoSkip + '）。★ 登録だけします');
  if (mapping.ekichika.usedDefault)
    warnings.push('★ 駅ちかへ送れる特徴が1つも無いので、既定の「店長オススメ」（' + EKICHIKA_DEFAULT_GENRE_ID + '）だけで登録します');
  if (mapping.ekichika.droppedBadges.length > 0 && !mapping.ekichika.usedDefault)
    warnings.push('★ ' + mapping.ekichika.droppedBadges.join('・') + ' は駅ちかに当たる言葉が無いので送りません');
  if (!values.cup) warnings.push('★ カップが未設定（または A〜 の1文字でない）ため送りません');
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です。★ 駅ちかには**即公開**で載ります');

  const plan = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'ekichika', slot, therapistId,
    values,
    badges,
    rookie: rookie
      ? '★ rookie_flg=1（新人・30日で自動的に消える）を付けます。★ 体験入店（2）は使いません'
      : '★ ★ rookie_flg は **付けません**（rookie=false が指定されました・切り分け用）',
    // ★★★★ 送り先の決め方（第235便）。★ 実弾のたびに何を試したのかが記録から読めるように
    postTo: postTo === 'action'
      ? '★ 読んだフォームの action へ送ります（★ 動いている出勤と同じ作法・§17-8）'
      : '★ ★ 決め打ちの URL へ送ります（postTo=fixed が指定されました・切り分け用）',
    steps: ['login', 'read_girls（在籍確認＋顔ぶれ）', 'girl_create_form（110部品を読む）', 'girl_create', 'read_girls（照合＋castId回収）'],
    notSent: photo
      ? ['優先タグ p_genre（上位表示は店舗様の運用）', 'キャッチ・紹介文']
      : ['写真（登録フォームに欄が無い。登録後に photo-push で送る）', '優先タグ p_genre（上位表示は店舗様の運用）', 'キャッチ・紹介文'],
    ...(photoSkip ? { photoSkipped: photoSkip } : {}),
    ...(photo
      ? {
          // ★★★★★★ 第249便: 登録のあと、そのまま枠1へ1枚
          photo: {
            imageSetId: 1,
            file: photo.file,
            mainRect: photo.mainRect,
            thumbRect: photo.thumbRect,
            // ★★★★★★ 第255便: 2枚目以降（★ 明示したときだけ）
            ...(photoQueue.length > 0
              ? {
                  alsoSlots: photoQueue.map((q) => q.slot),
                  alsoFiles: photoQueue.map((q) => ({ slot: q.slot, path: q.file.path, filename: q.file.filename, width: q.file.width, height: q.file.height, bytes: q.file.bytes })),
                }
              : {}),
            ...(photoQueueNotReady.length > 0 ? { alsoNotReady: photoQueueNotReady } : {}),
            guards: [
              '★★★ 8枠すべてが空きでなければ送りません（slot1_not_blank・第248便）',
              '★★★ 指名した枠と違う枠に入っていたら failed で申告します（slot_mismatch・第246便）',
              '★★ 写真の段で止まっても、castId の結びつけは残ります（★ 二重登録を作らない）',
              ...(photoQueue.length > 0
                ? [
                    '★★★ 2枚目以降は【番号固定】（N枚目 → 枠N）。★ 既に写真が入っている枠は1枚だけ飛ばします（第253便）',
                    '★★★ 1枚ごとに読み直して照合します。★ 途中で外れたらそこで止め、残りは送りません（第253便）',
                  ]
                : []),
            ],
          },
        }
      : {}),
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
    salonId, provider: 'ekichika', slot,
    intent: 'girl_create',
    actor: 'admin:girl-create',
    girlCreate: { therapistId, values, postTo, rookie, ...(photoSkip ? { photoSkip } : {}) },
    // ★★★★★★ 第249便: 登録が通ったら、そのまま枠1へ1枚。★ girl_id は【登録後に読み直した castId】を中継が入れる
    ...(photo
      ? {
          photo: {
            slot: 1,
            file: {
              bucket: photo.file.bucket, path: photo.file.path, filename: photo.file.filename,
              contentType: photo.file.contentType, width: photo.file.width, height: photo.file.height,
            },
            mainRect: photo.mainRect,
            thumbRect: photo.thumbRect,
            top: true,
            // ★★★★★★ 第255便: 2枚目以降。★ 列が空なら渡さない ＝ 第254便までと同じ振る舞い
            ...(photoQueue.length > 0
              ? {
                  multi: true,
                  queue: photoQueue.map((q) => ({
                    slot: q.slot,
                    file: {
                      bucket: q.file.bucket, path: q.file.path, filename: q.file.filename,
                      contentType: q.file.contentType, width: q.file.width, height: q.file.height,
                    },
                    mainRect: q.mainRect,
                    thumbRect: q.thumbRect,
                  })),
                }
              : {}),
          },
        }
      : {}),
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=create_girl）で見えます',
  });
}
