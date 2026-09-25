'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

// 運営からのお知らせの管理（第862便）。★ 書くのは運営だけ（requireAdmin のあと service role）。
// ★ 店舗が読むのはブラウザから（RLS: 店舗オーナー・公開のものだけ）。

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}

export type OpsNoticeAdminRow = {
  id: number; notice_date: string; title: string; body: string;
  is_published: boolean; published_at: string | null; updated_at: string;
};

export async function listOpsNoticesAdmin(): Promise<{ ok: true; rows: OpsNoticeAdminRow[] } | Err> {
  const a = await requireAdmin(); if (!a.ok) return a;
  const { data, error } = await createServiceClient()
    .from('ops_notices')
    .select('id, notice_date, title, body, is_published, published_at, updated_at')
    .order('notice_date', { ascending: false })
    .order('id', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, rows: (data ?? []) as OpsNoticeAdminRow[] };
}

export async function saveOpsNotice(input: {
  id?: number; notice_date: string; title: string; body: string; is_published: boolean;
}): Promise<{ ok: true; id: number } | Err> {
  const a = await requireAdmin(); if (!a.ok) return a;
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'タイトルを入れてください' };
  if (title.length > 60) return { ok: false, error: 'タイトルは60文字までです' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.notice_date)) return { ok: false, error: '日付を入れてください' };
  const svc = createServiceClient();
  const now = new Date().toISOString();

  // ★ 公開した時刻は【初めて公開したとき】だけ入れる（★ 直すたびに帯へ出し直さない）
  let publishedAt: string | null = null;
  if (input.id) {
    const { data: cur } = await svc.from('ops_notices').select('published_at').eq('id', input.id).maybeSingle();
    publishedAt = (cur?.published_at as string | null) ?? null;
  }
  if (input.is_published && !publishedAt) publishedAt = now;

  const row = {
    notice_date: input.notice_date, title, body: input.body.trim(),
    is_published: input.is_published, published_at: publishedAt, updated_at: now,
  };
  if (input.id) {
    const { error } = await svc.from('ops_notices').update(row).eq('id', input.id);
    return error ? { ok: false, error: error.message } : { ok: true, id: input.id };
  }
  const { data, error } = await svc.from('ops_notices').insert(row).select('id').single();
  return error ? { ok: false, error: error.message } : { ok: true, id: Number(data.id) };
}

export async function deleteOpsNotice(id: number): Promise<{ ok: true } | Err> {
  const a = await requireAdmin(); if (!a.ok) return a;
  const { error } = await createServiceClient().from('ops_notices').delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
