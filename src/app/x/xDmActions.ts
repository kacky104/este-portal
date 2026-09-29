'use server';

import { createClient } from '@/app/lib/supabase/server';
import type { DmOtherProfile } from './xDmShared';

// ★★ 第985便（2026-09-29・カッキーさん）: fukuX の DM・通知の既読・店舗所属の操作を【サーバー側】で行う。
// ★ 第980〜984便と同じ、アプリ内ブラウザで送る前に止まる事故の対策。
// ★ 本人のログインのまま（service_role ではない）＝RLS と各 RPC（security definer 側の本人チェック）はそのまま効く。
// ★ 自分のプロフィール id はクライアントから受け取らず、サーバーで引く。

type Fail = { ok: false; error: string };
const NO_LOGIN: Fail = { ok: false, error: 'ログインが切れています。ページを開き直してください。' };

function jpOr(message: string | undefined, fallback: string): string {
  return message && /[ぁ-んァ-ン一-龥]/.test(message) ? message : fallback;
}

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, myId: null as string | null };
  const { data } = await supabase.from('x_profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
  return { supabase, myId: (data?.id as string | undefined) ?? null };
}

export type XThreadMsg = { id: string; body: string; createdAt: string; mine: boolean };

// ── 会話の読み込み（参加者でない会話は RLS で 0 件＝accessible:false） ──
export async function loadXThread(conversationId: number): Promise<
  { ok: true; accessible: false } |
  { ok: true; accessible: true; other: DmOtherProfile | null; messages: XThreadMsg[] } | Fail
> {
  const { supabase, myId } = await ctx();
  if (!myId) return NO_LOGIN;
  const { data: conv } = await supabase
    .from('x_conversations')
    .select('id, participant_a, participant_b')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return { ok: true, accessible: false };
  const otherId = (conv.participant_a as string) === myId ? (conv.participant_b as string) : (conv.participant_a as string);
  const { data: op } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, kind, is_verified, status, dm_disabled')
    .eq('id', otherId)
    .maybeSingle();
  const other: DmOtherProfile | null = op
    ? {
        id: op.id as string,
        handle: (op.handle as string) ?? '',
        displayName: (op.display_name as string) ?? '',
        avatarUrl: (op.avatar_url as string | null) ?? null,
        kind: ((op.kind as string) ?? 'user') as DmOtherProfile['kind'],
        isVerified: Boolean(op.is_verified),
        status: (op.status as string) ?? 'approved',
        dmDisabled: Boolean(op.dm_disabled),
      }
    : null;
  const r = await listXMessages(conversationId);
  return { ok: true, accessible: true, other, messages: r.ok ? r.messages : [] };
}

export async function listXMessages(conversationId: number): Promise<{ ok: true; messages: XThreadMsg[] } | Fail> {
  const { supabase, myId } = await ctx();
  if (!myId) return NO_LOGIN;
  const { data, error } = await supabase
    .from('x_messages')
    .select('id, body, created_at, sender_profile_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) return { ok: false, error: 'メッセージを読み込めませんでした' };
  return {
    ok: true,
    messages: (data ?? []).map((m) => ({
      id: String(m.id),
      body: (m.body as string) ?? '',
      createdAt: m.created_at as string,
      mine: (m.sender_profile_id as string) === myId,
    })),
  };
}

export async function sendXMessage(conversationId: number, body: string): Promise<{ ok: true; id: string; createdAt: string } | Fail> {
  const text = String(body ?? '').trim();
  if (!text) return { ok: false, error: 'メッセージを入力してください' };
  const { supabase, myId } = await ctx();
  if (!myId) return NO_LOGIN;
  const { data, error } = await supabase
    .from('x_messages')
    .insert({ conversation_id: conversationId, sender_profile_id: myId, body: text })
    .select('id, created_at')
    .single();
  if (error || !data) {
    console.error('[x] DM を送れなかった', myId, error?.message);
    return { ok: false, error: jpOr(error?.message, '送信できませんでした。ページを開き直してから、もう一度お試しください。') };
  }
  return { ok: true, id: String(data.id), createdAt: (data.created_at as string) ?? new Date().toISOString() };
}

export async function markXConversationRead(conversationId: number): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('x_mark_conversation_read', { p_conversation_id: conversationId });
  return { ok: !error };
}

