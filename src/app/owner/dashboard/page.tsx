import { redirect } from "next/navigation";
import { createClient } from "@/app/lib/supabase/server";
import { areaLabel } from "@/app/lib/areaLabel";
import { logout } from "@/app/actions/auth";
import { SALONS } from "@/app/lib/salonData";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/owner/login");
  }

  const salon = SALONS.find(
    (s) => s.id === Number(user.user_metadata?.salon_id)
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-pink-50 border border-pink-200 flex items-center justify-center">
              <span className="text-pink-500 font-bold text-sm leading-none">◆</span>
            </div>
            <span className="font-bold text-[15px] tracking-wide text-pink-600">
              店舗管理画面
            </span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-slate-500 hover:text-pink-600 transition-colors"
            >
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          ようこそ、{salon?.name ?? user.email} さん
        </h2>
        <p className="text-sm text-slate-500 mb-8">
          ログイン中: {user.email}
        </p>

        {salon && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-base font-semibold text-slate-800 mb-4">
              店舗情報
            </h3>
            <dl className="space-y-3 text-sm">
              {(
                [
                  ["店舗名", salon.name],
                  ["エリア", areaLabel(salon.area)],
                  ["営業時間", salon.hours],
                  ["電話番号", salon.phone],
                  ["住所", salon.address],
                  ["アクセス", salon.access],
                  ["定休日", salon.closedDays],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex gap-4">
                  <dt className="w-24 shrink-0 text-slate-400">{label}</dt>
                  <dd className="text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {!salon && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-sm text-amber-700">
            店舗情報が見つかりません。管理者にお問い合わせください。
          </div>
        )}
      </main>
    </div>
  );
}
