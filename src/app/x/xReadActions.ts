'use server';

import { createClient } from '@/app/lib/supabase/server';
import type { DmOtherProfile } from './xDmShared';
import type { XNotification, XNotificationActor, XNotificationType } from './xNotificationsShared';

// ★★ 第986便（2026-09-29・カッキーさん）: fukuX の「読み込み」（通知一覧・会話一覧・未読バッジ・出勤表・フォロー関係）を【サーバー側】で行う。
// ★ アプリ内ブラウザでは、ブラウザの supabase-js が読み込みの前に止まり「読み込み中のまま」「空っぽ」になることがあるため。
// ★ 本人のログインのまま（service_role ではない）＝RLS はそのまま効く。中身の組み立ては元のクライアント処理そのまま。

async function myProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, myId: null as string | null };
  const { data } = await supabase.from('x_profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
  return { supabase, myId: (data?.id as string | undefined) ?? null };
}

// ── 通知一覧 ──
const LIMIT = 50;
type NotifRow = {
  id: string | number;
  type: XNotificationType;
  post_id: string | number | null;
  reply_post_id: string | number | null;
  is_read: boolean;
  created_at: string;
  actor_profile_id: string;
};

export async function listMyXNotifications(): Promise<{ ok: true; items: XNotification[] } | { ok: false }> {
  const { supabase, myId } = await myProfile();
  if (!myId) return { ok: false };
      // 自分宛・新しい順・上限取得。
      const { data: rows } = await supabase
        .from('x_notifications')
        .select('id, type, post_id, reply_post_id, is_read, created_at, actor_profile_id')
        .eq('recipient_profile_id', myId)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      const list = (rows ?? []) as NotifRow[];

      // actor を1クエリで合流し、rejected(凍結) actor の通知は表示から除外（トリガーは rejected でも作るため）。
      const actorIds = [...new Set(list.map((r) => r.actor_profile_id).filter(Boolean))];
      const dict = new Map<string, XNotificationActor & { status: string }>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from('x_profiles')
          .select('id, handle, display_name, avatar_url, kind, is_verified, status')
          .in('id', actorIds);
        (profs ?? []).forEach((p) =>
          dict.set(p.id as string, {
            id: p.id as string,
            handle: (p.handle as string) ?? '',
            displayName: (p.display_name as string) ?? '',
            avatarUrl: (p.avatar_url as string | null) ?? null,
            kind: ((p.kind as string) ?? 'user') as XNotificationActor['kind'],
            isVerified: Boolean(p.is_verified),
            status: (p.status as string) ?? 'approved',
          })
        );
      }

      const built: XNotification[] = [];
      for (const r of list) {
        const a = dict.get(r.actor_profile_id);
        if (!a || a.status === 'rejected') continue;
        built.push({
          id: String(r.id),
          type: r.type,
          postId: r.post_id != null ? String(r.post_id) : null,
          replyPostId: r.reply_post_id != null ? String(r.reply_post_id) : null,
          isRead: Boolean(r.is_read),
          createdAt: r.created_at,
          actor: {
            id: a.id,
            handle: a.handle,
            displayName: a.displayName,
            avatarUrl: a.avatarUrl,
            kind: a.kind,
            isVerified: a.isVerified,
          },
        });
      }
  return { ok: true, items: built };
}

// ── 会話一覧 ──
type ConvRow = {
  id: string | number;
  participant_a: string;
  participant_b: string;
  last_message_at: string;
};

export type ConvItem = {
  id: string;
  other: DmOtherProfile | null;
  preview: string | null;
  lastAt: string;
  unread: boolean;
};

export async function listMyXConversations(): Promise<{ ok: true; items: ConvItem[] } | { ok: false }> {
  const { supabase, myId } = await myProfile();
  if (!myId) return { ok: false };
      // 自分の会話（RLSで自分のものだけ）。
      const { data: convRows } = await supabase
        .from('x_conversations')
        .select('id, participant_a, participant_b, last_message_at')
        .order('last_message_at', { ascending: false });
      const convs = (convRows ?? []) as ConvRow[];
      if (convs.length === 0) {
        return { ok: true, items: [] };
      }

      const convIds = convs.map((c) => String(c.id));
      const otherIds = [
        ...new Set(convs.map((c) => (c.participant_a === myId ? c.participant_b : c.participant_a))),
      ];

      // 相手プロフィール・自分の既読位置・各会話の最新メッセージをまとめて取得。
      const [profRes, readRes, msgRes] = await Promise.all([
        supabase
          .from('x_profiles')
          .select('id, handle, display_name, avatar_url, kind, is_verified, status, dm_disabled')
          .in('id', otherIds),
        supabase.from('x_conversation_reads').select('conversation_id, last_read_at').eq('profile_id', myId).in('conversation_id', convIds),
        supabase
          .from('x_messages')
          .select('conversation_id, body, created_at, sender_profile_id')
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(500),
      ]);

      const profDict = new Map<string, DmOtherProfile>();
      (profRes.data ?? []).forEach((p) =>
        profDict.set(p.id as string, {
          id: p.id as string,
          handle: (p.handle as string) ?? '',
          displayName: (p.display_name as string) ?? '',
          avatarUrl: (p.avatar_url as string | null) ?? null,
          kind: ((p.kind as string) ?? 'user') as DmOtherProfile['kind'],
          isVerified: Boolean(p.is_verified),
          status: (p.status as string) ?? 'approved',
          dmDisabled: Boolean(p.dm_disabled),
        })
      );

      const readMap = new Map<string, string>();
      (readRes.data ?? []).forEach((r) => readMap.set(String(r.conversation_id), String(r.last_read_at)));

      // 最新メッセージ（desc 取得済みなので会話ごと最初の1件）。
      const lastMsg = new Map<string, { body: string; created_at: string; sender: string }>();
      (msgRes.data ?? []).forEach((m) => {
        const cid = String(m.conversation_id);
        if (!lastMsg.has(cid)) {
          lastMsg.set(cid, {
            body: (m.body as string) ?? '',
            created_at: m.created_at as string,
            sender: m.sender_profile_id as string,
          });
        }
      });

      const list: ConvItem[] = convs.map((c) => {
        const cid = String(c.id);
        const otherId = c.participant_a === myId ? c.participant_b : c.participant_a;
        const lm = lastMsg.get(cid);
        const readAt = readMap.get(cid) ?? '1970-01-01T00:00:00Z';
        const unread = !!lm && lm.sender !== myId && new Date(lm.created_at).getTime() > new Date(readAt).getTime();
        return {
          id: cid,
          other: profDict.get(otherId) ?? null,
          preview: lm?.body ?? null,
          lastAt: lm?.created_at ?? c.last_message_at,
          unread,
        };
      });

  return { ok: true, items: list };
}

