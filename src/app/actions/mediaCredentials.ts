'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { encryptSecret, maskSecret } from '@/lib/mediaCredentials';
import { MEDIA_CONSENT_VERSION, needsConsent } from '@/lib/mediaConsent';
import { recordMediaAudit, listMediaAudit } from '@/app/lib/media/mediaAudit';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { judgeWriteStall, stallMessage, mediaSlotLabel, type MediaLinkAlert } from '@/lib/mediaLinkStall';
import { judgeImportStall } from '@/lib/importStall';
import { isWriteDirection, isLinkMode, hasApprovedOnce } from '@/lib/mediaLinkMode';
import { loadCastIds } from '@/lib/mediaCastIds';
import { providerLabel } from '@/lib/mediaAudit';
import { findMediaSite } from '@/lib/mediaSites';
import {
  siteDirection,
  directionLabel,
  canSwitchDirection,
  nextImportAt,
  maskAddress,
} from '@/lib/mediaOverview';
import {
  buildRoster,
  type RosterResult,
  type RosterTherapist,
  type RosterRun,
  type RosterSnapshot,
  type RosterLink,
} from '@/lib/mediaRoster';

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

// ★ 受け付ける媒体。★ src/lib/mediaSites.ts の accepting と揃えること（第80便でエステラブを追加）。
//   ★ 片方だけ変えると、画面には登録フォームが出るのに server action が弾く形になる。
//   ★ DB 側の CHECK 制約（20260831_import_sources_esulove.sql）も同じ組でそろえる。
const PROVIDERS = ['ekichika', 'esulove'];

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
      /**
       * 連携の向き（第45便）。'none' | 'read' | 'write'。
       * ★ null は「取り込みの設定行そのものが無い」＝まだ連携の向きが決まっていない枠。
       *   'none'（連携しない）とは別物なので、まとめないこと。
       */
      linkMode: string | null;
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

  // ★ 向きは取り込み設定（salon_import_sources）が持つ。認証情報とは別のテーブルなので引き直す。
  //   ★★ 読み取りだけの店は認証情報を持たない（公開ページを読むだけ）ので、
  //     向きを認証情報の側に置くことはできない。逆に書き込みの店は両方を持つ。
  const { data: srcs } = await svc
    .from('salon_import_sources')
    .select('provider, slot, link_mode')
    .eq('salon_id', salonId);
  const modeOf = new Map<string, string>();
  for (const s of srcs ?? []) {
    modeOf.set(`${String(s.provider)}:${Number(s.slot ?? 1)}`, String(s.link_mode ?? 'read'));
  }

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
      linkMode: modeOf.get(`${String(r.provider)}:${Number(r.slot ?? 1)}`) ?? null,
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

  // ★★ 店舗IDを預かるサイトでだけ必須にする（第81便）。
  //   ★ エステラブはログインに店舗IDを使わない（追記53 §286）。画面にも欄を出していない。
  //   ★ ここを直さないと、欄が無いのに「入れてください」と言われて詰まる。
  //   ★ 出勤に要る shop_id は、向こうの画面から読む（人に入れさせない）。
  const site = findMediaSite(input.provider);
  if (site?.needsShopId !== false && !shopId) {
    return { ok: false, error: '店舗ID（shopid）を入れてください' };
  }
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
  /** ★ 承認したときに送る指紋。空なら承認できない（第46便） */
  fingerprint: string;
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
    .select('created_at, sendable, targets, active_shifts, change_count, field_count, date_labels, counts_before, counts_after, diff, blockers, notes, fingerprint')
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
      fingerprint: String(r['fingerprint'] ?? ''),
      diff: (r['diff'] as WorkPlanView['diff'] | null) ?? [],
      blockers: (r['blockers'] as WorkPlanView['blockers'] | null) ?? [],
      notes: (r['notes'] as WorkPlanView['notes'] | null) ?? [],
    },
  };
}

/**
 * ★★★ 連携の向きを変える（第46便・設計メモ §11-2）。
 *
 * ★ 'read' ↔ 'write' は【1つの列の別の値】なので、同時に立つことはない。
 * ★★ 向きを変えたら、保存してある計画は消す。前の向きで作った差分は意味が違う。
 * ★ 切り替えただけでは駅ちかへ何も送らない。送るのは承認ボタンを押したときだけ。
 */
