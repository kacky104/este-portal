import { revalidatePath } from 'next/cache';

// ★ 第1555便（2026-10-18・カッキーさん）: セラピストの並び（conecf_girl_order）を保存したら、
//   フクエスの店舗トップと在籍一覧を作り直す（どちらも同じ並びで出すため）。★ 失敗しても保存は止めない。
export function revalidateSalonTherapistOrder(salonId: number): void {
  try {
    revalidatePath(`/salon/${salonId}`);
    revalidatePath(`/salon/${salonId}/therapists`);
  } catch { /* 何もしない（ISR の時間が来れば反映される） */ }
}
