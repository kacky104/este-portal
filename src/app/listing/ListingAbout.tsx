// /listing の上部セクション（「掲載について」＋「掲載店舗様でできること」）の装飾版。
// 2026-08-17（第19便）にデザイン見本をもとに作成。
//
// ★ 見本の画像を1枚貼るのではなく、HTML・CSS で組んである（第18便のデザイン一覧と同じ方針）。
//   見出しも本文も生のテキストなので、検索エンジンにも読み上げにも乗る。
//
// ★ 文章は page.tsx にあったものを一字も変えずに移してある。
//   文言を変えるときは、ここだけ直せばよい（他のページには出ていない）。
//
// ★ 幅について。ページ本体は max-w-3xl（768px）だが、このセクションだけ 1280px にしている
//   （2026-08-17 オーナー判断）。そのため page.tsx 側で <main> の内側ラッパーを分け、
//   このコンポーネントは【全幅の帯】として置いている。
//   100vw を使う「はみ出し」手法は使っていない。Windows のスクロールバー幅ぶん
//   （約15px）横スクロールが出るため。帯そのものを全幅にすればその問題は起きない。
//
// ★ アイコンライブラリは入れていない（リポジトリの作法。salon/[id]/page.tsx のコメント参照）。
//   すべて lucide 相当のグリフを手書きのインラインSVGにしてある。依存は増やしていない。
//
// ★ 背景装飾は aria-hidden＋pointer-events-none の別レイヤーに隔離し、本文の後ろには重ねない。
//   セクションに overflow-hidden を付けてあるので、装飾がどれだけ外へ出ても横スクロールは出ない。

// 配色（デザイン見本の指定値）。Tailwind の既定色に無いので直値で持つ。
const CORAL = '#FF7373';
const CYAN = '#43C8CD';
const YELLOW = '#F7C94B';

/* ────────────────────────────────────────────────────────────
   アイコン（lucide 相当のグリフをインライン化。24×24・stroke ベース）
   ──────────────────────────────────────────────────────────── */

function IconStore() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M3.5 9h17l-1.4-5H4.9L3.5 9Z" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

function IconDiary() {
  // 写メ日記（本＋ハート）。
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" />
      <path d="M4 17.5h16" />
      <path d="M12 13.6s-2.6-1.7-2.6-3.3a1.6 1.6 0 0 1 2.6-1.2 1.6 1.6 0 0 1 2.6 1.2c0 1.6-2.6 3.3-2.6 3.3Z" />
    </svg>
  );
}

function IconCalendar() {
  // 出勤管理。
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="3" y="4.5" width="18" height="17" rx="2.5" />
      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
      <path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17.5h2M11 17.5h2" />
    </svg>
  );
}

function IconUserSearch() {
  // セラピスト求人（人＋虫めがね）。
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M3 20a6.5 6.5 0 0 1 9.6-5.7" />
      <circle cx="17" cy="16" r="3.2" />
      <path d="m19.4 18.4 2.1 2.1" />
    </svg>
  );
}

function IconMailStar() {
  // オファー（封筒＋星）。
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
      <rect x="2.5" y="6" width="15" height="12" rx="2" />
      <path d="m3 7.2 7.5 5 7.5-5" />
      <path d="m19.5 2.5.95 1.93 2.13.31-1.54 1.5.36 2.12-1.9-1-1.9 1 .36-2.12-1.54-1.5 2.13-.31Z" />
    </svg>
  );
}

// ★ 位置情報のピンは MapIllustration の中に直接書いてある。
//   最初 <svg> の中に <svg className="w-full h-full"> を入れ子にしたところ、
//   内側が親の座標系を無視して潰れ、ピンが「赤い板」になった（2026-08-17 実測で発見）。
//   入れ子の <svg> に w-full/h-full を渡さないこと。

/* ────────────────────────────────────────────────────────────
   イラスト
   ──────────────────────────────────────────────────────────── */