export async function setMediaLinkMode(input: {
  salonId: string | number; provider: string; slot?: number; mode: string;
}): Promise<Result<{ mode: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };
  if (!isLinkMode(input.mode)) return { ok: false, error: '入力する場所の指定が不正です' };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  // ★★★ 自動にできるのは「いまの向きになってから1回でも反映が成功している枠」だけ（§54）。
  //   ★ 画面にもスイッチを出さないが、**画面だけで守らない**。ここでも見る。
  //     第38便 §17-16 と同じ作法（受け口でも判定する）。
  if (input.mode === 'write_auto') {
    const h = await readWriteHistory(svc, salonId, input.provider, slot);
    if (!hasApprovedOnce(h)) {
      return {
        ok: false,
        error: 'まず1回、画面で内容をご確認のうえ承認してください。自動にできるのはそのあとです',
      };
    }
  }

  const { data: before } = await svc
    .from('salon_import_sources')
    .select('link_mode')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();

  const { data: updated, error } = await svc
    .from('salon_import_sources')
    .update({ link_mode: input.mode, updated_at: new Date().toISOString() })
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .select('id');
  if (error) return { ok: false, error: '入力する場所を変えられませんでした' };
  if (!updated || updated.length === 0) {
    return { ok: false, error: 'この枠の連携設定が見つかりません（運営にお問い合わせください）' };
  }

  // ★ 前の向きで作った計画を残さない
  await svc.from('media_work_plans').delete()
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot);

  await recordMediaAudit({
    salonId, provider: input.provider, slot,
    event: 'link_mode_changed', outcome: 'ok',
    // ★ from も残す（第48便）。「どこから来たか」が無いと、あとで区間を数えるのに苦労する
    detail: { mode: input.mode, from: String(before?.link_mode ?? '') },
    actor: 'shop:' + guard.data.userId,
  });

  return { ok: true, data: { mode: input.mode } };
}

/**
 * ★★★ 承認して実際に送る（第46便）。**駅ちかを書き換える唯一の入口。**
 *
 * ★ 承認は「その場で読み直して、その場で送る」と一体。承認だけを保存して後で送る形にしない。
 *   → ここで渡すのは【指紋】だけ。実際に送る内容は、中継が読み直したページから作り直す。
 *     指紋が違えば送らずに止まる（src/app/lib/media/relayFlow.ts の planWork）。
 * ★ 向きが 'write' の枠でしか受け付けない。
 */
