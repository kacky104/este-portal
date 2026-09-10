import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
// ★★★★★★ 【第257便】送る材料の組み立ては `girlCreatePlan.ts` に寄せた。
//   ★ これから **店舗様の画面から**も同じことをする（設計メモ_セラピスト登録を店舗様の画面から §5 ①）。
//   ★★ 2か所に書くと片方だけ漏れる … 今夜まさにそれで踏んだ（第255便(2)・`profile_images` の select）。
import { buildGirlCreatePlan } from '@/app/lib/media/girlCreatePlan';

// ── 駅ちかにセラピストを1人 登録する（第234便・運営だけの口）─────────────────────
//   POST /api/admin/media-girl-create  (Authorization: Bearer <CRON_SECRET>)
//   body: { salonId, therapistId, slot?: 1, apply?: boolean,
//           postTo?: 'action'|'fixed', rookie?: boolean,   ← ★ この2つは切り分け用（第235便）
//           withPhoto?: boolean }                          ← ★★ 第249便で追加・第250便で【既定 true】
//
// ★★★ 段: login → read_girls（もう居ないか＋顔ぶれ）→ girl_create_form（110部品を読む）
//            → girl_create → read_girls（照合＋castId 回収）
//
// ★★★ **相手に人が増える。** ★ 作法はエステ魂の登録（第232便）とそろえてある:
//   ① 相手は therapistId で1人だけ。★ 「まとめて登録」は作らない
//   ② apply の既定は false（試し打ち）。★ **送る中身をそのまま返すだけで、1人も作らない**
//   ③ すでに castId が結びついている人は積まない（★ 二重掲載を自分で作らない）
//   ④ 同じ名前が向こうに居たら、中継の側で止まる（一覧を読んでから判断する）
//   ⑤ 押したあと読み直して照合し、**増えた1人の castId を therapist_media_ids に書く**
//
// ★★★★ `rookie_flg=1`（新人・30日で自動的に消える）は **登録した全員に付く**（§6-1 の1）。
//   ★ フクエスの「新人」バッジの有無とは関係ない。★ 店舗様の運用に合わせた決め。
//
// ★★★★★★ 【第250便】**写真は既定で送る**（登録 → 枠1へ1枚。設計メモ 追記 K・L・M）。
//   ★ 登録フォームに写真の欄は無いので、登録が通ったあと編集ページへ回る（第249便）。
//   ★ `-d withPhoto=false` で切れる。
//   ★★★ 写真を用意できないとき:
//     `withPhoto=true` と**書いた**とき … 400 で止める（★ 送るつもりだったのに送れない）
//     何も書かないとき（既定）        … ★ **飛ばして登録だけする**。★ 理由は監査の `photoSkip` に残る
// ★★ 送らないもの: 優先タグ（p_genre・上位表示は店舗様の運用）／キャッチ・紹介文
//
// ★★ 店舗様の画面にボタンは置かない（設計メモ §5-3）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') ?? '';
  let text = '';
  try { text = await req.text(); } catch { return {}; }
  if (ct.includes('application/json')) {
    try { const v = JSON.parse(text); return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}; } catch { return {}; }
  }
  const o: Record<string, unknown> = {};
  new URLSearchParams(text).forEach((v, k) => { o[k] = v; });
  // ★ 文字の true を真偽に。★ 第249便で withPhoto を足した
  // ★ 第255便で allPhotos を足した
  for (const k of ['apply', 'withPhoto', 'allPhotos']) if (o[k] === 'true') o[k] = true;
  return o;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const body = await readBody(req);
  const salonId = Number(body.salonId);
  const therapistId = Number(body.therapistId);
  const slot = Number.isFinite(Number(body.slot)) && Number(body.slot) > 0 ? Number(body.slot) : 1;
  const apply = body.apply === true;
  // ★★★★★★ 【第249便】登録が通ったら、そのまま**枠1へ写真を1枚**送る。
  //   ★ 既定は無し ＝ 今までどおり登録だけ（★ 書かなければ振る舞いは1つも変わらない）。
  //   ★★ 枠1へ入れてよいかの最後の判断は、中継が編集ページを読み直してから（第248便・slot1_not_blank）。
  //   ★★★★★★ 【第250便】**既定で送る**ようになった（第249便までは書いたときだけ）。
  //   ★ `-d withPhoto=false` で切れる。
  //   ★★★ 写真を用意できないときの振る舞いが、明示と既定で違う（★ ここが第250便の芯）:
  //     明示（withPhoto=true と書いた）… **400 で止める**（★ 送るつもりで打ったのに送れないなら知らせる）
  //     既定（何も書かない）          … ★ **飛ばして登録だけする**（設計メモ §3-1 ④）。★ 理由は記録に残す
  const withPhoto = !(body.withPhoto === false || String(body.withPhoto ?? '') === 'false');
  const withPhotoAsked = body.withPhoto === true || String(body.withPhoto ?? '') === 'true';
  // ★★★★★★ 【第255便】2枚目以降（枠2〜5）も続けて送る。★ **明示したときだけ**。
  //   ★ 何も書かなければ今までどおり **枠1へ1枚**（第250便の既定）。★ 振る舞いは1つも変わらない。
  //   ★★★ 既定にしなかった理由（2026-09-10・カッキーさんの決め）… 相手へ送る枚数が **5倍**になる変更だから。
  //     ★ 第249便（明示）→ 第250便（既定）と同じ段取りで、まず明示で通してから既定を検討する。
  //   ★★ 対応づけは第253便と同じ【番号固定】（`profile_images` のN枚目 → 枠N）。★ 詰めない・ずらさない。
  const allPhotos = body.allPhotos === true;
  // ★★★★ 切り分け用の2つ（第235便・設計メモ §17-9）。★ **コードを直さずに試せるようにする。**
  //   postTo=fixed … これまでどおり決め打ちの URL へ送る（既定は action ＝ 読んだフォームの action）
  //   rookie=false … `rookie_flg=1` を混ぜない（★ §2-7b は1回だけの確認なので疑える口を開けた）
  const postTo: 'action' | 'fixed' = String(body.postTo ?? '') === 'fixed' ? 'fixed' : 'action';
  const rookie = !(body.rookie === false || String(body.rookie ?? '') === 'false');

  if (!Number.isFinite(salonId) || salonId <= 0)
    return NextResponse.json({ ok: false, error: 'salonId が要る' }, { status: 400 });
  if (!Number.isFinite(therapistId) || therapistId <= 0)
    return NextResponse.json({ ok: false, error: 'therapistId が要る（フクエスのセラピストID）' }, { status: 400 });

  const svc = createServiceClient();

  // ★★★★★★ 【第257便】ここから下の「送る材料づくり」は `girlCreatePlan.ts` に移した。
  //   ★ この口がすることは【認証（CRON_SECRET）】と【受け取った値の解釈】だけになった。
  //   ★★ 同じ材料を、店舗様の画面（サーバーアクション）からも作る。★ 認証だけが違う。
  const built = await buildGirlCreatePlan(svc, {
    salonId, therapistId, slot, withPhoto, withPhotoAsked, allPhotos, postTo, rookie,
  });
  if (!built.ok) return NextResponse.json({ ok: false, error: built.error }, { status: built.status });
  const { plan, relay } = built.data;

  if (!apply) {
    return NextResponse.json({
      ok: true, applied: false, plan,
      note: '試し打ち。★ 1人も作っていません。★ apply:true で中継ジョブを積みます'
        + '（★ 同じ名前が向こうに居れば、そこで何もせず終わります）',
    });
  }

  const r = await startRelayFlow({
    salonId, provider: 'ekichika', slot,
    intent: 'girl_create',
    actor: 'admin:girl-create',
    // ★★★★★★ 第249便: 登録が通ったら、そのまま枠1へ1枚。★ girl_id は【登録後に読み直した castId】を中継が入れる
    //   ★ 第255便: 2枚目以降の列も `relay` に入っている（★ 明示したときだけ）
    ...relay,
  });
  if (!r.ok) return NextResponse.json({ ok: false, applied: false, plan, reason: r.reason, note: r.note }, { status: 409 });
  return NextResponse.json({
    ok: true, applied: true, plan, jobId: r.jobId, flowId: r.flowId,
    note: r.note + ' ★ 結果は salon_media_audit（event=create_girl）で見えます',
  });
}
