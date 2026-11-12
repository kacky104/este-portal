'use server';

import { CRM_TERMS_VERSION } from '@/app/lib/crm/terms';
import { dbMessage } from '@/app/lib/crm/dbError';
import { headers } from 'next/headers';
import { crmGroupTableMissing } from '@/app/lib/crm/groupAlerts';
import { parsePaymentSplit, paymentLabel } from '@/app/lib/crm/types';
import { assertCrm, readFail, readAll, therapistNames, displayTel } from '@/app/lib/crm/server/core';

// ── 規約への同意・お客様の削除・書き出し（第569便・2026-09-20）──────────────

/** 今の版の規約・顧客データの取り扱いに同意する（オーナー本人だけ） */
export async function agreeCrmTerms(salonId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!CRM_TERMS_VERSION) return { ok: true };
  const auth = await assertCrm(salonId, { skipTerms: true }); // ★ 同意そのものは、同意前でも通す
  if (!auth.ok) return auth;
  const ua = ((await headers()).get('user-agent') ?? '').slice(0, 300);
  const { error } = await auth.svc.from('crm_terms_agreements')
    .upsert({ salon_id: salonId, version: CRM_TERMS_VERSION, agreed_by: auth.userId, user_agent: ua }, { onConflict: 'salon_id,version', ignoreDuplicates: true });
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

/**
 * お客様を台帳から消す（お客様から削除を頼まれたときなど）。
 * その人の予約は名前「削除済み」・電話なし・備考なし・customer_id なしにし、その予約の同意書も消す（金額・日時は残す）。
 * ★ 第1220便（カッキーさん）: 電話を 0000000000 にしていた → ''（空）に。
 *   0000000000 は10桁なので「電話番号らしい」判定（crmPhone）を通り、その予約を後で開いて保存すると
 *   「削除済み」という顧客が作られて削除済み全員の予約が1人に名寄せされる道があった。予約一覧にもそのまま出ていた。
 *   ★ customer_id も null に（消した顧客を指したまま残っていた）。
 */
export async function deleteCrmCustomer(
  salonId: number,
  customerId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const { data: c } = await svc.from('salon_customers').select('id').eq('salon_id', salonId).eq('id', customerId).maybeSingle();
  if (!c) return { ok: false, error: 'お客様が見つかりません' };
  // ★ 第1325便: このお客様をグループ・提携店へ共有していたら、先に取り下げる（台帳から消したのに、共有だけ残さない）。
  //   ★ 取り下げられなかったら、消さない（消すと customer_id が外れて、台帳から取り下げる道が無くなる）。
  //   ★★ 先に【読んで】確かめる。表がまだ無い（追加SQL_第1324便の前）ときは、共有そのものが無いので、そのまま消す。
  //      いきなり update すると、表が無いときに中身の無いエラーが返る版があり、見分けられずに「消せない」になる（手元で確かめた）。
  {
    const shared = await svc.from('crm_group_alerts').select('id, group_id')
      .eq('salon_id', salonId).eq('customer_id', customerId).is('withdrawn_at', null);
    if (shared.error && !crmGroupTableMissing(shared.error, shared.status)) {
      return { ok: false, error: '関連する記録を確かめられなかったので、削除していません。もう一度お試しください' };
    }
    const alive = shared.error ? [] : (shared.data ?? []);
    if (alive.length > 0) {
      const { error: wErr } = await svc.from('crm_group_alerts')
        .update({ withdrawn_at: new Date().toISOString(), withdrawn_by: auth.userId, withdrawn_reason: 'customer_deleted' })
        .eq('salon_id', salonId).in('id', alive.map((w) => Number(w.id))).is('withdrawn_at', null);
      if (wErr) return { ok: false, error: '関連する記録を整理できなかったので、削除していません。もう一度お試しください' };
      // 記録（★ 電話番号・名前・内容は入れない。書けなくても削除は止めない）
      for (const w of alive) {
        const { error: lErr } = await svc.from('crm_group_logs').insert({
          group_id: Number(w.group_id), salon_id: salonId, alert_id: Number(w.id), action: 'alert_withdraw',
          actor: 'owner:' + auth.userId, detail: { reason: 'customer_deleted' },
        });
        if (lErr) console.error('[crm] グループ共有の記録を書けなかった', Number(w.id), lErr.message);
      }
    }
  }
  let bookingIds: string[];
  try {
    const ids = await readAll<Record<string, unknown>>((from, to) =>
      svc.from('salon_bookings').select('id').eq('salon_id', salonId).eq('customer_id', customerId).order('id').range(from, to));
    bookingIds = ids.map((r) => String(r.id));
  } catch (e) {
    return readFail(e); // ★ 2026-10-09 点検#10: 予約を読めなかった回は、顧客行も消さない
  }
  for (let i = 0; i < bookingIds.length; i += 300) {
    const chunk = bookingIds.slice(i, i + 300);
    const { error: cErr } = await svc.from('crm_consents').delete().eq('salon_id', salonId).in('booking_id', chunk);
    if (cErr) return { ok: false, error: dbMessage(cErr) }; // ★ 2026-10-09 点検#10: 同意書を消せなかったら止める
    const { error } = await svc.from('salon_bookings')
      .update({ customer_name: '削除済み', customer_tel: '', customer_id: null, note: null })
      .eq('salon_id', salonId).in('id', chunk);
    if (error) return { ok: false, error: dbMessage(error) };
  }
  const { error } = await svc.from('salon_customers').delete().eq('salon_id', salonId).eq('id', customerId);
  if (error) return { ok: false, error: dbMessage(error) };
  return { ok: true };
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
function jst(iso: unknown): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(String(iso)));
}

