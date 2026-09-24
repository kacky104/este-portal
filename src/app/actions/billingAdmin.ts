'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { sendInvoiceMail } from '@/app/lib/billing/sendInvoiceMail';
import { createDraftsCore } from '@/app/lib/billing/createDrafts';
import {
  calcTotals, invoiceNo, isMonth, lineAmount, nextInvoiceSeq,
  type BillingLineInput,
} from '@/lib/billing';

// 請求書の管理（第816便・2026-09-25・カッキーさん）。★ すべて requireAdmin のあと service role で読み書きする。
// ★ 流れ: 契約（salon_billing_lines）→ 月の下書き（invoices.status='draft'）→ 確かめて「発行」→ 入金済み
// ★ 計算は src/lib/billing.ts（純粋関数・自己点検 npm run check:billing）。★ ここに計算を書かない。

type Err = { ok: false; error: string };
type Ok<T> = { ok: true } & T;

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}

export type BillingSettings = {
  issuer_name: string; issuer_address: string; issuer_tel: string; issuer_email: string;
  registration_no: string | null; bank_info: string; tax_rate_pct: number; due_day: number; note: string;
};
export type BillingItem = { id: number; name: string; unit_price: number; is_active: boolean; sort_order: number };
export type SalonProfile = { salon_id: number; recipient_name: string | null; billing_email: string | null; payment_method: 'transfer' | 'cash'; memo: string };
export type ContractLineRow = {
  id: number; salon_id: number; item_id: number | null; label: string; unit_price: number; quantity: number;
  start_month: string; end_month: string | null; sort_order: number;
};
export type InvoiceLineRow = { id?: number; label: string; unit_price: number; quantity: number; amount: number; sort_order: number };
export type InvoiceRow = {
  id: number; salon_id: number; invoice_no: string | null; billing_month: string; status: 'draft' | 'issued' | 'paid' | 'void';
  recipient_name: string; payment_method: 'transfer' | 'cash'; issue_date: string | null; due_date: string | null;
  subtotal: number; tax_amount: number; total: number; tax_rate_pct: number; issued_at: string | null;
  paid_at: string | null; paid_method: 'transfer' | 'cash' | null; admin_note: string; lines: InvoiceLineRow[];
};
export type BillingSalon = { id: number; name: string; is_hidden: boolean | null; listing_plan: string | null };

export type BillingAdminData = {
  settings: BillingSettings; items: BillingItem[]; salons: BillingSalon[];
  profiles: SalonProfile[]; lines: ContractLineRow[]; invoices: InvoiceRow[]; month: string;
};

const SETTINGS_COLS = 'issuer_name, issuer_address, issuer_tel, issuer_email, registration_no, bank_info, tax_rate_pct, due_day, note';
const INVOICE_COLS = 'id, salon_id, invoice_no, billing_month, status, recipient_name, payment_method, issue_date, due_date, subtotal, tax_amount, total, tax_rate_pct, issued_at, paid_at, paid_method, admin_note, invoice_lines(id, label, unit_price, quantity, amount, sort_order)';

type RawInvoice = Omit<InvoiceRow, 'lines'> & { invoice_lines: InvoiceLineRow[] | null };
function shapeInvoice(r: RawInvoice): InvoiceRow {
  const { invoice_lines, ...rest } = r;
  return { ...rest, lines: [...(invoice_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0)) };
}

function cleanInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[,，\s]/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// ── 読み込み ────────────────────────────────────────────
export async function getBillingAdmin(month: string): Promise<Ok<{ data: BillingAdminData }> | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  if (!isMonth(month)) return { ok: false, error: '月の形が正しくありません' };
  const svc = createServiceClient();
  const [st, it, sa, pr, li, iv] = await Promise.all([
    svc.from('billing_settings').select(SETTINGS_COLS).eq('id', 1).maybeSingle(),
    svc.from('billing_items').select('id, name, unit_price, is_active, sort_order').order('sort_order').order('id'),
    svc.from('salons').select('id, name, is_hidden, listing_plan').order('id'),
    svc.from('salon_billing_profiles').select('salon_id, recipient_name, billing_email, payment_method, memo'),
    svc.from('salon_billing_lines').select('id, salon_id, item_id, label, unit_price, quantity, start_month, end_month, sort_order').order('salon_id').order('sort_order').order('id'),
    svc.from('invoices').select(INVOICE_COLS).eq('billing_month', month).order('salon_id'),
  ]);
  const e = st.error ?? it.error ?? sa.error ?? pr.error ?? li.error ?? iv.error;
  if (e) return { ok: false, error: e.message };
  return {
    ok: true,
    data: {
      month,
      settings: (st.data as BillingSettings | null) ?? { issuer_name: '', issuer_address: '', issuer_tel: '', issuer_email: '', registration_no: null, bank_info: '', tax_rate_pct: 10, due_day: 25, note: '' },
      items: (it.data ?? []) as BillingItem[],
      salons: (sa.data ?? []) as BillingSalon[],
      profiles: (pr.data ?? []) as SalonProfile[],
      lines: (li.data ?? []) as ContractLineRow[],
      invoices: ((iv.data ?? []) as unknown as RawInvoice[]).map(shapeInvoice),
    },
  };
}

