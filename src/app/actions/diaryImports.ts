'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// ── 取り込んだ写メ日記かどうかを、画面に返す口（第98便）──────────────────
//
// ★★★ なぜ server action なのか
//   salon_diary_imports は service_role 専用（RLS 有効・ポリシー無し）。★ 画面からは読めない。
//   ★ ポリシーを足して直接読ませる手もあるが、**読ませたいのは「印を出すかどうか」だけ**。
//     ★ 表を1枚開けるより、必要な答えだけ返す口を1つ置くほうが小さい。
//
// ★★ 誰に返すか（呼び出しごとに確かめる）
//   ・その店舗のオーナー様（/mypage）
//   ・その日記のセラピスト様ご本人（/cast）
//   ・運営
//   ★ それ以外には **何も返さない**。★ 「知らない」ではなく、空を返す（在否も答えない）。
//
// ★ 返すのは provider だけ。★ 日記IDも本文も、媒体側の値は返さない。

export async function listImportedDiaries(input: { diaryPostIds: string[] }): Promise<{
  ok: boolean;
  /** diary_posts.id → 媒体（'ekichika' など）。★ 取り込んだものだけが入る */
  data?: Record<string, string>;
  error?: string;
}> {
  const ids = Array.from(
    new Set((input?.diaryPostIds ?? []).map((s) => String(s ?? '').trim()).filter((s) => s !== '')),
  ).slice(0, 200); // ★ 1画面ぶんで足りる。★ 上限を置いて総当たりの道具にしない
  if (ids.length === 0) return { ok: true, data: {} };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();

  // 1. その日記が誰のものか
  const { data: posts, error: pErr } = await svc
    .from('diary_posts')
    .select('id, salon_id, therapist_id')
    .in('id', ids);
  if (pErr) return { ok: false, error: pErr.message };
  if (!posts || posts.length === 0) return { ok: true, data: {} };

  const salonIds = Array.from(new Set(posts.map((r) => Number((r as { salon_id: number }).salon_id))));
  const therapistIds = Array.from(new Set(posts.map((r) => Number((r as { therapist_id: number }).therapist_id))));

  // 2. 見てよい相手か（オーナー／本人／運営）
  const { data: salons } = await svc.from('salons').select('id, owner_id').in('id', salonIds);
  const ownedSalons = new Set(
    (salons ?? [])
      .filter((s) => (s as { owner_id: string | null }).owner_id === user.id)
      .map((s) => Number((s as { id: number }).id)),
  );
  const { data: mine } = await svc
    .from('therapists')
    .select('id')
    .eq('user_id', user.id)
    .in('id', therapistIds);
  const myTherapists = new Set((mine ?? []).map((t) => Number((t as { id: number }).id)));
  const isAdmin = user.id === ADMIN_UUID;

  const allowed = posts
    .filter((r) => {
      const p = r as { salon_id: number; therapist_id: number };
      return isAdmin || ownedSalons.has(Number(p.salon_id)) || myTherapists.has(Number(p.therapist_id));
    })
    .map((r) => String((r as { id: string }).id));
  if (allowed.length === 0) return { ok: true, data: {} };

  // 3. 取り込みの記録を引く
  const { data: rows, error: iErr } = await svc
    .from('salon_diary_imports')
    .select('diary_post_id, provider')
    .in('diary_post_id', allowed);
  if (iErr) return { ok: false, error: iErr.message };

  const out: Record<string, string> = {};
  for (const r of rows ?? []) {
    const id = (r as { diary_post_id: string | null }).diary_post_id;
    if (id) out[String(id)] = String((r as { provider: string }).provider);
  }
  return { ok: true, data: out };
}
