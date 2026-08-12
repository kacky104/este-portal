'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import { HP_DEMO_SLUG } from '@/app/lib/hpSite';
import { getBusinessDateJST } from '@/lib/dutyStatus';

// 公式HPの【サンプル店舗（デモ）】管理（2026-08-09・運営専用）。
//
// デザイン一覧（/hp/templates）の「デモ →」が参照するサンプル店舗を、
// /admin からワンクリックで生成・管理できるようにする。手作業だった
// 「ダミーサロン作成 → mypage でセラピスト登録 → SQL で salon_sites 行」を全部自動化。
//
// 生成されるもの:
//  - salons 1行（is_hidden=true・show_on_top=false → 本体の一覧・トップには一切出ない）
//  - salon_sites 1行（slug='demo'・タイプS gold・design_locked・status=draft）
//    ※ draft でも /hp/demo/preview/... は表示される（プレビューは status を見ない）。
//      /hp/demo 直アクセスは「準備中」になるので一般ユーザーには何も見えない。
//  - セラピスト5名（名前・年齢・体型・キャッチ入り。写真は /admin から差し替え）
//  - 出勤スケジュール14日分（毎日3〜4名・時間帯もばらす）
//
// すべて運営（ADMIN_UUID）専用。書き込みは service_role で行う。

type Err = { ok: false; error: string };

export type DemoTherapist = {
  id: string;
  name: string;
  age: number | null;
  bodyType: string;
  imageUrl: string | null;
};

export type DemoState = {
  exists: boolean;
  salonId: number | null;
  salonName: string;
  status: string;
  heroImages: number;
  therapists: DemoTherapist[];
  /** 出勤が入っている未来日数（今日から数えて） */
  scheduledDays: number;
};

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '運営のみ操作できます' };
  return { ok: true };
}

type Svc = ReturnType<typeof createServiceClient>;

async function findDemoSalonId(svc: Svc): Promise<number | null> {
  const { data } = await svc
    .from('salon_sites')
    .select('salon_id')
    .eq('slug', HP_DEMO_SLUG)
    .maybeSingle();
  return data ? Number(data.salon_id) : null;
}

/** 'YYYY-MM-DD' の n 日後（JST・営業日基準の起点は getBusinessDateJST）。 */
function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

// ── 取得 ─────────────────────────────────────────────
export async function getHpDemoState(): Promise<{ ok: true; state: DemoState } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const salonId = await findDemoSalonId(svc);
  if (salonId === null) {
    return {
      ok: true,
      state: { exists: false, salonId: null, salonName: '', status: '', heroImages: 0, therapists: [], scheduledDays: 0 },
    };
  }

  const [salonRes, siteRes, thRes] = await Promise.all([
    svc.from('salons').select('name').eq('id', salonId).maybeSingle(),
    svc.from('salon_sites').select('status, hero_images').eq('salon_id', salonId).maybeSingle(),
    svc.from('therapists').select('id, name, age, body_type, profile_image_url').eq('salon_id', salonId).order('name'),
  ]);

  const therapists: DemoTherapist[] = (thRes.data ?? []).map((t) => ({
    id: String(t.id),
    name: (t.name as string) ?? '',
    age: (t.age as number | null) ?? null,
    bodyType: (t.body_type as string | null) ?? '',
    imageUrl: (t.profile_image_url as string | null) ?? null,
  }));

  // 今日以降で出勤が入っている日数（ざっくりの健康チェック用）
  const today = getBusinessDateJST();
  const { data: schedDays } = await svc
    .from('therapist_schedules')
    .select('schedule_date')
    .in('therapist_id', therapists.map((t) => t.id))
    .gte('schedule_date', today)
    .eq('is_active', true);
  const scheduledDays = new Set((schedDays ?? []).map((r) => String(r.schedule_date))).size;

  const heroImages = Array.isArray(siteRes.data?.hero_images) ? (siteRes.data!.hero_images as unknown[]).length : 0;

  return {
    ok: true,
    state: {
      exists: true,
      salonId,
      salonName: (salonRes.data?.name as string) ?? '',
      status: (siteRes.data?.status as string) ?? 'draft',
      heroImages,
      therapists,
      scheduledDays,
    },
  };
}

