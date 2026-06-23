import Link from "next/link";
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { getBusinessDateJST } from "@/lib/dutyStatus";
import { formatBodySizes } from "@/lib/bodyType";
import { SalonOnDutyExcludingNow } from "@/components/SalonTherapists";

// "HH:MM〜HH:MM"（日跨ぎは終了側に「翌」）。GridCard の buildDisplayHours と同じ整形。
function buildDisplayHours(start: string | null, end: string | null): string {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const prefix = eh * 60 + (em || 0) < sh * 60 + (sm || 0) ? "翌" : "";
  return `${sh}:${pad(sm || 0)}〜${prefix}${eh}:${pad(em || 0)}`;
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

export default async function SalonImasuguPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // 第1段：salons と在籍セラピストは互いに独立なので並列取得。
  const [
    { data: salonRow, error },
    { data: therapistRows },
  ] = await Promise.all([
    supabase
      .from("salons")
      .select("id, name, theme")
      .eq("id", Number(id))
      .single(),
    supabase
      .from("therapists")
      .select("id, name, age, work_hours, body_type, profile_image_url, is_available_now, available_until")
      .eq("salon_id", Number(id)),
  ]);

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  // 時刻ベースで「今すぐ」を判定（is_available_now=true かつ available_until が未来）。最大3名。
  const nowMs = Date.now();
  const imasugu = (therapistRows ?? [])
    .filter(
      (t) =>
        Boolean(t.is_available_now) &&
        t.available_until != null &&
        new Date(t.available_until as string).getTime() > nowMs,
    )
    .slice(0, 3);

  // 第2段：壁紙（theme.key 依存）と当日スケジュール（imasugu の id 依存）を並列取得。
  // imasugu が空のときは .in が0件を返すため、scheduleMap は従来どおり空になる。
  const today = getBusinessDateJST();
  const [wallpaperRes, schedRes] = await Promise.all([
    supabase
      .from("theme_wallpapers")
      .select("image_url")
      .eq("theme_key", theme.key)
      .maybeSingle(),
    supabase
      .from("therapist_schedules")
      .select("therapist_id, start_time, end_time, is_active")
      .in("therapist_id", imasugu.map((t) => t.id))
      .eq("schedule_date", today),
  ]);

  const wallpaperUrl = (wallpaperRes.data?.image_url as string | undefined) ?? null;

  // 他のサロン配下ページと同じ背景レイヤー（壁紙＋テーマ色オーバーレイ、モバイル対応の固定配置）
  const bgLayerStyle: React.CSSProperties = {
    backgroundColor: theme.bg,
    ...(wallpaperUrl
      ? {
          backgroundImage: `linear-gradient(${theme.bg}D9, ${theme.bg}D9), url(${wallpaperUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {}),
  };

  // 出勤時間表示用に当日のスケジュールを構築
  const scheduleMap: Record<string, { start: string | null; end: string | null }> = {};
  (schedRes.data ?? []).forEach((r) => {
    if (!r.is_active) return;
    scheduleMap[String(r.therapist_id)] = {
      start: r.start_time ? String(r.start_time).slice(0, 5) : null,
      end: r.end_time ? String(r.end_time).slice(0, 5) : null,
    };
  });

  const salonName = (salonRow.name as string) ?? "";

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（テーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center flex-shrink-0">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="flex items-baseline gap-1"><span className="font-bold text-[22px] tracking-wide leading-none inline-block" style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>フクエス</span><span className="hidden min-[420px]:inline-block text-[12px] font-normal leading-none" style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'transparent' }}>～福岡メンズエステポータル～</span></span>
          </Link>
          <div className="flex items-center gap-2"><SavedSalonsMenu /><NotificationBell /><AccountMenu /></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 今すぐ（他ページと同形式） ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-6" style={{ fontSize: "13px" }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: "#ec4899" }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: "#999" }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: "#ec4899" }}>
            {salonName || "サロン"}
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: "#999" }}>›</span>
          <span aria-current="page" className="flex-shrink-0 whitespace-nowrap" style={{ color: breadcrumbCurrentColor(theme.key), fontWeight: 600 }}>今すぐ</span>
        </nav>

        {/* タイトル */}
        <div className="mb-6 text-center">
          <h1 className="font-bold whitespace-nowrap overflow-hidden" style={{ fontSize: "clamp(16px, 4vw, 24px)", textOverflow: "ellipsis", color: theme.heading }}>
            {salonName}
          </h1>
          <p className="text-sm mt-1" style={{ color: theme.body }}>今すぐ対応可能なセラピスト</p>
        </div>

        {imasugu.length === 0 ? (
          <p className="text-center text-base py-12 rounded-2xl" style={{ color: theme.body }}>
            お店にお問い合わせください
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {imasugu.map((t) => {
              const tid = String(t.id);
              const sched = scheduleMap[tid];
              const hours = buildDisplayHours(sched?.start ?? null, sched?.end ?? null) || (t.work_hours as string) || "";
              const bodySizes = formatBodySizes((t.body_type as string | null) ?? null);
              const name = (t.name as string) ?? "";
              const age = t.age as string | null;
              return (
                <div
                  key={tid}
                  className="imasugu-card-shine rounded-2xl border shadow-sm overflow-hidden flex flex-col"
                  style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
                >
                  {/* 写真（大きめ）＋今すぐバッジ */}
                  <div className="relative w-full aspect-[4/5] bg-gradient-to-br from-pink-300 to-rose-400 flex items-center justify-center overflow-hidden">
                    {t.profile_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.profile_image_url as string} alt={name} className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span className="text-white/70 font-bold text-5xl">{(name || "?").charAt(0)}</span>
                    )}
                    <span
                      className="absolute top-2.5 left-2.5 z-10"
                      style={{ background: "linear-gradient(to right, #ec4899, #f97316)", color: "white", fontSize: "13px", fontWeight: 700, padding: "4px 12px", borderRadius: "20px", whiteSpace: "nowrap" }}
                    >
                      今すぐ
                    </span>
                    {/* 名前(年齢)オーバーレイ（写真左下）。写真色に依存せず読めるよう下→上の黒スクリム＋白文字＋影。 */}
                    <div
                      className="absolute inset-x-0 bottom-0 px-3 pt-10 pb-2 z-10 pointer-events-none"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0))" }}
                    >
                      <p className="font-bold text-white truncate" style={{ fontSize: "18px", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
                        {name || "(名前未設定)"}{age ? ` (${age})` : ""}
                      </p>
                    </div>
                  </div>

                  {/* 情報（スリーサイズ・出勤時間を1行に横並び。名前(年齢)は写真内オーバーレイへ移動） */}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <div className="flex items-baseline gap-x-2 min-w-0 text-sm">
                      {bodySizes && (
                        <span className="whitespace-nowrap flex-shrink-0" style={{ color: theme.body }}>{bodySizes}</span>
                      )}
                      {hours && (
                        <span className="font-medium text-pink-600 whitespace-nowrap flex-shrink-0 ml-2">🕒 {hours}</span>
                      )}
                    </div>
                    <Link
                      href={`/therapist/${tid}`}
                      className="mt-auto inline-flex items-center justify-center text-white shadow-sm hover:opacity-90 transition-opacity"
                      style={{ background: "linear-gradient(to right, #ec4899, #f97316)", color: "#ffffff", borderRadius: "9999px", padding: "10px 24px", fontWeight: 600 }}
                    >
                      プロフィールを見る
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 下段：本日出勤のうち「今すぐ」を除いた残り（出勤中→出勤予定→受付終了）。0名ならセクションごと非表示。 */}
        <SalonOnDutyExcludingNow salonId={Number(id)} theme={theme} />
      </main>
    </div>
  );
}
