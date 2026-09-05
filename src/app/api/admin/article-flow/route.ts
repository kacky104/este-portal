import { NextResponse } from 'next/server';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { isArticleSlot, articleSlotLabel, checkArticleTitle, checkArticleBody } from '@/lib/ekichikaArticle';

// ── 駅ちかの新着情報を1枠だけ書き換える（第155便・運営だけの口）──────────────
//   POST /api/admin/article-flow  (Authorization: Bearer <CRON_SECRET>)
//   body(form): salonId=6  slot=5  intent=article_dryrun|article_push
//               title=...  body=<p>...</p>  girlId=5232190  image=keep|girl
//
// ★★★ この口がすること: 中継ジョブ（最初の段）を1件積むだけ。★ 実際に投げるのは VPS の周。
//
// ★★ intent の既定は article_dryrun（試し打ち）。★ **1文字も書かない。**
//   ★ article_push は【人が試し打ちの結果を見てから】打つ（第43便の作法）。
//
// ★★★ 触るのは【指定した1枠だけ】。★ 店舗様が選んでいない枠には触らない（設計メモ §9②）。
//   ★ ニュースは上書きなので、**その枠の前の記事は消える**。
//
// ★ 相手は駅ちかだけ。★ エステ魂には送らない（AI広報部が既に1日10回自動投稿している）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTENTS = ['article_dryrun', 'article_push'] as const;

async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try { const v = JSON.parse(text); if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x); } catch { /* 空 */ }
    return o;
  }
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const salonId = Number(body.salonId);
  const mediaSlot = Number.isFinite(Number(body.mediaSlot)) && Number(body.mediaSlot) > 0 ? Number(body.mediaSlot) : 1;
  const slot = Number(body.slot);
  const intent = String(body.intent ?? 'article_dryrun');
  const title = String(body.title ?? '');
  const text = String(body.body ?? '');
  const girlId = String(body.girlId ?? '');
  const image = String(body.image ?? 'keep');

  if (!Number.isFinite(salonId) || salonId <= 0) return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!(INTENTS as readonly string[]).includes(intent)) return NextResponse.json({ ok: false, error: 'intent は ' + INTENTS.join('/') + ' のどれか' }, { status: 400 });
  // ★★★ 枠は必ず要る。★ 既定値を作らない（★ 「うっかり速報NEWSを上書き」を起こさない）
  if (!isArticleSlot(slot)) return NextResponse.json({ ok: false, error: 'slot は 1〜5（1速報NEWS / 2新人速報 / 3激アツ割引情報 / 4イベント速報 / 5緊急出勤速報）' }, { status: 400 });
  if (image !== 'keep' && image !== 'girl') return NextResponse.json({ ok: false, error: 'image は keep か girl' }, { status: 400 });

  // ★ 送る前にここでも弾く。★ 中継役を動かしてから断られるのは無駄
  const t = checkArticleTitle(title);
  if (!t.ok) return NextResponse.json({ ok: false, error: 'title: ' + t.message }, { status: 400 });
  const b = checkArticleBody(text);
  if (!b.ok) return NextResponse.json({ ok: false, error: 'body: ' + b.message }, { status: 400 });
  if (girlId && !/^\d{1,12}$/.test(girlId)) return NextResponse.json({ ok: false, error: 'girlId は数字だけ' }, { status: 400 });

  const r = await startRelayFlow({
    salonId,
    provider: 'ekichika',
    slot: mediaSlot,
    intent: intent as (typeof INTENTS)[number],
    article: {
      slot,
      title,
      body: text,
      ...(girlId ? { girlId } : {}),
      image: image as 'keep' | 'girl',
    },
    actor: 'admin:article-flow',
  });

  return NextResponse.json({
    ...r,
    salonId,
    provider: 'ekichika',
    mediaSlot,
    intent,
    枠: slot,
    枠の名前: articleSlotLabel(slot),
    // ★ 試し打ちなら、そう書く（★ 撃ったつもりにさせない）
    注意: intent === 'article_dryrun'
      ? '試し打ちです。1文字も書きません。結果は連携の記録に出ます'
      : '★ 実弾です。' + articleSlotLabel(slot) + ' の記事を上書きします（前の記事は消えます）',
  });
}
