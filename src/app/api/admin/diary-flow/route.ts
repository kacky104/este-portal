import { NextResponse } from 'next/server';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// ── エステ魂の写メ日記を送る流れを1つ始める（第133便・運営だけの口）──────────────
//   POST /api/admin/diary-flow  (Authorization: Bearer <CRON_SECRET>)
//   body(form): salonId=6  slot=1  intent=diary_dryrun
//   body(form): salonId=6  slot=1  intent=diary_push  therapistId=123  [diaryId=<uuid>]
//
// ★★★ この口がすること: 中継ジョブ（最初の段）を1件積むだけ。★ 実際に投げるのは VPS の周。
//   ★ だから、この口の返事は「積めた」までしか言わない。★ 送れたかは監査ログで見る。
//
// ★★★ **diary_dryrun が既定。** ★ 下見は【1文字も書かない・代理ログインもしない】。
//   ★ 一覧を読んで「誰に送れるか」を数えて終わり。
//
// ★★★ **diary_push は 1人だけ。** ★ therapistId が要る（無ければ 400 で断る）。
//   ★ 日記は上書きではなく投稿。★ しかもエステ魂は店舗側から消せない（2026-09-03 実測）。
//   ★★ だから「全員に送る」という口を作らない。★ 1人ずつ、人が見て打つ。
//
// ★ provider は esutama だけ。★ 駅ちか・エステラブの日記は別の経路（メール転送）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROVIDER = 'esutama';
const INTENTS = ['diary_dryrun', 'diary_push'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ★ フォーム形式（-d 名前=値）で受ける（作法 3-10）。
 *   ★ PowerShell から JSON を渡すと引用符の潰し合いで必ずどこかで壊れる。
 *   ★ ただし JSON で来ても読める（他から叩かれたときに黙って落とさない）。
 */
async function readBody(req: Request): Promise<Record<string, string>> {
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  const o: Record<string, string> = {};
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    try {
      const v = JSON.parse(text) as unknown;
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) o[k] = String(x);
    } catch { /* 空のまま */ }
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
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const intent = String(body.intent ?? 'diary_dryrun');

  if (!Number.isFinite(salonId) || salonId <= 0)
    return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!(INTENTS as readonly string[]).includes(intent))
    return NextResponse.json({ ok: false, error: 'intent は ' + INTENTS.join('/') + ' のどちらか' }, { status: 400 });

  // ★★ 下見はここで終わり。★ 相手も日記も指定しない（指定されても使わない）
  if (intent === 'diary_dryrun') {
    const r = await startRelayFlow({
      salonId, provider: PROVIDER, slot, intent: 'diary_dryrun', actor: 'admin:diary-flow',
    });
    return NextResponse.json({ ...r, salonId, provider: PROVIDER, slot, intent });
  }

  // ────── ここから実弾 ──────
  const therapistId = Number(body.therapistId);
  if (!Number.isFinite(therapistId) || therapistId <= 0) {
    // ★★★ 相手を指定しない実弾は受け付けない。★ 「全員に送る」を作らない
    return NextResponse.json(
      { ok: false, error: 'diary_push には therapistId が要る（★ 1人だけ送る口です）' },
      { status: 400 },
    );
  }
  // ★ diary_posts.id は uuid。★ Number() で数値化しない（第37便で踏んだ穴）
  const diaryId = String(body.diaryId ?? '').trim();
  if (diaryId && !UUID_RE.test(diaryId)) {
    return NextResponse.json({ ok: false, error: 'diaryId は日記のUUIDを指定してください' }, { status: 400 });
  }

  const r = await startRelayFlow({
    salonId, provider: PROVIDER, slot,
    intent: 'diary_push',
    diary: { therapistId, ...(diaryId ? { diaryId } : {}) },
    actor: 'admin:diary-flow',
  });
  return NextResponse.json({
    ...r, salonId, provider: PROVIDER, slot, intent, therapistId,
    diaryId: diaryId || null,
    // ★ 「積んだ」までしか言わない。★ 送れたかは監査ログで確かめる
    見かた: '結果は /mypage の連携の記録（監査ログ）に出ます。★ push_diary が ok でも、載ったかは媒体側でご確認ください',
  });
}
