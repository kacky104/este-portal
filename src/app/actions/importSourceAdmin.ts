'use server';

// 運営（/admin）から、駅ちかのお店のページ（店舗番号・URL）を登録する（第704便・2026-09-23・カッキーさん）。
//
// ★★★ なぜ要るか: フクエスリンク（駅ちかからの取り込み）は、salon_import_sources に
//   external_id・shop_url と取り込みの旗が無いと1件も動かない。★ これまでは SQL Editor で入れていた。
//   新しく契約が決まるたびに要る作業なので、画面にする。
//
// ★★ 守り: requireAdmin（ADMIN_UUID 照合）＋ service_role。★ adminOwner.ts と同じ作法。
//   ★ salon_import_sources は anon/authenticated に一切開いていない（RLS 有効・ポリシーなし）ので、
//     ここ（サーバー）以外からは読めも書けもしない。
// ★★ 旗はラビリンス様（salon 6）と同じ値で立てる（★ 1店ずつ SQL で揃えていたものを既定にする）:
//   import_schedule / import_profile / import_imasugu / create_missing = true
//   list_mode = true・import_interval_min = 30（出勤は30分ごと・第1312便で15→30、週間出勤は1日1回の周）
//   link_mode = 'read'・is_enabled = true
// ★★ 店舗様が先にホームで「駅ちかから反映する」を押していると external_id が空の行が既にある
//   （mediaCredentials.ts の insert）。★ その場合は新規ではなく【その行に上書き】（salon_id, provider, slot の一意で upsert）。
// ★ 消す口は作らない（戻せない操作は SQL のまま）。★ 止める・再開は is_enabled だけ。
// ★★★ 第1261便（2026-10-07・カッキーさんの決定）: 即ヒメを読むか（import_imasugu）は【枠ごとに選ぶ】。既定は 枠1＝読む・枠2と3＝読まない。
//   ★ 実際に起きた（アロマメイ様・2026-10-07 2:03）: 2枠の店で、駅ちかの即ヒメは12名なのにフクエスの「今すぐ」は4名。
//     即ヒメの印は掲載（枠）ごと。取り込みは枠ごとに走り、「その枠の一覧に居て印が無い方」の今すぐを外すので、
//     枠1で付けた直後（1秒後）に枠2の内容で外されていた。
//   ★ 決め: フクエスの「今すぐ」は【駅ちかの枠1のページと同じ】にする（両方の枠を合わせる形にはしない）。
//     ＝2枠の店は、即ヒメを枠1だけ読む。★ 出勤・プロフィール・新しい方の作成は、今までどおり全部の枠で読む。
//   ★ それまではここが全部の枠で true を立てていた（＝上書き登録のたびに枠2も true に戻っていた）。
//   ★ 一覧からも枠ごとに切り替えられる（adminSetImportSourceImasugu）。

import { createClient } from '@/app/lib/supabase/server';
import { IMPORT_LIST_INTERVAL_MIN } from '@/lib/importListInterval';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true; uid: string } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true, uid: user.id };
}

export type ImportSourceRow = {
  id: number;
  salonId: number;
  salonName: string;
  slot: number;
  externalId: string;
  shopUrl: string;
  isEnabled: boolean;
  /** ★ 第1261便: この枠の即ヒメを読むか */
  importImasugu: boolean;
  /** ★ 第1283便: この枠へ即ヒメを送るか（コネックエフの店・既定は送る）。false＝運営が止めた（sokuhime_push_off） */
  sokuhimePush: boolean;
  linkMode: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};

/**
 * 駅ちかのお店のページの URL から店舗番号を抜く（★ 画面の初期値。手で直せる）。
 *   例: https://ranking-deli.jp/fukuoka/area175/style8/46440/ → '46440'
 *   ★ URL にはエリア・業態が入るので、番号から URL は作れない（カッキーさん・2026-09-23）。★ 逆向きだけ
 */
