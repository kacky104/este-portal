import { createServiceClient } from '@/app/lib/supabase/service';

// コネックエフのメニューに出すかの判定（運営がその店で ON にしているか）。★ サーバー専用。
// ★ 第1957便（総点検の整理）: 前は各 actions ファイル（'use server'）から export していた＝店の番号を渡せば
//   ログインの確認なしで「その店でその機能が ON か」を外から聞けた。受け口ではなく、ここ（ただの関数）に移した。
//   呼ぶのは actions/conecf.ts（getConecfShellState・自分の店を引いたあと）と conecfEkichikaMovies.ts だけ。

/** ★ コネックエフのメニューに出すか（運営が1つでも ON にしている）。読めなければ出さない */
export async function hasConecfEsutamaOptions(salonId: number): Promise<boolean> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc.from('conecf_esutama_options').select('option_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    if (!error && (data ?? []).length > 0) return true;
    // ★ 第1811便: 投稿（リアルタイム集客）だけ ON の店も出す
    const p = await svc.from('conecf_esutama_posts').select('post_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    if (!p.error && (p.data ?? []).length > 0) return true;
    // ★ 第1941便: 写メNote だけ ON の店も出す
    const nt = await svc.from('conecf_esutama_notes').select('salon_id').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !nt.error && (nt.data ?? []).length > 0;
  } catch { return false; }
}

/** ★ コネックエフのメニューに出すか（運営が1つでも ON にしている）。読めなければ出さない */
export async function hasConecfZenkokuOptions(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_zenkoku_options').select('option_key').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

/** ★ コネックエフのメニューに出すか（運営が ON にしている）。読めなければ出さない */
export async function hasConecfVanillaBlog(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_vanilla_blog').select('salon_id').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

/** ★ コネックエフのメニューに出すか */
export async function hasConecfEkichikaMovies(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_ekichika_movies').select('slot').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

/** ★ コネックエフのメニューに出すか */
export async function hasConecfEkichikaMagazines(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_ekichika_magazines').select('slot').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}

/** ★ コネックエフのメニューに出すか */
export async function hasConecfEkichikaRankImages(salonId: number): Promise<boolean> {
  try {
    const { data, error } = await createServiceClient().from('conecf_ekichika_rankimgs').select('slot').eq('salon_id', salonId).eq('admin_enabled', true).limit(1);
    return !error && (data ?? []).length > 0;
  } catch { return false; }
}
