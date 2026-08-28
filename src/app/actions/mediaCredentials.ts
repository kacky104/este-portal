'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { encryptSecret, maskSecret } from '@/lib/mediaCredentials';
import { MEDIA_CONSENT_VERSION, needsConsent } from '@/lib/mediaConsent';
import { recordMediaAudit, listMediaAudit } from '@/app/lib/media/mediaAudit';
import { startRelayFlow } from '@/app/lib/media/relayFlow';

// 他媒体の管理画面ログイン情報の登録（第39便・第3弾の入口）。
//
// ★★★ 第1弾（公開ページを読む）とは責任の重さが違う。
//   ここで預かるのは店舗のアカウントそのもので、その射程は駅ちか1つに収まらない
//   （駅ちかの管理画面には求人サイトへの自動ログインが埋まっている・第38便 §6）。
//   → 同意なしでは保存させない。同意した版番号を行に残す。履歴は監査ログに残す。
//
// ⚠ salon_media_credentials は anon/authenticated に GRANT していない。
//   取得経路はこの server action だけ。★ 呼び出しごとに店舗オーナー検証を行う
//   （diaryForward.ts / diaryMail.ts と同型）。
//
// ★ 'use server' ファイルは async 関数以外を export できない（Next のビルド時チェック）。
//   定数や型を export しないこと。文言と版番号は src/lib/mediaConsent.ts にある。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PROVIDERS = ['ekichika'];

/** その店舗を操作してよいか（オーナー本人・運営）。 */
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

function validTarget(provider: string, slot: number): string | null {
  if (!PROVIDERS.includes(provider)) return '媒体の指定が不正です';
  if (!Number.isFinite(slot) || slot < 1 || slot > 20) return '枠の指定が不正です';
  return null;
}

/**
 * 登録済みの連携を返す。
 * ★★★ パスワードは返さない。maskSecret() の ●●●● だけ。
 *   「登録されているか」は hasPassword で分かれば足りる。
 *   復号して返す口を作ると、その口が漏れ口になる。
 */
export async function getMediaCredentials(input: { salonId: string | number }): Promise<
  Result<{
    consentVersion: string;
    rows: Array<{
      provider: string;
      slot: number;
      shopId: string;
      loginId: string;
      passwordMask: string;
      hasPassword: boolean;
      isEnabled: boolean;
      needsConsent: boolean;
      consentAgreedAt: string | null;
      lastVerifiedAt: string | null;
      lastError: string | null;
    }>;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_media_credentials')
    .select('provider, slot, shop_id, login_id, password_enc, is_enabled, consent_version, consent_agreed_at, last_verified_at, last_error')
    .eq('salon_id', salonId);
  if (error) return { ok: false, error: error.message };

  const rows = (data ?? [])
    .map((r) => ({
      provider: r.provider as string,
      slot: Number(r.slot ?? 1),
      shopId: (r.shop_id as string | null) ?? '',
      loginId: (r.login_id as string | null) ?? '',
      passwordMask: r.password_enc ? maskSecret() : '',
      hasPassword: Boolean(r.password_enc),
      isEnabled: r.is_enabled !== false,
      needsConsent: needsConsent(r.consent_version as string | null),
      consentAgreedAt: (r.consent_agreed_at as string | null) ?? null,
      lastVerifiedAt: (r.last_verified_at as string | null) ?? null,
      lastError: (r.last_error as string | null) ?? null,
    }))
    .sort((a, b) => {
      const pi = PROVIDERS.indexOf(a.provider) - PROVIDERS.indexOf(b.provider);
      return pi !== 0 ? pi : a.slot - b.slot;
    });

  return { ok: true, data: { consentVersion: MEDIA_CONSENT_VERSION, rows } };
}

/**
 * 連携を登録・更新する。
 * ★★★ agreed が true で、かつ画面が見ていた版がいまの版と一致しないと保存しない。
 *   「同意のチェックだけ後から付ける」形にしないため、認証情報と同じ呼び出しで受け取る。
 * ★ password を空で送ると【変更しない】（登録済みのものを残す）。
 *   ●●●● 表示のまま店舗ID だけ直したいことがあるので、空＝削除にはしない。
 */
