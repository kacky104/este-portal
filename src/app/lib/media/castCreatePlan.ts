import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { toEsutamaTypeIds, explainBadgeMapping } from '@/lib/mediaBadgeMap';
import { parseBodyType } from '@/lib/bodyType';
// ★★★ 値の型は**中継側の正本**をそのまま使う（★ girlCreatePlan.ts・第257便と同じ判断。★ ここで別の形に緩めない）
import type { EsutamaCastCreateValues } from '@/lib/esutamaRequests';
// ★★★★★★ 【第267便】登録のあとに送る写真。★ 検査は esutama-photo-push と同じ1か所（therapistPhotoFile.ts）
import { resolveEsutamaPhotoFile, type EsutamaPhotoFile } from '@/app/lib/media/therapistPhotoFile';

// ── エステ魂へ「1人を登録する」ための材料を作る（第263便で1か所に寄せた）───────────
//
// ★★★ なぜ寄せたか … 駅ちかの girlCreatePlan.ts（第257便）と同じ理由。
//   第232便からこの組み立ては `/api/admin/media-cast-create`（★ 運営だけの curl の口）にあった。
//   ★ これから **店舗様の画面から**も同じことをする（設計メモ_セラピスト登録を店舗様の画面から §5 ⑥）。
//   ★★ 2か所に同じ組み立てを書くと、**片方だけ直したときに緩いほうから通る**（第255便(2) で踏んだ）。
//
// ★★ ここがすること … 【材料を作るだけ】
//   ① 店舗・セラピストを読んで、送れる相手かを確かめる
//   ② 送る値を組み立てる（名前・特徴・年齢・サイズ）
//   ③ 画面や記録に出す `plan` と、注意（warnings）を作る
//
// ★★★ ここがしないこと
//   ・**送らない**（★ `startRelayFlow` は呼ばない）。★ 誰の権限で送るかは呼び出し側が決める
//   ・認証（★ curl の口は CRON_SECRET・店舗様の画面は assertSalonOwner）
//   ・写真を**送る**こと（★ 用意はする。★ 送るのは中継。★ 相手の cast_id は登録後に中継が読み直して入れる）
//
// ★★★★ 【第263便】切り出しただけ。★ 振る舞い・`plan` の形・文言は route.ts にあったときと**一字一句同じ**。
// ★★★★★★ 【第267便】登録のあと、そのまま写真を1枚送る材料を足した（★ 駅ちかの第249便と同じ形）。
//   ★ `withPhoto` を渡したときだけ。★ 渡さなければ第263便までと**同じ JSON**が返る。
// ★★★★★★ 【第268便】呼び出し側（media-cast-create）の既定が true になった（★ 2026-09-11 15:00 の実弾で貫通したので）。
//   ★ ここ（材料づくり）は変えていない。★ `withPhoto` を渡さない呼び出し（店舗様の画面・第269便まで）は今までどおり登録だけ。
//   ★★ 用意できないとき … 明示（withPhotoAsked）なら 400 で止める／既定なら飛ばして登録だけ（理由は photoSkip に残す）。
//   ★★★ 枠は選ばない・選べない（★ エステ魂がいちばん小さい空き枠へ詰める・第245便）。★ 登録直後は全枠空きなので枠1＝トップ画像。

export type CastCreateInput = {
  salonId: number;
  therapistId: number;
  /** 掲載枠 */
  slot: number;
  /** ★★★★★★ 【第267便】登録のあと写真を1枚送るか。★ 省略＝送らない（第263便までと同じ） */
  withPhoto?: boolean;
  /** ★ `withPhoto=true` と**明示された**か（★ 明示なら用意できないとき止める・駅ちかの第250便と同じ） */
  withPhotoAsked?: boolean;
};

export type CastCreatePlan = {
  /** ★ 画面にも記録にも出せる形（★ 秘密は入れない） */
  plan: Record<string, unknown>;
  /** ★ 店舗様に見せる注意 */
  warnings: string[];
  /** ★ `startRelayFlow` にそのまま渡す材料 */
  relay: {
    castCreate: {
      therapistId: number;
      values: EsutamaCastCreateValues;
      /** ★★★ 第267便: 在処だけ（★ 画像そのものは載せない・第106便 案B）。★ 無ければ登録だけ */
      photo?: { bucket: string; path: string };
      photoSkip?: string;
    };
  };
};

