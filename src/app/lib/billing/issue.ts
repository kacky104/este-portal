import { createServiceClient } from '@/app/lib/supabase/service';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { sendInvoiceMail } from '@/app/lib/billing/sendInvoiceMail';
import { invoiceNo, nextInvoiceSeq } from '@/lib/billing';

// 請求書の発行（第816便 → 第825便で actions から切り出し）。★ 'use server' の外＝ブラウザから直接は呼べない。
// ★ 呼ぶのは billingAdmin.ts（requireAdmin のあと）だけ。

const SETTINGS_COLS = 'issuer_name, issuer_address, issuer_tel, issuer_email, registration_no, bank_info, tax_rate_pct, due_day, note';

// ── 発行 ────────────────────────────────────────────────
//   ★ 番号を付け・発行者の設定を丸ごと写し・発行日を入れる。★ そのあとメール（失敗しても発行は戻さない）
export async function issueInvoiceCore(id: number): Promise<{ ok: true; mail: string } | { ok: false; error: string }> {
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