export async function saveMediaCredential(input: {
  salonId: string | number;
  provider: string;
  slot?: number;
  shopId: string;
  loginId: string;
  password: string;
  agreed: boolean;
  consentVersion: string;
}): Promise<Result<{ saved: true }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data: existing } = await svc
    .from('salon_media_credentials')
    .select('password_enc, consent_version')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();

  // ★★ 同意の検査。すでにいまの版で同意済みなら、毎回チェックを求めない
  const alreadyAgreed = !needsConsent((existing?.consent_version as string | null) ?? null);
  const agreeingNow = input.agreed === true && input.consentVersion === MEDIA_CONSENT_VERSION;
  if (!alreadyAgreed && !agreeingNow) {
    // ★ 版がずれている場合もここに来る。画面が古いまま送ってきた可能性があるので、そう言う
    return {
      ok: false,
      error:
        input.agreed === true
          ? '説明の内容が更新されています。画面を再読み込みして、もう一度ご確認ください'
          : '説明をお読みのうえ、同意のチェックを入れてください',
    };
  }

  const shopId = (input.shopId ?? '').trim();
  const loginId = (input.loginId ?? '').trim();
  const password = input.password ?? '';

  if (!shopId) return { ok: false, error: '店舗ID（shopid）を入れてください' };
  if (!loginId) return { ok: false, error: 'ログインIDを入れてください' };
  if (shopId.length > 100 || loginId.length > 200) return { ok: false, error: '入力が長すぎます' };
  if (password.length > 200) return { ok: false, error: 'パスワードが長すぎます' };
  // ★ 新規登録でパスワードが空なら、そもそもログインできない。ここで止める
  if (!password && !existing?.password_enc) return { ok: false, error: 'パスワードを入れてください' };

  const passwordEnc = password
    ? encryptSecret(password, { salonId, provider: input.provider, slot })
    : (existing!.password_enc as string);

  const nowISO = new Date().toISOString();
  const { error } = await svc.from('salon_media_credentials').upsert(
    {
      salon_id: salonId,
      provider: input.provider,
      slot,
      shop_id: shopId,
      login_id: loginId,
      password_enc: passwordEnc,
      is_enabled: true,
      consent_version: MEDIA_CONSENT_VERSION,
      // ★ すでに同意済みなら日時は上書きしない（「いつ同意したか」を新しくしない）
      ...(alreadyAgreed ? {} : { consent_agreed_at: nowISO, consent_agreed_by: guard.data.userId }),
      last_error: null,
      updated_at: nowISO,
    },
    { onConflict: 'salon_id,provider,slot' },
  );
  if (error) return { ok: false, error: error.message };

  const actor = 'shop:' + guard.data.userId;
  if (!alreadyAgreed) {
    await recordMediaAudit({
      salonId, provider: input.provider, slot,
      event: 'consent_agreed', outcome: 'ok',
      detail: { consentVersion: MEDIA_CONSENT_VERSION },
      actor,
    });
  }
  await recordMediaAudit({
    salonId, provider: input.provider, slot,
    event: 'credential_saved', outcome: 'ok',
    // ★ shop_id は公開ページから機械的に取れる値なので記録に残してよい（第38便 §5-2）
    detail: { shop_id: shopId, passwordChanged: Boolean(password) },
    actor,
  });

  return { ok: true, data: { saved: true } };
}

/**
 * 連携の停止・再開。
 * ★ 停止は【消さずに止める】。認証情報を消してしまうと、再開のたびに店舗へ聞き直すことになる。
 *   消したいときは deleteMediaCredential を使う。
 */
export async function setMediaCredentialEnabled(input: {
  salonId: string | number; provider: string; slot?: number; enabled: boolean;
}): Promise<Result<{ enabled: boolean }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_media_credentials')
    .update({ is_enabled: input.enabled === true, updated_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot);
  if (error) return { ok: false, error: error.message };

  await recordMediaAudit({
    salonId, provider: input.provider, slot,
    event: input.enabled === true ? 'credential_enabled' : 'credential_disabled',
    outcome: 'ok',
    actor: 'shop:' + guard.data.userId,
  });

  return { ok: true, data: { enabled: input.enabled === true } };
}

/** 登録そのものを消す。★ 監査ログは消えない（追記専用）。 */
export async function deleteMediaCredential(input: {
  salonId: string | number; provider: string; slot?: number;
}): Promise<Result<{ deleted: true }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { error } = await svc
    .from('salon_media_credentials')
    .delete()
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot);
  if (error) return { ok: false, error: error.message };

  await recordMediaAudit({
    salonId, provider: input.provider, slot,
    event: 'credential_deleted', outcome: 'ok',
    actor: 'shop:' + guard.data.userId,
  });

  return { ok: true, data: { deleted: true } };
}

/**
 * ★★★ 接続テスト（第41便）。
 *   実際に駅ちかへログインし、出勤ページが読めるところまでを1回だけ試す。
 *
 * ★★ 読むだけ。**駅ちかを一切書き換えない。** だから何度押しても店舗に影響が無い。
 * ★★ 結果はその場では返らない。中継役（VPS）が1分ごとに引き取り、
 *   終わると last_verified_at / last_error と履歴に出る。
 *   → 画面には「受け付けました」と出し、しばらくして履歴を見てもらう。
 *   ★ ここで待たない（Vercel の関数は最長でも数十秒。相手のサーバーを待つ場所ではない）。
 *
 * ★ 同意が済んでいない枠では走らせない。認証情報を使う操作は、同意の後ろにしか置かない。
 */