// ── ヘッダーの未読バッジ（通知・DM） ──
export async function getMyXUnreadCounts(): Promise<{ notif: number; dm: number }> {
  const { supabase, myId } = await myProfile();
  if (!myId) return { notif: 0, dm: 0 };
  const [n, d] = await Promise.all([
    supabase.from('x_notifications').select('id', { count: 'exact', head: true }).eq('recipient_profile_id', myId).eq('is_read', false),
    supabase.rpc('x_unread_dm_count'),
  ]);
  return { notif: n.count ?? 0, dm: typeof d.data === 'number' ? d.data : 0 };
}

// ── 「メッセージ」ボタンを出すか（どちら向きでもフォローが1本あれば可） ──
export async function isXFollowLinked(viewerProfileId: string, targetProfileId: string): Promise<boolean> {
  const supabase = await createClient();
  const [a, b] = await Promise.all([
    supabase.from('x_follows').select('follower_profile_id', { head: true, count: 'exact' })
      .eq('follower_profile_id', viewerProfileId).eq('followee_profile_id', targetProfileId),
    supabase.from('x_follows').select('follower_profile_id', { head: true, count: 'exact' })
      .eq('follower_profile_id', targetProfileId).eq('followee_profile_id', viewerProfileId),
  ]);
  return (a.count ?? 0) > 0 || (b.count ?? 0) > 0;
}

// ── プロフィールの出勤表（7日分・公開データ） ──
export async function getXTherapistSchedule(therapistId: number, dates: string[]) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('therapist_schedules')
    .select('schedule_date, is_active, start_time, end_time')
    .eq('therapist_id', therapistId)
    .in('schedule_date', (Array.isArray(dates) ? dates : []).slice(0, 14))
    .order('schedule_date', { ascending: true });
  return (data ?? []).map((r) => ({
    schedule_date: String(r.schedule_date),
    is_active: Boolean(r.is_active),
    start_time: (r.start_time as string | null) ?? null,
    end_time: (r.end_time as string | null) ?? null,
  }));
}

// ── 投稿の一覧に付ける「自分の状態」（いいね済み・フォロー中・保存済み）とリポスト（公開） ──
export async function getMyXPostStates(postIds: string[], authorIds: string[], withMine: boolean): Promise<{
  liked: string[]; followees: string[]; saved: string[]; reposts: { post_id: string; reposter_profile_id: string }[];
}> {
  const ids = (Array.isArray(postIds) ? postIds : []).slice(0, 300);
  const aids = (Array.isArray(authorIds) ? authorIds : []).slice(0, 300);
  const supabase = await createClient();
  const rr = ids.length
    ? await supabase.from('x_reposts').select('post_id, reposter_profile_id').in('post_id', ids)
    : { data: [] as { post_id: unknown; reposter_profile_id: unknown }[] };
  const reposts = (rr.data ?? []).map((x) => ({ post_id: String(x.post_id), reposter_profile_id: String(x.reposter_profile_id) }));
  if (!withMine || ids.length === 0) return { liked: [], followees: [], saved: [], reposts };
  const { myId } = await myProfile();
  if (!myId) return { liked: [], followees: [], saved: [], reposts };
  const [likeRes, followRes, saveRes] = await Promise.all([
    supabase.from('x_likes').select('post_id').eq('profile_id', myId).in('post_id', ids),
    aids.length
      ? supabase.from('x_follows').select('followee_profile_id').eq('follower_profile_id', myId).in('followee_profile_id', aids)
      : Promise.resolve({ data: [] as { followee_profile_id: unknown }[] }),
    supabase.from('x_post_saves').select('post_id').eq('profile_id', myId).in('post_id', ids),
  ]);
  return {
    liked: (likeRes.data ?? []).map((l) => String(l.post_id)),
    followees: (followRes.data ?? []).map((f) => String(f.followee_profile_id)),
    saved: (saveRes.data ?? []).map((s) => String(s.post_id)),
    reposts,
  };
}
