import type { createServiceClient } from '@/app/lib/supabase/service';

// コネックエフ: セラピストの並び順（第1384便・2026-10-10・カッキーさん）。★ サーバー専用（service_role）。
//
// ★ 表は conecf_girl_order（店ごとに1行・therapist_ids ＝ 公開中の方の id を上から順に）。追加SQL_第1384便。
// ★ 並べ方の決まりは lib/therapistOrder.ts の sortTherapistsByManual（純粋関数・番人 check:therapistorder）。
//   ・並びに入っていない公開中の方（新しく登録した方）はいちばん上／非公開の方は下／行が無い店は あいうえお順。
// ★ therapists の行には触らない（updated_at を動かさない）。
// ★ 表が無い（SQL がまだ）・読めなかったときは [] を返す＝今までどおり あいうえお順で出す（画面を止めない）。

type Svc = ReturnType<typeof createServiceClient>;

/** 「表が無い」の番号: 42P01（Postgres）／PGRST205（PostgREST の表の一覧に無い） */
export function isMissingOrderTable(code: string | null | undefined): boolean {
  return code === '42P01' || code === 'PGRST205';
}

/** その店の並び（上から順の therapist の id）。無ければ [] */
export async function readConecfGirlOrder(svc: Svc, salonId: number): Promise<number[]> {
  const { data, error } = await svc
    .from('conecf_girl_order')
    .select('therapist_ids')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) {
    if (!isMissingOrderTable(error.code)) console.error('[conecf] 並び順を読めなかった（あいうえお順で出す）', salonId, error.code, error.message);
    return [];
  }
  const raw = (data?.therapist_ids as unknown[] | null) ?? [];
  return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}