// ── 設定 ────────────────────────────────────────────────
export async function saveBillingSettings(input: BillingSettings): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const tax = cleanInt(input.tax_rate_pct); const due = cleanInt(input.due_day);
  if (tax === null || tax < 0 || tax > 100) return { ok: false, error: '税率は0〜100で入れてください' };
  if (due === null || due < 1 || due > 28) return { ok: false, error: '期限日は1〜28で入れてください' };
  const reg = (input.registration_no ?? '').trim();
  if (reg && !/^T\d{13}$/.test(reg)) return { ok: false, error: '登録番号は T＋13桁の数字で入れてください（無いときは空欄）' };
  const svc = createServiceClient();
  const { error } = await svc.from('billing_settings').upsert({
    id: 1, issuer_name: input.issuer_name.trim(), issuer_address: input.issuer_address.trim(),
    issuer_tel: input.issuer_tel.trim(), issuer_email: input.issuer_email.trim(), registration_no: reg || null,
    bank_info: input.bank_info.trim(), tax_rate_pct: tax, due_day: due, note: input.note.trim(), updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── 品目 ────────────────────────────────────────────────
export async function saveBillingItem(input: { id?: number; name: string; unit_price: number; is_active: boolean; sort_order: number }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const name = input.name.trim(); const price = cleanInt(input.unit_price);
  if (!name) return { ok: false, error: '品目名を入れてください' };
  if (price === null) return { ok: false, error: '金額を数字で入れてください' };
  const row = { name, unit_price: price, is_active: !!input.is_active, sort_order: cleanInt(input.sort_order) ?? 0 };
  const svc = createServiceClient();
  const { error } = input.id ? await svc.from('billing_items').update(row).eq('id', input.id) : await svc.from('billing_items').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── 店舗の請求先 ────────────────────────────────────────
export async function saveSalonProfile(input: SalonProfile): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const email = (input.billing_email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'メールアドレスの形が正しくありません' };
  const svc = createServiceClient();
  const { error } = await svc.from('salon_billing_profiles').upsert({
    salon_id: input.salon_id, recipient_name: (input.recipient_name ?? '').trim() || null, billing_email: email || null,
    payment_method: input.payment_method === 'cash' ? 'cash' : 'transfer', memo: (input.memo ?? '').trim(), updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── 店舗の契約の行（割引はマイナス）─────────────────────
export async function saveContractLine(input: Omit<ContractLineRow, 'id'> & { id?: number }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const label = input.label.trim(); const price = cleanInt(input.unit_price); const qty = cleanInt(input.quantity);
  if (!label) return { ok: false, error: '品名を入れてください' };
  if (price === null) return { ok: false, error: '金額を数字で入れてください（割引はマイナス）' };
  if (qty === null || qty < 1) return { ok: false, error: '数量は1以上で入れてください' };
  if (!isMonth(input.start_month)) return { ok: false, error: '開始月を選んでください' };
  if (input.end_month && (!isMonth(input.end_month) || input.end_month < input.start_month)) return { ok: false, error: '終了月は開始月より後にしてください' };
  const row = {
    salon_id: input.salon_id, item_id: input.item_id ?? null, label, unit_price: price, quantity: qty,
    start_month: input.start_month, end_month: input.end_month || null, sort_order: cleanInt(input.sort_order) ?? 0,
  };
  const svc = createServiceClient();
  const { error } = input.id ? await svc.from('salon_billing_lines').update(row).eq('id', input.id) : await svc.from('salon_billing_lines').insert(row);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteContractLine(id: number): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc.from('salon_billing_lines').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ★ 本体は src/app/lib/billing/createDrafts.ts（'use server' の外＝ブラウザから直接は呼べない）
export async function createDrafts(month: string) {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  return createDraftsCore(month);
}

// ── 下書きの手直し（明細・宛名・支払い方法・メモ）─────────
export async function saveDraft(input: {
  id: number; recipient_name: string; payment_method: 'transfer' | 'cash'; admin_note: string;
  lines: { label: string; unit_price: number; quantity: number }[];
}): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data: cur, error: ce } = await svc.from('invoices').select('status, tax_rate_pct').eq('id', input.id).maybeSingle();
  if (ce) return { ok: false, error: ce.message };
  if (!cur) return { ok: false, error: '請求書が見つかりません' };
  if (cur.status !== 'draft') return { ok: false, error: '下書きのときだけ直せます' };
  const lines: BillingLineInput[] = [];
  for (const l of input.lines) {
    const label = l.label.trim(); const price = cleanInt(l.unit_price); const qty = cleanInt(l.quantity);
    if (!label && !price) continue;
    if (!label) return { ok: false, error: '品名が空の行があります' };
    if (price === null) return { ok: false, error: `「${label}」の金額を数字で入れてください` };
    if (qty === null || qty < 1) return { ok: false, error: `「${label}」の数量は1以上で入れてください` };
    lines.push({ label, unit_price: price, quantity: qty });
  }
  if (lines.length === 0) return { ok: false, error: '明細を1行以上入れてください' };
  if (!input.recipient_name.trim()) return { ok: false, error: '宛名を入れてください' };
  const t = calcTotals(lines, cur.tax_rate_pct as number);
  const { error: de } = await svc.from('invoice_lines').delete().eq('invoice_id', input.id);
  if (de) return { ok: false, error: de.message };
  const { error: le } = await svc.from('invoice_lines').insert(lines.map((l, i) => ({ invoice_id: input.id, ...l, amount: lineAmount(l), sort_order: i })));
  if (le) return { ok: false, error: le.message };
  const { error } = await svc.from('invoices').update({
    recipient_name: input.recipient_name.trim(), payment_method: input.payment_method === 'cash' ? 'cash' : 'transfer',
    admin_note: input.admin_note.trim(), subtotal: t.subtotal, tax_amount: t.tax, total: t.total, updated_at: new Date().toISOString(),
  }).eq('id', input.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteDraft(id: number): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc.from('invoices').delete().eq('id', id).eq('status', 'draft');
  return error ? { ok: false, error: error.message } : { ok: true };
}

// ── 発行 ────────────────────────────────────────────────
//   ★ 番号を付け・発行者の設定を丸ごと写し・発行日を入れる。★ そのあとメール（失敗しても発行は戻さない）
export async function issueInvoice(id: number): Promise<{ ok: true; mail: string } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data: inv, error: ie } = await svc.from('invoices').select('id, salon_id, status, billing_month, recipient_name, total, due_date').eq('id', id).maybeSingle();
  if (ie) return { ok: false, error: ie.message };
  if (!inv) return { ok: false, error: '請求書が見つかりません' };
  if (inv.status !== 'draft') return { ok: false, error: 'この請求書はもう発行されています' };
  const { data: st } = await svc.from('billing_settings').select(SETTINGS_COLS).eq('id', 1).maybeSingle();
  if (!st || !st.issuer_name) return { ok: false, error: '先に「発行者の設定」で屋号を入れてください' };
  const month = inv.billing_month as string;
  let no = '';
  for (let tries = 0; tries < 5; tries++) {
    const { data: nos } = await svc.from('invoices').select('invoice_no').eq('billing_month', month).not('invoice_no', 'is', null);
    no = invoiceNo(month, nextInvoiceSeq(month, (nos ?? []).map((r) => r.invoice_no as string)));
    const { error: ue, data: upd } = await svc.from('invoices').update({
      invoice_no: no, status: 'issued', issue_date: jstTodayYmd(), issuer_snapshot: st,
      issued_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', id).eq('status', 'draft').select('id');
    if (!ue) { if (!upd || upd.length === 0) return { ok: false, error: 'ほかの画面で先に発行されました' }; break; }
    if (ue.code !== '23505') return { ok: false, error: ue.message };
    if (tries === 4) return { ok: false, error: '請求番号を付けられませんでした。もう一度押してください' };
  }
  // ★ 送り先: 請求先のメール → 無ければオーナーのログインメール
  let to = '';
  const { data: prof } = await svc.from('salon_billing_profiles').select('billing_email').eq('salon_id', inv.salon_id).maybeSingle();
  to = (prof?.billing_email as string | null) ?? '';
  if (!to) {
    const { data: s } = await svc.from('salons').select('owner_id').eq('id', inv.salon_id).maybeSingle();
    if (s?.owner_id) { const { data: u } = await svc.auth.admin.getUserById(s.owner_id as string); to = u?.user?.email ?? ''; }
  }
  const r = await sendInvoiceMail({
    to, recipientName: inv.recipient_name as string, billingMonth: month, invoiceNo: no,
    total: inv.total as number, dueDate: inv.due_date as string, invoiceId: id,
  });
  return { ok: true, mail: r.ok ? `メールを送りました（${to}）` : `発行しましたが、メールは送れませんでした：${r.error}` };
}

// ── 入金・取り消し ──────────────────────────────────────
export async function markPaid(id: number, method: 'transfer' | 'cash', paidYmd: string): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidYmd)) return { ok: false, error: '入金日を選んでください' };
  const svc = createServiceClient();
  const { error } = await svc.from('invoices').update({
    status: 'paid', paid_method: method === 'cash' ? 'cash' : 'transfer', paid_at: `${paidYmd}T12:00:00+09:00`, updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'issued');
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function unmarkPaid(id: number): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc.from('invoices').update({ status: 'issued', paid_method: null, paid_at: null, updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'paid');
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function voidInvoice(id: number): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin(); if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc.from('invoices').update({ status: 'void', updated_at: new Date().toISOString() }).eq('id', id).in('status', ['issued', 'paid']);
  return error ? { ok: false, error: error.message } : { ok: true };
}
