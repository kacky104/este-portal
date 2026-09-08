'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { businessDateJSTFrom } from '@/lib/dutyStatus';

// セラピスト削除・プロフィール画像掃除のサーバー専用処理（2026-07-12 新設）。
//
// 従来 /mypage からクライアント直 delete（RLS）だったが、
//  - therapist-photos のプロフィール画像（profile_image_url / profile_images 最大5枚）
//  - 写メ日記（diary-images）の画像
// が残置され URL 直打ちで見え続けるため、fukuX の adminDeleteXProfile と同方針で
// server action 化した（行削除成功後に storage を掃除）。
//
// ⚠ セキュリティ（厳守）:
//  - service_role はこのサーバー専用モジュール内でのみ使用。クライアントへ出さない。
//  - 全 action の先頭で assertOwner（salons.owner_id === auth.uid() または ADMIN_UUID）を再検証。
//  - storage 掃除は best-effort：失敗しても行削除は続行（孤児は残るが公開面は消える）。

const THERAPIST_BUCKET = 'therapist-photos';
const DIARY_BUCKET = 'diary-images';

type Result = { ok: true } | { ok: false; error: string };

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証（castInvite.ts と同型）。
async function assertOwner(salonId: number): Promise<{ userId: string } | { error: string }> {
  if (!Number.isFinite(salonId)) return { error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: '店舗が見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'この店舗の操作権限がありません' };
  }
  return { userId: user.id };
}

// 公開URL（.../storage/v1/object/public/{bucket}/{path}）→ バケット内パス。
// 対象バケット以外のURL（外部画像等）は null を返して触らない（xAdmin.ts と同ロジック）。
function bucketPathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
  } catch {
    return null;
  }
}

/**
 * セラピストを削除する（storage 掃除つき）。
 * 行削除の順序は schedules → diary_posts → therapists（FK が CASCADE 未設定でも安全な順）。
 * storage 掃除は行削除成功後に best-effort で実行する。
 */
export async function deleteTherapistWithCleanup(input: {
  therapistId: string;
  salonId: number;
}): Promise<Result> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();

  // 対象が当該サロン所属か検証しつつ、掃除対象のプロフィール画像URLを行削除前に控える。
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `セラピストの取得に失敗しました: ${tErr.message}` };
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  // 写メ日記の画像URLも行削除前に控える（行が消えると辿れなくなる）。
  const { data: diaries } = await svc
    .from('diary_posts')
    .select('images')
    .eq('therapist_id', therapistId);

  // 行削除：schedules → diary_posts → therapists の順。
  const { error: schedErr } = await svc
    .from('therapist_schedules')
    .delete()
    .eq('therapist_id', therapistId);
  if (schedErr) return { ok: false, error: `出勤スケジュールの削除に失敗しました: ${schedErr.message}` };

  const { error: diaryErr } = await svc
    .from('diary_posts')
    .delete()
    .eq('therapist_id', therapistId);
  if (diaryErr) return { ok: false, error: `写メ日記の削除に失敗しました: ${diaryErr.message}` };

  const { error: delErr } = await svc
    .from('therapists')
    .delete()
    .eq('id', therapistId)
    .eq('salon_id', salonId);
  if (delErr) return { ok: false, error: `削除に失敗しました: ${delErr.message}` };

  // ── ここから storage 掃除（best-effort・失敗しても ok を返す） ──
  const profilePaths = [
    ...(Array.isArray(t.profile_images) ? (t.profile_images as string[]) : []),
    (t.profile_image_url as string | null) ?? null,
  ]
    .map((u) => bucketPathFromPublicUrl(u, THERAPIST_BUCKET))
    .filter((p): p is string => !!p);
  if (profilePaths.length > 0) {
    const { error: rmErr } = await svc.storage
      .from(THERAPIST_BUCKET)
      .remove([...new Set(profilePaths)]);
    if (rmErr) console.error('[deleteTherapistWithCleanup] therapist-photos remove failed:', rmErr.message);
  }

  const diaryPaths = (diaries ?? [])
    .flatMap((d) => (Array.isArray(d.images) ? (d.images as string[]) : []))
    .map((u) => bucketPathFromPublicUrl(u, DIARY_BUCKET))
    .filter((p): p is string => !!p);
  if (diaryPaths.length > 0) {
    const { error: rmErr } = await svc.storage
      .from(DIARY_BUCKET)
      .remove([...new Set(diaryPaths)]);
    if (rmErr) console.error('[deleteTherapistWithCleanup] diary-images remove failed:', rmErr.message);
  }

  return { ok: true };
}

/**
 * プロフィール画像の差し替え・スロット削除で不要になった旧ファイルを掃除する
 * （/mypage/therapist/[id] の保存成功後にクライアントから呼ぶ）。
 * 安全弁：
 *  - 現行プロフィール（profile_image_url / profile_images）で使用中のURLは削除しない。
 *  - ファイル名は `${therapistId}-${Date.now()}.{ext}` 規約のため、
 *    `${therapistId}-` プレフィックス以外のパスは削除しない（他セラピストの画像を守る）。
 */
export async function cleanupTherapistPhotos(input: {
  therapistId: string;
  salonId: number;
  urls: string[];
}): Promise<Result> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `セラピストの取得に失敗しました: ${tErr.message}` };
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  const inUse = new Set(
    [
      ...(Array.isArray(t.profile_images) ? (t.profile_images as string[]) : []),
      (t.profile_image_url as string | null) ?? '',
    ].filter(Boolean),
  );

  const paths = [...new Set(input.urls ?? [])]
    .filter((u) => typeof u === 'string' && !inUse.has(u))
    .map((u) => bucketPathFromPublicUrl(u, THERAPIST_BUCKET))
    .filter((p): p is string => !!p && p.startsWith(`${therapistId}-`));
  if (paths.length === 0) return { ok: true };

  const { error: rmErr } = await svc.storage.from(THERAPIST_BUCKET).remove(paths);
  if (rmErr) return { ok: false, error: rmErr.message };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ★★★ 公開／非公開の切替（第216便・2026-09-08）
