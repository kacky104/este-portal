import { cache } from 'react';
import { createPublicClient } from '@/app/lib/supabase/public';
import type { AreaSalonRow } from '@/app/lib/areas';

// エリアごとの店の数を数えるための、いちばん軽い読み取り（第1396便・2026-10-11・カッキーさん）。
//
// ★ 何のため: お店が 0件のエリアページ（/area/…）と、そのエリアの出勤中（/working/…）を、
//   Google に登録しない・サイトマップに載せない、を決めるために「そのエリアに店が何件あるか」だけ知りたい。
//   10/11 の時点で、北九州・小倉／久留米／その他福岡／出張 の4つが 0店（「このエリアの掲載店舗はまだありません」）なのに、
//   登録してよい設定のままサイトマップに載っていた。
// ★ 読むのは3列だけ（area・area2・dispatch_type）。条件は一覧（lib/salons.ts の fetchSalons）と同じ:
//   非表示でない・listing_plan が standard（無料掲載の店は、地域の一覧に出ないので数えない）。
//   ★ fetchSalons の条件を変えたら、ここも変える（数と画面がずれる）。
// ★ 読めなかったときは null（＝分からない）。★ 分からないときに「0店」と決めつけない
//   （読み取りの不調で、店のあるエリアまで検索から外さないため。判定は areas.ts の isAreaPageIndexable）。
// ★ cache(): 同じ描画の中（generateMetadata と本体）で2回呼んでも、DB へは1回。
export const fetchAreaSalonRows = cache(async (): Promise<AreaSalonRow[] | null> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('salons')
    .select('area, area2, dispatch_type')
    .eq('is_hidden', false)
    .eq('listing_plan', 'standard');
  if (error) {
    console.error('[area] エリアごとの店の数を読めなかった（検索に出す側に倒す）', error.code, error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    area: (r.area as string | null) ?? '',
    area2: (r.area2 as string | null) ?? null,
    dispatchType: (r.dispatch_type as string | null) ?? 'none',
  }));
});
