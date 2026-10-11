import { cookies } from 'next/headers';
import { ADMIN_UUID } from '@/app/lib/admin';
import { CONECF_ACT_COOKIE, actingSalonIdFor } from '@/lib/conecfActing';

// コネックエフ: 「いま操作する店」をどれにするか（第1399便・2026-10-11・カッキーさん）。
// ★ 決めごとは src/lib/conecfActing.ts。ここは cookie を読んで当てるだけ。
//
// ★★★ コネックエフの server action は、どれも最初に「ログインした人の店」を1件読む。
//   その読み方を1か所にそろえる（scopeConecfSalon）:
//     ・ふつう（店舗様）          … 今までどおり owner_id = 自分・非表示でない店を先・id の若い順で1件
//     ・運営が店を選んでいるとき … その店（id）
//   ★ 店舗様のときは cookie を見ない（operatorActingSalonId が運営アカウント以外に必ず null を返す）。
//   ★ 読み取りは増えない（cookie を読むだけ。DB への問い合わせは今までと同じ1本）。

/** 運営として操作中の店の番号。★ 運営アカウント以外は必ず null */
export async function operatorActingSalonId(userId: string | null | undefined): Promise<number | null> {
  if (!userId || userId !== ADMIN_UUID) return null;   // ★ 先に見る（店舗様のときは cookie に触りもしない）
  try {
    const store = await cookies();
    return actingSalonIdFor({ userId, adminUuid: ADMIN_UUID, cookie: store.get(CONECF_ACT_COOKIE)?.value });
  } catch {
    // ★ cookie を読めない場所から呼ばれたとき（無いはず）は「選んでいない」＝今までどおり自分の店
    return null;
  }
}

// ★ salons への問い合わせ（supabase の組み立て途中の形）から、ここで使う2つだけを取り出した形。
//   ★ 型の引数に条件を付けない（supabase の型は深く、条件を付けると型の計算が終わらなくなる＝TS2589）。
//     受け取った形のまま返すので、呼ぶ側の型（select した列）はそのまま残る。
type SalonQuery = {
  eq(column: string, value: string | number): SalonQuery;
  order(column: string, options: { ascending: boolean }): SalonQuery;
};

/**
 * salons への問い合わせに「どの店か」の条件を付ける。★ このあとに .limit(1).maybeSingle() を続ける。
 *   actingId が null … owner_id = userId・非表示でない店を先・id の若い順（今までと同じ並び）
 *   actingId がある … id = actingId
 */
export function scopeConecfSalon<Q>(query: Q, userId: string, actingId: number | null): Q {
  const q = query as unknown as SalonQuery;
  const scoped = actingId != null
    ? q.eq('id', actingId)
    : q.eq('owner_id', userId).order('is_hidden', { ascending: true }).order('id', { ascending: true });
  return scoped as unknown as Q;
}
