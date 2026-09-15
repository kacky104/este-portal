'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { postOneArticle } from '@/app/lib/media/articlePost';
import { listMediaAudit } from '@/app/lib/media/mediaAudit';
import { isShopVisibleAudit } from '@/lib/mediaAudit';
import {
  articleSlotAdviceAll,
  articleSlotSummary,
  type ArticleSlotAdvice,
  type ArticleSlotRow,
} from '@/lib/articleSlotAdvice';
import {
  isArticleSlot,
  articleSlotLabel,
  checkArticleTitle,
  checkArticleBody,
  EKICHIKA_ARTICLE_SLOTS,
} from '@/lib/ekichikaArticle';
import {
  ARTICLE_POSTS_PER_DAY_DEFAULT,
  ARTICLE_TEMPLATES_PER_SLOT_MAX,
  articleSlotPostTimeLabel,
  articleSlotAutoNote,
} from '@/lib/articleRotation';
import { dayKeyJST } from '@/lib/announceAuto';
import { normalizeArticlePhotoIds, ARTICLE_PHOTO_MAX } from '@/lib/articlePhotoPick';

// 駅ちかの新着情報：枠の状態とテンプレート（第158便・2026-09-05 → ★ 第373便で写真を【店舗に1つの箱】へ・2026-09-15）。
//
// ★★★ この画面が守ること
//   ① **店舗様が選んだ枠しか触らない。** ★ 枠に既定値を作らない（選ばせる）
//   ② **送る前に枠の状態を見せる。** ★ 非表示・カラを、登録の前に言う
//      ★ 2026-09-05 の実弾で、送ってから「公開ページに出ていない」と分かった。★ 順番を逆にする
//   ③ **作っただけでは何も起きない。** ★ is_active / auto_enabled の既定は false（第43便の作法）
//
// ★★★ 第373便（カッキーさん・2026-09-15）「まずシンプルにします」
//   ・写真は【文章ごと】ではなく【店舗に1つの箱】（salon_article_settings.photo_therapist_ids・最大10枚）
//   ・どの枠から出すときも、その箱から1枚をランダムに選ぶ（★ 選ぶのは articlePost.ts）
//   ・「駅ちかに登録されている方から選ぶ」（駅ちか側の写真に差し替える道）は画面から外した
//   ★★ 列は消していない: salon_article_templates.therapist_ids / last_photo_therapist_id / ekichika_girl_id
//      ★ ここでは読まない・書かない（新規行の therapist_ids は空で埋める）。
//      ★ 戻すなら: select に列を足し、ArticleTemplateRow に girlId/therapistIds を戻す（第172便の形）
//
// ★★ 秘密は扱わない。★ ログイン情報には触れない（それは mediaCredentials.ts の仕事）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVIDER = 'ekichika';
/** 店舗様がフクエスに上げた写真の置き場。★ 中継役が取りに来られるのはここだけ（第106便） */
const PHOTO_BUCKET = 'therapist-photos';

async function assertSalonOwner(salonId: number): Promise<Result<{ userId: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };

  const isOwner = (salon.owner_id as string | null) === user.id;
  if (!isOwner && user.id !== ADMIN_UUID) return { ok: false, error: 'この店舗の操作権限がありません' };
  return { ok: true, data: { userId: user.id } };
}

/**
 * ★★ この店の方で、★ フクエスに写真が入っている方だけを返す（★ 名前順）。
 *   ★ 写真の箱に入れられるのはこの方たちだけ（★ 中継役が取りに行けるのは therapist-photos だけ・第106便）。
 *   ★★ 既定画像（第217便）は【本人の写真ではない】ので、ここでは当てない。
 *      ★ 駅ちかへ送るのは本人の写真だけ。★ 既定画像を送ると「写真がある子」と区別がつかなくなる。
 */