export async function startMediaWorkPush(input: {
  salonId: string | number; provider: string; slot?: number; fingerprint: string;
}): Promise<Result<{ jobId: string; note: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const slot = Math.trunc(Number(input.slot ?? 1));
  const ng = validTarget(input.provider, slot);
  if (ng) return { ok: false, error: ng };

  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data: cred } = await svc
    .from('salon_media_credentials')
    .select('consent_version')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  if (!cred) return { ok: false, error: 'ログイン情報が登録されていません' };
  if (needsConsent(cred.consent_version as string | null)) {
    return { ok: false, error: '連携の説明に同意してから実行してください' };
  }

  // ★ 向きが 'write' でなければ送らない
  const { data: src } = await svc
    .from('salon_import_sources')
    .select('link_mode')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  // ★ write / write_auto のどちらでも受ける（自動の枠でも、人がその場で押せる方が良い）
  if (!src || !isWriteDirection(String((src as { link_mode?: string }).link_mode))) {
    return { ok: false, error: '「フクエスから駅ちかへ反映する」に切り替えてから実行してください' };
  }

  // ★★ 画面が見ていた計画と、いま保存されている計画が同じであること。
  //   別の端末で「反映内容を確認」を押し直していたら、画面の指紋は古い。
  const { data: plan } = await svc
    .from('media_work_plans')
    .select('sendable, change_count, fingerprint')
    .eq('salon_id', salonId).eq('provider', input.provider).eq('slot', slot)
    .maybeSingle();
  if (!plan) return { ok: false, error: '反映する内容がありません。先に「反映内容を確認」を押してください' };
  if (plan.sendable !== true) return { ok: false, error: 'いまの内容は送れません。止めた理由をご確認ください' };
  if (Number(plan.change_count ?? 0) === 0) return { ok: false, error: '変えるところがありません' };
  const saved = String(plan.fingerprint ?? '');
  if (!saved || saved !== input.fingerprint) {
    return { ok: false, error: '内容が新しくなっています。画面を開き直してご確認ください' };
  }

  try {
    const r = await startRelayFlow({
      salonId, provider: input.provider, slot,
      intent: 'work_push',
      approvedFingerprint: saved,
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { jobId: r.jobId, note: r.note } };
  } catch (e) {
    console.error('[media] 反映を始められなかった', (e as Error).message);
    return { ok: false, error: '反映を開始できませんでした。時間をおいてお試しください' };
  }
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

/**
 * ★★ 監査ログから「最後に書く向きへ切り替えた時刻」と「最後に反映できた時刻」を拾う（第48便）。
 *
 * ★ 新しい箱を作らない。第47便の見張りと同じ材料をそのまま使う（設計メモ §54）。
 * ★ 追記専用の監査ログなので、消えることはあっても書き換わることはない。
 */
async function readWriteHistory(
  svc: ReturnType<typeof createServiceClient>,
  salonId: number,
  provider: string,
  slot: number,
): Promise<{ switchedToWriteAt: string | null; lastWriteOkAt: string | null }> {
  const { data } = await svc
    .from('salon_media_audit')
    .select('event, outcome, detail, created_at')
    .eq('salon_id', salonId).eq('provider', provider).eq('slot', slot)
    .in('event', ['link_mode_changed', 'write_work'])
    .order('created_at', { ascending: false })
    .limit(100);

  // ★★★ 欲しいのは「いまの書く向きが、いつ始まったか」。
  //   ★ write → write_auto の切り替えで【1回目の承認をやり直させない】ため、
  //     直前の書く向きへの切り替えではなく、**書く向きが連続している区間の先頭**を取る。
  //     危ないのは read/none から来たときだけ（§11-3）。向きの中での模様替えは危なくない。
  //   → 新しい順に見て、書く向き以外の切り替えに当たったら、そこで打ち切る。
  let switchedToWriteAt: string | null = null;
  let lastWriteOkAt: string | null = null;
  let leftWrite = false;
  for (const r of data ?? []) {
    const at = String(r.created_at);
    if (r.event === 'write_work' && r.outcome === 'ok') {
      if (lastWriteOkAt === null) lastWriteOkAt = at;   // 新しい順なので最初の1件が最新
      continue;
    }
    if (r.event !== 'link_mode_changed' || leftWrite) continue;
    const mode = (r.detail as { mode?: unknown } | null)?.mode;
    if (mode === 'write' || mode === 'write_auto') {
      switchedToWriteAt = at;      // ★ さらに古い書く向きの切り替えがあれば、そちらで上書きされる
    } else {
      leftWrite = true;            // ★ ここで書く向きが途切れている。これ以上さかのぼらない
    }
  }
  return { switchedToWriteAt, lastWriteOkAt };
}

/**
 * ★★★ 「書き込みの向きにしたまま止まっている枠」を返す（第47便）。
 *
 * ★ 追記11 §32 の裏返し。向きを write にすると取り込みが止まるので、
 *   承認しないまま放置されると【出勤がどこからも更新されない】。
 *   店舗もこちらも気づけないので、こちらが気づいて画面に出す（設計メモ §2-3）。
 *
 * ★★ 判定そのものは src/lib/mediaLinkStall.ts の純粋関数。ここは値を集めるだけ。
 *   now もそちらへ渡す。★ 判定の中で時刻を取らない＝点検で作れる状態にしておく。
 */
export async function getMediaLinkAlerts(input: { salonId: string | number }): Promise<Result<MediaLinkAlert[]>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  // ★★ 第51便から【全部の枠】を読む。向きで担当が分かれる:
  //   書く向き（write / write_auto）… judgeWriteStall（第47便）
  //   読む向き・未設定               … judgeImportStall（第51便）
  //   ★ 以前は書く向きだけを読んでいた。★ 読む向きの停止を誰も見張っていなかった（追記20 §91）
  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('id, provider, slot, link_mode, is_enabled, last_run_at, import_interval_min, created_at')
    .eq('salon_id', salonId);
  if (srcErr) return { ok: false, error: '連携の状態を確認できませんでした' };
  if (!sources || sources.length === 0) return { ok: true, data: [] };

  // ★ 監査ログは追記専用で消えない（migration のとおり）。新しい順に少しだけ読む。
  //   ★ 枠ごとに問い合わせを分けない（枠が増えるほど往復が増える形にしない）。
  const { data: audit, error: auErr } = await svc
    .from('salon_media_audit')
    .select('provider, slot, event, outcome, detail, created_at')
    .eq('salon_id', salonId)
    .in('event', ['link_mode_changed', 'write_work'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (auErr) return { ok: false, error: '連携の記録を確認できませんでした' };

  const key = (p: string, s: number) => p + '#' + s;
  const switchedAt = new Map<string, string>();
  const lastOkAt = new Map<string, string>();
  for (const r of audit ?? []) {
    const k = key(String(r.provider), Number(r.slot));
    const at = String(r.created_at);
    if (r.event === 'write_work' && r.outcome === 'ok') {
      if (!lastOkAt.has(k)) lastOkAt.set(k, at);          // 新しい順なので最初の1件が最新
    } else if (r.event === 'link_mode_changed') {
      const mode = (r.detail as { mode?: unknown } | null)?.mode;
      if (mode === 'write' && !switchedAt.has(k)) switchedAt.set(k, at);
    }
  }

  const now = new Date();
  const alerts: MediaLinkAlert[] = [];
  for (const s of sources) {
    const provider = String(s.provider);
    const slot = Number(s.slot);
    const k = key(provider, slot);
    const linkMode = (s.link_mode as string | null) ?? null;

    // ── 書く向き: 押したまま送っていないか（第47便）─────────────────
    if (isWriteDirection(linkMode)) {
      const verdict = judgeWriteStall({
        linkMode,
        switchedToWriteAt: switchedAt.get(k) ?? null,
        lastWriteOkAt: lastOkAt.get(k) ?? null,
        now,
      });
      const message = stallMessage(verdict, mediaSlotLabel(provider, slot));
      if (verdict.stalled && message) {
        alerts.push({
          provider, slot, watch: 'write',
          reason: verdict.reason, elapsedHours: verdict.elapsedHours, message,
        });
      }
      continue;   // ★ 書く向きの枠では取り込みは止まっていて当然。二重に鳴らさない
    }

    // ── 読む向き: 取り込みが止まっていないか（第51便）───────────────
    //   ★★ 時計は2本。★ どちらか片方だけを見ると、2026-08-29 の事故は捕まらない:
    //     当日の周（list・15分ごと）は正常なのに、週間の周（full・1日1回）が3日止まっていた。
    //   ★ full が走ったかは salon_import_runs にしか残らない（ingest-list は書かない）。
    const { data: runs } = await svc
      .from('salon_import_runs')
      .select('started_at')
      .eq('source_id', Number(s.id))
      .order('started_at', { ascending: false })
      .limit(1);
    const fullLastRunAt = (runs ?? [])[0] ? String((runs ?? [])[0].started_at) : null;

    for (const f of judgeImportStall({
      provider, slot,
      linkMode,
      isEnabled: s.is_enabled === true,
      listLastRunAt: (s.last_run_at as string | null) ?? null,
      fullLastRunAt,
      intervalMin: (s.import_interval_min as number | null) ?? null,
      createdAt: (s.created_at as string | null) ?? null,
      now,
    })) {
      alerts.push({
        provider, slot, watch: 'import',
        reason: f.clock + '_' + f.reason,     // ★ 'list_stale' / 'full_never' …
        elapsedHours: f.elapsedHours,
        message: f.message,
      });
    }
  }
  return { ok: true, data: alerts };
}

/**
 * ★ 「自動にできる枠」を返す（第48便）。画面のスイッチを出すかどうかの判定に使う。
 *
 * ★★ 画面だけで守らない。setMediaLinkMode 側でも同じ判定をしている（§54）。
 *   ここは**出す／出さない**を決めるだけ。守りは受け口側。
 */
export async function getMediaAutoEligible(input: { salonId: string | number }): Promise<
  Result<Array<{ provider: string; slot: number; eligible: boolean }>>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data: sources, error } = await svc
    .from('salon_import_sources')
    .select('provider, slot, link_mode')
    .eq('salon_id', salonId);
  if (error) return { ok: false, error: '連携の状態を確認できませんでした' };

  const out: Array<{ provider: string; slot: number; eligible: boolean }> = [];
  for (const s of sources ?? []) {
    const provider = String(s.provider);
    const slot = Number(s.slot);
    // ★ 書く向きの枠だけ見る。read/none の枠に自動の話は出さない（§11-5「選ばなかった側を出さない」）
    if (!isWriteDirection(String(s.link_mode))) { out.push({ provider, slot, eligible: false }); continue; }
    const h = await readWriteHistory(svc, salonId, provider, slot);
    out.push({ provider, slot, eligible: hasApprovedOnce(h) });
  }
  return { ok: true, data: out };
}