/**
 * 福岡の位置を示すイメージ。
 * ★ 正確な県境の地図ではなく「陸地＋位置ピン」の記号として描いている
 *   （デザイン指示でも「正確な地図が難しければ位置情報アイコンで可」とされている）。
 *   正確な形が要るときは県境のSVGを別途もらうこと。ここで手描きすると必ずどこかが嘘になる。
 */
function MapIllustration() {
  return (
    <svg viewBox="0 0 132 108" className="h-full w-full" role="presentation" aria-hidden="true">
      {/* 陸地イメージ（水色。1枚の面＋うっすら重ねた面で厚みを出す） */}
      <path
        d="M24 84c-8-7-7-19 1-25 7-5 8-13 17-16 9-3 15 3 24 2 8-1 15-6 22-1 8 5 7 16 2 23-4 6-5 13-12 17-8 5-17 2-26 3-10 1-20 4-28-3Z"
        fill={CYAN}
        opacity="0.22"
      />
      <path
        d="M36 82c-6-5-5-13 1-17 5-4 6-9 12-11 7-2 11 2 17 1 6-1 11-4 16-1 6 4 5 12 1 16-3 5-3 9-8 12-6 4-12 1-19 2-7 1-14 3-20-2Z"
        fill={CYAN}
        opacity="0.3"
      />
      {/* 位置ピン（塗り。親と同じ座標系に直接描く＝入れ子の <svg> にしない） */}
      <path
        d="M52 8c-11.6 0-21 9.4-21 21 0 15.2 18.7 35.9 19.5 36.8a2 2 0 0 0 3 0C54.3 64.9 73 44.2 73 29c0-11.6-9.4-21-21-21Z"
        fill={CORAL}
      />
      <circle cx="52" cy="29" r="8" fill="#FFF9F2" />
      {/* 接地の影 */}
      <ellipse cx="52" cy="70" rx="11" ry="3" fill={CORAL} opacity="0.18" />
    </svg>
  );
}

