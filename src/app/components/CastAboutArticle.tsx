// セラピストページとは（第1666便）の本文。★ 第1679便（カッキーさん）: マイページとコネックエフの両方で出すので共通にした。
// ★ 違うのは「どこで管理するか」「どこで QR を出すか」の2か所だけ（manageAt・qrAt）。
// ★ 書いてある中身の正本（変えたらここも直す）:
//   - 今すぐの受付時間 … src/lib/imasugu.ts IMASUGU_WINDOW_MIN（45分）
//   - ランキングの加点 … src/lib/rankingPoints.ts（セラピスト +5／お店のおすすめランキングは連携率÷2）
//   - スケジュールのタブ … src/app/actions/castSchedule.ts isCastScheduleEnabled
//   - 記録帳はお店・運営に見えない … src/app/cast/CastCustomers.tsx

const CAN_DO: { title: string; body: string; note?: string; caution?: string }[] = [
  { title: '写メ日記', body: '自分のスマホから写真と文章を投稿できます。フクエスのお店のページにそのまま載ります。', note: 'fukuX を開設していれば、fukuX にも同時に投稿できます。',
    // ★ 第1667便（カッキーさん）: 駅ちかの写メ日記を読み込んでいるお店への注意。フクエス→駅ちかへは送らない（読み込みは駅ちか→フクエスの一方向）
    caution: '駅ちかの写メ日記をフクエスに読み込む設定にしているお店では、フクエスで投稿した日記は駅ちかには反映されません。その場合は、駅ちかでの投稿をおすすめします（フクエスにも自動で載ります）。' },
  { title: '今すぐ', body: '「今すぐご案内できます」を本人が ON にできます。ON にすると45分間表示され、時間が来たら自動で消えます。', note: 'お店が ON にしているあいだは、本人は操作できません。' },
  { title: '記録帳', body: '接客の記録や今日の報酬を、自分だけの手帳としてつけられます。', note: 'お店・運営からは見えません。' },
  { title: 'スケジュール', body: '自分の出勤と予約を、スマホのタイムラインで確認できます。料金やお客様の電話番号は出ません。', note: 'フクエスCRM をお使いで、お店がこの表示を出している場合だけです。' },
  { title: '着せ替え', body: 'セラピストページの色を、好きなテーマに変えられます。' },
];

const SHOP_MERIT: { title: string; body: string }[] = [
  { title: '写メ日記が増える', body: 'お店が代わりに投稿しなくても、セラピストさんが空き時間に投稿できます。日記の多いお店・女の子は、ページを見てもらいやすくなります。' },
  { title: '「今すぐ」がすぐ出せる', body: '手が空いたその場で本人が ON にできるので、お店への連絡を待たずに表示できます。' },
  { title: 'ランキングで有利に', body: '連携したセラピストさんは、人気セラピストランキングで毎週 +5 点。お店の「おすすめランキング」にも、連携率の半分の点が毎週つきます。' },
];


export function CastAboutArticle({ manageAt, qrAt }: {
  /** 例: 「お店のマイページ」「コネックエフ」 */
  manageAt: string;
  /** 例: 「マイページの「セラピスト」」「コネックエフの「セラピスト一覧」」 */
  qrAt: string;
}) {
  return (
    <article className="bg-[#fffafc] border border-slate-200 border-t-4 border-t-[#c8477d] px-5 py-7 sm:px-10 sm:py-9 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <h1 className="text-[24px] sm:text-[28px] font-black text-slate-800 tracking-wide">セラピストページとは</h1>
        <span className="text-[12px] font-bold text-[#b83a6f] bg-pink-50 border border-pink-100 rounded-full px-4 py-1">店舗オーナー様へ</span>
      </div>

      <p className="text-[26px] sm:text-[34px] font-black leading-snug text-[#c8477d] mb-4">
        セラピストさん<br className="sm:hidden" />専用のページです。
      </p>
      <p className="text-[16px] sm:text-[17px] font-bold text-slate-700 leading-relaxed mb-6">
        写メ日記や「今すぐ」を、<br />
        セラピストさんが自分のスマホから更新できます。
      </p>
      <div className="bg-pink-50 border border-pink-100 px-5 py-4 text-[14px] text-slate-600 leading-relaxed mb-10">
        プロフィール・写真・出勤は、これまで通り<b className="text-[#b83a6f]">{manageAt}で管理</b>します。<br />
        セラピストページは、それに「本人が自分で更新できること」を足すものです。
      </div>

      {/* 01 お店のメリット */}
      <section className="mb-10">
        <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
          <span className="text-[14px] font-black text-[#c8477d]">01</span>お店にとってのよいところ
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SHOP_MERIT.map((m) => (
            <div key={m.title} className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[15px] font-black text-[#b83a6f] mb-2">{m.title}</p>
              <p className="text-[13px] text-slate-600 leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 02 セラピストさんができること */}
      <section className="mb-10">
        <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
          <span className="text-[14px] font-black text-[#c8477d]">02</span>セラピストさんができること
        </h2>
        <div className="space-y-3">
          {CAN_DO.map((c) => (
            <div key={c.title} className="bg-white border border-slate-200 rounded-xl p-4 sm:flex sm:gap-5">
              <p className="sm:w-28 flex-none text-[15px] font-black text-[#b83a6f] mb-1 sm:mb-0">{c.title}</p>
              <div>
                <p className="text-[14px] text-slate-700 leading-relaxed">{c.body}</p>
                {c.note && <p className="text-[12px] text-slate-500 leading-relaxed mt-1">※ {c.note}</p>}
                {c.caution && (
                  <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 leading-relaxed mt-2">
                    <b>ご注意：</b>{c.caution}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 03 始め方 */}
      <section>
        <h2 className="flex items-baseline gap-3 text-[20px] font-black text-slate-800 mb-4">
          <span className="text-[14px] font-black text-[#c8477d]">03</span>始め方
        </h2>
        <div className="bg-white border border-slate-200 rounded-xl p-5 text-[14px] text-slate-700 leading-relaxed">
          お店が{qrAt}で <b className="text-[#b83a6f]">QR</b> を出し、セラピストさんがスマホで読み取って登録するだけです。<br />
          費用はかかりません。くわしい手順は「作り方」をご覧ください。
        </div>
      </section>
    </article>
  );
}