/**
 * 名簿の突き合わせ（第49便・設計メモ §1-4 / §2-1 の2 / §8）。
 *
 * ★★★ 読み取りだけ。1行も書かない。
 *   §4「新人登録を先にやらない。登録は人を増やす＝失敗すると重複掲載を自分で作る（禁則269）」。
 *   まず「揃っていないこと」が見えるようにする。直すのは駅ちかの登録フォームを実機で調べたあと。
 *
 * ★ 返すのは【取り込みの設定行がある枠】だけ。
 *   設定が無い枠に「0人」と出すと、揃っているように見えてしまう（§1-5 の全国0人と同じ形）。
 *   画面側は、この配列に無い枠については「設定がまだありません」と出すこと。
 *
 * ★ 判断そのものは src/lib/mediaRoster.ts（純粋関数・now も引数）に置いてある。
 *   ここは【読んで渡すだけ】。★ ここで数えたり判定したりしないこと。
 */
export async function getMediaRoster(input: { salonId: string | number }): Promise<Result<RosterResult[]>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('id, provider, slot, link_mode')
    .eq('salon_id', salonId)
    .order('provider')
    .order('slot');
  if (srcErr) return { ok: false, error: '連携の設定を読めませんでした' };
  if (!sources || sources.length === 0) return { ok: true, data: [] };

  // ★ 在籍は1回だけ読む。枠ごとに読み直さない（枠が増えても問い合わせを増やさない）。
  const { data: therapists, error: thErr } = await svc
    .from('therapists')
    .select('id, name, is_active, import_cast_id')
    .eq('salon_id', salonId);
  if (thErr) return { ok: false, error: 'セラピストを読めませんでした' };

  const people: RosterTherapist[] = (therapists ?? []).map((t) => ({
    id: Number(t.id),
    name: String(t.name ?? ''),
    isActive: t.is_active === true,
  }));
  const castIdRows = (therapists ?? []).map((t) => ({
    id: Number(t.id),
    import_cast_id: (t.import_cast_id as string | null) ?? null,
  }));

  const now = new Date();
  const out: RosterResult[] = [];

  for (const s of sources) {
    const provider = String(s.provider);
    const slot = Number(s.slot);

    // ★ 旧 therapists.import_cast_id は「駅ちかの枠1」としてだけ混ざる（mediaCastIds.ts）。
    //   ここで自前に読み替えると、その規則が2か所に分かれる。必ず loadCastIds を通すこと。
    const { maps, error: castErr } = await loadCastIds(svc, { therapists: castIdRows, provider, slot });
    if (castErr) return { ok: false, error: '媒体側の番号を読めませんでした' };
    // ★★ 結びつきは【対で1本】にして渡す（第52便）。
    //   以前は therapist_id の配列と castId の配列を別々に渡しており、
    //   ★ 片方だけ渡す・順番がずれるといった食い違いが作れる形だった。
    const links: RosterLink[] = [];
    for (const [id, castId] of maps.castIdOf) {
      if (!castId) continue;
      links.push({ therapistId: id, castId });
    }

    // ★ 直近の取り込み1回ぶんだけ。★ 無ければ null のまま渡す（0件に潰さない）。
    const { data: runs } = await svc
      .from('salon_import_runs')
      .select('started_at, status, unmatched')
      .eq('source_id', Number(s.id))
      .order('started_at', { ascending: false })
      .limit(1);
    const run = (runs ?? [])[0];
    const lastRun: RosterRun | null = run
      ? {
          startedAt: String(run.started_at),
          status: String(run.status),
          unmatched: ((run.unmatched as string[] | null) ?? []).map((n) => String(n)),
        }
      : null;

    // ★ 媒体側の名簿の写し（第50便）。★ 無ければ null のまま渡す（0人に潰さない）
    const { data: snapRow } = await svc
      .from('media_roster_snapshots')
      .select('read_at, entries')
      .eq('salon_id', salonId)
      .eq('provider', provider)
      .eq('slot', slot)
      .maybeSingle();
    const snapshot: RosterSnapshot | null = snapRow
      ? {
          readAtISO: String(snapRow.read_at),
          entries: ((snapRow.entries as Array<{ castId?: unknown; name?: unknown }> | null) ?? []).map(
            (e) => ({ castId: String(e?.castId ?? ''), name: String(e?.name ?? '') }),
          ),
        }
      : null;

    out.push(
      buildRoster({
        provider,
        slot,
        linkMode: (s.link_mode as string | null) ?? null,
        therapists: people,
        links,
        lastRun,
        snapshot,
        now,
      }),
    );
  }

  return { ok: true, data: out };
}