async function listPhotoTherapists(
  svc: ReturnType<typeof createServiceClient>,
  salonId: number,
): Promise<Array<{ id: number; name: string; photoUrl: string }>> {
  const { data: ths } = await svc
    .from('therapists').select('id, name, profile_image_url')
    .eq('salon_id', salonId)
    .order('name', { ascending: true });
  return (ths ?? [])
    .filter((r) => String(r.profile_image_url ?? '').includes('/' + PHOTO_BUCKET + '/'))
    // ★★★ 第167便: 写真そのものを画面へ渡す。★ 名前だけの一覧では「誰の写真か」が分からない
    //   ★ ここは【見せるためのURL】。★ 中継役が取りに行く道（relayFileUrl）とは別物
    .map((r) => ({
      id: Number(r.id),
      name: String(r.name ?? ''),
      photoUrl: String(r.profile_image_url ?? ''),
    }));
}

export type ArticleTemplateRow = {
  id: number;
  articleSlot: number;
  slotLabel: string;
  title: string;
  body: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
  // ★ 第373便: girlId / therapistIds は【文章から外した】。★ 写真は ArticleBoard.photoIds（店舗に1つの箱）
  /**
   * ★★ 最後に駅ちかへ出した時刻（第376便）。★ 自動・手動どちらでも入る。
   *   ★ null は【まだ一度も出していない】。★ 次に出るのは、この枠でいちばん古い1本
   */
  lastPostedAt: string | null;
};

/**
 * ★★★ 枠（カテゴリー）1つぶんの自動投稿の様子（第376便）。
 *   ★ 画面の【枠の見出しの下】に、そのまま出す1行を持つ。★ 画面で文言を作らない（第167便の作法）
 */
export type ArticleSlotAuto = {
  slot: number;
  /** この枠に登録されている文章の本数（★ 自動の印が無いものも含む） */
  count: number;
  /** この枠で「自動で回す」印の付いた本数 */
  activeCount: number;
  /** この枠が自動で出る時刻「09:42」。★ 出せなければ null */
  timeLabel: string | null;
  /** ★ 見出しの下に出す1行。★ 材料が読めていなければ null */
  note: string | null;
  /** ★ まだ文章を足せるか（★ 1枠5本まで） */
  canAdd: boolean;
};

export type ArticleBoard = {
  /** ★ 必ず5枠ぶん。★ 読めていない枠は「分からない」 */
  slots: ArticleSlotAdvice[];
  /** ★ 画面の上に出す1行 */
  summary: string;
  /** 枠の状態をいつ読んだか。★ 一度も読んでいなければ null（★ 0と混ぜない） */
  readAt: string | null;
  templates: ArticleTemplateRow[];
  autoEnabled: boolean;
  /** ★★★ 枠ごとの自動投稿の様子（第376便）。★ 必ず5枠ぶん */
  slotAuto: ArticleSlotAuto[];
  /** ★ 1枠に登録できる本数の上限。★ 画面が同じ数字を持たないよう、ここから渡す */
  perSlotMax: number;
  /**
   * ★★★ フクエスの写真を送れる方（第162便）。★ 写真の箱の【選択肢】。
   *   ★ プロフィール写真が therapist-photos に入っている方だけ。★ 無い方は出さない
   *     （★ 選べるように見せてから断らない・設計メモ §32）
   */
  therapists: Array<{ id: number; name: string; photoUrl: string }>;
  /**
   * ★★★ 写真の箱（第373便）。★ 店舗（＋媒体＋枠）に1つ。★ therapists.id の並び・最大10件。
   *   ★ 空＝写真に触らない（駅ちかの写真のまま）。★ どの枠から出すときも、ここから1枚をランダムに。
   *   ★★ 写真が消された方（therapists に写真が無くなった方）は、ここでは【落として】返す
   *      （★ 画面に「いない人」を数えさせない。★ DBの並びは次の保存で整う）
   */
  photoIds: number[];
  /**
   * ★★★ 今日この枠へ出した本数（第159便）。★ 手で出したぶんも数える。
   *   ★ 区切りは営業日（朝6時）。★ 暦の0時ではない
   */
  postedToday: number;
  /**
   * 直近の送信の記録（新しい順）。★ 押したあと「どうなったか」を同じ画面で見せるため。
   * ★ 中継役が引き取るまで1〜2分かかるので、届くまではここが空のことがある。
   */
  runs: Array<{ id: number; event: string; outcome: string; summary: string; createdAt: string }>;
};

/** ★ 画面に出す新着情報の記録だけ。★ ほかの連携の記録（出勤・日記）は混ぜない */
const ARTICLE_EVENTS = new Set([
  'read_article_list', 'read_article', 'plan_article', 'push_article', 'verify_article', 'flow_stalled',
]);

