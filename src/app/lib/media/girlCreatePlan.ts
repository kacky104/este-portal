import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveTherapistPhotoFile, type TherapistPhotoFile } from '@/app/lib/media/therapistPhotoFile';
import { centeredMainCrop, THUMB_DEFAULT_RECT, PHOTO_SLOT_MAX } from '@/lib/ekichikaPhoto';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { toEkichikaGenreIds, explainBadgeMapping, EKICHIKA_DEFAULT_GENRE_ID } from '@/lib/mediaBadgeMap';
import { parseBodyType } from '@/lib/bodyType';
// ★★★★★ 【第257便】値の型は**中継側の正本**をそのまま使う（★ ここで別の形に緩めない）。
//   ★ 最初 `Record<string, unknown>` にしたら、`startRelayFlow` に渡すところで型が落ちた。
//   ★★ **型が捕まえてくれた。** ★ 緩めていたら実行時まで分からなかった。
import type { EkichikaGirlCreateValues } from '@/lib/ekichikaGirlCreate';

// ── 駅ちかへ「1人を登録する」ための材料を作る（第257便で1か所に寄せた）───────────
//
// ★★★ なぜ寄せたか
//   第234便からこの組み立ては `/api/admin/media-girl-create`（★ 運営だけの curl の口）にあった。
//   ★ これから **店舗様の画面から**も同じことをする（設計メモ_セラピスト登録を店舗様の画面から §5 ①）。
//   ★★ 2か所に同じ組み立てを書くと、**片方だけ直したときに緩いほうから通る**
//     （★ 禁則185「ロジックを重複させない」と同じ形。★ 第249便 `therapistPhotoFile.ts` と同じ判断）。
//
// ★★★★★ しかも今夜まさにそれで踏んだ（第255便(2)）:
//   `photo-push` には `profile_images` を select に足したのに、`media-girl-create` は足し忘れ、
//   ★ DBに3枚あるのに「2枚目以降のお写真がありません」と言い続けた。★ **口が2つあると片方だけ漏れる。**
//
// ★★ ここがすること … 【材料を作るだけ】
//   ① 店舗・セラピストを読んで、送れる相手かを確かめる
//   ② 送る値を組み立てる（名前・ジャンル・年齢・サイズ）
//   ③ 写真を用意する（枠1／★ 明示があれば枠2〜）
//   ④ 画面や記録に出す `plan` と、注意（warnings）を作る
//
// ★★★ ここがしないこと
//   ・**送らない**（★ `startRelayFlow` は呼ばない）。★ 誰の権限で送るかは呼び出し側が決める
//   ・認証（★ curl の口は CRON_SECRET・店舗様の画面は assertSalonOwner）
//   → ★ だから「運営が押したか店舗様が押したか」でこのファイルは変わらない。

export type GirlCreateInput = {
  salonId: number;
  therapistId: number;
  /** 掲載枠（★ 写真の枠ではない・設計メモ 追記 K-9） */
  slot: number;
  /** 枠1へ写真を1枚送るか（★ 既定 true・第250便） */
  withPhoto: boolean;
  /** ★ `withPhoto=true` と**明示された**か（★ 明示なら用意できないとき止める・第250便） */
  withPhotoAsked: boolean;
  /** 2枚目以降（枠2〜5）も送るか（★ 明示したときだけ・第255便） */
  allPhotos: boolean;
  postTo: 'action' | 'fixed';
  rookie: boolean;
};

export type Rect = { x: number; y: number; w: number; h: number };

type PhotoMaterial = { file: TherapistPhotoFile; mainRect: Rect; thumbRect: Rect };

export type GirlCreatePlan = {
  /** ★ 画面にも記録にも出せる形（★ 秘密は入れない） */
  plan: Record<string, unknown>;
  /** ★ 店舗様に見せる注意 */
  warnings: string[];
  /** ★ `startRelayFlow` にそのまま渡す材料 */
  relay: {
    girlCreate: { therapistId: number; values: EkichikaGirlCreateValues; postTo: 'action' | 'fixed'; rookie: boolean; photoSkip?: string };
    photo?: {
      slot: number;
      file: { bucket: string; path: string; filename: string; contentType: string; width: number; height: number };
      mainRect: Rect;
      thumbRect: Rect;
      top: true;
      multi?: true;
      queue?: Array<{
        slot: number;
        file: { bucket: string; path: string; filename: string; contentType: string; width: number; height: number };
        mainRect: Rect;
        thumbRect: Rect;
      }>;
    };
  };
};