export async function extractEkichikaShopId(shopUrl: string): Promise<string> {
  const m = String(shopUrl ?? '').trim().match(/ranking-deli\.jp\/(?:[a-z0-9_-]+\/)*?(\d+)\/?(?:[?#].*)?$/i);
  return m ? m[1] : '';
}

/** 登録済みの一覧（駅ちかだけ）。★ 店舗名は salons から引く */
export async function adminListImportSources(): Promise<{ ok: true; rows: ImportSourceRow[] } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_import_sources')
    .select('id, salon_id, slot, external_id, shop_url, is_enabled, import_imasugu, link_mode, last_run_at, last_status, last_error, salons!inner(name)')
    .eq('provider', 'ekichika')
    .order('salon_id')
    .order('slot');
  if (error) return { ok: false, error: error.message };
  // ★ 第1283便: 即ヒメを送らない枠。★ 別に引く（列がまだ無い＝追加SQL の前でも、一覧は今までどおり出す）
  const offIds = new Set<number>();
  {
    const { data: offs, error: offErr } = await svc
      .from('salon_import_sources').select('id').eq('provider', 'ekichika').eq('sokuhime_push_off', true);
    if (offErr && offErr.code !== '42703' && offErr.code !== 'PGRST204') return { ok: false, error: offErr.message };
    for (const o of (offErr ? [] : (offs ?? [])) as Array<{ id: number }>) offIds.add(Number(o.id));
  }
  const rows: ImportSourceRow[] = (data ?? []).map((r) => {
    const salon = (r as unknown as { salons: { name: string | null } | { name: string | null }[] }).salons;
    const name = Array.isArray(salon) ? salon[0]?.name : salon?.name;
    return {
      id: Number(r.id),
      salonId: Number(r.salon_id),
      salonName: String(name ?? ''),
      slot: Number(r.slot ?? 1),
      externalId: String(r.external_id ?? ''),
      shopUrl: String(r.shop_url ?? ''),
      isEnabled: r.is_enabled !== false,
      importImasugu: (r as { import_imasugu?: boolean | null }).import_imasugu === true,
      sokuhimePush: !offIds.has(Number(r.id)),
      linkMode: String(r.link_mode ?? ''),
      lastRunAt: (r.last_run_at as string | null) ?? null,
      lastStatus: (r.last_status as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
    };
  });
  return { ok: true, rows };
}

/**
 * 登録（新規 or 上書き）。★ 旗は立てる（上のコメント）。
 * ★ 第1261便: 即ヒメを読むか（importImasugu）だけは選ぶ。★ 渡さなければ 枠1＝読む・枠2と3＝読まない。
 */
export async function adminUpsertImportSource(input: {
  salonId: number; slot?: number; externalId: string; shopUrl: string; importImasugu?: boolean;
}): Promise<{ ok: true; created: boolean } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const salonId = Number(input.salonId);
  const slot = Number(input.slot ?? 1);
  const externalId = String(input.externalId ?? '').trim();
  const shopUrl = String(input.shopUrl ?? '').trim();
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗を選んでください' };
  if (![1, 2, 3].includes(slot)) return { ok: false, error: '枠は 1〜3 です' };
  if (!/^\d{1,10}$/.test(externalId)) return { ok: false, error: '掲載番号は数字だけで入れてください（例: 46440・URL 末尾の数字）' };
  if (!/^https:\/\/([a-z0-9-]+\.)*ranking-deli\.jp\/\S*$/i.test(shopUrl)) {
    return { ok: false, error: 'URL は https://ranking-deli.jp/ で始まる駅ちかのお店のページにしてください' };
  }

  const svc = createServiceClient();
  // ★ 既に行があるか（店舗様が先にホームで押していると external_id が空の行がある）
  const { data: existing, error: exErr } = await svc
    .from('salon_import_sources')
    .select('id')
    .eq('salon_id', salonId).eq('provider', 'ekichika').eq('slot', slot)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  const now = new Date().toISOString();
  // ★ 第1261便: 即ヒメは枠1だけが既定（2枠の店で、枠2が枠1の今すぐを外さないように）
  const importImasugu = typeof input.importImasugu === 'boolean' ? input.importImasugu : slot === 1;
  const flags = {
    external_id: externalId,
    shop_url: shopUrl,
    import_schedule: true,
    import_profile: true,
    import_imasugu: importImasugu,
    create_missing: true,
    list_mode: true,
    import_interval_min: IMPORT_LIST_INTERVAL_MIN,
    is_enabled: true,
    updated_at: now,
  };
  let error: { message: string } | null = null;
  if (existing?.id != null) {
    // ★ 向き（link_mode）は上書きしない。★ 店舗様が「反映しない」を選んでいたら、それを勝手に戻さない
    const res = await svc.from('salon_import_sources').update(flags).eq('id', Number(existing.id));
    error = res.error;
  } else {
    const res = await svc.from('salon_import_sources').insert({
      salon_id: salonId, provider: 'ekichika', slot, link_mode: 'read', ...flags,
    });
    error = res.error;
  }

  await recordMediaAudit({
    salonId, provider: 'ekichika', slot,
    event: 'source_registered',
    outcome: error ? 'failed' : 'ok',
    detail: { externalId, shopUrl, created: existing?.id == null, importImasugu },
    actor: `admin:${auth.uid}`,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, created: existing?.id == null };
}

/** 止める／再開（is_enabled だけ）。★ 消す口は作らない */
export async function adminSetImportSourceEnabled(input: { id: number; enabled: boolean }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_import_sources')
    .update({ is_enabled: input.enabled === true, updated_at: new Date().toISOString() })
    .eq('id', Number(input.id)).eq('provider', 'ekichika');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * ★ 第1261便: この枠の即ヒメを読む／読まない（import_imasugu だけ）。
 *   ★ 読まないにしても、すでに付いている「今すぐ（取り込みの枠）」は消さない（期限で自然に消える・最大50分）。
 *   ★ 出勤・プロフィール・向きには触れない。
 */
export async function adminSetImportSourceImasugu(input: { id: number; on: boolean }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_import_sources')
    .update({ import_imasugu: input.on === true, updated_at: new Date().toISOString() })
    .eq('id', Number(input.id)).eq('provider', 'ekichika');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * ★★★ 第1283便（2026-10-07・カッキーさんの決定）: この枠へ即ヒメを送る／送らない（sokuhime_push_off だけ）。
 *   ★ コネックエフの店は、店舗様が「更新する」を押した枠すべてに、フクエスの「今すぐ」を即ヒメとして送る（既定）。
 *     2枠ある店で「枠2には送りたくない」（ログインが倍になる・回数制の回数を使う）ときだけ、ここで止める。
 *   ★ 止めても、いまフクエスが押している即ヒメは外しに行かない（45分で自然に切れる）。
 *   ★ 出勤・プロフィール・向きには触れない。★ 店舗様の画面（出勤をサイトへ）には「即ヒメは送っていません」と出る。
 *   ★ 追加SQL（第1283便）を流す前は列が無いので、ここは失敗する（一覧は出る）。
 */
export async function adminSetImportSourceSokuhimePush(input: { id: number; on: boolean }): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_import_sources')
    .update({ sokuhime_push_off: input.on !== true, updated_at: new Date().toISOString() })
    .eq('id', Number(input.id)).eq('provider', 'ekichika');
  if (error) {
    return { ok: false, error: error.code === '42703' || error.code === 'PGRST204' ? '追加SQL（第1283便）がまだ流れていません' : error.message };
  }
  return { ok: true };
}