/**
 * 画面ぜんぶを1回で返す。
 * ★★ 3つの箱（写し／テンプレート／設定）を読むだけ。★ 駅ちかへは触らない。
 */
export async function getArticleBoard(input: { salonId: string | number; slot?: number }): Promise<Result<ArticleBoard>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const svc = createServiceClient();

  const { data: snap, error: snapErr } = await svc
    .from('media_article_slots')
    .select('read_at, rows')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  // ★★ 読めなかったときは【分からない】として返す。★ 「まだ読んでいない」と混ぜない
  if (snapErr) return { ok: false, error: '枠の状態を読み出せませんでした。時間をおいてお試しください' };

  const rows = Array.isArray(snap?.rows) ? (snap!.rows as ArticleSlotRow[]) : null;

  // ★ 第373便: ekichika_girl_id / therapist_ids は読まない（★ 列は残っている）
  // ★ 第376便: last_auto_day（今日この枠を出したか）と last_posted_at（順番と画面表示）を読む
  const { data: temps, error: tErr } = await svc
    .from('salon_article_templates')
    .select('id, article_slot, title, body, is_active, sort_order, updated_at, last_auto_day, last_posted_at')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  if (tErr) return { ok: false, error: '登録した文章を読み出せませんでした。時間をおいてお試しください' };

  const { data: st, error: sErr } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled, last_day, last_count, photo_therapist_ids')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  if (sErr) return { ok: false, error: '設定を読み出せませんでした。時間をおいてお試しください' };

  // ★★ フクエスの写真を送れる方。★ 写真が入っている方だけを出す（★ 写真の箱の選択肢）
  const therapists = await listPhotoTherapists(svc, salonId);

  // ★★★ 写真の箱。★ 並びと重複はここで整え、★ 写真が無くなった方は落とす
  //   （★ 画面に「いない人」を数えさせない。★ articlePost 側でも同じ理由で弾く）
  const photoIds = normalizeArticlePhotoIds(st?.photo_therapist_ids)
    .filter((id) => therapists.some((x) => x.id === id));

  const templates: ArticleTemplateRow[] = (temps ?? []).map((r) => ({
    id: Number(r.id),
    articleSlot: Number(r.article_slot),
    slotLabel: articleSlotLabel(Number(r.article_slot)),
    title: String(r.title ?? ''),
    body: String(r.body ?? ''),
    isActive: r.is_active === true,
    sortOrder: Number(r.sort_order ?? 0),
    updatedAt: String(r.updated_at ?? ''),
    lastPostedAt: r.last_posted_at ? String(r.last_posted_at) : null,
  }));

  const autoEnabled = st?.auto_enabled === true;
  const today = dayKeyJST(new Date());

  // ★★★ 枠ごとの自動投稿の様子（第376便）。★ 必ず5枠ぶん作る（★ 文章が0本の枠も出す）
  //   ★★ 文言は articleRotation が作る。★ ここで作らない（第167便で直した作法）
  const slotAuto: ArticleSlotAuto[] = EKICHIKA_ARTICLE_SLOTS.map((s) => {
    const mine = (temps ?? []).filter((r) => Number(r.article_slot) === s.slot);
    const active = mine.filter((r) => r.is_active === true);
    // ★★ その枠のどれか1本でも今日 自動で出ていれば、その枠は今日ぶんを出し終えている
    const lastAutoDay = mine
      .map((r) => (r.last_auto_day ? String(r.last_auto_day) : ''))
      .filter((d) => d !== '')
      .sort()
      .pop() ?? null;
    const timeLabel = articleSlotPostTimeLabel(salonId, s.slot);
    return {
      slot: s.slot,
      count: mine.length,
      activeCount: active.length,
      timeLabel,
      note: articleSlotAutoNote({
        autoEnabled,
        activeCount: active.length,
        lastAutoDay,
        dayKey: today,
        timeLabel,
      }),
      canAdd: mine.length < ARTICLE_TEMPLATES_PER_SLOT_MAX,
    };
  });

  // ★ 直近の記録。★ 読めなくても画面は出す（★ 記録が無いのと読めないのを画面で混ぜないよう空で返す）
  let runs: ArticleBoard['runs'] = [];
  try {
    const all = await listMediaAudit({ salonId, limit: 120, provider: PROVIDER, slot: mediaSlot });
    runs = all
      .filter((r) => ARTICLE_EVENTS.has(r.event))
      // ★★★ 第164便: ここに第149便の物差しを通していなかった。
      //   ★ たたむはずの busy が店舗様の画面に出ていた（2026-09-05 実測）。
      //   ★★ 出す・出さないの判断は mediaAudit の1か所だけ。★ ここで判定し直さない
      .filter((r) => isShopVisibleAudit({ event: r.event, outcome: r.outcome, detail: r.detail }))
      .slice(0, 12)
      .map((r) => ({ id: r.id, event: r.event, outcome: r.outcome, summary: r.summary, createdAt: r.createdAt }));
  } catch {
    runs = [];
  }

  // ★★ 今日ぶんは「区切りの日」が今日と同じときだけ数える。★ 昨日の数を持ち越さない
  const postedToday = st && today !== null && String(st.last_day ?? '') === today ? Number(st.last_count ?? 0) : 0;

  return {
    ok: true,
    data: {
      slots: articleSlotAdviceAll(rows),
      summary: articleSlotSummary(rows),
      readAt: snap?.read_at ? String(snap.read_at) : null,
      templates,
      autoEnabled,
      slotAuto,
      perSlotMax: ARTICLE_TEMPLATES_PER_SLOT_MAX,
      therapists,
      photoIds,
      postedToday,
      runs,
    },
  };
}