/**
 * ★★ 媒体側の名簿を読みに行く（第50便・設計メモ 追記18 §81の1）。
 *
 * ★★★ **読むだけ。駅ちかへは1文字も書かない。**
 *   接続テスト（connect_test）と同じ「読むだけ」の仲間で、読む先が違う
 *   （出勤ページではなく /admin/girls/ の女の子一覧）。
 *
 * ★ 向きが write / write_auto の枠でも実行してよい。
 *   取り込みの周とは別に、明示的に1回読むものだから（追記17 §72 の「古くて当然」に当たらない）。
 *
 * ★ 結果は非同期。中継役が1分ごとに引き取り、media_roster_snapshots に写しが1件残る。
 *   ★ ここで結果を待たない（待つと関数が中継の都合に縛られる）。
 */
export async function startMediaRosterRead(input: {
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
      intent: 'roster_read',
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { jobId: r.jobId, note: r.note } };
  } catch (e) {
    // ★ 例外文に秘密が混ざらないよう、こちら側で作った文言だけ返す
    console.error('[media] 名簿の読み取りを始められなかった', (e as Error).message);
    return { ok: false, error: '名簿の読み取りを開始できませんでした。時間をおいてお試しください' };
  }
}

/**
 * ★★ 投稿用メールアドレスを駅ちかから取り込む（第53便・設計メモ 追記26）。
 *
 * ★★★ 駅ちかへは1文字も書かない。読むだけ。
 *   書き換えるのは【フクエス側の】therapist_diary_forward（写メ日記の転送先）。
 *
 * ★★ 2段（第43便の作法）:
 *   apply=false（既定） … 何件入れるつもりかを数えるだけ。★ 1行も書かない
 *   apply=true          … 実際に登録する。★ 常に上書き（カッキーさんの決定）
 *
 * ★ 結果は非同期。中継役が引き取ってから「連携の記録」に件数が出る。
 *   ★ アドレスの値は記録にも画面にも出さない（秘密値）。
 */
