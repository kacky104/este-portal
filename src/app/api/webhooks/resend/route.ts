import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { normalizeEmail } from '@/app/lib/validation/email';
import {
  isEmailTroubleEvent,
  shouldNotifyAdmin,
  emailEventLabel,
  bounceTypeLabel,
  bounceSubTypeLabel,
} from '@/app/lib/email/eventTypes';

// Resend の Webhook 受け口（2026-08-16 新設・第19便）。
//   URL:  https://fukues.com/api/webhooks/resend
//   環境変数: RESEND_WEBHOOK_SECRET（Resend の Webhook 画面に出る whsec_ で始まる文字列）
//
// ── なぜ必要か ──────────────────────────────────────────────
// resend.emails.send() は「Resend が受け付けた」までしか返さない。宛先の打ち間違い・
// 受信箱の満杯・迷惑メール判定は【送信のあと】に非同期で起きるので、アプリ側からは
// 一切見えなかった。ネット予約が入っても店に通知が届いていない、という取りこぼしが
// 起きうる状態だったのを、この受け口で拾う。
//
// ★ 署名検証は svix パッケージを使わず node:crypto で書いてある。
//   Svix の v1 署名は「HMAC-SHA256(secret, `${svix-id}.${svix-timestamp}.${生ボディ}`)」を
//   base64 にしただけで、依存を1つ増やすほどの中身ではない。
//   （package.json を増やさない＝クラウド作業で書き戻す対象を減らす、という運用上の都合もある）
//
// ★ 生のボディで検証すること。req.json() したものを JSON.stringify し直すと
//   キーの順序や空白が変わって署名が【必ず】合わなくなる。必ず req.text() を先に呼ぶ。

// 署名検証で node:crypto を使うので Node ランタイムを明示する（Edge では動かない）。
export const runtime = 'nodejs';
// Webhook はキャッシュしてはいけない。
export const dynamic = 'force-dynamic';

// 署名のタイムスタンプ許容幅（秒）。Svix の既定に合わせて5分。
// 古いリクエストの再送（リプレイ）を弾く。
const TOLERANCE_SEC = 5 * 60;

type ResendWebhookBody = {
  type?: unknown;
  created_at?: unknown;
  data?: {
    email_id?: unknown;
    message_id?: unknown;
    from?: unknown;
    to?: unknown;
    subject?: unknown;
    bounce?: { type?: unknown; subType?: unknown; message?: unknown } | null;
  } | null;
};

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/**
 * Svix（Resend）の署名を検証する。
 *
 * svix-signature ヘッダは "v1,xxxx v1,yyyy" のように【空白区切りで複数】入りうる
 * （シークレットのローテーション中は新旧2本が並ぶ）。1つでも合えば正。
 * 比較は timingSafeEqual で行い、長さが違う場合は先に false を返す。
 */