/**
 * ★★★ いま1本出す（第159便）。★ **駅ちかの記事を書き換える。前の記事は消える。**
 *
 * ★★ 守っていること
 *   ① 送るのは【店舗様が選んだテンプレート1本】だけ。★ 内容はDBから読み直す（画面から受け取らない）
 *   ② 記事が無い枠へは送らない。★ 写しで弾き、★ 一覧の段（第156便）でもう一度弾く（二重）
 *   ③ 非表示の枠へは【送れる】。★ ただし記録に「公開ページには出ていません」と残る（第156便）
 */
export async function readArticleSlots(input: { salonId: string | number; slot?: number }): Promise<Result<{ note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  try {
    const r = await startRelayFlow({
      salonId,
      provider: PROVIDER,
      slot: mediaSlot,
      intent: 'article_slots',
      actor: 'shop:' + guard.data.userId,
    });
    // ★ 断られた（別の手順が走っている）も、そのまま店舗様の言葉で返す。★ 握りつぶさない
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { note: r.note } };
  } catch (e) {
    console.error('[article] 枠の状態を読みにいけなかった', (e as Error).message);
    return { ok: false, error: '駅ちかの状態を読みにいけませんでした。時間をおいてお試しください' };
  }
}

/**
 * テンプレートを1本保存する（新規／上書き）。
 * ★★★ 枠は必ず選ばせる。★ 既定値を作らない（★ うっかり速報NEWSを上書きする道を残さない）。
 *   ★ 第376便からは画面が【枠ごとに分かれている】ので、枠は画面が渡す（★ 店舗様は選ばない）。
 * ★★ タイトル・本文はここで弾く。★ 駅ちかへ送ってから断られるのは無駄。
 * ★★★ 第376便: **1つの枠に5本まで。** ★ 6本目は断る（★ 黙って落とさない）。
 */