// ── 会話を始める（無ければ作る）。フォロー条件などは RPC が判定 ──
export async function startXConversation(otherProfileId: string): Promise<{ ok: true; conversationId: string } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NO_LOGIN;
  const { data, error } = await supabase.rpc('x_start_conversation', { p_other: otherProfileId });
  if (error || data == null) {
    console.error('[x] 会話を始められなかった', user.id, error?.message);
    return { ok: false, error: jpOr(error?.message, '会話を開始できませんでした') };
  }
  return { ok: true, conversationId: String(data) };
}

// ── 運営へのお問い合わせ（会話を作って1通送る） ──
export async function sendXOfficialContact(officialProfileId: string, body: string): Promise<{ ok: true } | Fail> {
  const started = await startXConversation(officialProfileId);
  if (!started.ok) return started;
  const sent = await sendXMessage(Number(started.conversationId), body);
  if (!sent.ok) return sent;
  return { ok: true };
}

// ── 通知の既読 ──
export async function markAllXNotificationsRead(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('x_mark_all_notifications_read');
  return { ok: !error };
}

export async function markXNotificationRead(id: number): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('x_mark_notification_read', { p_id: id });
  return { ok: !error };
}

// ── 店舗所属（申請・取消・解除・承認/却下） ──
async function rpc(name: string, args: Record<string, unknown>, fallback: string): Promise<{ ok: true; data: unknown } | Fail> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NO_LOGIN;
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(`[x] ${name} に失敗`, user.id, error.message);
    return { ok: false, error: jpOr(error.message, fallback) };
  }
  return { ok: true, data };
}

export async function requestXAffiliation(therapistProfileId: string): Promise<{ ok: true; requestId: string } | Fail> {
  const r = await rpc('x_affiliation_request_create', { p_therapist_profile_id: therapistProfileId }, '申請を送れませんでした');
  return r.ok ? { ok: true, requestId: String(r.data) } : r;
}

export async function cancelXAffiliationRequest(requestId: number): Promise<{ ok: true } | Fail> {
  const r = await rpc('x_affiliation_request_cancel', { p_request_id: requestId }, '申請を取り消せませんでした');
  return r.ok ? { ok: true } : r;
}

export async function removeXAffiliation(therapistProfileId: string): Promise<{ ok: true } | Fail> {
  const r = await rpc('x_affiliation_remove', { p_therapist_profile_id: therapistProfileId }, '所属を解除できませんでした');
  return r.ok ? { ok: true } : r;
}

export async function respondXAffiliation(requestId: number, accept: boolean): Promise<{ ok: true } | Fail> {
  const r = await rpc('x_affiliation_respond', { p_request_id: requestId, p_accept: accept }, accept ? '承認できませんでした' : '却下できませんでした');
  return r.ok ? { ok: true } : r;
}

// ── 店舗管理: セラピストを @ID で1件探す（★ 第986便: 読み込みもサーバー経由） ──
export async function findXTherapistByHandle(raw: string): Promise<
  { ok: true; row: { id: string; handle: string; display_name: string; avatar_url: string | null; affiliated_shop_id: string | null } | null; otherShopName: string | null } | Fail
> {
  const h = String(raw ?? '').trim().replace(/^@+/, '');
  if (!h) return { ok: true, row: null, otherShopName: null };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('x_profiles')
    .select('id, handle, display_name, avatar_url, affiliated_shop_id, status')
    .ilike('handle', h.replace(/([\\%_])/g, '\\$1'))
    .eq('kind', 'therapist')
    .neq('status', 'rejected')
    .limit(1);
  if (error) return { ok: false, error: '検索できませんでした。もう一度お試しください。' };
  const row = (data ?? [])[0] as
    | { id: string; handle: string; display_name: string; avatar_url: string | null; affiliated_shop_id: string | null }
    | undefined;
  if (!row || row.handle.toLowerCase() !== h.toLowerCase()) return { ok: true, row: null, otherShopName: null };
  let otherShopName: string | null = null;
  if (row.affiliated_shop_id) {
    const { data: shop } = await supabase.from('x_profiles').select('display_name').eq('id', row.affiliated_shop_id).maybeSingle();
    otherShopName = (shop?.display_name as string) ?? '他店';
  }
  return { ok: true, row, otherShopName };
}
