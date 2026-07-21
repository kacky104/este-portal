import Link from "next/link";
import { Logo } from '@/app/components/Logo';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { notFound } from "next/navigation";
import { createPublicClient } from "@/app/lib/supabase/public";
import { getTheme, breadcrumbCurrentColor } from "@/app/lib/themes";
import { SalonOnDutyExcludingNow } from "@/components/SalonTherapists";
import { ImasuguList } from "./ImasuguList";
import type { Metadata } from "next";
import { buildSalonSubpageMetadata } from "../subpageMetadata";

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。詳細は ../subpageMetadata.ts。
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return buildSalonSubpageMetadata(id, "imasugu", "今すぐ案内");
}

// ISR：10分ごとに再生成（保存時は /api/revalidate で即時無効化）。
export const revalidate = 600;

// 事前生成はせず、初回アクセス時にその場生成→以降キャッシュ（ランタイムISR）。
// Next 16 では revalidate を効かせるため generateStaticParams（空配列）が必須。dynamicParams は既定 true。
export async function generateStaticParams() {
  return [];
}

export default async function SalonImasuguPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  // salon 本体（テーマ・店名）を取得。
  // ※「今すぐ」一覧は時刻ベース判定のためサーバー（ISRキャッシュ対象）では絞り込まず、
  //   クライアントの ImasuguList でマウント時の現在時刻で算出する（焼き付き防止）。
  const { data: salonRow, error } = await supabase
    .from("salons")
    .select("id, name, theme")
    .eq("id", Number(id))
    .single();

  if (error || !salonRow) notFound();

  const theme = getTheme(salonRow.theme as string | null);

  // 壁紙（theme.key 依存）を取得。
  const { data: wallpaperRow } = await supabase
    .from("theme_wallpapers")
    .select("image_url")
    .eq("theme_key", theme.key)
    .maybeSingle();

  const wallpaperUrl = (wallpaperRow?.image_url as string | undefined) ?? null;

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

  const salonName = (salonRow.name as string) ?? "";

  return (
    <div className="relative min-h-screen overflow-x-clip" style={{ color: theme.text }}>

      {/* 背景レイヤー（テーマ壁紙） */}
      <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle} />

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b shadow-sm" style={{ backgroundColor: `${theme.card}E6`, borderColor: theme.cardBorder }}>
        <div className="max-w-4xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2"><SavedSalonsMenu /><VipLetterIcon /><NotificationBell /><AccountMenu /></div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* ─── パンくずリスト：トップ › サロン名 › 今すぐ（他ページと同形式） ─── */}
        <nav aria-label="パンくずリスト" className="flex items-center gap-1.5 mb-3" style={{ fontSize: "13px" }}>
          <Link href="/" className="hover:opacity-80 transition-opacity flex-shrink-0 whitespace-nowrap" style={{ color: "#ec4899" }}>
            トップ
          </Link>
          <span aria-hidden className="flex-shrink-0" style={{ color: "#999" }}>›</span>
          <Link href={`/salon/${id}`} className="hover:opacity-80 transition-opacity inline-block max-w-[45%] truncate align-middle" style={{ color: "#ec4899" }}>
            {salonName || "店舗"}
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

        {/* 今すぐ一覧（時刻ベース判定のためクライアントでマウント時に算出。0名は「お店にお問い合わせください」） */}
        <ImasuguList salonId={Number(id)} cardBg={theme.card} cardBorder={theme.cardBorder} bodyColor={theme.body} />

        {/* 下段：本日出勤のうち「今すぐ」を除いた残り（出勤中→出勤予定→受付終了）。0名ならセクションごと非表示。 */}
        <SalonOnDutyExcludingNow salonId={Number(id)} theme={theme} />
      </main>
    </div>
  );
}