export async function saveArticleTemplate(input: {
  salonId: string | number;
  slot?: number;
  id?: number | null;
  articleSlot: number;
  title: string;
  body: string;
  isActive?: boolean;
  // ★ 第373便: girlId / therapistIds は受けない。★ 写真は saveArticlePhotoPool（店舗に1つの箱）
}): Promise<Result<{ id: number }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const articleSlot = Number(input.articleSlot);
  if (!isArticleSlot(articleSlot)) return { ok: false, error: 'どの枠へ出すかを選んでください' };

  const title = String(input.title ?? '');
  const body = String(input.body ?? '');
  const t = checkArticleTitle(title);
  if (!t.ok) return { ok: false, error: t.message };
  const b = checkArticleBody(body);
  if (!b.ok) return { ok: false, error: b.message };

  const svc = createServiceClient();
  const id = Number(input.id);

  if (Number.isFinite(id) && id > 0) {
    // ★★ 必ず salon_id で絞る。★ id だけで更新すると他店の行を書き換えられる
    // ★ 第373便: ekichika_girl_id / therapist_ids は触らない（★ 古い値が残っていても読まないので無害）
    const { data, error } = await svc
      .from('salon_article_templates')
      .update({
        article_slot: articleSlot,
        title: title.trim(),
        body,
        ...(input.isActive === undefined ? {} : { is_active: input.isActive === true }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id).eq('salon_id', salonId).eq('provider', PROVIDER)
      .select('id').maybeSingle();
    if (error) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
    if (!data) return { ok: false, error: 'その文章が見つかりません（画面を開き直してください）' };
    return { ok: true, data: { id: Number(data.id) } };
  }

  // ★★★ 第376便: この枠にあと足せるか。★ 数えてから入れる（★ 入れてから断らない）
  const { count: mine, error: cErr } = await svc
    .from('salon_article_templates')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .eq('article_slot', articleSlot);
  // ★★ 数えられなかったときは入れない。★ 0件と混ぜない（作法3-5）
  if (cErr || mine === null) {
    return { ok: false, error: 'いま登録されている本数を数えられませんでした。時間をおいてお試しください' };
  }
  if (mine >= ARTICLE_TEMPLATES_PER_SLOT_MAX) {
    return {
      ok: false,
      error: articleSlotLabel(articleSlot) + ' に登録できるのは'
        + ARTICLE_TEMPLATES_PER_SLOT_MAX + '本までです（いま' + mine + '本）。どれかを消してからお試しください',
    };
  }

  const { data, error } = await svc
    .from('salon_article_templates')
    .insert({
      salon_id: salonId,
      provider: PROVIDER,
      slot: mediaSlot,
      article_slot: articleSlot,
      title: title.trim(),
      body,
      // ★★★ 既定は「回さない」。★ 作っただけでは何も起きない
      is_active: input.isActive === true,
      // ★ 第373便: 文章は写真を持たない。★ 列は残っているので空で埋める（★ 駅ちかの画像に触らない）
      ekichika_girl_id: null,
      therapist_ids: [],
    })
    .select('id').maybeSingle();
  if (error || !data) return { ok: false, error: '保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { id: Number(data.id) } };
}

/**
 * ★★★ 写真の箱を保存する（第373便）。★ 店舗（＋媒体＋枠）に1つ。★ 最大10枚。
 *
 * ★★ 守っていること
 *   ① 他店の方を混ぜられない。★ 画面から来た番号をそのまま入れない（★ 番号は誰でも書き換えられる）
 *   ② 写真が入っている方だけ。★ 選べるように見せて送れない、を作らない（設計メモ §32）
 *   ③ 1枚でも落ちたら黙って保存しない。★ 「選んだのに入っていない」を作らない
 *   ④ 設定の行が無ければ作る。★ そのとき本数・元栓は【既定（回さない側）】のまま
 *   ⑤ 箱を入れ替えたら「直前に出した1枚」は忘れる。★ 箱に無い人を避け続けても意味が無い
 */
export async function saveArticlePhotoPool(input: {
  salonId: string | number;
  slot?: number;
  /** ★ 箱に入れる写真の持ち主（therapists.id）。★ 空配列＝写真に触らない */
  therapistIds: number[];
}): Promise<Result<{ photoIds: number[] }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  // ★★ 上限を超えて来たら【切らずに断る】。★ 黙って落とすと「10枚選んだのに9枚」になる
  const raw = Array.isArray(input.therapistIds) ? input.therapistIds : [];
  const want = normalizeArticlePhotoIds(raw);
  if (raw.length > ARTICLE_PHOTO_MAX || want.length > ARTICLE_PHOTO_MAX) {
    return { ok: false, error: '写真は' + ARTICLE_PHOTO_MAX + '枚までです' };
  }

  const svc = createServiceClient();

  if (want.length > 0) {
    const { data: ths, error: thErr } = await svc
      .from('therapists').select('id, salon_id, profile_image_url')
      .eq('salon_id', salonId).in('id', want);
    if (thErr) return { ok: false, error: '写真を確かめられませんでした。時間をおいてお試しください' };
    const okIds = new Set(
      (ths ?? [])
        .filter((r) => String(r.profile_image_url ?? '').includes('/' + PHOTO_BUCKET + '/'))
        .map((r) => Number(r.id)),
    );
    if (want.some((x) => !okIds.has(x))) {
      return { ok: false, error: '選べない写真が混ざっています。画面を開き直してもう一度お選びください' };
    }
  }

  // ★ 行が無いときは既定で作る。★ 本数・元栓を勝手に「回す側」へ倒さない（saveArticleSettings と同じ作法）
  const { data: cur, error: curErr } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  if (curErr) return { ok: false, error: '設定を読み出せませんでした。時間をおいてお試しください' };

  const { error } = await svc.from('salon_article_settings').upsert(
    {
      salon_id: salonId, provider: PROVIDER, slot: mediaSlot,
      posts_per_day: cur ? Number(cur.posts_per_day) : ARTICLE_POSTS_PER_DAY_DEFAULT,
      auto_enabled: cur?.auto_enabled === true,
      photo_therapist_ids: want,
      // ★ 箱を入れ替えたら「直前の1枚」は忘れる
      last_photo_therapist_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) return { ok: false, error: '写真を保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { photoIds: want } };
}

/** テンプレートを1本消す。★ 消すのは店舗様が書いた文章だけ。★ 駅ちかの記事は消えない */
export async function deleteArticleTemplate(input: { salonId: string | number; id: number }): Promise<Result<{ id: number }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const id = Number(input.id);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: '指定が不正です' };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_article_templates')
    .delete()
    .eq('id', id).eq('salon_id', salonId).eq('provider', PROVIDER)
    .select('id').maybeSingle();
  if (error) return { ok: false, error: '消せませんでした。時間をおいてお試しください' };
  if (!data) return { ok: false, error: 'その文章が見つかりません（画面を開き直してください）' };
  return { ok: true, data: { id: Number(data.id) } };
}

export async function startArticlePost(input: {
  salonId: string | number;
  slot?: number;
  templateId: number;
}): Promise<Result<{ note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  // ★★★ 手で押したときも、自動の周も【同じ道】を通る（第166便）。
  //   ★ 2か所に同じ手順を書かない。★ 書くと、いつか片方だけ直す（第141便の反省）。
  const r = await postOneArticle({
    salonId, slot: mediaSlot, templateId: Number(input.templateId),
    intent: 'article_push',
    actor: 'shop:' + guard.data.userId,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, data: { note: r.note } };
}

/** 1日の本数と、自動の元栓。★ どちらも既定は「回さない」側 */
export async function saveArticleSettings(input: {
  salonId: string | number;
  slot?: number;
  autoEnabled?: boolean;
  // ★ 第376便: postsPerDay は受けない（★ 枠ごと1日1回に固定したので設定そのものが無くなった）。
  //   ★★ 列（posts_per_day）は残っている。★ upsert のときは今の値をそのまま書き戻す
}): Promise<Result<{ autoEnabled: boolean }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;
  const mediaSlot = Number.isFinite(Number(input.slot)) && Number(input.slot) > 0 ? Number(input.slot) : 1;

  const svc = createServiceClient();
  const { data: cur, error: curErr } = await svc
    .from('salon_article_settings')
    .select('posts_per_day, auto_enabled')
    .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', mediaSlot)
    .maybeSingle();
  if (curErr) return { ok: false, error: '設定を読み出せませんでした。時間をおいてお試しください' };

  const autoEnabled = input.autoEnabled === undefined ? cur?.auto_enabled === true : input.autoEnabled === true;

  const { error } = await svc.from('salon_article_settings').upsert(
    {
      salon_id: salonId, provider: PROVIDER, slot: mediaSlot,
      // ★ 読まなくなった列。★ 行を作り直すときに既定へ戻さないよう、今の値を書き戻すだけ
      posts_per_day: cur ? Number(cur.posts_per_day) : ARTICLE_POSTS_PER_DAY_DEFAULT,
      auto_enabled: autoEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) return { ok: false, error: '設定を保存できませんでした。時間をおいてお試しください' };
  return { ok: true, data: { autoEnabled } };
}