/** 店舗管理画面のイメージ（ノートPC＋機能アイコン）。CSS と小さなSVGだけで作る。 */
function DashboardIllustration() {
  const tile = 'flex items-center justify-center rounded-[10px] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.08)]';
  return (
    <div className="w-full max-w-[360px] mx-auto" aria-hidden="true">
      {/* 画面 */}
      <div className="rounded-[14px] border-[3px] border-slate-300 bg-white p-2 shadow-[0_10px_24px_-14px_rgba(15,23,42,0.35)]">
        <div className="flex gap-2">
          {/* 左のサイドバー */}
          <div className="w-[22%] shrink-0 rounded-[8px] p-1.5" style={{ backgroundColor: `${CYAN}33` }}>
            <div className="w-3.5 h-3.5 rounded-full mb-1.5" style={{ backgroundColor: '#fff' }} />
            <div className="h-1.5 rounded-full bg-white/90 mb-1" />
            <div className="h-1.5 rounded-full bg-white/70 mb-1 w-4/5" />
            <div className="h-1.5 rounded-full bg-white/70 mb-1" />
            <div className="h-1.5 rounded-full bg-white/50 w-3/5" />
          </div>
          {/* 右のコンテンツ（3×2のタイル） */}
          <div className="grid grid-cols-3 gap-1.5 flex-1" style={{ backgroundColor: '#F1F5F9', borderRadius: 8, padding: 6 }}>
            <div className={tile} style={{ color: CORAL }}>
              <span className="block w-5 h-5 m-2"><IconStore /></span>
            </div>
            {/* 店舗情報の文章を表す線（見本と同じ位置） */}
            <div className={`${tile} flex-col gap-1 px-2`}>
              <span className="block h-1.5 w-full rounded-full bg-slate-200" />
              <span className="block h-1.5 w-4/5 rounded-full bg-slate-200" />
              <span className="block h-1.5 w-3/5 rounded-full bg-slate-200" />
            </div>
            <div className={tile} style={{ color: CORAL }}>
              <span className="block w-5 h-5 m-2"><IconDiary /></span>
            </div>
            <div className={tile} style={{ color: CYAN }}>
              <span className="block w-5 h-5 m-2"><IconCalendar /></span>
            </div>
            <div className={tile} style={{ color: YELLOW }}>
              <span className="block w-5 h-5 m-2"><IconUserSearch /></span>
            </div>
            <div className={tile} style={{ color: CORAL }}>
              <span className="block w-5 h-5 m-2"><IconMailStar /></span>
            </div>
          </div>
        </div>
      </div>
      {/* 台座 */}
      <div className="mx-auto mt-1 h-2 w-[112%] max-w-none -translate-x-[5%] rounded-b-[10px] rounded-t-sm bg-slate-300" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   背景装飾（本文には重ねない。すべて aria-hidden）
   ──────────────────────────────────────────────────────────── */

function Sparkle({ className, color, size = 18 }: { className: string; color: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill={color} aria-hidden="true">
      <path d="M12 1.5c.7 5.6 2.6 8.3 8.4 9-5.8.7-7.7 3.4-8.4 9-.7-5.6-2.6-8.3-8.4-9 5.8-.7 7.7-3.4 8.4-9Z" />
    </svg>
  );
}

function Decorations() {
  // ドットは radial-gradient で作る（画像を足さない）。
  const dots = (color: string) => ({
    backgroundImage: `radial-gradient(${color} 1.6px, transparent 1.6px)`,
    backgroundSize: '12px 12px',
  });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none">
      {/* 左上のコーラルの塊。
          ★ スマホでは小さくして画面の角へ逃がすこと。
            当初は sm 以上と同じ大きさで出していたら、390px幅で
            「ABOUT FUKUES」と「掲載について」の真後ろに重なって読みにくくなった（実測で発見）。
            スマホは左右の余白が20pxしかなく、装飾を逃がす余地が無いのが理由。 */}
      <div
        className="absolute -left-12 -top-12 h-28 w-32 rotate-12 rounded-[45%_55%_50%_50%/50%_45%_55%_50%] opacity-90 sm:hidden"
        style={{ backgroundColor: CORAL }}
      />
      <div
        className="absolute -left-24 -top-24 hidden h-64 w-72 rotate-12 rounded-[45%_55%_50%_50%/50%_45%_55%_50%] opacity-90 sm:block"
        style={{ backgroundColor: CORAL }}
      />
      {/* 右下の水色（スマホ用・小さく角へ） */}
      <div
        className="absolute -right-14 bottom-[-40px] h-32 w-36 rounded-[55%_45%_50%_50%/45%_55%_50%_50%] opacity-80 sm:hidden"
        style={{ backgroundColor: CYAN }}
      />
      {/* 右下の水色の塊（PCのみ） */}
      <div
        className="absolute -right-28 bottom-[-90px] hidden h-72 w-80 rounded-[55%_45%_50%_50%/45%_55%_50%_50%] opacity-80 sm:block"
        style={{ backgroundColor: CYAN }}
      />
      {/* 左下の黄色（PCのみ） */}
      <div
        className="absolute -left-16 bottom-6 hidden h-28 w-36 rotate-[-8deg] rounded-[40%_60%_55%_45%/55%_40%_60%_45%] opacity-90 lg:block"
        style={{ backgroundColor: YELLOW }}
      />
      {/* ドット（薄いコーラル・右上と左下） */}
      <div className="absolute right-6 top-8 hidden h-24 w-28 opacity-60 sm:block" style={dots(`${CORAL}55`)} />
      <div className="absolute left-8 top-40 hidden h-20 w-24 opacity-50 lg:block" style={dots(`${CORAL}44`)} />
      <div className="absolute right-16 bottom-24 hidden h-20 w-24 opacity-50 lg:block" style={dots(`${CYAN}55`)} />
      {/* 薄い円（輪郭だけ） */}
      <div className="absolute right-24 top-28 hidden h-24 w-24 rounded-full border-2 opacity-40 lg:block" style={{ borderColor: `${CYAN}66` }} />
      {/* キラキラ */}
      <Sparkle className="absolute right-[8%] top-[12%] hidden sm:block" color={CORAL} size={22} />
      <Sparkle className="absolute right-[14%] top-[22%] hidden sm:block" color={YELLOW} size={14} />
      <Sparkle className="absolute left-[6%] top-[46%] hidden lg:block" color={CYAN} size={20} />
      <Sparkle className="absolute left-[11%] top-[54%] hidden lg:block" color={YELLOW} size={13} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   本体
   ──────────────────────────────────────────────────────────── */

/** 丸いラベル（ABOUT FUKUES / FOR SALON）。 */
function Eyebrow({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="inline-block rounded-full px-5 py-1.5 text-[11px] font-black tracking-[0.14em] text-white sm:text-xs"
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

export function ListingAbout() {
  return (
    <section className="relative overflow-hidden bg-[#FFF9F2] py-12 sm:py-16 lg:py-20">
      <Decorations />

      {/* 本文レイヤー。装飾より前面に置く。 */}
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 sm:px-8">

        {/* ══════════ 掲載について ══════════ */}
        <div className="text-center">
          <Eyebrow color={CORAL}>ABOUT FUKUES</Eyebrow>
          <h1 className="mt-3 text-[28px] font-black leading-tight tracking-tight text-[#333333] sm:text-4xl lg:text-5xl">
            掲載について
          </h1>
          {/* アクセントライン（コーラル＋水色） */}
          <div className="mt-4 flex items-center justify-center gap-1.5">
            <span className="block h-1 w-16 rounded-full sm:w-24" style={{ backgroundColor: CORAL }} />
            <span className="block h-1 w-8 rounded-full sm:w-12" style={{ backgroundColor: CYAN }} />
          </div>
        </div>

        <div
          className="mx-auto mt-7 max-w-[1000px] rounded-[24px] border bg-white px-5 py-6 shadow-[0_12px_32px_-18px_rgba(255,115,115,0.55)] sm:rounded-[28px] sm:px-10 sm:py-8"
          style={{ borderColor: `${CORAL}59` }}
        >
          {/* スマホは1カラム（イラストが上）／PCは左にイラスト・右に文章 */}
          <div className="flex flex-col items-center gap-4 md:flex-row md:gap-8">
            <div className="h-24 w-28 shrink-0 sm:h-28 sm:w-36 md:h-32 md:w-40">
              <MapIllustration />
            </div>
            <p className="text-base leading-8 text-slate-700 sm:text-[17px] sm:leading-9">
              フクエスは、福岡県のメンズエステ専門ポータルサイトです。博多・天神・北九州・久留米など福岡全域の店舗様の情報を掲載しています。
            </p>
          </div>
        </div>

        {/* ══════════ 掲載店舗様でできること ══════════ */}
        <div className="mt-12 text-center sm:mt-16">
          <Eyebrow color={CYAN}>FOR SALON</Eyebrow>
          <h2 className="mt-3 text-[24px] font-black leading-tight tracking-tight text-[#333333] sm:text-4xl lg:text-5xl">
            掲載店舗様でできること
          </h2>
        </div>

        <div
          className="mx-auto mt-7 max-w-[1120px] rounded-[24px] border bg-white px-5 py-7 shadow-[0_12px_32px_-18px_rgba(255,115,115,0.45)] sm:rounded-[32px] sm:px-10 sm:py-10"
          style={{ borderColor: `${CORAL}40`, backgroundImage: `linear-gradient(180deg,#ffffff 0%,#fffaf8 100%)` }}
        >
          <div className="grid grid-cols-1 items-center gap-7 md:grid-cols-2 md:gap-10">
            <DashboardIllustration />
            {/* PCのときだけ左に点線の区切りを出す（見本と同じ） */}
            <div className="md:border-l md:border-dashed md:pl-10" style={{ borderColor: `${CORAL}66` }}>
              <p className="text-base leading-8 text-slate-700 sm:text-[17px] sm:leading-9">
                掲載店舗様には、集客からリピートづくりまでに必要な機能をまとめてご用意しています。
                店舗情報の更新・写メ日記・出勤管理はすべて専用の管理画面から、店舗様ご自身でいつでも行えます。
                また、セラピストの求人掲載や、お仕事を探しているセラピストへのオファーもできるようになります。
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