/** 店舗データの書き出し（CSV・Excel で開けるよう先頭に BOM を付けるのは画面側） */
async function exportCrmCsvInner(
  salonId: number,
  kind: 'customers' | 'bookings',
): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  const auth = await assertCrm(salonId);
  if (!auth.ok) return auth;
  const svc = auth.svc;
  const names = await therapistNames(svc, salonId);
  if (kind === 'customers') {
    const cs = await readAll<Record<string, unknown>>((from, to) =>
      svc.from('salon_customers').select('id, name, name_kana, category, member_no, ng_therapist_ids, caution_memo, memo, created_at, updated_at')
        .eq('salon_id', salonId).order('id').range(from, to));
    const ph = await readAll<Record<string, unknown>>((from, to) =>
      svc.from('salon_customer_phones').select('customer_id, phone').eq('salon_id', salonId).order('id').range(from, to));
    const phones = new Map<number, string[]>();
    ph.forEach((p) => { const k = Number(p.customer_id); phones.set(k, [...(phones.get(k) ?? []), String(p.phone)]); });
    const label: Record<string, string> = { general: '一般', ng: '出禁' }; // ★ 第1742便: 会員・常連・VIP はやめた → 一般
    const rows: unknown[][] = [['顧客ID', '名前', 'フリガナ', '電話番号', '分類', '女子NG', '要注意メモ', 'メモ', '登録日時', '更新日時']];
    cs.forEach((c) => rows.push([
      c.id, c.name, c.name_kana, (phones.get(Number(c.id)) ?? []).join(' / '), label[String(c.category)] ?? '一般',
      ((c.ng_therapist_ids as number[] | null) ?? []).map((id) => names.get(Number(id)) ?? id).join(' / '),
      c.caution_memo, c.memo, jst(c.created_at), jst(c.updated_at),
    ]));
    return { ok: true, csv: toCsv(rows), count: cs.length };
  }
  const bs = await readAll<Record<string, unknown>>((from, to) =>
    svc.from('salon_bookings')
      .select('id, slot_start, slot_end, therapist_id, course_name, customer_name, customer_tel, status, cancel_bad, price_total, pay_total, payment_method, payment_split, received_by, source, note, customer_id')
      .eq('salon_id', salonId).order('slot_start').range(from, to));
  const st: Record<string, string> = { new: '未確定', confirmed: '確定', cancelled: 'キャンセル' };
  const rcv: Record<string, string> = { '': '', therapist: '女子が受領', shop: 'お店が受領' };
  const rows: unknown[][] = [['予約ID', '開始', '終了', '担当', 'コース', '名前', '電話番号', '状態', '悪質', '料金', '女子報酬', '支払い', '受領', '入り口', '備考', '顧客ID']];
  bs.forEach((b) => rows.push([
    b.id, jst(b.slot_start), jst(b.slot_end), b.therapist_id == null ? 'フリー' : names.get(Number(b.therapist_id)) ?? b.therapist_id,
    b.course_name, b.customer_name, displayTel(b.customer_tel), st[String(b.status)] ?? b.status, b.cancel_bad ? '悪質' : '', // ★ 2026-10-09 点検#8: 削除済み（0000000000）は出さない
    b.price_total, b.pay_total, paymentLabel(String(b.payment_method ?? ''), parsePaymentSplit(b.payment_split)), rcv[String(b.received_by ?? '')] ?? '', b.source === 'web' ? 'フクエス' : '店で受付', b.note, b.customer_id,
  ]));
  return { ok: true, csv: toCsv(rows), count: bs.length };
}

/** ★ 第596便から画面では使っていない。規約 第7条3（やめるときの書き出し）のために残してある（settings/page.tsx の注記） */
/** ★ 2026-10-09 点検#10: readAll が投げるようになったので、ここで受けて ok:false にする */
export async function exportCrmCsv(...args: Parameters<typeof exportCrmCsvInner>): ReturnType<typeof exportCrmCsvInner> {
  try {
    return await exportCrmCsvInner(...args);
  } catch (e) {
    return readFail(e);
  }
}
