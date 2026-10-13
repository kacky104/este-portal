// 楽天口座の入金明細を読んで、請求書の候補を付ける（第1437便・2026-10-13・カッキーさん）。★ サーバー専用。
//   ・読むのはマネーフォワード（lib/billing/mfApi.ts・GET だけ）。書くのは自分の DB（bank_deposits）だけ
//   ・一度読んだ明細（mf_id）は二度と足さない＝決めたものを上書きしない
//   ・★ 入金済みにはしない（AUTO_MARK_PAID = false の間は、候補を付けるだけ）
import { createServiceClient } from '@/app/lib/supabase/service';
import { jstTodayYmd } from '@/app/lib/salonStats';
import { mfGet, firstArray } from '@/app/lib/billing/mfApi';
import { isNotPayment, suggestInvoice, type InvoiceCand } from '@/lib/bankDeposit';

const DAYS = 14;

function addDays(ymd: string, d: number): string {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + d);
  return t.toISOString().slice(0, 10);
}

/** 入金待ちの請求書（金額と振込名義） */
export async function issuedInvoiceCands(svc: ReturnType<typeof createServiceClient>): Promise<InvoiceCand[]> {
  const [{ data: invs }, { data: profs }] = await Promise.all([
    svc.from('invoices').select('id, salon_id, total').eq('status', 'issued'),
    svc.from('salon_billing_profiles').select('salon_id, transfer_name'),
  ]);
  const nameOf = new Map((profs ?? []).map((p) => [Number(p.salon_id), String(p.transfer_name ?? '')]));
  return (invs ?? []).map((i) => ({ id: Number(i.id), total: Number(i.total), transferName: nameOf.get(Number(i.salon_id)) ?? '' }));
}

export type SyncResult = { ok: true; read: number; added: number; pending: number } | { ok: false; error: string };

export async function syncBankDeposits(): Promise<SyncResult> {
  const svc = createServiceClient();
  const today = jstTodayYmd();
  let rows: Record<string, unknown>[];
  try {
    const accounts = firstArray(await mfGet('/connected_accounts'));
    const rakuten = accounts.find((a) => String(a.name ?? '').includes('楽天銀行'));
    if (!rakuten) return { ok: false, error: 'マネーフォワードに楽天銀行の口座が見つかりません' };
    rows = firstArray(await mfGet('/transactions', {
      start_date: addDays(today, -DAYS), end_date: today, side: 'INCOME', order: 'asc', per_page: 500,
      connected_account_id: String(rakuten.id),
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const ids = rows.map((r) => String(r.id ?? '')).filter(Boolean);
  if (ids.length === 0) return { ok: true, read: 0, added: 0, pending: 0 };
  const { data: known, error: ke } = await svc.from('bank_deposits').select('mf_id').in('mf_id', ids);
  if (ke) return { ok: false, error: ke.code === '42P01' || ke.code === 'PGRST205' ? '表 bank_deposits が無い（追加SQL_第1437便がまだ）' : ke.message };
  const seen = new Set((known ?? []).map((k) => String(k.mf_id)));
  const cands = await issuedInvoiceCands(svc);

  const add = rows
    .filter((r) => r.id && !seen.has(String(r.id)) && String(r.side ?? 'INCOME') === 'INCOME')
    .map((r) => {
      const content = String(r.content ?? '');
      const amount = Math.round(Number(r.value ?? 0));
      const skip = isNotPayment(content);
      const sug = skip ? null : suggestInvoice({ amount, content }, cands);
      return {
        mf_id: String(r.id), deposit_date: String(r.date ?? today).slice(0, 10), amount, content,
        status: skip ? 'ignored' : 'pending',
        suggested_invoice_id: sug?.invoiceId ?? null, suggest_reason: sug?.reason ?? null,
        decided_at: skip ? new Date().toISOString() : null,
      };
    });
  if (add.length > 0) {
    const { error } = await svc.from('bank_deposits').upsert(add, { onConflict: 'mf_id', ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, read: rows.length, added: add.length, pending: add.filter((a) => a.status === 'pending').length };
}