export async function startMediaMailImport(input: {
  salonId: string | number; provider: string; slot?: number; apply?: boolean;
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
      // ★ 既定は試し打ち。★ apply を明示したときだけ書く
      intent: input.apply === true ? 'mail_apply' : 'mail_dryrun',
      actor: 'shop:' + guard.data.userId,
    });
    if (!r.ok) return { ok: false, error: r.note };
    return { ok: true, data: { jobId: r.jobId, note: r.note } };
  } catch (e) {
    console.error('[media] 投稿用アドレスの取り込みを始められなかった', (e as Error).message);
    return { ok: false, error: '取り込みを開始できませんでした。時間をおいてお試しください' };
  }
}

/**
 * 媒体連携の入口（/mypage/media）に出す状態をまとめて返す（第56便・㉞）。
 *
 * ★★★ なぜ1本にまとめたか
 *   入口は「いま何が起きているか」を1枚で見せる画面。★ 枠ごと・媒体ごとに往復すると、
 *   サイトが4つになったときに問い合わせが4倍になる。★ 1回で足りる形にしておく。
 *
 * ★ 判定そのものは src/lib/mediaOverview.ts（純粋関数）が持つ。ここは材料を集めるだけ。
 *   ★ 時刻も now を作って渡す。★ 判定の中で now を呼ばない（引き継ぎメモ 3-1）。
 *
 * ★★ 失敗しても画面は止めない、は呼び出し側の作法。ここは素直にエラーを返す。
 */
