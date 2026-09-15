import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow, countArticleTry } from '@/app/lib/media/relayFlow';
import { readImageSize } from '@/lib/imageSize';
import { checkArticleImage } from '@/lib/ekichikaArticleImage';
import { isArticleSlot, articleSlotLabel, checkArticleTitle, checkArticleBody } from '@/lib/ekichikaArticle';
import { dayKeyJST } from '@/lib/announceAuto';
import { pickArticlePhoto, normalizeArticlePhotoIds } from '@/lib/articlePhotoPick';

// 新着情報を1本出す（第166便・2026-09-05 → 第373便で写真を【店舗に1つの箱】へ →
//   ★ 第379便で【文章ごとに1人固定】を足した・2026-09-15）。
//
// ★★★ 手で押したときも、自動の周も【ここを通る】。
//   ★ 2か所に同じ手順を書かない。★ 書くと、いつか片方だけ直す（第141便の反省）。
//
// ★★ この関数がすること: 中継ジョブ（最初の段）を1件積むだけ。★ 実際に投げるのは VPS の周。
// ★★★ 積んだ時点で「出そうとした回数」を1つ進める（★ 送れたかどうかとは別）。
//
// ★★★ 写真の決め方は【2段】。
//   ① salon_article_templates.photo_therapist_id が入っていれば **その人で固定**（第379便）
//      ★ 「新人速報でサクラさんを紹介する」のような文章のため。★ 別の人にすり替えない
//   ② 入っていなければ salon_article_settings.photo_therapist_ids（店舗に1つの箱）から1枚（第373便）
//      ★ 直前の1枚（last_photo_therapist_id）は避ける。★ 箱が空なら写真に触らない
//   ★★ 文章の therapist_ids / last_photo_therapist_id / ekichika_girl_id は【読まない】（列は残っている）。

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
    .select('id, article_slot, title, body, photo_therapist_id')
    .eq('id', input.templateId).eq('salon_id', input.salonId).eq('provider', PROVIDER)
    .maybeSingle();
  if (tErr) return { ok: false, error: '文章を読み出せませんでした' };
  if (!t) return { ok: false, error: 'その文章が見つかりません' };

  const articleSlot = Number(t.article_slot);
  if (!isArticleSlot(articleSlot)) return { ok: false, error: 'この文章には出す枠が入っていません' };

  const title = String(t.title ?? '');
  const body = String(t.body ?? '');
  const tc = checkArticleTitle(title);
  if (!tc.ok) return { ok: false, error: tc.message };
  const bc = checkArticleBody(body);
  if (!bc.ok) return { ok: false, error: bc.message };

  // ★★★ 写真の箱（第373便）。★ 文章ではなく【設定の行】が持つ。★ 行が無ければ空の箱
  const { data: st, error: stErr } = await svc
    .from('salon_article_settings')
    .select('photo_therapist_ids, last_photo_therapist_id')
    .eq('salon_id', input.salonId).eq('provider', PROVIDER).eq('slot', input.slot)
    .maybeSingle();
  // ★★ 読めなかったときは【送らない】。★ 「写真なし」で出すと、店舗様の意図と違う記事が載る
  if (stErr) return { ok: false, error: '写真の設定を読み出せませんでした' };

  // ★★ 写しで先に弾く。★ 「まだ読んでいない」と「一覧に無い」を分ける
  const { data: snap } = await svc
    .from('media_article_slots').select('rows')
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
  // ★★★ 写真の決め方は【2段】（第379便・2026-09-15）。
  //   ① この文章が誰かを指していれば **その人で固定**（★ 特定のセラピストを紹介する文章のため）
  //   ② 指していなければ、**店舗の箱**から1枚（第373便）
  //
  //   ★ ②の中では: 1枚だけ入っていれば固定／2枚以上なら直前と同じ1枚は避けて1枚
  //   ★★ さいころはここで振る。★ 選び方そのものは articlePhotoPick（点検できる形）
  //   ★★ 写真が消えていた方は【外して】選び直す（★ 飾りで本体を止めない）
  const fixedId = t.photo_therapist_id === null || t.photo_therapist_id === undefined
    ? 0 : Number(t.photo_therapist_id);
  /** ★ ①で選んだか。★ ②（箱）で選んだときだけ「直前の1枚」を覚える */
  const byFixed = Number.isFinite(fixedId) && fixedId > 0;

  let therapistId = 0;
  let picked: ReturnType<typeof pickArticlePhoto> = { kind: 'keep' };

  if (byFixed) {
    // ★★ 固定の1人。★ この人の写真が消えていたら【店舗の箱へは落とさない】。
    //   ★ 「サクラさんの紹介文にリカさんの写真」は、写真なしより悪い（★ 別人が出る）。
    //   → ★ 下の段で写真が無ければ送信そのものを断る（★ 黙って別の人を出さない）
    therapistId = fixedId;
  } else {
    const boxIds = normalizeArticlePhotoIds(st?.photo_therapist_ids);
    let photoIds = boxIds;
    if (boxIds.length > 0) {
      const { data: ths } = await svc
        .from('therapists').select('id, profile_image_url')
        .eq('salon_id', input.salonId).in('id', boxIds);
      // ★★ この店の方で、★ いまも写真が入っている方だけ。★ 他店の id が紛れていても弾ける
      const alive = new Set(
        (ths ?? [])
          .filter((r) => String(r.profile_image_url ?? '').includes('/' + PHOTO_BUCKET + '/'))
          .map((r) => Number(r.id)),
      );
      photoIds = boxIds.filter((id) => alive.has(id));
    }
    const lastPhoto = st?.last_photo_therapist_id === null || st?.last_photo_therapist_id === undefined
      ? null : Number(st.last_photo_therapist_id);
    picked = pickArticlePhoto(photoIds, lastPhoto, Math.random());
    therapistId = picked.kind === 'keep' ? 0 : picked.id;
  }
  if (Number.isFinite(therapistId) && therapistId > 0) {
    const { data: th } = await svc
      .from('therapists').select('id, salon_id, name, profile_image_url')
      .eq('id', therapistId).maybeSingle();
    // ★★ 他店の子を指せないこと。★ id だけで引かない
    if (!th || Number(th.salon_id) !== input.salonId) {
      return {
        ok: false,
        error: byFixed
          ? 'この文章に固定している方が見つかりません（画面を開き直して選び直してください）'
          : '写真に設定された方が見つかりません',
      };
    }
    const url = String(th.profile_image_url ?? '');
    const i = url.indexOf('/' + PHOTO_BUCKET + '/');
    // ★★★ 固定の人の写真が無いときは【送らない】。★ 別の人の写真にすり替えない
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

  try {
    const r = await startRelayFlow({
      salonId: input.salonId, provider: PROVIDER, slot: input.slot,
      intent: input.intent,
      article: {
        slot: articleSlot, title, body,
        // ★ 第373便: 駅ちか側の写真に差し替える道（image: 'girl'）は使わない。★ 箱が空なら写真に触らない
        ...(file !== null ? { image: 'upload' as const, file } : {}),
      },
      actor: input.actor,
    });
    if (!r.ok) return { ok: false, error: r.note };

    // ★★★ 出した写真を覚える（★ 第373便: 覚える先は【設定の行】）。★ 次に選ぶとき、これと同じ1枚は避ける。
    //   ★ 覚えられなくても送信は止めない（★ 写真は飾り。飾りのために本体を止めない）。
    //   ★★ 次が「直前と同じ」になるだけで、★ 記事は出る。
    //   ★ 設定の行が無いことは無い（箱が空なら picked は keep でここへ来ない）。★ 念のため update（insert しない）
    //   ★★ 第379便: 文章で固定した1人は覚えない。★ 覚えると、箱のローテがその人を避け続ける
    if (!byFixed && (picked.kind === 'rotate' || picked.kind === 'fixed')) {
      const { error: memErr } = await svc
        .from('salon_article_settings')
        .update({ last_photo_therapist_id: picked.id })
        .eq('salon_id', input.salonId).eq('provider', PROVIDER).eq('slot', input.slot);
      if (memErr) console.error('[article] 出した写真を覚えられなかった', memErr.message);
    }

    // ★★★ 第376便: 出した印を文章に残す。
    //   ・last_posted_at … 自動でも手動でも入れる（★ 次に出す1本は、この枠でいちばん古いもの）
    //   ・last_auto_day  … **自動のときだけ**（★ 枠ごと1日1回の判定）。
    //     ★★ 手で出した日も自動は出る（カッキーさんの判断・2026-09-15）。★ だから手動では入れない。
    //   ★ 覚えられなくても送信は止めない（★ 積んだ事実は変わらない）。★ ただし黙らない。
    {
      const day = input.intent === 'article_auto' ? dayKeyJST(new Date()) : null;
      const { error: memErr } = await svc
        .from('salon_article_templates')
        .update({
          last_posted_at: new Date().toISOString(),
          ...(day === null ? {} : { last_auto_day: day }),
        })
        .eq('id', input.templateId).eq('salon_id', input.salonId);
      // ★★★ ここが書けないと、自動が同じ日に何度も出る恐れがある。★ 記録に残す
      if (memErr) console.error('[article] 出した印を残せなかった', input.templateId, memErr.message);
    }

    // ★★★ 積めたので「出そうとした回数」を1つ進める（第166便）。
    //   ★ 送れたかどうかは別（★ それは push_article: ok で数える）。
    //   ★ 第376便: 1日の回数で止める仕掛けは無くなったが、記録として数え続ける
    await countArticleTry({ salonId: input.salonId, provider: PROVIDER, slot: input.slot });

    return { ok: true, jobId: r.jobId, note: r.note };
  } catch (e) {
    console.error('[article] 送信を始められなかった', (e as Error).message);
    return { ok: false, error: '送信を開始できませんでした' };
  }
}
