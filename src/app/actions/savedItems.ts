'use server';

import { createClient } from '@/app/lib/supabase/server';

// ★★ 第982便（2026-09-29・カッキーさん）: ☆保存（saved_items）の読み書きを【サーバー側】で行う。
// ★ 第980・981便と同じ対策: LINE 等のアプリ内ブラウザでは、ブラウザの supabase-js が送る前に止まり、
//   ☆を押しても保存されない（押した直後に☆が戻る）ことがある。
// ★ 本人のログインのままサーバーで動かす＝saved_items の RLS（本人の行だけ）はそのまま効く。
// ★ user_id はクライアントから受け取らない（サーバーの getUser() の本人だけ）。
const KINDS = new Set(['salon', 'therapist', 'job_salon']);
export type SavedKind = 'salon' | 'therapist' | 'job_salon';
type Row = { item_type: string; item_id: number };

function ok(kind: unknown, id: unknown): id is number {
  return typeof kind === 'string' && KINDS.has(kind) && typeof id === 'number' && Number.isInteger(id) && id > 0;
}

export async function loadMySavedItems(): Promise<{ ok: true; rows: Row[] } | { ok: false }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data, error } = await supabase
    .from('saved_items')
    .select('item_type, item_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) { console.error('[saved] 読めなかった', user.id, error.message); return { ok: false }; }
  return {
    ok: true,
    rows: ((data ?? []) as { item_type: string; item_id: number | string }[])
      .map((r) => ({ item_type: r.item_type, item_id: Number(r.item_id) })),
  };
}

export async function setMySavedItem(kind: SavedKind, id: number, add: boolean): Promise<{ ok: boolean }> {
  if (!ok(kind, id)) return { ok: false };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = add
    ? await supabase
        .from('saved_items')
        .upsert({ user_id: user.id, item_type: kind, item_id: id }, { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true })
    : await supabase
        .from('saved_items')
        .delete()
        .eq('user_id', user.id)
        .eq('item_type', kind)
        .eq('item_id', id);
  if (error) { console.error('[saved] 保存できなかった', user.id, kind, id, add, error.message); return { ok: false }; }
  return { ok: true };
}

// ★ ログイン前に端末へ貯めた☆を、ログイン後にまとめて入れる（重複は無視）
export async function mergeMySavedItems(items: { kind: SavedKind; id: number }[]): Promise<{ ok: boolean }> {
  const list = (Array.isArray(items) ? items : []).filter((x) => x && ok(x.kind, x.id)).slice(0, 500);
  if (list.length === 0) return { ok: true };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase
    .from('saved_items')
    .upsert(
      list.map((x) => ({ user_id: user.id, item_type: x.kind, item_id: x.id })),
      { onConflict: 'user_id,item_type,item_id', ignoreDuplicates: true },
    );
  if (error) { console.error('[saved] まとめて入れられなかった', user.id, error.message); return { ok: false }; }
  return { ok: true };
}