export async function getMediaOverview(input: { salonId: string | number }): Promise<
  Result<{
    /** フクエスに登録されているセラピストの人数 */
    therapistCount: number;
    sites: Array<{
      provider: string;
      slot: number;
      /** 店舗が読む媒体名（'ekichika' とは書かない） */
      label: string;
      /** 'read' | 'write' | 'unset' */
      direction: string;
      /** 「読み込み」「反映のみ」「未設定」 */
      statusLabel: string;
      /** 向きの切り替えボタンを出してよいか（★ 読める媒体だけ） */
      canSwitch: boolean;
      /**
       * ★ いま自動で反映しているか（link_mode === 'write_auto'）。
       *   ★★ direction は write_auto も 'write' に畳むので、これが無いと画面から区別できない。
       *     自動の入り切りは「出勤を送る」に置くので、そこで要る（第65便・設計メモ §206）。
       */
      autoOn: boolean;
      hasCredential: boolean;
      /** 最後にその管理画面へログインできた時刻 */
      lastVerifiedAt: string | null;
      /** 最後の取り込み（当日の周） */
      listLastRunAt: string | null;
      /** 最後のフル取り込み（週間の周） */
      fullLastRunAt: string | null;
      /** 最後に反映できた時刻 */
      lastWriteOkAt: string | null;
      /** ★ 次の取り込み。分からない・止まっているときは null */
      nextImportAt: string | null;
    }>;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const now = new Date();

  const { data: sources, error: srcErr } = await svc
    .from('salon_import_sources')
    .select('id, provider, slot, link_mode, is_enabled, last_run_at, import_interval_min')
    .eq('salon_id', salonId);
  if (srcErr) return { ok: false, error: '連携の状態を確認できませんでした' };

  const { data: creds, error: crErr } = await svc
    .from('salon_media_credentials')
    .select('provider, slot, is_enabled, password_enc, last_verified_at')
    .eq('salon_id', salonId);
  if (crErr) return { ok: false, error: 'ログイン情報を確認できませんでした' };

  // ★ 最後に反映できた時刻。★ 枠ごとに問い合わせを分けない（枠が増えるほど往復が増える形にしない）
  const { data: audit } = await svc
    .from('salon_media_audit')
    .select('provider, slot, event, outcome, created_at')
    .eq('salon_id', salonId)
    .eq('event', 'write_work')
    .eq('outcome', 'ok')
    .order('created_at', { ascending: false })
    .limit(200);

  const { count: therapistCount } = await svc
    .from('therapists')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId);

  const key = (p: string, s: number) => p + '#' + s;

  const credOf = new Map<string, { hasCredential: boolean; lastVerifiedAt: string | null }>();
  for (const c of creds ?? []) {
    credOf.set(key(String(c.provider), Number(c.slot ?? 1)), {
      // ★ 「行がある」ではなく「使える」かどうか。止めてある枠・パスワードが無い枠は持っていない扱い
      hasCredential: c.is_enabled !== false && Boolean(c.password_enc),
      lastVerifiedAt: (c.last_verified_at as string | null) ?? null,
    });
  }

  const writeOkOf = new Map<string, string>();
  for (const a of audit ?? []) {
    const k = key(String(a.provider), Number(a.slot));
    if (!writeOkOf.has(k)) writeOkOf.set(k, String(a.created_at));   // 新しい順なので最初が最新
  }

  // ★ 取り込みの枠と、ログイン情報だけある枠の【両方】を出す。
  //   ★ 片方しか無い状態は普通にある（読むだけの店は鍵を持たない／登録しただけで向き未決定）。
  const keys = new Set<string>([...(sources ?? []).map((s) => key(String(s.provider), Number(s.slot ?? 1))), ...credOf.keys()]);
  const sourceOf = new Map<string, (typeof sources extends (infer U)[] | null ? U : never)>();
  for (const s of sources ?? []) sourceOf.set(key(String(s.provider), Number(s.slot ?? 1)), s);

  const sites: Array<{
    provider: string; slot: number; label: string; direction: string; statusLabel: string;
    canSwitch: boolean; autoOn: boolean; hasCredential: boolean; lastVerifiedAt: string | null;
    listLastRunAt: string | null; fullLastRunAt: string | null; lastWriteOkAt: string | null;
    nextImportAt: string | null;
  }> = [];

  for (const k of keys) {
    const [provider, slotStr] = k.split('#');
    const slot = Number(slotStr);
    const src = sourceOf.get(k);
    const cred = credOf.get(k);

    const facts = {
      provider,
      slot,
      linkMode: (src?.link_mode as string | null) ?? null,
      // ★ 取り込み設定の行そのものが無い枠は、止めているのではなく「まだ決めていない」。
      //   ★ どちらにせよ向きは unset になるが、意味が違うので false を作らず true で渡す
      sourceEnabled: src ? src.is_enabled === true : true,
      hasCredential: cred?.hasCredential === true,
    };

    const direction = siteDirection(facts);

    // ★ フル取り込み（週間の周）は runs にしか残らない。★ 読む向きの枠だけ引く
    let fullLastRunAt: string | null = null;
    if (direction === 'read' && src?.id != null) {
      const { data: runs } = await svc
        .from('salon_import_runs')
        .select('started_at')
        .eq('source_id', Number(src.id))
        .order('started_at', { ascending: false })
        .limit(1);
      fullLastRunAt = (runs ?? [])[0] ? String((runs ?? [])[0].started_at) : null;
    }

    const listLastRunAt = (src?.last_run_at as string | null) ?? null;
    const next = direction === 'read'
      ? nextImportAt({
          lastRunAt: listLastRunAt,
          intervalMin: (src?.import_interval_min as number | null) ?? null,
          now,
        })
      : null;

    sites.push({
      provider,
      slot,
      label: providerLabel(provider),
      direction,
      // ★ read の文言には媒体の名前が入る（第86便）。★ 決め打ちにしない
      statusLabel: directionLabel(direction, providerLabel(provider)),
      canSwitch: canSwitchDirection(facts),
      // ★ 生の link_mode を画面へ流さず、要る1点だけを boolean にして渡す
      autoOn: facts.linkMode === 'write_auto',
      hasCredential: facts.hasCredential,
      lastVerifiedAt: cred?.lastVerifiedAt ?? null,
      listLastRunAt,
      fullLastRunAt,
      lastWriteOkAt: writeOkOf.get(k) ?? null,
      nextImportAt: next ? next.toISOString() : null,
    });
  }

  // ★ 並びは媒体の順。★ 知らない媒体は後ろへ（消さない）
  sites.sort((a, b) => {
    const ia = PROVIDERS.indexOf(a.provider);
    const ib = PROVIDERS.indexOf(b.provider);
    const na = ia < 0 ? 999 : ia;
    const nb = ib < 0 ? 999 : ib;
    return na !== nb ? na - nb : a.slot - b.slot;
  });

  return { ok: true, data: { therapistCount: therapistCount ?? 0, sites } };
}

/**
 * 写メ日記の投稿先を、店舗ぶんまとめて返す（第58便・㉞ その3）。
 *
 * ★★★ 写メ日記を受け取れるのは【駅ちかとエステラブだけ】。
 *   エステ魂はメール投稿が無く、全国エステランキングは写メ日記機能そのものが無い
 *   （2026-08-26 調査・migration 20260826_diary_forward.sql の冒頭）。
 *   ★ だから「4サイトのうち2つだけ」を画面にそう書く。
 *
 * ★★ アドレスは秘密値。★ 伏せ字にして返す（maskAddress）。
 *   ★ 生の値を返す口をここに作らない。1人ぶんを直すのはセラピスト画面の仕事。
 */
