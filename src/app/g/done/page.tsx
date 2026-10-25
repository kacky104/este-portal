import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import { acrylicStandSalonHref, acrylicStandTherapistHref } from '@/lib/ga';
import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { isPointToken } from '@/lib/points';
import { readClaim, readMyPoints, readUse, type ClaimView } from '@/app/lib/points/server';
import { PointsClaimCard } from './PointsClaimCard';
import { PointsUseCard } from './PointsUseCard';

// 同意書の送信が終わったあとの画面（第560便）。★ 同意書の中身は出さない（戻るボタンで同意書に戻れないように、送信後はここへ置き換える）。
// ★ 第1404便（2026-10-11・カッキーさん）: 「フクエスでこのお店を見る」を出す（部屋のアクリルスタンド → 同意書 → ここ → お店ページ）。
//    ・s = お店の番号（送信のときサーバーが返す。フクエスで非表示のお店は付かない＝案内を出さない）
//    ・リンクには印（acrylic_stand / qr）だけ付ける。お客様や予約が分かる値は付けない（lib/ga.ts）
//    ・★ <a rel="noreferrer"> のふつうのリンクにする（next/link にしない）。この画面の「前のページ」は同意書（合言葉入りのアドレス）なので、
//       それを移動先や Google へ渡さないため。
// ★ 第1405便（2026-10-12・カッキーさん）: 予約の時刻は出さない（「12:30〜の予約で了承しました」→「了承しました」）。
//    お店の都合で開始が遅れたとき（13:00 の予約が 13:15 開始）に「13:00〜」と出ると、お客様が勘違いしてセラピストが責められるため。
// ★ 第1406便（2026-10-12・カッキーさん「もっと興味をそそる画像に」）: 画像1枚（public/consent-done/hero.webp・1080×1350・下は真っ白）に文字を重ねる形。
//    ・右上の空き ＝「了承しました」（同意が済んだことを最初に見せる）／下の白い余白 ＝ 案内とボタン。画像ぜんたいが押せる
//    ・★ 文字は画像に入れない（にじまない・文言だけ直せる）。画像を差し替えるときも「文字なし・左上に人物・下4割は真っ白」で作る
//    ・「この画面は閉じてください」は、リンクを出すときは出さない（押してほしいのに逆の案内になるため）。リンクを出さないお店では今までどおり出す
// ★ 第1655便（2026-10-25・カッキーさん「了承後の画面の見直し」案1＋案3）:
//    GA4 で acrylic_stand / qr は 10/1〜25 で46セッション（平均3分28秒・全入口で最長）なのに、アロマメイ様だけで同意は10月475回＝進むのは1割前後。
//    ・案1: 画像のすぐ下に「本日のセラピスト」（写真・名前 → セラピストページ）。t = 担当の番号（お店が公開のときだけ付く）。
//           ★ 在籍中（is_active が false でない）で、s のお店の子のときだけ出す（URL の t を書き換えても他店・退店の子は出ない）
//    ・案3: 来店ポイントを受け取れるときは、白い余白に「来店ポイント◯pt を受け取れます ↓」を出し、押すと下のポイント欄へ移る
//    ・リンクの目印は utm_content で salon / therapist に分ける（どの入口が押されたか GA4 で分かる）
//    ・★ 口コミ100pt の案内（案2）は入れない（100pt は初めての口コミだけ＝書いたことのある人に誤解を生む・カッキーさん）

export const metadata: Metadata = {
  title: 'ご案内',
  description: '',
  robots: { index: false, follow: false },
  openGraph: null,
  twitter: null,
};