export type GirlCreatePlanResult =
  | { ok: true; data: GirlCreatePlan }
  | { ok: false; status: number; error: string };

/**
 * 送る材料を作る。★ ここでは1人も作らない。
 *
 * @param svc  service client（★ 呼び出し側が作る。★ 認証は呼び出し側の責任）
 */
export async function buildGirlCreatePlan(svc: SupabaseClient, input: GirlCreateInput): Promise<GirlCreatePlanResult> {
  const { salonId, therapistId, slot, withPhoto, withPhotoAsked, allPhotos, postTo, rookie } = input;

  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return { ok: false, status: 500, error: sErr.message };
  if (!salon) return { ok: false, status: 404, error: '店舗が見つからない' };

  const { data: th, error: tErr } = await svc
    .from('therapists')
    // ★★★★★★ 【第255便】`profile_images` を忘れない。★ 読まなければ **無いのと同じ**になる。
    //   ★ 2026-09-10 の実弾前に踏んだ: DBには3枚あるのに `alsoSlots` が出ず、
    //     「2枚目以降のお写真がありません」と言い続けた。★ 原因は **select に書いていなかった**だけ。
    //   ★★★ この便で1か所に寄せたので、**次からは片方だけ漏れることが無い**。
    .select('id, salon_id, name, age, body_type, feature_badges, is_active, profile_image_url, profile_images')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return { ok: false, status: 500, error: tErr.message };
  if (!th) return { ok: false, status: 404, error: 'セラピストが見つからない' };

  // ★★★ 他店の人を送らない
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return { ok: false, status: 400, error: 'そのセラピストはこの店舗の在籍ではありません' };

  // ★★★ すでに番号が結びついていたら積まない（★ 二重掲載を自分で作らない）
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('external_cast_id')
    .eq('provider', 'ekichika').eq('slot', slot).eq('therapist_id', therapistId)
    .maybeSingle();
  const linkedCastId = link ? String((link as { external_cast_id?: string }).external_cast_id ?? '') : '';
  if (linkedCastId) {
    return {
      ok: false, status: 409,
      error: 'この方はすでに駅ちかの castId ' + linkedCastId + '（枠' + slot + '）と結びついています。★ 登録しません',
    };
  }

  // ── 送る内容を組み立てる ─────────────────────────────────
  const name = String((th as { name?: string }).name ?? '').trim();
  if (!name) return { ok: false, status: 400, error: '名前が空のセラピストは送れません' };
  // ★★ 名前の文字数は【相手の画面の maxlength】で見る（中継の組み立て側・第233便）。
  //   ★ ここに数字を書き写さない。★ 書き写すと、相手が変えたときに古くなる。

  const badges = sanitizeBadges((th as { feature_badges?: unknown }).feature_badges);
  const genreIds = toEkichikaGenreIds(badges);
  const mapping = explainBadgeMapping(badges);

  const size = parseBodyType(String((th as { body_type?: string | null }).body_type ?? '') || null);
  const ageRaw = (th as { age?: number | null }).age;
  const age = ageRaw !== null && ageRaw !== undefined && /^\d{1,2}$/.test(String(ageRaw)) ? String(ageRaw) : null;
  const cupRaw = String(size?.cup ?? '').toUpperCase();

  const values: EkichikaGirlCreateValues = {
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
  let photo: PhotoMaterial | null = null;
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
        return { ok: false, status: got.status, error: '写真を用意できないため登録しません: ' + got.error };
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

  const plan: Record<string, unknown> = {
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

  return {
    ok: true,
    data: {
      plan,
      warnings,
      relay: {
        girlCreate: { therapistId, values, postTo, rookie, ...(photoSkip ? { photoSkip } : {}) },
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
                top: true as const,
                // ★★★★★★ 第255便: 2枚目以降。★ 列が空なら渡さない ＝ 第254便までと同じ振る舞い
                ...(photoQueue.length > 0
                  ? {
                      multi: true as const,
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
      },
    },
  };
}