export async function getSalonDiaryForwards(input: { salonId: string | number }): Promise<
  Result<{
    /** 写メ日記の正本（'fukues' なら他媒体へ転送する） */
    diarySource: string;
    /** 名前つきのセラピスト（フクエスに登録されている全員） */
    therapists: Array<{ id: string; name: string }>;
    /** 登録済みの投稿先（★ アドレスは伏せ字） */
    forwards: Array<{ therapistId: string; provider: string; slot: number; addressMask: string; isEnabled: boolean }>;
    /** ★ 最後に読み取った記録（無ければ null）。★ 「0件」と「まだ読んでいない」を混ぜない */
    lastRead: { at: string; applied: boolean; created: number; updated: number; unchanged: number; unmatched: number } | null;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  const { data: ths, error: thErr } = await svc
    .from('therapists')
    .select('id, name')
    .eq('salon_id', salonId)
    .order('id', { ascending: true });
  if (thErr) return { ok: false, error: 'セラピストを読み込めませんでした' };

  const ids = (ths ?? []).map((t) => Number(t.id));
  let forwards: Array<{ therapistId: string; provider: string; slot: number; addressMask: string; isEnabled: boolean }> = [];
  if (ids.length > 0) {
    const { data: fw, error: fwErr } = await svc
      .from('therapist_diary_forward')
      .select('therapist_id, provider, slot, address, is_enabled')
      .in('therapist_id', ids);
    if (fwErr) return { ok: false, error: '投稿先を読み込めませんでした' };
    forwards = (fw ?? []).map((r) => ({
      therapistId: String(r.therapist_id),
      provider: String(r.provider),
      slot: Number(r.slot ?? 1),
      // ★★ ここで伏せる。★ 生のアドレスはこの関数の外へ出さない
      addressMask: maskAddress(r.address as string | null),
      isEnabled: r.is_enabled !== false,
    }));
  }

  // ★ 最後の読み取り（read_maillist）。★ 見つからない＝「0件」ではなく「まだ読んでいない」
  const { data: audit } = await svc
    .from('salon_media_audit')
    .select('detail, created_at, outcome')
    .eq('salon_id', salonId)
    .eq('event', 'read_maillist')
    .eq('outcome', 'ok')
    .order('created_at', { ascending: false })
    .limit(1);
  const a0 = (audit ?? [])[0];
  const d = (a0?.detail as Record<string, unknown> | null) ?? null;
  const num = (k: string) => {
    const v = d?.[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };
  const lastRead = a0
    ? {
        at: String(a0.created_at),
        applied: d?.['applied'] === true,
        created: num('created'),
        updated: num('updated'),
        unchanged: num('unchanged'),
        unmatched: num('unmatched'),
      }
    : null;

  const { data: salon } = await svc.from('salons').select('diary_source').eq('id', salonId).maybeSingle();

  return {
    ok: true,
    data: {
      diarySource: (salon?.diary_source as string | null) ?? 'benry',
      therapists: (ths ?? []).map((t) => ({ id: String(t.id), name: (t.name as string | null) ?? '' })),
      forwards,
      lastRead,
    },
  };
}

/**
 * セラピスト一覧に出すフクエス側の情報（第62便・㉞ その4）。
 *
 * ★★★ この画面の主役は【フクエスに登録されているセラピスト】。
 *   各サイトはその出先として横に並べる（設計メモ §180）。
 *   ★ だから、ここが返すのはフクエスの側だけ。媒体側の状態は getMediaRoster が持つ。
 *
 * ★ 写真は公開ページにも出ているものなので秘密値ではない。そのまま返してよい。
 */
export async function getSalonTherapists(input: { salonId: string | number }): Promise<
  Result<Array<{
    id: string;
    name: string;
    age: string | null;
    imageUrl: string | null;
    isNewFace: boolean;
    newFaceSince: string | null;
  }>>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('therapists')
    .select('id, name, age, profile_image_url, is_new_face, new_face_since')
    .eq('salon_id', salonId)
    .order('id', { ascending: true });
  if (error) return { ok: false, error: 'セラピストを読み込めませんでした' };

  return {
    ok: true,
    data: (data ?? []).map((t) => ({
      id: String(t.id),
      name: (t.name as string | null) ?? '',
      age: t.age == null ? null : String(t.age),
      imageUrl: (t.profile_image_url as string | null) ?? null,
      isNewFace: t.is_new_face === true,
      newFaceSince: (t.new_face_since as string | null) ?? null,
    })),
  };
}
