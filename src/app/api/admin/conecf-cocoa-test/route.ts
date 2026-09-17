import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// ★ ココア店長ブログのメール投稿【1回だけの試し】（第403便・2026-09-17）。
//
// ★★ 目的: 「アドレス管理」の投稿用メールアドレスへ、件名＝タイトル・本文＝本文でメールを1通送り、
//   ★ ココアの店長ブログに載るかを確かめる（案A の検証）。★ 本実装の前の下見。
// ★★ 宛先はコードに書かない。★ 毎回 curl の -d で渡す（機密をリポジトリに残さない）。
// ★ 認証は CRON_SECRET（ほかの admin と同じ）。★ 使い方は下の curl。
//
//   curl -sS -X POST https://fukues.com/api/admin/conecf-cocoa-test \
//     --oauth2-bearer "$CRON_SECRET" -H 'Content-Type: application/json' \
//     -d '{"to":"ここにココアの投稿用アドレス","title":"テスト投稿","body":"コネックエフからの接続テストです。"}'
//
// ★ 画像は今回は付けない（まず本文だけで載るかを見る）。★ 載ったら本実装で画像も足す。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FROM = 'フクエス <diary@send.fukues.com>';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { to?: unknown; title?: unknown; body?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* noop */ }
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'テスト投稿';
  const text = typeof body.body === 'string' && body.body.trim() ? body.body.trim() : 'コネックエフからの接続テストです。';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: '宛先(to)が正しくありません' }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY is not set' }, { status: 500 });

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from: FROM, to, subject: title, text });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, id: data?.id ?? null, to: to.replace(/(.{2}).*(@.*)/, '$1****$2'), note: 'Resend が受け付けました。ココアの店長ブログ一覧に載るか確認してください。' });
}
