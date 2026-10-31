import { createServiceClient } from '@/app/lib/supabase/service';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { conecfConsentMissingNote } from '@/lib/mediaConsent';
import { findMediaSite } from '@/lib/mediaSites';

// 駅ちかの新着情報（お知らせ）を、枠2以降（別エリアのお店ページ）へ枠1から自動で写す（第1709便・2026-10-31・カッキーさんの決定）。
//
// ★ 店舗様の望み: 「枠2に駅ちかの ID と PW を入れたら、勝手に枠1の内容が枠2に写って、そのまま枠1と同じように自動投稿に」。
//   オーナー様は新しい作業をしないので、ボタンも置かない（セラピストの自動登録＝slotMirror.ts・第1681便と同じ考え方）。
// ★ 対象: 向きが「フクエスから反映（自動）」（write_auto）の枠2以降で、ID・PW があり一時停止でなく、コネックエフの文に同意済み。
//   コネックエフに切り替えた店・非表示でない店だけ。
// ★ やること（自動投稿の周＝article-auto・5分ごと、の先頭で）:
//   ① 枠2の駅ちかの新着情報の一覧をまだ一度も読んでいなければ、自動で読みにいく（2時間に1回まで）
//   ② 枠1の文章（店舗様が書いたもの）を枠2へ写す。タイトル・本文・カテゴリー・固定の写真・並び・「自動投稿中」の印。
//      枠1 → 枠2 の一方向でそろえ続ける（枠1で直す・増やす・消す・印を外す → 次の周で枠2も同じ）。
//      ★ 枠2のお店ページに無いカテゴリーは写さない（毎回「失敗」が積もるため）
//      ★ 出した印（last_posted_at・last_auto_day）は枠ごとに持つ＝写すときに触らない
//   ③ 写真の箱も枠1と同じにする
// ★ 出すのは今までの自動投稿の周（枠ごとに 1日1回・同じ時刻）。ここでは駅ちかへ書かない（①の読み取りだけ）。
// ★ 読めなかったときは何もしない（ログだけ）。周そのものを止めない。

type Svc = ReturnType<typeof createServiceClient>;
const PROVIDER = 'ekichika';
/** ① 自動の読み取りの間隔（同じ枠で、これより短い間隔ではやり直さない） */
const READ_RETRY_MS = 2 * 3_600_000;

export type ArticleMirrorSummary = {
  targets: number;
  read: string[];
  inserted: number;
  updated: number;
  removed: number;
  errors: string[];
};

type Tpl = {
  id: number;
  slot: number;
  article_slot: number;
  title: string;
  body: string;
  is_active: boolean;
  sort_order: number;
  photo_therapist_id: number | null;
  mirror_of: number | null;
};

/** 写す対象の（店・枠）。★ 画面（getArticleBoard）も同じ判定で「枠1と同じ」を出す */
export async function listArticleMirrorTargets(svc: Svc, onlySalonId?: number): Promise<Array<{ salonId: number; slot: number }>> {
  let q = svc.from('salon_import_sources')
    .select('salon_id, slot')
    .eq('provider', PROVIDER).eq('is_enabled', true).eq('link_mode', 'write_auto').gte('slot', 2);
  if (onlySalonId !== undefined) q = q.eq('salon_id', onlySalonId);
  const { data: srcs, error } = await q;
  if (error || !srcs || srcs.length === 0) return [];

  const salonIds = Array.from(new Set(srcs.map((s) => Number(s.salon_id))));
  const [{ data: creds }, { data: salons }] = await Promise.all([
    svc.from('salon_media_credentials').select('salon_id, slot, is_enabled, consent_version')
      .eq('provider', PROVIDER).in('salon_id', salonIds),
    svc.from('salons').select('id, is_hidden, conecf_enabled_at').in('id', salonIds),
  ]);
  const siteName = findMediaSite(PROVIDER)?.name ?? '駅ちか';
  const out: Array<{ salonId: number; slot: number }> = [];
  for (const s of srcs) {
    const salonId = Number(s.salon_id);
    const slot = Number(s.slot);
    const sal = (salons ?? []).find((x) => Number(x.id) === salonId);
    if (!sal || sal.is_hidden === true || !sal.conecf_enabled_at) continue;
    const cred = (creds ?? []).find((c) => Number(c.salon_id) === salonId && Number(c.slot) === slot);
    if (!cred || cred.is_enabled !== true) continue;
    if (conecfConsentMissingNote(cred.consent_version as string | null, siteName)) continue;
    out.push({ salonId, slot });
  }
  return out;
}

/** 自動投稿の周から呼ぶ。★ 例外は外へ出さない（周を止めない） */
export async function mirrorArticlesToSlots(svc: Svc): Promise<ArticleMirrorSummary> {
  const sum: ArticleMirrorSummary = { targets: 0, read: [], inserted: 0, updated: 0, removed: 0, errors: [] };
  let targets: Array<{ salonId: number; slot: number }> = [];
  try {
    targets = await listArticleMirrorTargets(svc);
  } catch (e) {
    sum.errors.push('対象を読めませんでした: ' + (e as Error).message.slice(0, 120));
    return sum;
  }
  sum.targets = targets.length;
  for (const t of targets) {
    try {
      await mirrorOne(svc, t, sum);
    } catch (e) {
      sum.errors.push(`${t.salonId}#${t.slot}: ` + (e as Error).message.slice(0, 160));
    }
  }
  return sum;
}

