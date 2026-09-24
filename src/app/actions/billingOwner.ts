'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import type { SheetInvoice, SheetIssuer } from '@/app/components/billing/InvoiceSheet';

// 店舗オーナーの請求書（第816便）。★ ログイン中の人の client で読む＝RLS が【自分の店の・発行済みの】だけに絞る。

export type MyInvoiceListItem = {
  id: number; invoice_no: string | null; billing_month: string; status: 'issued' | 'paid' | 'void';
  total: number; due_date: string | null; issue_date: string | null;
};

export async function getMyInvoices(): Promise<{ ok: true; items: MyInvoiceListItem[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_no, billing_month, status, total, due_date, issue_date')
    .order('billing_month', { ascending: false })
    .order('id', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, items: (data ?? []) as MyInvoiceListItem[] };
}

export async function getMyInvoice(id: number): Promise<{ ok: true; invoice: SheetInvoice & { id: number }; issuer: SheetIssuer } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  // ★ 第820便: 運営（ADMIN_UUID）は、どの店の請求書も開ける（★ メールのリンクを運営が押すと 404 になっていた）。
  //   ★ 店舗オーナーは今までどおり RLS で【自分の店の・発行済みの】だけ。
  const reader = user.id === ADMIN_UUID ? createServiceClient() : supabase;
  const { data, error } = await reader
    .from('invoices')
    .select('id, invoice_no, billing_month, status, recipient_name, payment_method, issue_date, due_date, subtotal, tax_amount, total, tax_rate_pct, issuer_snapshot, invoice_lines(label, unit_price, quantity, amount, sort_order)')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'この請求書は、発行した店舗のアカウントでログインすると見られます。' };
  const { invoice_lines, issuer_snapshot, ...rest } = data as unknown as SheetInvoice & { id: number; issuer_snapshot: SheetIssuer | null; invoice_lines: (SheetInvoice['lines'][number] & { sort_order: number })[] };
  const empty: SheetIssuer = { issuer_name: '', issuer_address: '', issuer_tel: '', issuer_email: '', registration_no: null, bank_info: '', note: '' };
  return {
    ok: true,
    invoice: { ...rest, lines: [...(invoice_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order) },
    issuer: { ...empty, ...(issuer_snapshot ?? {}) },
  };
}
