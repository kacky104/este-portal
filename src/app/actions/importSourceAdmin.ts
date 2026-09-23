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
//   list_mode = true・import_interval_min = 15（出勤は15分ごと、週間出勤は1日1回の周）
//   link_mode = 'read'・is_enabled = true
// ★★ 店舗様が先にホームで「駅ちかから反映する」を押していると external_id が空の行が既にある
//   （mediaCredentials.ts の insert）。★ その場合は新規ではなく【その行に上書き】（salon_id, provider, slot の一意で upsert）。
// ★ 消す口は作らない（戻せない操作は SQL のまま）。★ 止める・再開は is_enabled だけ。

import { createClient } from '@/app/lib/supabase/server';
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
    .select('id, salon_id, slot, external_id, shop_url, is_enabled, link_mode, last_run_at, last_status, last_error, salons!inner(name)')
    .eq('provider', 'ekichika')
    .order('salon_id')
    .order('slot');
  if (error) return { ok: false, error: error.message };
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
      linkMode: String(r.link_mode ?? ''),
      lastRunAt: (r.last_run_at as string | null) ?? null,
      lastStatus: (r.last_status as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
    };
  });
  return { ok: true, rows };
}

/** 登録（新規 or 上書き）。★ 旗は全部立てる（上のコメント） */
export async function adminUpsertImportSource(input: {
  salonId: number; slot?: number; externalId: string; shopUrl: string;
}): Promise<{ ok: true; created: boolean } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const salonId = Number(input.salonId);
  const slot = Number(input.slot ?? 1);
  const externalId = String(input.externalId ?? '').trim();
  const shopUrl = String(input.shopUrl ?? '').trim();
  if (!Number.isInteger(salonId) || salonId <= 0) return { ok: false, error: '店舗を選んでください' };
  if (![1, 2, 3].includes(slot)) return { ok: false, error: '枠は 1〜3 です' };
  if (!/^\d{1,10}$/.test(externalId)) return { ok: false, error: '店舗番号は数字だけで入れてください（例: 37168）' };
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
  const flags = {
    external_id: externalId,
    shop_url: shopUrl,
    import_schedule: true,
    import_profile: true,
    import_imasugu: true,
    create_missing: true,
    list_mode: true,
    import_interval_min: 15,
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
    detail: { externalId, shopUrl, created: existing?.id == null },
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
