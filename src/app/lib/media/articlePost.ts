import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, countArticleTry } from '@/app/lib/media/relayFlow';
import { readImageSize } from '@/lib/imageSize';
import { checkArticleImage } from '@/lib/ekichikaArticleImage';
import { isArticleSlot, articleSlotLabel, checkArticleTitle, checkArticleBody } from '@/lib/ekichikaArticle';
import { fillArticleVars } from '@/lib/articleVars';
import { dayKeyJST } from '@/lib/announceAuto';

// 新着情報を1本出す（第166便・2026-09-05）。
//
// ★★★ 手で押したときも、自動の周も【ここを通る】。
//   ★ 2か所に同じ手順を書かない。★ 書くと、いつか片方だけ直す（第141便の反省）。
//
// ★★ この関数がすること: 中継ジョブ（最初の段）を1件積むだけ。★ 実際に投げるのは VPS の周。
// ★★★ 積んだ時点で「出そうとした回数」を1つ進める（★ 送れたかどうかとは別）。

const PROVIDER = 'ekichika';
/** 店舗様がフクエスに上げた写真の置き場。★ 中継役が取りに来られるのはここだけ（第106便） */
const PHOTO_BUCKET = 'therapist-photos';
const SAFE_PATH = /^[A-Za-z0-9_\-][A-Za-z0-9_\-./]{0,200}$/;

export type PostOneResult =
  | { ok: true; jobId: string; note: string }
  | { ok: false; error: string };

/**
 * テンプレート1本を駅ちかへ出す。
 *
 * @param intent 'article_push'（手で押した） / 'article_auto'（周が出した）
 *   ★ やることは同じ。★ 分けているのは【記録の出し分け】のため（第166便）
 */