export type CastCreatePlanResult =
  | { ok: true; data: CastCreatePlan }
  | { ok: false; status: number; error: string };

/**
 * 送る材料を作る。★ ここでは1人も作らない。
 *
 * @param svc  service client（★ 呼び出し側が作る。★ 認証は呼び出し側の責任）
 */
export async function buildCastCreatePlan(svc: SupabaseClient, input: CastCreateInput): Promise<CastCreatePlanResult> {
  const { salonId, therapistId, slot } = input;
  const withPhoto = input.withPhoto === true;
  const withPhotoAsked = input.withPhotoAsked === true;

  const { data: salon, error: sErr } = await svc
    .from('salons').select('id, name').eq('id', salonId).maybeSingle();
  if (sErr) return { ok: false, status: 500, error: sErr.message };
  if (!salon) return { ok: false, status: 404, error: '店舗が見つからない' };

  const { data: th, error: tErr } = await svc
    .from('therapists')
    // ★★★★★★ 第267便: `profile_image_url` を足した（★ 読んでいないものは、無いのと同じ・第255便(2)）
    .select('id, salon_id, name, age, body_type, feature_badges, is_active, profile_image_url')
    .eq('id', therapistId).maybeSingle();
  if (tErr) return { ok: false, status: 500, error: tErr.message };
  if (!th) return { ok: false, status: 404, error: 'セラピストが見つからない' };

  // ★★★ 他店の人を送らない。★ ここを外すと、店舗を取り違えて登録する事故になる
  if (Number((th as { salon_id?: number }).salon_id) !== salonId)
    return { ok: false, status: 400, error: 'そのセラピストはこの店舗の在籍ではありません' };

  // ★★★ すでに番号が結びついていたら積まない（★ 二重掲載を自分で作らない）
  const { data: link } = await svc
    .from('therapist_media_ids')
    .select('external_cast_id')
    .eq('provider', 'esutama').eq('slot', slot).eq('therapist_id', therapistId)
    .maybeSingle();
  const linkedCastId = link ? String((link as { external_cast_id?: string }).external_cast_id ?? '') : '';
  if (linkedCastId) {
    return {
      ok: false, status: 409,
      error: 'この方はすでにエステ魂の cast_id ' + linkedCastId + ' と結びついています。★ 登録しません',
    };
  }

  // ── 送る内容を組み立てる ─────────────────────────────────
  const name = String((th as { name?: string }).name ?? '').trim();
  if (!name) return { ok: false, status: 400, error: '名前が空のセラピストは送れません' };
  // ★★ 相手は10文字以内。★ **黙って切り詰めない**（切り詰めた名前で登録されると誰か分からなくなる）
  if ([...name].length > 10) {
    return {
      ok: false, status: 400,
      error: 'エステ魂の名前は10文字以内です（「' + name + '」は ' + [...name].length + '文字）。★ フクエス側の表示名を短くしてから送ってください',
    };
  }

  const badges = sanitizeBadges((th as { feature_badges?: unknown }).feature_badges);
  const typeIds = toEsutamaTypeIds(badges);
  const mapping = explainBadgeMapping(badges);

  const size = parseBodyType(String((th as { body_type?: string | null }).body_type ?? '') || null);
  const ageRaw = (th as { age?: number | null }).age;
  const age = ageRaw !== null && ageRaw !== undefined && /^\d{1,2}$/.test(String(ageRaw)) ? String(ageRaw) : null;
  const cupRaw = String(size?.cup ?? '').toUpperCase();
  const sizeCup = /^[A-L]$/.test(cupRaw) ? cupRaw : null;

  const values: EsutamaCastCreateValues = {
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

  // ── ★★★★★★ 【第267便】登録のあとに送る写真を、**送る前に**用意しておく ──────────
  //   ★ 明示（withPhotoAsked）で用意できなければ **1人も作らない**。★ 「登録はしたが写真が無い」を作らない。
  //   ★ 既定（withPhoto だけ）で用意できなければ、飛ばして登録だけ。★ 理由は photoSkip に残す（★ 黙って落とさない）。
  //   ★★ 用意するだけで、どの枠に入るかは相手が決める（第245便）。★ 送ってよいかの最後の判断は中継が編集ページを読んでから。
  let photo: EsutamaPhotoFile | null = null;
  let photoSkip = '';
  if (withPhoto) {
    const got = await resolveEsutamaPhotoFile(svc, {
      profileImageUrl: (th as { profile_image_url?: string | null }).profile_image_url ?? null,
    });
    if (!got.ok) {
      if (withPhotoAsked) {
        return { ok: false, status: got.status, error: '写真を用意できないため登録しません: ' + got.error };
      }
      photoSkip = got.error;
    } else {
      photo = got.file;
    }
  }

  const warnings: string[] = [];
  if (photoSkip) warnings.push('★★ 写真は送りません（' + photoSkip + '）。★ 登録だけします');
  // ★★★ 相手の画面の注記:「※3サイズのB(バスト)が未入力の場合、表示されません」（2026-09-09 実測）
  // ★★ 第298便（2026-09-12・カッキーさんの確認）: バストは【いまは必須ではない】（空でも公開された）。
  //   ★ ただしエステ魂の画面には必須と書いてあり、いつ戻るか分からない。★ 断定せずに注意だけ残す。
  if (!values.sizeB) warnings.push('★ バスト(B)が空です。★ このまま登録すると **公開されない可能性あります**');
  if (mapping.esutama.usedDefault) warnings.push('★ 送れる特徴が1つも無いので、既定の「新人」を入れます。★ エステ魂の新人は自動では消えません');
  if (mapping.esutama.overflowBadges.length > 0)
    warnings.push('★ 特徴は4つまでなので、' + mapping.esutama.overflowBadges.join('・') + ' は送りません');
  if ((th as { is_active?: boolean }).is_active === false)
    warnings.push('★ この方はフクエスでは非公開です。★ エステ魂には**即公開**で載ります');

  const plan: Record<string, unknown> = {
    salonId, salonName: String((salon as { name?: string }).name ?? ''),
    provider: 'esutama', slot, therapistId,
    values,
    badges,
    steps: [
      'login', 'esutama_cast_list（在籍確認）', 'esutama_cast_form（65部品を読む）', 'esutama_cast_create', 'esutama_cast_list（照合＋cast_id回収）',
      // ★★★★★★ 第267便: 写真まで行くときは、そのまま cast_photo の5段が続く（第243便）
      ...(photo
        ? ['esutama_photo_form（枠の状態と ctk）', 'esutama_photo_tmp（仮置き）', 'esutama_photo_form（取り直し）', 'esutama_photo_save', 'esutama_photo_form（照合）']
        : []),
    ],
    notSent: photo
      ? ['set_up_limit（保存と同時に上位表示・残り回数あり）', 'キャッチ・紹介文']
      // ★★ 第268便: 送らない理由を書く（★ 「未調査」はもう嘘になる・第243便で送り方は分かっている）
      : [
          photoSkip ? '写真（' + photoSkip + '）' : (withPhoto ? '写真' : '写真（withPhoto=false・登録だけ）'),
          'set_up_limit（保存と同時に上位表示・残り回数あり）', 'キャッチ・紹介文',
        ],
    ...(photoSkip ? { photoSkipped: photoSkip } : {}),
    ...(photo
      ? {
          // ★★★★★★ 第267便: 登録のあと、そのまま写真を1枚
          photo: {
            file: photo,
            photoSlot: '（指名できません：エステ魂がいちばん小さい空き枠へ詰めます。★ 登録直後は全枠空きなので枠1＝トップ画像）',
            guards: [
              '★★ 空き枠にだけ送ります（★ 登録直後は全枠空き）',
              '★★ 読んだ編集ページの cast_id が違えば保存しません（★ 別人を上書きしない・第243便）',
              '★★ 仮置きだけでは付きません。保存まで通って、読み直して照合します',
              '★★ 写真の段で止まっても、cast_id の結びつけは残ります（★ 二重登録を作らない）',
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
        castCreate: {
          therapistId, values,
          ...(photo ? { photo: { bucket: photo.bucket, path: photo.path } } : {}),
          ...(photoSkip ? { photoSkip } : {}),
        },
      },
    },
  };
}
