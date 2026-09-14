import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 無料掲載枠（listing_plan='free'）の店はサブページを持たない＝404（第368便）。 */
export async function notFoundIfFreeListing(supabase: SupabaseClient, salonId: number): Promise<void> {
  const { data } = await supabase.from('salons').select('listing_plan').eq('id', salonId).maybeSingle();
  if (data && data.listing_plan === 'free') notFound();
}