export async function postOneArticle(input: {
  salonId: number;
  slot: number;
  templateId: number;
  intent: 'article_push' | 'article_auto';
  actor: string;
}): Promise<PostOneResult> {
  const svc = createServiceClient();

  // ★★★ 内容は【DBから読み直す】。★ 呼び出し側から受け取った文字をそのまま駅ちかへ流さない
  const { data: t, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, article_slot, title, body, ekichika_girl_id, therapist_id')
    .eq('id', input.templateId).eq('salon_id', input.salonId).eq('provider', PROVIDER)
    .maybeSingle();
  if (tErr) return { ok: false, error: '文章を読み出せませんでした' };
  if (!t) return { ok: false, error: 'その文章が見つかりません' };

  const articleSlot = Number(t.article_slot);
  if (!isArticleSlot(articleSlot)) return { ok: false, error: 'この文章には出す枠が入っていません' };

  // ★★★ 第169便: タイトル・本文の検査は【差し込みを埋めたあと】。★ 下の「差し込み」の段で行う。
  //   ★ ここで数えると「{月}月{日}日」を3文字と数えてしまい、★ 出すときに駅ちかで断られる。
  const rawTitle = String(t.title ?? '');
  const rawBody = String(t.body ?? '');
  const girlId = /^\d{1,12}$/.test(String(t.ekichika_girl_id ?? '')) ? String(t.ekichika_girl_id) : null;

  // ★★ 写しで先に弾く。★ 「まだ読んでいない」と「一覧に無い」を分ける
  const { data: snap } = await svc
    .from('media_article_slots').select('rows, girls')
    .eq('salon_id', input.salonId).eq('provider', PROVIDER).eq('slot', input.slot)
    .maybeSingle();
  const rows = Array.isArray(snap?.rows) ? (snap!.rows as Array<{ slot: number }>) : null;
  if (rows === null) {
    return { ok: false, error: 'まず「いまの状態を読む」を押して、枠の状態を確かめてください' };
  }
  if (!rows.some((r) => r.slot === articleSlot)) {
    return { ok: false, error: articleSlotLabel(articleSlot) + ' が駅ちかの一覧に見当たりません' };
  }

  // ── フクエスの写真を送るとき ──
  //   ★ 画像そのものはここを通さない。★ 在処と【実寸】だけを渡す（第106便・案B）
  let file:
    | { bucket: string; path: string; filename: string; contentType: string; width: number; height: number; as?: 'jpeg' }
    | null = null;
  // ★ {セラピスト} に入れる名前。★ 「誰の紹介か」で決まる。★ 選ばれていなければ null
  let personName: string | null = null;
  const therapistId = Number(t.therapist_id ?? 0);
  if (Number.isFinite(therapistId) && therapistId > 0) {
    const { data: th } = await svc
      .from('therapists').select('id, salon_id, name, profile_image_url')
      .eq('id', therapistId).maybeSingle();
    // ★★ 他店の子を指せないこと。★ id だけで引かない
    if (!th || Number(th.salon_id) !== input.salonId) {
      return { ok: false, error: 'この文章に設定された方が見つかりません' };
    }
    personName = String(th.name ?? '');
    const url = String(th.profile_image_url ?? '');
    const i = url.indexOf('/' + PHOTO_BUCKET + '/');
    if (i < 0) return { ok: false, error: String(th.name ?? 'この方') + 'のプロフィール写真が登録されていません' };
    const path = url.slice(i + PHOTO_BUCKET.length + 2).split('?')[0];
    if (!SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) {
      return { ok: false, error: '写真の在処が読めません' };
    }

    const { data: blob, error: dlErr } = await svc.storage.from(PHOTO_BUCKET).download(path);
    if (dlErr || !blob) return { ok: false, error: '写真を読み出せませんでした' };
    const buf = new Uint8Array(await blob.arrayBuffer());
    const size = readImageSize(buf);
    if (!size) return { ok: false, error: '写真を JPEG か PNG として読めませんでした' };
    const c = checkArticleImage({ bytes: buf.byteLength, contentType: size.type });
    if (!c.ok) return { ok: false, error: c.message };

    // ★★★ 駅ちかの記事の画像は JPEG のみ。★ 元が違えば取りに来た口で直す（第165便）
    const needsJpeg = size.type !== 'image/jpeg';
    file = {
      bucket: PHOTO_BUCKET,
      path,
      filename: 'fukues_news_' + therapistId + '.jpg',
      // ★ 記録には「実際に送る種類」を残す
      contentType: 'image/jpeg',
      width: size.width,
      height: size.height,
      ...(needsJpeg ? { as: 'jpeg' as const } : {}),
    };
  }

  // ★ 駅ちかに登録されている方を選んでいるときは、写しから名前を引く
  if (personName === null && girlId !== null) {
    const gs = Array.isArray(snap?.girls) ? (snap!.girls as Array<{ id: string; name: string }>) : [];
    const g = gs.find((x) => String(x.id) === girlId);
    // ★★ 引けなければ null のまま。★ 番号を名前の代わりに出さない
    if (g && String(g.name ?? '').trim().length > 0) personName = String(g.name);
  }

  // ───────── ★★★ 差し込み（第169便） ─────────
  //   ★ 日付は【営業日】（朝6時区切り・カッキーさんの判断）。★ 深夜03:42は前日の日付
  //   ★★ 埋められなければ **送らない**。★ 「{セラピスト}」のまま公開ページに出さない
  const dayKey = dayKeyJST(new Date());
  const vt = fillArticleVars(rawTitle, { dayKey, therapistName: personName });
  if (!vt.ok) return { ok: false, error: vt.message };
  const vb = fillArticleVars(rawBody, { dayKey, therapistName: personName });
  if (!vb.ok) return { ok: false, error: vb.message };
  const title = vt.text;
  const body = vb.text;

  // ★★★ 数えるのは【埋めたあと】。★ ここが第169便のいちばん大事な順番
  const tc = checkArticleTitle(title);
  if (!tc.ok) return { ok: false, error: tc.message };
  const bc = checkArticleBody(body);
  if (!bc.ok) return { ok: false, error: bc.message };

  try {
    const r = await startRelayFlow({
      salonId: input.salonId, provider: PROVIDER, slot: input.slot,
      intent: input.intent,
      article: {
        slot: articleSlot, title, body,
        ...(file !== null
          ? { image: 'upload' as const, file }
          : girlId !== null
            ? { girlId, image: 'girl' as const }
            : {}),
      },
      actor: input.actor,
    });
    if (!r.ok) return { ok: false, error: r.note };

    // ★★★ 積めたので「出そうとした回数」を1つ進める（第166便）。
    //   ★ 送れたかどうかは別（★ それは push_article: ok で数える）。
    //   ★★ ここで数えないと、送れなかった日に自動が延々と撃ち続ける。
    await countArticleTry({ salonId: input.salonId, provider: PROVIDER, slot: input.slot });

    return { ok: true, jobId: r.jobId, note: r.note };
  } catch (e) {
    console.error('[article] 送信を始められなかった', (e as Error).message);
    return { ok: false, error: '送信を開始できませんでした' };
  }
}
