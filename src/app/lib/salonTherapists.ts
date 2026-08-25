import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { sanitizeBadges } from '@/lib/therapistBadges';
import type { Therapist } from '@/components/SalonTherapists';
// ★ 並び替えは lib/therapistSort.ts から取る。components/SalonTherapists.tsx（'use client'）から
//   import すると、このサーバー専用モジュール経由でクライアント一式がビルドに巻き込まれ
//   `supabaseUrl is required` でビルドが落ちる（2026-08-22 実測）。
import { sortSalonTherapists } from '@/lib/therapistSort';

type PublicClient = ReturnType<typeof createPublicClient>;

// 在籍セラピストをサーバー側（anon）で取得し、SalonTherapists.tsx の GridCard がそのまま使える
// Therapist[] に組み立てる。newFaceTherapists.ts と同じ「page が ISR で取得 → props で渡す」方式。
//
// なぜサーバー取得が必要か（2026-07-28 SEO対応）:
//   SalonAllTherapists は 'use client' + useEffect でブラウザから Supabase を叩いていたため、
//   初期HTML（＝クローラが最初に見る中身）に <a href="/therapist/[id]"> が1本も含まれていなかった。
//   その結果 /therapist/[id] の大半が Search Console 上で「検出 - インデックス未登録」に滞留していた。
//   ここで取得して props で渡すことで、同じカードがそのままサーバー描画され HTML にリンクが載る。
//
// - createPublicClient（cookie を触らない anon）を使うので、呼び出し元の revalidate（ISR）が効く。
// - ★ is_active=false（退店）は返さない（第34便）。
//   もとは「クライアント実装と完全に同じ＝is_active で絞らない」だったが、それは is_active=false の
//   セラピストが全店で1件も存在しなかった時期の話。第34便で初めて退店を7名登録したところ、
//   店舗詳細の在籍一覧と /therapist/[id] にだけ退店者が残ることが分かったため絞るようにした。
//   ランキング・検索・公式HP・予約・sitemap は元から is_active=true で絞っている。
//   運用: 退店した子が戻ってきたら、このレコードを復活させず新しく作る（オーナー判断・第34便）。
// - N+1 回避のため、出勤・写メ日記・口コミ件数・fukuX ハンドルはそれぞれ1クエリでまとめて引く。
const THERAPIST_SELECT =
  'id, name, age, work_hours, area, comment, profile_image_url, is_available_now, available_until, is_available_now_cast, available_until_cast, is_new_face, new_face_since, body_type, feature_badges, user_id, catchphrase';

export async function fetchSalonTherapists(
  salonId: number,
  supabase: PublicClient = createPublicClient(),
): Promise<Therapist[]> {
  const { data: rows } = await supabase
    .from('therapists')
    .select(THERAPIST_SELECT)
    .eq('salon_id', salonId)
    .eq('is_active', true);

  if (!rows || rows.length === 0) return [];

  const rawIds = rows.map((t) => t.id);
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((u) => u != null).map(String))];
  const today = getBusinessDateJST();

  const [schedRes, diaryRes, reviewRes, xRes] = await Promise.all([
    supabase
      .from('therapist_schedules')
      .select('therapist_id, is_active, start_time, end_time')
      .in('therapist_id', rawIds)
      .eq('schedule_date', today),
    supabase.from('diary_posts').select('therapist_id').in('therapist_id', rawIds),
    supabase
      .from('therapist_reviews')
      .select('therapist_id')
      .in('therapist_id', rawIds)
      .eq('status', 'approved'),
    // userIds が空でも .in('auth_user_id', []) は0件を返すため分岐不要
    // （salon/[id]/page.tsx の .in('therapist_id', therapistIds) と同じ扱い）。
    supabase
      .from('x_profiles')
      .select('auth_user_id, handle')
      .in('auth_user_id', userIds)
      .eq('kind', 'therapist')
      .eq('status', 'approved')
      .not('handle', 'is', null),
  ]);

  const schedMap: Record<string, { is_active: boolean; start_time: string | null; end_time: string | null }> = {};
  (schedRes.data ?? []).forEach((row) => {
    schedMap[String(row.therapist_id)] = {
      is_active: Boolean(row.is_active),
      start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
      end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    };
  });

  const diarySet = new Set((diaryRes.data ?? []).map((r) => String(r.therapist_id)));

  const reviewMap: Record<string, number> = {};
  (reviewRes.data ?? []).forEach((r) => {
    const key = String(r.therapist_id);
    reviewMap[key] = (reviewMap[key] ?? 0) + 1;
  });

  const xHandles = new Map<string, string>();
  (xRes.data ?? []).forEach((r) => {
    if (r.handle) xHandles.set(String(r.auth_user_id), String(r.handle));
  });

  // ★ 並び順は sortSalonTherapists（写真あり優先 → 出勤状況）に集約。
  //   初期HTML（SEO対象）の時点で正しい順序にしておく＝クライアント側で並び替え直さない。
  const mapped = rows.map((t) => {
    const key = String(t.id);
    return {
      id: key,
      name: (t.name as string) ?? '',
      workHours: (t.work_hours as string) ?? '',
      area: (t.area as string) ?? '',
      comment: (t.comment as string) ?? '',
      catchphrase: (t.catchphrase as string) ?? '',
      profileImageUrl: (t.profile_image_url as string | null) ?? null,
      today: schedMap[key] ?? { is_active: false, start_time: null, end_time: null },
      isAvailableNow: Boolean(t.is_available_now),
      availableUntil: (t.available_until as string | null) ?? null,
      isAvailableNowCast: Boolean(t.is_available_now_cast),
      availableUntilCast: (t.available_until_cast as string | null) ?? null,
      isNewFace: Boolean(t.is_new_face),
      newFaceSince: (t.new_face_since as string | null) ?? null,
      bodyType: (t.body_type as string | null) ?? null,
      age: (t.age as string | null) ?? null,
      hasDiary: diarySet.has(key),
      reviewCount: reviewMap[key] ?? 0,
      onFukuX: xHandles.has(String(t.user_id)),
      xHandle: xHandles.get(String(t.user_id)) ?? null,
      featureBadges: sanitizeBadges(t.feature_badges),
      salonId, // 保存ボタン用（このサロンに在籍）
    };
  });

  return sortSalonTherapists(mapped);
}
