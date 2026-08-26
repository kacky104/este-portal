import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/app/lib/supabase/service';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 写メ日記のメール投稿の受け口（2026-08-21 第27便）。
//   URL:  https://fukues.com/api/webhooks/resend-inbound
//   環境変数: RESEND_INBOUND_WEBHOOK_SECRET（Resend の Webhook 画面の whsec_〜）
//             RESEND_API_KEY（既存。本文・添付の取得に使用）
//             DIARY_MAIL_ALLOWED_SENDERS（任意。カンマ区切りの許可送信元。
//               "@venrey.jp" のように @ 始まりならドメイン後方一致、
//               それ以外は完全一致。未設定なら送信元を制限しない=トークンのみで認証）
//
// ── 流れ ──────────────────────────────────────────────
// ベンリー等 → d-{token}@diary.fukues.com へメール（件名=タイトル・本文=日記・添付=写真）
//   → Resend Inbound が受信し email.received Webhook をここへ POST
//   → 署名検証 → 宛先トークン → therapist 解決 → 本文/添付を Resend API から取得
//   → 添付画像を diary-images へ保存 → diary_posts に insert（セラピスト手投稿と同じ形）
//
// ── 二重投稿防止 ──────────────────────────────────────
// Webhook は at-least-once 配送（タイムアウト時の再送あり）。diary_mail_log に
// email_id を PRIMARY KEY で insert し、衝突＝処理済みとして 200 を返す。
//
// ── 返すステータス ────────────────────────────────────
// 200 … 処理完了 or 意図的スキップ（宛先不明・画像なし等。再送されても結果は同じため）
// 401 … 署名不正（再送不要）
// 500 … 一時障害（DB/API エラー。Resend に再送させる）
//
// ★ 署名検証・Node ランタイム指定は /api/webhooks/resend/route.ts（第19便）と同作法。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOLERANCE_SEC = 5 * 60;
const MAX_IMAGES = 4;                     // 1通から取り込む画像の上限
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 1枚10MBまで
const MAX_TITLE_LEN = 100;
const MAX_CONTENT_LEN = 5000;
const DIARY_BUCKET = 'diary-images';
const ADDR_RE = /^d-([a-f0-9]{16})@diary\.fukues\.com$/i;