function verifySignature(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string,
): boolean {
  // whsec_ プレフィックスを外した残りが base64 のシークレット本体。
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${svixId}.${svixTimestamp}.${rawBody}`)
    .digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return true;
  }
  return false;
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // 設定漏れ。500 を返して Svix にリトライさせる（環境変数を入れれば取りこぼさず届く）。
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET 未設定');
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 500 });
  }

  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ ok: false, error: 'missing signature headers' }, { status: 400 });
  }

  // リプレイ対策。ここで弾いたものはリトライさせない（400）。
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SEC) {
    return NextResponse.json({ ok: false, error: 'timestamp out of tolerance' }, { status: 400 });
  }

  // ★ 生のボディ。json() より先に呼ぶこと（Request のボディは一度しか読めない）。
  const rawBody = await req.text();

  if (!verifySignature(secret, svixId, svixTimestamp, svixSignature, rawBody)) {
    // 署名が合わない＝Resend 以外からの投稿。リトライさせる意味がないので 401。
    console.error('[resend-webhook] 署名不一致 svix-id=', svixId);
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 });
  }

  let body: ResendWebhookBody;
  try {
    body = JSON.parse(rawBody) as ResendWebhookBody;
  } catch {
    // 署名は通っているのに JSON でない＝こちらでは直しようがない。リトライさせない。
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 });
  }

  const eventType = str(body.type);
  if (!eventType) return NextResponse.json({ ok: true, ignored: 'no type' });

  // ★ 購読していない種別が来ても 200 を返して静かに捨てる。
  //   ここで 4xx/5xx を返すと Svix が延々リトライし、他のイベントの配送まで詰まる。
  if (!isEmailTroubleEvent(eventType)) {
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  const data = body.data ?? {};
  const toEmails = Array.isArray(data.to)
    ? data.to.map((v) => normalizeEmail(String(v))).filter((v) => v !== '')
    : [];
  const bounce = data.bounce ?? null;
  const bounceType = str(bounce?.type);
  const bounceSubType = str(bounce?.subType);
  const bounceMessage = str(bounce?.message);
  const subject = str(data.subject);
  const fromEmail = str(data.from);

  // created_at が無い/壊れている場合は受信時刻で代用する（記録を落とさないため）。
  const createdAt = str(body.created_at);
  const occurredAt = createdAt && !Number.isNaN(Date.parse(createdAt))
    ? new Date(createdAt).toISOString()
    : new Date().toISOString();

  const svc = createServiceClient();

  // ── 宛先から店を特定する ──────────────────────────────────
  // 「どの店の予約通知が届いていないのか」を運営が一目で分かるようにするため。
  // salons.booking_email は normalizeEmail 済みで保存されているので、こちらも正規化して突き合わせる。
  // 一致しなければ null のまま（運営宛 unei@ の通知、応募通知の notify_email など）。
  let salonId: number | null = null;
  let salonName: string | null = null;
  if (toEmails.length > 0) {
    const { data: salons, error: salonErr } = await svc
      .from('salons')
      .select('id, name')
      .in('booking_email', toEmails)
      .limit(1);
    if (salonErr) {
      // 店の特定に失敗しても記録そのものは残す（ここで諦めるとイベントを失う）。
      console.error('[resend-webhook] 店舗の突き合わせに失敗:', salonErr.message);
    } else if (salons && salons.length > 0) {
      salonId = salons[0].id as number;
      salonName = (salons[0].name as string | null) ?? null;
    }
  }

  const { error: insertError } = await svc.from('email_events').insert({
    svix_id: svixId,
    event_type: eventType,
    email_id: str(data.email_id),
    message_id: str(data.message_id),
    from_email: fromEmail,
    to_emails: toEmails,
    subject,
    bounce_type: bounceType,
    bounce_sub_type: bounceSubType,
    bounce_message: bounceMessage,
    salon_id: salonId,
    salon_name: salonName,
    occurred_at: occurredAt,
    payload: body,
  });

  if (insertError) {
    // 23505 = unique 違反 ＝ 同じ svix-id を前に処理済み（Svix は「少なくとも1回」配送）。
    // 正常系なので 200 を返す。ここで 500 を返すと同じイベントを永久にリトライされる。
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // それ以外（テーブル未作成・接続断など）は 500 を返してリトライさせる。
    console.error('[resend-webhook] email_events への保存に失敗:', insertError.message);
    return NextResponse.json({ ok: false, error: 'insert failed' }, { status: 500 });
  }

  // ── 運営へ即メール（bounced / complained / failed のみ）──────
  // ★ notifyAdmin は例外を投げない。通知が失敗しても保存は済んでいるので 200 を返す
  //   （通知の失敗で Svix にリトライさせると、保存が重複して弾かれるだけ）。
  // ★ 宛先は joltcoffee@gmail.com（＝send.fukues.com とは別経路）なので、
  //   send.fukues.com 側が壊れていてもこの通知自体は届く。
  if (shouldNotifyAdmin(eventType)) {
    const lines = [
      `フクエスから送ったメールが「${emailEventLabel(eventType)}」になりました。`,
      '',
      `発生時刻: ${new Date(occurredAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      `宛先: ${toEmails.join(', ') || '(不明)'}`,
      ...(salonName ? [`該当店舗: ${salonName}（ID: ${salonId}）★この店の予約通知が届いていません`] : []),
      ...(fromEmail ? [`送信元: ${fromEmail}`] : []),
      ...(subject ? [`件名: ${subject}`] : []),
      ...(bounceType ? [`種類: ${bounceTypeLabel(bounceType)}`] : []),
      ...(bounceSubType ? [`詳細: ${bounceSubTypeLabel(bounceSubType)}`] : []),
      ...(bounceMessage ? [`原文: ${bounceMessage}`] : []),
      '',
      ...(salonName
        ? [
            '【対応】/admin の「店舗管理」タブ →「メール配信トラブル」で確認し、',
            '　　　　店舗編集の「予約通知メール」を直してから、ネット予約設定のテスト送信で疎通を確認してください。',
          ]
        : ['【対応】/admin の「店舗管理」タブ →「メール配信トラブル」で確認してください。']),
    ];
    await notifyAdmin(`【フクエス】メールが届きませんでした（${emailEventLabel(eventType)}）`, lines);
  }

  return NextResponse.json({ ok: true });
}