// 部屋のアクリルスタンド（明朝体）と同じ印象にそろえる。端末に入っている明朝体を使う（フォントは読み込まない）
const SERIF = { fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif' } as const;
const BRAND = 'linear-gradient(90deg, #FB923C, #DB2777)';

export default async function GuideDonePage({ searchParams }: { searchParams: Promise<{ s?: string; c?: string; t?: string }> }) {
  const { s, c, t } = await searchParams;
  const salonHref = acrylicStandSalonHref(typeof s === 'string' ? s : '');

  // ★ 第1655便: 本日のセラピスト（お店のリンクが出るときだけ・そのお店の在籍中の子だけ）
  let therapist: { name: string; image: string | null; href: string } | null = null;
  const therapistHref = salonHref ? acrylicStandTherapistHref(typeof t === 'string' ? t : '') : null;
  if (therapistHref) {
    try {
      const svc = createServiceClient();
      const { data } = await svc.from('therapists').select('id, name, profile_image_url, salon_id, is_active').eq('id', Number(t)).maybeSingle();
      if (data && String(data.salon_id) === String(s) && data.is_active !== false && String(data.name ?? '').trim() !== '') {
        const img = typeof data.profile_image_url === 'string' && /^https:\/\//.test(data.profile_image_url) ? data.profile_image_url : null;
        therapist = { name: String(data.name).trim(), image: img, href: therapistHref };
      }
    } catch {
      therapist = null; // ★ 読めないときは欄を出さない（同意は済んでいる）
    }
  }

  // ★ 第1444便: フクエスポイント（加盟店で同意したときだけ c＝受け取り券がある）。★ 読めないときは欄を出さない
  let points: ReactNode = null;
  let claimablePoints: number | null = null; // ★ 第1655便: 受け取れる来店ポイント（白い余白の帯に出す）
  if (isPointToken(c)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const svc = createServiceClient();
    // ★ 第1454便: 「使う」の状態も一緒に読む（使用済みなら、この画面をセラピストに見せてもらう）
    const [view, spendView]: [ClaimView, Awaited<ReturnType<typeof readUse>>] = await Promise.all([readClaim(svc, c, user?.id ?? null), readUse(svc, c, user?.id ?? null)]);
    const mine = user && view.kind === 'claimed' && view.mine ? await readMyPoints(svc, user.id, 1) : null;
    const back = `/g/done?${new URLSearchParams({ ...(typeof s === 'string' && s ? { s } : {}), c }).toString()}`;
    if (view.kind === 'open') claimablePoints = view.points;
    if (view.kind !== 'none' || spendView.kind !== 'none') {
      points = (
        <div id="points" className="scroll-mt-2">
          {/* ★ 第1454便: 使う（お支払いに関わるので来店ポイントより上） */}
          {spendView.kind !== 'none' && <PointsUseCard token={c} view={spendView} loggedIn={!!user} returnPath={back} />}
          {view.kind !== 'none' && <PointsClaimCard token={c} view={view} loggedIn={!!user} balance={mine?.balance ?? null} returnPath={back} />}
        </div>
      );
    }
  }

  const picture = (
    <>
      <Image
        src="/consent-done/hero.webp"
        alt=""
        width={1080}
        height={1350}
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        className="block h-auto w-full"
      />
      {/* 右上の空き: 同意が済んだこと */}
      <div className="absolute left-[46%] right-[2%] top-[7%] text-center">
        <p className="text-[30px] leading-none text-emerald-600">✓</p>
        <p className="mt-2 text-[20px] font-black tracking-[0.04em] text-slate-800" style={SERIF}>了承しました</p>
        <p className="mt-1.5 text-[13px] leading-normal text-slate-600">
          ありがとう
          <br />
          ございました。
        </p>
      </div>
    </>
  );

  if (!salonHref) {
    return (
      <main className="mx-auto w-full max-w-md bg-white">
        <div className="relative text-slate-800">
          {picture}
          <div className="absolute inset-x-0 bottom-[4%] top-[56%] flex flex-col justify-center px-5 text-center">
            <p className="text-[14px] text-slate-500">この画面は閉じてください。</p>
          </div>
        </div>
        {points}
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-md bg-white">
      {/* ★ 第1430便（カッキーさん）: 第1428便の右上の ✕ はやめた（出さない） */}
      {/* ★ 第1655便: 画像（お店へ）とポイントの帯（下の欄へ）を兄弟のリンクにする（リンクの入れ子にしない） */}
      <div className="relative text-slate-800">
        <a href={salonHref} rel="noreferrer" className="block">
          {picture}
          {/* 下の白い余白: 案内とボタン */}
          <div className="absolute inset-x-0 bottom-[4%] top-[56%] flex flex-col justify-center px-5 text-center">
            <p className="text-[14px] tracking-[0.04em] text-slate-600" style={SERIF}>このお店の出勤・写メ日記・口コミは</p>
            <p className="mt-0.5 text-[17px] leading-[1.2] text-slate-700" style={SERIF}>
              <span className="mr-1 bg-clip-text text-[40px] font-bold text-transparent" style={{ backgroundImage: BRAND }}>フクエス</span>
              で
            </p>
            <span className="mt-3.5 block w-full px-4 py-[13px] text-[15px] font-bold text-white" style={{ backgroundImage: BRAND }}>
              このお店のページを見る　›
            </span>
          </div>
        </a>
        {claimablePoints != null && (
          <a
            href="#points"
            className="absolute left-1/2 top-[50%] z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-pink-300 bg-white/95 px-4 py-1.5 text-[13px] font-bold text-pink-600 shadow-sm"
          >
            🎁 来店ポイント{claimablePoints}ptを受け取れます ↓
          </a>
        )}
      </div>
      {therapist && (
        <a href={therapist.href} rel="noreferrer" className="mx-4 mb-4 mt-1 flex items-center gap-3 border border-slate-200 bg-white px-3 py-3 text-slate-800">
          {therapist.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- セラピストの写真は外部の保存先（next/image の許可先に依らない）
            <img src={therapist.image} alt="" width={64} height={64} className="h-16 w-16 shrink-0 object-cover" loading="eager" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center bg-pink-50 text-[22px] text-pink-400">♡</span>
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[11.5px] tracking-[0.04em] text-slate-500" style={SERIF}>本日のセラピスト</span>
            <span className="block truncate text-[18px] font-bold" style={SERIF}>{therapist.name}さん</span>
            <span className="mt-0.5 block text-[13px] font-bold text-pink-600">写メ日記・プロフィールを見る　›</span>
          </span>
        </a>
      )}
      {points}
    </main>
  );
}