export async function startMediaConnectionTest(input: {
  salonId: string | number; provider: string; slot?: number;
}): Promise<Result<{ jobId: string; note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data: row } = await svc
    .from('salon_media_credentials')
    .select('consent_version')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  if (!row) return { ok: false, error: 'ログイン情報が登録されていません' };
  if (needsConsent(row.consent_version as string | null)) {
    return { ok: false, error: '連携の説明に同意してから実行してください' };
  }

  try {
    const r = await startRelayFlow({
      salonId, provider: input.provider, slot,
      intent: 'connect_test',
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { jobId: r.jobId, note: r.note } };
  } catch (e) {
    // ★ 例外文に秘密が混ざらないよう、こちら側で作った文言だけ返す
    console.error('[media] 接続テストを始められなかった', (e as Error).message);
    return { ok: false, error: '接続テストを開始できませんでした。時間をおいてお試しください' };
  }
}

/**
 * ★★★ 試し打ち（第43便）。「いまフクエスの出勤を駅ちかへ反映したら、何がどう変わるか」を
 *   組み立てて記録に残すだけ。★★ **駅ちかへは1文字も送らない。**
 *
 * ★ 接続テストとの違いは、読んだあとフクエス側と突き合わせるところまで進むこと。
 *   ★ どちらも【読むだけ】なので、何度押しても店舗に影響が無い。
 *
 * ★★ 設計メモ §11-3: 読み取り→書き込みへ切り替えた直後の1回目は、
 *   必ず試し打ちで差分を見せ、人が承認してから送る。その「差分を見せる」側がこれ。
 *   ★ 送る側（承認して実際に書く）は第44便。ここにはまだ無い。
 */
export async function startMediaWorkDryRun(input: {
  salonId: string | number; provider: string; slot?: number;
}): Promise<Result<{ jobId: string; note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data: row } = await svc
    .from('salon_media_credentials')
    .select('consent_version')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  if (!row) return { ok: false, error: 'ログイン情報が登録されていません' };
  if (needsConsent(row.consent_version as string | null)) {
    return { ok: false, error: '連携の説明に同意してから実行してください' };
  }

  try {
    const r = await startRelayFlow({
      salonId, provider: input.provider, slot,
      intent: 'work_dryrun',
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { jobId: r.jobId, note: r.note } };
  } catch (e) {
    console.error('[media] 試し打ちを始められなかった', (e as Error).message);
    return { ok: false, error: '確認を開始できませんでした。時間をおいてお試しください' };
  }
}

/**
 * ★★★ 保存してある「反映内容」（試し打ちの結果）を返す（第44便）。
 *
 * ★ まだ送っていない計画。**送った記録ではない。** 画面の文言もそう読めるようにすること。
 * ★ media_work_plans は service_role でしか読めない。ここでオーナー検証を通したものだけ返す。
 * ★ 差分は最大でも「人数 × 7日」なので、そのまま返してよい大きさ（送信項目1000件の上限が効くため）。
 */
export type WorkPlanView = {
  createdAt: string;
  sendable: boolean;
  targets: number;
  activeShifts: number;
  changeCount: number;
  fieldCount: number;
  dateLabels: string[];
  countsBefore: number[];
  countsAfter: number[];
  diff: Array<{ girlId: string; name: string; dayIndex: number; before: string; after: string }>;
  blockers: Array<{ kind: string; detail: string; count?: number }>;
  notes: Array<{ kind: string; detail: string; count?: number }>;
};

export async function getMediaWorkPlan(input: {
  salonId: string | number; provider: string; slot?: number;
}): Promise<Result<WorkPlanView | null>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('media_work_plans')
    .select('created_at, sendable, targets, active_shifts, change_count, field_count, date_labels, counts_before, counts_after, diff, blockers, notes')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  if (error) {
    console.error('[media] 反映内容を読めなかった', error.message);
    return { ok: false, error: '反映内容を取得できませんでした' };
  }
  if (!data) return { ok: true, data: null };

  const r = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      createdAt: String(r['created_at']),
      sendable: r['sendable'] === true,
      targets: Number(r['targets'] ?? 0),
      activeShifts: Number(r['active_shifts'] ?? 0),
      changeCount: Number(r['change_count'] ?? 0),
      fieldCount: Number(r['field_count'] ?? 0),
      dateLabels: (r['date_labels'] as string[] | null) ?? [],
      countsBefore: (r['counts_before'] as number[] | null) ?? [],
      countsAfter: (r['counts_after'] as number[] | null) ?? [],
      diff: (r['diff'] as WorkPlanView['diff'] | null) ?? [],
      blockers: (r['blockers'] as WorkPlanView['blockers'] | null) ?? [],
      notes: (r['notes'] as WorkPlanView['notes'] | null) ?? [],
    },
  };
}

/**
 * この店舗の連携の記録を返す（画面の「履歴」）。
 * ★★ listMediaAudit は service_role で読む。salonId は必ずオーナー検証を通したものを渡す。
 */
export async function getMediaAuditRows(input: { salonId: string | number; limit?: number }): Promise<
  Result<Array<{ id: number; provider: string; slot: number; outcome: string; summary: string; createdAt: string }>>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  try {
    const rows = await listMediaAudit({ salonId, limit: Number(input.limit ?? 30) });
    // ★ detail / actor / job_id は画面に出さない。店舗が読むのは「何が起きたか」だけでよい
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id, provider: r.provider, slot: r.slot,
        outcome: r.outcome, summary: r.summary, createdAt: r.createdAt,
      })),
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
