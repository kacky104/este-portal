// フクエスCRM「連絡文のひな形」（第1947便）: 本日スケジュールの予約 → 置き換えに使う中身。
// ★ スケジュール画面（予約の「連絡文▼」）と設定画面（プレビュー）の両方で使う。
import { paymentLabel, type CrmScheduleBooking, type CrmScheduleData } from '@/app/lib/crm/types';
import type { CrmMessageContext } from '@/lib/crmMessage';

export type CrmMessageExtras = {
  salonName: string;
  salonTel: string;
  prev: { date: string; priceTotal: number | null; nomination: string } | null;
};

export function crmMessageContextOf(
  b: CrmScheduleBooking,
  data: Pick<CrmScheduleData, 'date' | 'therapists' | 'workDays'> & { settings?: Pick<CrmScheduleData['settings'], 'customToggles'> | null },
  extras: CrmMessageExtras | null,
): CrmMessageContext {
  const t = b.therapistId == null ? null : data.therapists.find((x) => x.id === b.therapistId) ?? null;
  const wd = b.therapistId == null ? null : data.workDays?.[b.therapistId] ?? null;
  const toggles: Record<string, string> = {};
  for (const tg of data.settings?.customToggles ?? []) {
    const v = wd?.toggles?.[tg.id];
    toggles[tg.title] = v ? String(v) : '';
  }
  const c = b.customer;
  return {
    date: data.date,
    slotStartISO: b.slotStartISO,
    slotEndISO: b.slotEndISO,
    therapistId: b.therapistId,
    therapistName: t?.name ?? '',
    courseName: b.courseName,
    courseMin: b.courseMin,
    customerName: c?.name || b.customerName || '',
    items: b.items.map((i) => ({ kind: i.kind, name: i.name, minutes: i.minutes, price: i.price, pay: i.pay })),
    priceTotal: b.priceTotal,
    payTotal: b.payTotal,
    pointsYen: b.pointsYen,
    paymentLabel: b.paymentMethod ? paymentLabel(b.paymentMethod, b.paymentSplit) : '',
    note: b.note || '',
    source: b.source,
    ordinal: b.ordinal,
    visits: c ? c.stats.visits : null,
    cancels: c ? c.stats.cancels : null,
    badCancels: c ? c.stats.badCancels : null,
    cautionMemo: c?.cautionMemo ?? '',
    room: wd?.room ?? '',
    toggles,
    salonName: extras?.salonName ?? '',
    salonTel: extras?.salonTel ?? '',
    prev: extras?.prev ?? null,
  };
}

/** クリップボードへ（https でない・古いブラウザでは textarea で） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 下へ */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