const IMAGE_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function verifySignature(
  secret: string, svixId: string, svixTimestamp: string, svixSignature: string, rawBody: string,
): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`).digest('base64');
  const expectedBuf = Buffer.from(expected);
  for (const part of svixSignature.split(' ')) {
    const sig = part.startsWith('v1,') ? part.slice(3) : part;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** HTMLしか無いメール用の簡易テキスト化（タグ除去・改行維持）。 */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/tr)\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 送信元の許可判定。DIARY_MAIL_ALLOWED_SENDERS 未設定なら常に許可。 */
function senderAllowed(from: string): boolean {
  const raw = process.env.DIARY_MAIL_ALLOWED_SENDERS?.trim();
  if (!raw) return true;
  // "Name <a@b.c>" 形式からアドレス部を取り出す
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).some((rule) =>
    rule.startsWith('@') ? addr.endsWith(rule) : addr === rule
  );
}

type InboundBody = {
  type?: unknown;
  data?: {
    email_id?: unknown;
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    attachments?: Array<{ id?: unknown; filename?: unknown; content_type?: unknown }> | null;
  } | null;
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  const apiKey = process.env.RESEND_API_KEY;
  if (!secret || !apiKey) {
    console.error('[diary-mail] RESEND_INBOUND_WEBHOOK_SECRET / RESEND_API_KEY 未設定');
    return NextResponse.json({ error: 'not configured' }, { status: 500 });
  }

  // ── 署名検証（生ボディで）──
  const rawBody = await req.text();
  const svixId = req.headers.get('svix-id') ?? '';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
  const svixSignature = req.headers.get('svix-signature') ?? '';
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 401 });
  }
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SEC) {
    return NextResponse.json({ error: 'timestamp out of tolerance' }, { status: 401 });
  }
  if (!verifySignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: InboundBody;
  try { body = JSON.parse(rawBody) as InboundBody; } catch {
    return NextResponse.json({ ok: true, skipped: 'bad json' });
  }
  if (body.type !== 'email.received') return NextResponse.json({ ok: true, skipped: 'not inbound' });

  const emailId = str(body.data?.email_id);
  const from = str(body.data?.from) ?? '';
  const to: string[] = Array.isArray(body.data?.to)
    ? (body.data!.to as unknown[]).map((v) => (typeof v === 'string' ? v : '')).filter(Boolean)
    : [];
  if (!emailId) return NextResponse.json({ ok: true, skipped: 'no email_id' });

  const svc = createServiceClient();

  // ── 二重投稿防止：email_id を先に記録（衝突＝処理済み）──
  const { error: logErr } = await svc.from('diary_mail_log').insert({ email_id: emailId, result: 'processing' });
  if (logErr) {
    if (logErr.code === '23505') return NextResponse.json({ ok: true, skipped: 'duplicate' });
    console.error('[diary-mail] log insert failed:', logErr.message);
    return NextResponse.json({ error: 'log failed' }, { status: 500 });
  }
  const finishLog = async (result: string, therapistId?: number) => {
    await svc.from('diary_mail_log').update({ result, therapist_id: therapistId ?? null }).eq('email_id', emailId);
  };

  // ── 宛先トークン → セラピスト解決 ──
  let token: string | null = null;
  for (const addr of to) {
    const m = addr.trim().match(ADDR_RE);
    if (m) { token = m[1].toLowerCase(); break; }
  }
  if (!token) { await finishLog('rejected:no-token'); return NextResponse.json({ ok: true, skipped: 'no token address' }); }

  if (!senderAllowed(from)) {
    await finishLog('rejected:sender');
    console.warn(`[diary-mail] 送信元不許可: ${from}`);
    return NextResponse.json({ ok: true, skipped: 'sender not allowed' });
  }

  const { data: mailRow } = await svc
    .from('therapist_diary_mail').select('therapist_id').eq('token', token).maybeSingle();
  if (!mailRow) { await finishLog('rejected:unknown-token'); return NextResponse.json({ ok: true, skipped: 'unknown token' }); }
  const therapistId = Number(mailRow.therapist_id);

  const { data: therapist } = await svc
    .from('therapists').select('id, salon_id, user_id').eq('id', therapistId).maybeSingle();
  if (!therapist) { await finishLog('rejected:no-therapist', therapistId); return NextResponse.json({ ok: true, skipped: 'therapist gone' }); }
  const salonId = Number(therapist.salon_id);
  const therapistUserId = (therapist.user_id as string | null) ?? null;

  // ★★★ 正本がフクエスの店舗宛のメールは【受け取らない】（第36便・第2弾）
  //   その店舗はフクエスで日記を書き、そこから駅ちか・エスラブへ送っている。
  //   ベンリー側の転送設定が外し忘れられていると、自分が送った日記がここへ戻ってきて
  //   同じ日記が2つ並ぶ。**受け取ってから重複判定する形にしてはいけない** ——
  //   本文が媒体側で整形されたり、時刻が数分ずれたりして、判定は必ずどこかで外れる。
  //   「送る側の店舗からは受け取らない」という一本の線で切るのが唯一確実。
  //   ★ 切り替えは salons.diary_source（既定 'benry'＝従来どおり受け取る）。
  const { data: salonRow } = await svc
    .from('salons').select('diary_source').eq('id', salonId).maybeSingle();
  const diarySource = (salonRow?.diary_source as string | null) ?? 'benry';
  if (diarySource === 'fukues') {
    await finishLog('rejected:source_is_fukues', therapistId);
    console.warn(`[diary-mail] 正本がフクエスの店舗宛のため受け取らない: salon_id=${salonId} therapist_id=${therapistId}`);
    return NextResponse.json({ ok: true, skipped: 'source_is_fukues' });
  }

  try {
    // ── 本文の取得 ──
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!emailRes.ok) throw new Error(`email fetch ${emailRes.status}`);
    const email = (await emailRes.json()) as { subject?: unknown; text?: unknown; html?: unknown };

    const title = (str(email.subject) ?? str(body.data?.subject) ?? '').slice(0, MAX_TITLE_LEN) || null;
    let content = str(email.text);
    if (!content) {
      const html = str(email.html);
      content = html ? htmlToText(html) : null;
    }
    if (content) content = content.slice(0, MAX_CONTENT_LEN);

    // ── 添付画像の取得 → diary-images へ保存 ──
    const images: string[] = [];
    const metaList = Array.isArray(body.data?.attachments) ? body.data!.attachments! : [];
    const hasImageMeta = metaList.some((a) => IMAGE_EXT[String(a?.content_type ?? '').toLowerCase()]);
    if (hasImageMeta) {
      const listRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!listRes.ok) throw new Error(`attachments fetch ${listRes.status}`);
      const listJson = (await listRes.json()) as {
        data?: Array<{ id?: string; content_type?: string; download_url?: string }>;
      };
      const atts = (listJson.data ?? []).filter(
        (a) => a.download_url && IMAGE_EXT[String(a.content_type ?? '').toLowerCase()]
      ).slice(0, MAX_IMAGES);

      for (let i = 0; i < atts.length; i++) {
        const a = atts[i];
        const contentType = String(a.content_type).toLowerCase();
        const dl = await fetch(a.download_url!);
        if (!dl.ok) throw new Error(`attachment download ${dl.status}`);
        const buf = Buffer.from(await dl.arrayBuffer());
        if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) continue;
        const path = `${therapistId}/mail_${Date.now()}_${i}.${IMAGE_EXT[contentType]}`;
        const { error: upErr } = await svc.storage.from(DIARY_BUCKET).upload(path, buf, {
          contentType, cacheControl: STORAGE_CACHE_CONTROL,
        });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        const { data: { publicUrl } } = svc.storage.from(DIARY_BUCKET).getPublicUrl(path);
        images.push(publicUrl);
      }
    }

    // 画像・タイトル・本文のすべて空なら投稿しない（手投稿フォームと同じ最低条件）。
    if (images.length === 0 && !title && !content) {
      await finishLog('rejected:empty', therapistId);
      return NextResponse.json({ ok: true, skipped: 'empty' });
    }

    const { error: insErr } = await svc.from('diary_posts').insert({
      therapist_id: therapistId,
      salon_id: salonId,
      images,
      title,
      content,
    });
    if (insErr) throw new Error(`diary insert: ${insErr.message}`);

    // ── fukuX 同時投稿（2026-08-22 追加）──────────────────────────
    // /cast の手投稿は「連携済みならデフォルトON」でフォークしている（CastDiary.tsx）。
    // メール投稿にはチェックボックスが無いので、連携済み＝常にフォークする（同じ結果になる）。
    //
    // ★ 手投稿はユーザー自身の認証クライアントで insert し、x_posts の INSERT ポリシー
    //   （author_profile_id = x_my_profile_id()）を正規に通している。こちらはメール経由で
    //   本人セッションが無いため service_role で入れる。なりすまし防止は
    //   「宛先トークン → therapist_id → その therapist の user_id」という経路で担保する
    //   （他人の profile_id を指定する余地がない）。
    //
    // ★ 付随処理なので best-effort。失敗しても日記投稿は成功のまま（手投稿と同じ作法）。
    let crossposted = false;
    if (therapistUserId) {
      try {
        const { data: xp } = await svc
          .from('x_profiles')
          .select('id, handle, status, kind')
          .eq('auth_user_id', therapistUserId)
          .eq('kind', 'therapist')
          .eq('status', 'approved')
          .not('handle', 'is', null)
          .limit(1)
          .maybeSingle();
        if (xp?.id) {
          // body = タイトル行 + 空行 + 本文（手投稿 CastDiary.tsx と同じ組み立て）
          const body = title && content ? `${title}\n\n${content}` : (title || content);
          if ((body && body.length > 0) || images.length > 0) {
            const { error: xErr } = await svc.from('x_posts').insert({
              author_profile_id: xp.id,
              body: body || null,
              images,                    // diary と同じフルURL配列をそのままコピー
              replies_disabled: false,   // 手投稿のデフォルトに合わせる
            });
            if (xErr) console.error('[diary-mail] fukuX 同時投稿に失敗:', xErr.message);
            else crossposted = true;
          }
        }
      } catch (e) {
        console.error('[diary-mail] fukuX 同時投稿でエラー:', e instanceof Error ? e.message : e);
      }
    }

    await finishLog('posted', therapistId);
    return NextResponse.json({ ok: true, posted: true, images: images.length, crossposted });
  } catch (e) {
    // 一時障害は log 行を消して 500 → Resend が再送してくれる（email_id 衝突しないように）。
    console.error('[diary-mail] 処理失敗:', e instanceof Error ? e.message : e);
    await svc.from('diary_mail_log').delete().eq('email_id', emailId);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });
  }
}