//
// ★ 保存先は therapists.is_active（★ 新しい列は作らない）。第34便で入れた「退店」の列を、
//   店舗様の手で動かせるようにしただけ。★ 公開側は元から is_active=false を全部落としている:
//     /therapist/[id] は404／店舗詳細の在籍一覧・ランキング・検索・sitemap・埋め込み日記から除外。
//   ★ つまりこの action は【公開面の見え方を新しく決めるものではない】。
//     すでにある仕組みのスイッチを、Supabase の SQL から画面へ移すだけ。
//
// ★★ 非公開にするとき、ついでに2つ降ろす（★ カッキーさんの判断・2026-09-08）。
//   ★ 理由は第215便 §1-3 と同じ穴（「read に戻しても true が残ると、後日 write にした瞬間に
//     黙って走り出す」）。★ 非公開なのに裏で走り続けるものを残さない。
//   ① 「今すぐ」のオーナー枠・キャスト枠を消す
//      ★ 取り込み枠（_import・駅ちかの即ヒメ由来）は触らない。★ あれは向こうの写しなので、
//        こちらで消しても次の取り込みで戻る。★ 消すべきは駅ちか側（第39便）。
//   ② 今日以降（営業日基準）の出勤を休みにする
//      ★★★ これをやらないと、駅ちかの出勤表に入ったままになる。
//        planWork は「フクエスの出勤」を7日ぶん送る作りなので、こちらを休みにすれば
//        次の周が「全休」として送り、駅ちかからも自然に降りる。
//        ★ planWork を is_active で絞る道は採らなかった: 絞ると駅ちかに残った出勤に
//          フクエスから二度と触れなくなり、店舗様が駅ちか側で手で消すことになる。
//      ★ 昨日までの出勤は残す（★ 実績なので消さない）。
//
// ★★ 公開に戻すときは is_active=true にするだけ。★ 出勤は戻さない（★ 勝手に戻すと
//   「休みにしたはずの日」が復活する）。★ 画面でその旨を伝えること。
// ─────────────────────────────────────────────────────────────────────────────

/** 非公開にしたときに何を降ろしたか。★ 画面がそのまま文にできる形で返す。 */
export type SetActiveResult =
  | { ok: true; isActive: boolean; clearedImasugu: boolean; clearedShiftDays: number }
  | { ok: false; error: string };

export async function setTherapistActive(input: {
  therapistId: string | number;
  salonId: number;
  isActive: boolean;
}): Promise<SetActiveResult> {
  const therapistId = String(input.therapistId ?? '').trim();
  const salonId = Number(input.salonId);
  const next = input.isActive === true;
  if (!therapistId) return { ok: false, error: '対象セラピストが不正です' };

  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const svc = createServiceClient();

  // ★ 対象が当該サロン所属か（★ 権限は上で見ているが、他店の id を渡された場合をここで落とす）
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, is_active')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr) return { ok: false, error: `セラピストの取得に失敗しました: ${tErr.message}` };
  if (!t || Number(t.salon_id) !== salonId) return { ok: false, error: 'セラピストが見つかりません' };

  // ★ 非公開にするときだけ、今すぐの2枠も一緒に落とす（1回の update にまとめる）。
  const patch: Record<string, unknown> = { is_active: next };
  if (!next) {
    patch.is_available_now = false;
    patch.available_until = null;
    patch.is_available_now_cast = false;
    patch.available_until_cast = null;
  }

  const { error: upErr } = await svc
    .from('therapists')
    .update(patch)
    .eq('id', therapistId)
    .eq('salon_id', salonId);
  if (upErr) return { ok: false, error: `切り替えに失敗しました: ${upErr.message}` };

  // ★ 今日以降の出勤を休みにする（非公開のときだけ）。
  //   ★ 「今日」は営業日基準（午前6時始まり）。★ planWork・マイページと同じ数え方。
  let clearedShiftDays = 0;
  if (!next) {
    const todayISO = businessDateJSTFrom(Date.now());
    const { data: cleared, error: schErr } = await svc
      .from('therapist_schedules')
      .update({ is_active: false, start_time: null, end_time: null })
      .eq('therapist_id', therapistId)
      .gte('schedule_date', todayISO)
      .eq('is_active', true)
      .select('schedule_date');
    // ★ ここが失敗しても非公開そのものは成立している（公開面からは消えている）。
    //   ★ ただし黙らない: 駅ちかに出勤が残る話なので、画面に理由を返す。
    if (schErr) {
      return { ok: false, error: `非公開にしましたが、今日以降の出勤を休みにできませんでした（${schErr.message}）。媒体連携をお使いの場合は出勤設定をご確認ください` };
    }
    clearedShiftDays = (cleared ?? []).length;
  }

  // ★★★ ISR の無効化は【呼び出した画面（クライアント）側】でやる。
  //   ★ ここで src/app/lib/revalidateTop.ts を呼ばないこと。
  //     ★ あれは fetch('/api/revalidate') という【相対URL】なので、
  //       サーバー（この action の中）から呼ぶと必ず失敗する。
  //       ★★ しかも中で握り潰しているので【何も起きないまま ok が返る】。
  //       ★ 「非公開にしたのに10分サイトに残る」が静かに成立する形なので、呼ばない。
  //   ★ 呼び先は /mypage/therapist/[id] の handleToggleActive（revalidateSalon＋revalidateTherapist）。

  return { ok: true, isActive: next, clearedImasugu: !next, clearedShiftDays };
}