// ── 生成 ─────────────────────────────────────────────
// サンプル店舗の在籍名簿（この配列が「正」。増やしたら /admin の「セラピストを補充」で反映する）
const DEMO_THERAPISTS = [
  { name: 'みれい', age: 24, body_type: 'スレンダー',   catchphrase: '透明感あふれる正統派セラピスト' },
  { name: 'ゆあ',   age: 26, body_type: 'グラマー',     catchphrase: '包み込むような癒やしのひととき' },
  { name: 'さくら', age: 22, body_type: '癒やし系',     catchphrase: '笑顔がかわいい若手のホープ' },
  { name: 'れな',   age: 25, body_type: 'モデル系',     catchphrase: '目を惹くスタイルと丁寧な施術' },
  { name: 'ひなの', age: 23, body_type: '小柄・華奢',   catchphrase: '小さな身体で芯のあるトリートメント' },
  { name: 'あやか', age: 27, body_type: '大人系',       catchphrase: '落ち着いた所作で満たす上質な時間' },
  { name: 'ことは', age: 21, body_type: '清楚・童顔',   catchphrase: 'やわらかな雰囲気と丁寧な手つき' },
  { name: 'りお',   age: 26, body_type: 'スレンダー',   catchphrase: '指先まで神経の行き届いた施術を' },
] as const;

/** DEMO_THERAPISTS の1件 → therapists への insert 行。 */
function demoTherapistRow(t: (typeof DEMO_THERAPISTS)[number], salonId: number) {
  return {
    salon_id:          salonId,
    name:              t.name,
    age:               t.age,
    body_type:         t.body_type,
    catchphrase:       t.catchphrase,
    area:              '中洲・天神・薬院',
    work_hours:        null,
    comment:           null,
    profile_image_url: null,
    profile_text:      null,
    is_new_face:       false,
    new_face_since:    null,
  };
}

// 出勤パターン（日替わりで3〜4名・時間帯もばらす）
const SHIFT_PATTERNS = [
  { start: '12:00', end: '22:00' },
  { start: '15:00', end: '23:00' },
  { start: '18:00', end: '24:00' },
  { start: '13:00', end: '21:00' },
];

async function seedSchedules(svc: Svc, therapistIds: string[]): Promise<string | null> {
  const today = getBusinessDateJST();
  // 在籍数の6割（最少3・最多6）を「その日の出勤枠」とし、日替わりで回す。
  // 端数の枠は偶数日だけ出勤にして人数に揺らぎを作る（毎日同じ人数だと不自然なため）。
  const slots = Math.max(3, Math.min(6, Math.round(therapistIds.length * 0.6)));
  const rows: Record<string, unknown>[] = [];
  for (let day = 0; day < 14; day++) {
    const date = addDays(today, day);
    therapistIds.forEach((id, i) => {
      const slot = (i + day) % therapistIds.length;
      const on = slot < slots - 1 || (slot === slots - 1 && day % 2 === 0);
      const p = SHIFT_PATTERNS[(i + day) % SHIFT_PATTERNS.length];
      rows.push({
        therapist_id: id,
        schedule_date: date,
        is_active: on,
        start_time: on ? p.start : null,
        end_time: on ? p.end : null,
      });
    });
  }
  const { error } = await svc
    .from('therapist_schedules')
    .upsert(rows, { onConflict: 'therapist_id,schedule_date' });
  return error ? error.message : null;
}

/** サンプル店舗を一式生成する（既にあれば何もしない）。 */
export async function createHpDemo(): Promise<{ ok: true; salonId: number } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const existing = await findDemoSalonId(svc);
  if (existing !== null) return { ok: true, salonId: existing };

  // 1) サロン本体（非表示・トップ非掲載。/admin の handleAdd と同じ列構成）
  const { data: salonRow, error: salonErr } = await svc
    .from('salons')
    .insert({
      name:              'AROMA FUKUES',
      catchphrase:       'LUXURY AROMA PRIVATE SALON',
      area:              '中洲・天神・薬院',
      price:             '60分 12,000円〜',
      hours:             '12:00〜LAST',
      phone:             '090-0000-0000',
      postal_code:       '',
      address:           '福岡市中央区（サンプル表示）',
      access:            '天神駅より徒歩5分',
      closed_days:       '不定休',
      owner_id:          null,
      show_on_top:       false,
      dispatch_type:     'none',
      rating:            0,
      review_count:      0,
      courses: [
        { name: 'スタンダードコース', duration: '60分',  price: '12,000円' },
        { name: 'スタンダードコース', duration: '90分',  price: '16,000円' },
        { name: 'スタンダードコース', duration: '120分', price: '21,000円' },
        { name: 'プレミアムコース',   duration: '90分',  price: '20,000円' },
        { name: 'プレミアムコース',   duration: '120分', price: '26,000円' },
      ],
      tags:              [],
      description:       '',
      appeal:            '',
      therapist_count:   null,
      therapist_types:   null,
      therapist_profile: '',
      note:              '公式HP営業用のサンプル店舗（実在しません）。削除・公開しないこと。',
      is_hidden:         true,
    })
    .select('id')
    .single();
  if (salonErr || !salonRow) return { ok: false, error: `サロンの作成に失敗しました: ${salonErr?.message}` };
  const salonId = Number(salonRow.id);

  // 2) 公式HP行（タイプS gold で確定済み・非公開）
  const { error: siteErr } = await svc.from('salon_sites').insert({
    salon_id:      salonId,
    slug:          HP_DEMO_SLUG,
    status:        'draft',
    template_key:  's',
    theme_key:     'gold',
    design_locked: true,
    hero_catch:    '上質な体験を、あなたのサロンに。',
    concept_title: 'コンセプト',
    concept_text:
      '日常の喧騒から離れた、静かなプライベート空間。\n厳選されたセラピストによる丁寧なオールハンドトリートメントで、心と身体をゆっくりとほどいていきます。\n\n照明・アロマ・音楽まで細部にこだわった非日常のひとときを、ぜひご体験ください。',
    contract_note: '公式HP営業用のサンプルサイト。契約行ではない。',
  });
  if (siteErr) return { ok: false, error: `サイト行の作成に失敗しました: ${siteErr.message}` };

  // 3) セラピスト5名
  const { data: thRows, error: thErr } = await svc
    .from('therapists')
    .insert(DEMO_THERAPISTS.map((t) => demoTherapistRow(t, salonId)))
    .select('id');
  if (thErr) return { ok: false, error: `セラピストの作成に失敗しました: ${thErr.message}` };

  // 4) 出勤14日分
  const seedErr = await seedSchedules(svc, (thRows ?? []).map((r) => String(r.id)));
  if (seedErr) return { ok: false, error: `出勤の作成に失敗しました: ${seedErr}` };

  return { ok: true, salonId };
}

