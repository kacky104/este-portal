import { Resend } from 'resend';
import { createServiceClient } from '@/app/lib/supabase/service';
import { COCOA_TEMPLATES_MAX, pickCocoaTemplate, type CocoaTemplate } from '@/lib/conecfCocoa';
import { dayKeyJST } from '@/lib/announceAuto';

// ココア店長ブログの1店ぶんのメール投稿（第404便・1f 応用）。★ サーバー専用（'use server' ではない）。
// ★ ココアは駅ちかと同じ ranking-deli 系。★ 写メ日記転送（forwardDiary）と同じ Resend で、件名＝タイトル・本文＝本文・添付＝写真1枚。
// ★ 呼ぶ場所：/api/admin/conecf-cocoa（1日1回・全店）／画面の「いま1回投稿」（1店）。

type Svc = ReturnType<typeof createServiceClient>;
const FROM = 'フクエス <diary@send.fukues.com>';
const MAX_IMG_BYTES = 8 * 1024 * 1024;

export type CocoaPostResult = {
  salonId: number;
  posted: boolean;
  templateId?: number;
  title?: string;
  error?: string;
  skipped?: string;
};

function toTemplate(r: Record<string, unknown>): CocoaTemplate {
  return {
    id: Number(r.id), title: String(r.title ?? ''), body: String(r.body ?? ''),
    imageUrl: (r.image_url as string | null) ?? null, isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order ?? 0), lastPostedAt: (r.last_posted_at as string | null) ?? null,
  };
}

async function attachmentOf(imageUrl: string | null): Promise<Array<{ filename: string; content: string }>> {
  if (!imageUrl || !/^https:\/\//.test(imageUrl)) return [];
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return [];
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMG_BYTES) return [];
    const ext = (imageUrl.split('.').pop() || 'jpg').split('?')[0].slice(0, 4);
    return [{ filename: `photo.${ext}`, content: buf.toString('base64') }];
  } catch { return []; }
}

/**
 * ★ 1店に1本投稿する。
 * @param apply false なら送らず「出す予定のもの」を返す（試し）
 * @param markAuto true なら自動投稿として last_auto_day を更新（1日1回の判定に使う）
 */
export async function postCocoaForSalon(svc: Svc, salonId: number, apply: boolean, markAuto: boolean, now = new Date()): Promise<CocoaPostResult> {
  const { data: salon } = await svc.from('salons').select('id, is_hidden, conecf_enabled_at').eq('id', salonId).maybeSingle();
  if (!salon || salon.is_hidden) return { salonId, posted: false, skipped: 'salon-hidden' };
  if (!salon.conecf_enabled_at) return { salonId, posted: false, skipped: 'conecf-not-enabled' };

  const { data: st } = await svc.from('conecf_cocoa_settings').select('*').eq('salon_id', salonId).maybeSingle();
  const to = (st?.post_email as string | null)?.trim() ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { salonId, posted: false, skipped: 'no-address' };

  const { data: temps } = await svc.from('conecf_cocoa_templates').select('*').eq('salon_id', salonId).eq('is_active', true);
  const pick = pickCocoaTemplate((temps ?? []).map(toTemplate));
  if (!pick) return { salonId, posted: false, skipped: 'no-template' };
  if (!pick.title.trim() && !pick.body.trim()) return { salonId, posted: false, skipped: 'empty' };

  if (!apply) return { salonId, posted: false, templateId: pick.id, title: pick.title, skipped: 'dry-run' };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { salonId, posted: false, error: 'RESEND_API_KEY 未設定' };
  const resend = new Resend(apiKey);
  const attachments = await attachmentOf(pick.imageUrl);
  const { error } = await resend.emails.send({
    from: FROM, to,
    subject: pick.title.trim() || '店長ブログ',
    text: pick.body ?? '',
    ...(attachments.length ? { attachments } : {}),
  });

  const nowIso = now.toISOString();
  if (error) {
    await svc.from('conecf_cocoa_settings').upsert({ salon_id: salonId, last_result: 'failed:' + error.message.slice(0, 120), updated_at: nowIso }, { onConflict: 'salon_id' });
    return { salonId, posted: false, templateId: pick.id, title: pick.title, error: error.message };
  }
  await svc.from('conecf_cocoa_templates').update({ last_posted_at: nowIso, updated_at: nowIso }).eq('id', pick.id);
  const patch: Record<string, unknown> = { salon_id: salonId, last_posted_at: nowIso, last_result: 'sent', updated_at: nowIso };
  if (markAuto) patch.last_auto_day = dayKeyJST(now);
  await svc.from('conecf_cocoa_settings').upsert(patch, { onConflict: 'salon_id' });
  return { salonId, posted: true, templateId: pick.id, title: pick.title };
}

export { COCOA_TEMPLATES_MAX };