async function mirrorOne(svc: Svc, t: { salonId: number; slot: number }, sum: ArticleMirrorSummary): Promise<void> {
  const { salonId, slot } = t;

  // ① 枠2の新着情報の一覧（どのカテゴリーがあるか）
  const { data: snap, error: snapErr } = await svc.from('media_article_slots')
    .select('rows').eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', slot).maybeSingle();
  if (snapErr) { sum.errors.push(`${salonId}#${slot}: 一覧の写しを読めませんでした`); return; }
  const rows = Array.isArray(snap?.rows) ? (snap!.rows as Array<{ slot: number }>) : null;
  if (rows === null) {
    // ★ まだ一度も読んでいない → 自動で読みにいく。★ 直近2時間に読んだ記録があれば待つ（読み終わるまでの重複を防ぐ）
    const since = new Date(Date.now() - READ_RETRY_MS).toISOString();
    const { count } = await svc.from('salon_media_audit').select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', slot)
      .eq('event', 'read_article_list').gte('created_at', since);
    if ((count ?? 0) > 0) return;
    const r = await startRelayFlow({ salonId, provider: PROVIDER, slot, intent: 'article_slots', actor: 'system' });
    sum.read.push(`${salonId}#${slot}: ${r.ok ? '読み取りを始めました' : r.note}`.slice(0, 160));
    return;
  }
  const available = new Set(rows.map((r) => Number(r.slot)));

  // ② 文章
  const { data: all, error: tErr } = await svc.from('salon_article_templates')
    .select('id, slot, article_slot, title, body, is_active, sort_order, photo_therapist_id, mirror_of')
    .eq('salon_id', salonId).eq('provider', PROVIDER).in('slot', [1, slot]);
  if (tErr) { sum.errors.push(`${salonId}#${slot}: 文章を読めませんでした（${tErr.message.slice(0, 80)}）`); return; }
  const list = (all ?? []) as unknown as Tpl[];
  const sources = list.filter((x) => Number(x.slot) === 1 && x.mirror_of === null);
  const copies = list.filter((x) => Number(x.slot) === slot && x.mirror_of !== null);
  const now = new Date().toISOString();

  for (const src of sources) {
    const want = available.has(Number(src.article_slot));
    const copy = copies.find((c) => Number(c.mirror_of) === Number(src.id));
    if (!want) continue; // ★ 無いカテゴリーの写しは下でまとめて消す
    const fields = {
      article_slot: Number(src.article_slot),
      title: src.title,
      body: src.body,
      is_active: src.is_active === true,
      sort_order: Number(src.sort_order ?? 0),
      photo_therapist_id: src.photo_therapist_id ?? null,
    };
    if (!copy) {
      const { error } = await svc.from('salon_article_templates').insert({
        salon_id: salonId, provider: PROVIDER, slot, mirror_of: Number(src.id), ...fields,
      });
      if (error) sum.errors.push(`${salonId}#${slot}: 写せませんでした（${error.message.slice(0, 80)}）`);
      else sum.inserted++;
      continue;
    }
    const same = Number(copy.article_slot) === fields.article_slot && copy.title === fields.title && copy.body === fields.body
      && (copy.is_active === true) === fields.is_active && Number(copy.sort_order ?? 0) === fields.sort_order
      && (copy.photo_therapist_id ?? null) === fields.photo_therapist_id;
    if (same) continue;
    const { error } = await svc.from('salon_article_templates')
      .update({ ...fields, updated_at: now })
      .eq('id', copy.id).eq('salon_id', salonId).eq('slot', slot);
    if (error) sum.errors.push(`${salonId}#${slot}: 直せませんでした（${error.message.slice(0, 80)}）`);
    else sum.updated++;
  }

  // ★ 写し元が無くなった・枠2に無いカテゴリーになった写しは消す（写し元を消したときは DB が消す＝on delete cascade）
  const stale = copies.filter((c) => {
    const src = sources.find((s) => Number(s.id) === Number(c.mirror_of));
    return !src || !available.has(Number(src.article_slot));
  });
  if (stale.length > 0) {
    const { error } = await svc.from('salon_article_templates').delete()
      .in('id', stale.map((c) => c.id)).eq('salon_id', salonId).eq('slot', slot).not('mirror_of', 'is', null);
    if (error) sum.errors.push(`${salonId}#${slot}: 古い写しを消せませんでした（${error.message.slice(0, 80)}）`);
    else sum.removed += stale.length;
  }

  // ③ 写真の箱
  const { data: sts } = await svc.from('salon_article_settings')
    .select('slot, posts_per_day, auto_enabled, photo_therapist_ids')
    .eq('salon_id', salonId).eq('provider', PROVIDER).in('slot', [1, slot]);
  const s1 = (sts ?? []).find((x) => Number(x.slot) === 1);
  const s2 = (sts ?? []).find((x) => Number(x.slot) === slot);
  if (s1) {
    const ids1 = JSON.stringify(s1.photo_therapist_ids ?? []);
    const ids2 = JSON.stringify(s2?.photo_therapist_ids ?? []);
    if (!s2 || ids1 !== ids2) {
      const { error } = await svc.from('salon_article_settings').upsert(
        {
          salon_id: salonId, provider: PROVIDER, slot,
          posts_per_day: Number(s1.posts_per_day),
          auto_enabled: s1.auto_enabled === true,
          photo_therapist_ids: s1.photo_therapist_ids ?? [],
          last_photo_therapist_id: null,
          updated_at: now,
        },
        { onConflict: 'salon_id,provider,slot' },
      );
      if (error) sum.errors.push(`${salonId}#${slot}: 写真の箱をそろえられませんでした（${error.message.slice(0, 80)}）`);
    }
  }
}