/** 出勤スケジュールを今日から14日分作り直す（日が経って出勤が切れたとき用）。 */
export async function reseedHpDemoSchedules(): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const salonId = await findDemoSalonId(svc);
  if (salonId === null) return { ok: false, error: 'サンプル店舗がまだありません' };

  const { data: thRows } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const ids = (thRows ?? []).map((r) => String(r.id));
  if (ids.length === 0) return { ok: false, error: 'サンプル店舗にセラピストがいません' };

  const seedErr = await seedSchedules(svc, ids);
  if (seedErr) return { ok: false, error: `出勤の再生成に失敗しました: ${seedErr}` };
  return { ok: true };
}

/**
 * 名簿（DEMO_THERAPISTS）に居るのに DB に居ないセラピストを追加し、出勤も作り直す。
 * 既存のセラピスト（写真を差し替え済みのもの）は名前で照合して触らない＝何度押しても安全。
 */
export async function syncHpDemoTherapists(): Promise<{ ok: true; added: number; total: number } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const salonId = await findDemoSalonId(svc);
  if (salonId === null) return { ok: false, error: 'サンプル店舗がまだありません' };

  const { data: existing, error: readErr } = await svc
    .from('therapists')
    .select('id, name')
    .eq('salon_id', salonId);
  if (readErr) return { ok: false, error: `在籍の取得に失敗しました: ${readErr.message}` };

  const have = new Set((existing ?? []).map((r) => String(r.name ?? '')));
  const missing = DEMO_THERAPISTS.filter((t) => !have.has(t.name));

  if (missing.length > 0) {
    const { error } = await svc
      .from('therapists')
      .insert(missing.map((t) => demoTherapistRow(t, salonId)));
    if (error) return { ok: false, error: `セラピストの追加に失敗しました: ${error.message}` };
  }

  // 追加ぶんも出勤に入るよう、全員で作り直す
  const { data: all } = await svc.from('therapists').select('id').eq('salon_id', salonId);
  const ids = (all ?? []).map((r) => String(r.id));
  const seedErr = await seedSchedules(svc, ids);
  if (seedErr) return { ok: false, error: `出勤の再生成に失敗しました: ${seedErr}` };

  return { ok: true, added: missing.length, total: ids.length };
}

/** サンプルセラピストの写真を差し替える（url=null で削除）。 */
export async function setHpDemoTherapistImage(
  therapistId: string,
  url: string | null,
): Promise<{ ok: true } | Err> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const svc = createServiceClient();
  const salonId = await findDemoSalonId(svc);
  if (salonId === null) return { ok: false, error: 'サンプル店舗がまだありません' };

  // 対象がサンプル店舗のセラピストであることを必ず確認（他店の写真を書き換えさせない）
  const { data: th } = await svc
    .from('therapists')
    .select('id, salon_id')
    .eq('id', therapistId)
    .maybeSingle();
  if (!th || Number(th.salon_id) !== salonId) {
    return { ok: false, error: 'サンプル店舗のセラピストではありません' };
  }

  const { error } = await svc
    .from('therapists')
    .update({ profile_image_url: url })
    .eq('id', therapistId);
  if (error) return { ok: false, error: `保存に失敗しました: ${error.message}` };
  return { ok: true };
}
