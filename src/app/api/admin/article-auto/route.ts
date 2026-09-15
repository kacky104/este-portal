import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { postOneArticle } from '@/app/lib/media/articlePost';
import { shouldPostArticleSlot } from '@/lib/articleRotation';
import { EKICHIKA_ARTICLE_SLOTS } from '@/lib/ekichikaArticle';

// ── 新着情報を自動で出す周（第166便・2026-09-05 → ★ 第376便で【枠ごとに1日1回】へ・2026-09-15）──
//   POST /api/admin/article-auto        (Authorization: Bearer <CRON_SECRET>)
//     apply=1 … 実際に出す ／ 付けなければ【数えるだけ】（★ 第43便の作法）
//
// ★★★ この周がすること: 出すと決めた店舗について、中継ジョブを1件積むだけ。
//   ★ 実際に駅ちかへ投げるのは VPS の周。
//
// ★★★ 第376便の形（カッキーさん・2026-09-15）
//   ・**枠（カテゴリー）ごとに1日1回。** ★ 枠は5つなので、目いっぱいでも1日5本。
//   ・枠ごとに時刻が違う（★ 288分ずつずれる・articleSlotPostMinute）。
//   ・その枠の中で、**最後に出したのがいちばん古い1本**を出す（★ 位置の数字は持たない）。
//   ・**手で出したぶんは数えない。** ★ 手動と自動は別（★ last_auto_day は自動でしか入らない）。
//
// ★★★ 第380便（カッキーさん・2026-09-15）: **店舗の元栓（auto_enabled）をやめた。**
//   「デフォルトが自動で出す。出したくなかったら文章で自動設定を止めてもらう」
//
//   ★ 元栓は【1つだけ】: その枠に「自動投稿中」の印が付いた文章が1本以上あること。
//   ★★ 暴発しない理由: 新しく作った文章の is_active は **false**（第43便の作法）。
//      ★ 店舗様が「自動投稿にする」を押して初めて回る。★ 押していない文章は何もしない。
//   ★★★ 起点も変えた: 前は salon_article_settings（auto_enabled=true の行）から引いていたので、
//      **設定の行が無い店舗は永久に回らなかった**。★ いまは【印の付いた文章】から引く。
//   ★ salon_article_settings.auto_enabled は列も受け口も残っている（★ 読まないだけ）。
//
// ★★ 1回の周で【1店舗につき1枠だけ】出す。
//   ★ 初めて元栓を入れた日は、過ぎた枠がまとめて期限切れになる（★ 5本いっぺんに積まれる）。
//   ★ 中継役は1本ずつしかさばけないので、5分後の次の周へ送る。★ 相手にも自分にも優しい。
//
// ★★ 判断そのものは src/lib/articleRotation.ts（純粋関数）が持つ。★ ここはDBと配線だけ。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDER = 'ekichika';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const apply = url.searchParams.get('apply') === '1';
  const now = new Date();
  const svc = createServiceClient();

  // ★★★ 第380便: 【「自動投稿中」の印が付いた文章】を起点に引く。
  //   ★ 前は設定の行（auto_enabled=true）が起点だったので、行が無い店舗は永久に回らなかった。
  //   ★★ 並びは「最後に出したのが古い順 → sort_order → id」。★ まだ出していない（null）が先。
  //     ★★★ nullsFirst を明示する。★ 昇順の既定では null が【後ろ】に来るので、任せない。
  //     ★ ここを間違えると「まだ一度も出していない文章が、いつまでも出ない」。
  //   ★ 非表示の店舗は外す（★ salons!inner で絞る）
  const { data: temps, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, salon_id, slot, article_slot, last_auto_day, last_posted_at, salons!inner(id, is_hidden)')
    .eq('provider', PROVIDER)
    .eq('is_active', true)
    .eq('salons.is_hidden', false)
    .order('last_posted_at', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  // ★★ 読めなかったときは【何もしない】。★ 0件と混ぜない（作法3-5）
  if (tErr) return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });

  const posted: string[] = [];
  const skipped: Array<{ salonId: number; articleSlot: number; why: string }> = [];
  const failed: Array<{ salonId: number; articleSlot: number; why: string }> = [];

  // ★ 店舗×媒体枠ごとにまとめる。★ 並び（古い順）はそのまま保たれる
  const groups = new Map<string, { salonId: number; slot: number }>();
  for (const r of temps ?? []) {
    const salonId = Number(r.salon_id);
    const slot = Number(r.slot ?? 1);
    groups.set(salonId + '#' + slot, { salonId, slot });
  }

  for (const { salonId, slot } of groups.values()) {
    const ours = (temps ?? []).filter((r) => Number(r.salon_id) === salonId && Number(r.slot ?? 1) === slot);

    // ★★★ 枠を順に見て、**最初に「出す」になった1枠だけ**出す。★ 1周1店舗1本
    let did = false;
    for (const s of EKICHIKA_ARTICLE_SLOTS) {
      if (did) break;
      const mine = ours.filter((r) => Number(r.article_slot) === s.slot);

      // ★★ その枠のどれか1本でも今日 自動で出ていれば、今日ぶんは終わっている
      const lastAutoDay = mine
        .map((r) => (r.last_auto_day ? String(r.last_auto_day) : ''))
        .filter((d) => d !== '')
        .sort()
        .pop() ?? null;

      const judged = shouldPostArticleSlot({
        now,
        salonId,
        articleSlot: s.slot,
        // ★★ 第380便: 店舗の元栓は無くなった。★ 常に true（★ 純粋関数の引数は残してある）
        autoEnabled: true,
        activeCount: mine.length,
        lastAutoDay,
      });

      if (!judged.post) {
        // ★ 「まだ時刻でない」「今日は出した」は毎回出るので、記録には残すが騒がない
        skipped.push({ salonId, articleSlot: s.slot, why: judged.reason });
        continue;
      }
      if (!apply) {
        posted.push(`${salonId}#${s.slot}(${s.label})`);
        did = true;
        continue;
      }

      // ★ 並びの先頭＝この枠でいちばん長く出していない1本
      const pick = mine[0];
      // ★ 数えた直後に店舗様が消した／印を外した、が起こりうる。★ 黙って飛ばさず数える
      if (!pick) {
        failed.push({ salonId, articleSlot: s.slot, why: '出す文章が見つかりません（直前に変わった可能性）' });
        continue;
      }

      const r = await postOneArticle({
        salonId, slot, templateId: Number(pick.id),
        intent: 'article_auto',
        actor: 'system',
      });
      if (!r.ok) {
        failed.push({ salonId, articleSlot: s.slot, why: r.error.slice(0, 160) });
        // ★★ 失敗したらこの店舗は打ち切る。★ 同じ周で別の枠へ移ると、詰まっているときに束で撃つ
        did = true;
        continue;
      }

      // ★★★ 「今日この枠を出した」印は postOneArticle が文章に書く（last_auto_day）。
      //   ★ ここで二重に書かない。★ 書く場所を2つ持つと、いつか片方だけ直す（第141便の反省）。
      posted.push(`${salonId}#${s.slot}(${s.label})`);
      did = true;
    }
  }

  return NextResponse.json({
    ok: true,
    apply,
    at: now.toISOString(),
    targets: groups.size,
    posted,
    skipped,
    failed,
  });
}
