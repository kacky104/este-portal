// ★★ コネックエフ＋フクエスCRM のセット販売（第1241便・2026-10-06・カッキーさんの決定）。
//   ・コネックエフとフクエスCRM は【セットのみ】で販売する（片方だけの契約は無い）。月額 20,000円（税別）。
//     ★ 第1304便（2026-10-08・カッキーさんの決定）: 税込（22,000円）から税別（20,000円）の書き方にそろえた。額は同じ。
//       /listing（掲載のご案内）と同じ書き方。★ 利用規約（app/lib/crm/termsText.ts 第2条）は「月額22,000円（税込）」のまま（同意済みの文面・額は同じ）。
//   ・契約しているかどうかは、今までのフクエスCRM のスイッチ（salons.crm_until・/admin の店舗編集で運営が ON／OFF）で見る。
//     ＝スイッチは1つ。ON の店だけ「コネックエフに切り替える」を押せて、フクエスCRM も使える。
//   ・フクエスリンク（駅ちかからの反映専用）は今までどおり無料（このセットとは別）。
// ★★★ 第1381便（2026-10-10・カッキーさんの決定）: 【書き方】を変えた。額・契約の中身・スイッチ（crm_until）は同じ。
//   ・これまで … 「コネックエフとフクエスCRMは、セットで月額20,000円（税別）」。
//   ・これから … 「フクエスCRM 月額20,000円（税別）」。契約すると【無料オプション】で、他サイトへの連携サービス「コネックエフ」が付く。
//     コネックエフは外部のサービスという形。★ 店舗様に見える文に「セット」と書かないこと（番人 check:setplan）。
//   ・/listing（掲載について）は第1380便で先に直した（そちらは「コネックエフ」の名前も出さない）。
//   ・コード・注記の「セット」（isSetPlanActive・SET_PLAN_〜 など）は、契約のスイッチの呼び名としてそのまま残している。
// ★ 金額・呼び名を変えるときはここだけ（ご案内・よくあるご質問・利用規約・/admin が同じ値を使う）。
//   ★ 画像の中の札（public/mypage/conecf/conecf-intro-v3.webp「フクエスCRMご契約で無料」）は別に直すこと。
// ★ 純粋なデータと判定だけ（通信も DB も触らない）。

/** 月額（税別） */
export const SET_PLAN_PRICE_YEN = 20000;
/** 例: 月額20,000円（税別） */
export const SET_PLAN_PRICE_LABEL = `月額${SET_PLAN_PRICE_YEN.toLocaleString('ja-JP')}円（税別）`;
export const SET_PLAN_NAME = 'フクエスCRM';
/** ご案内に出す1文（フクエスCRM の側） */
export const SET_PLAN_LINE = `フクエスCRMは、${SET_PLAN_PRICE_LABEL}です。ご契約の店舗様は、無料オプションとして、他サイトへ一括で更新できる外部の連携サービス「コネックエフ」をお使いいただけます。`;
/** ご案内に出す1文（コネックエフの側） */
export const CONECF_OPTION_LINE = `コネックエフは、フクエスCRM（${SET_PLAN_PRICE_LABEL}）をご契約の店舗様が、無料オプションとしてお使いいただけます。`;
/** コネックエフだけでは契約できない、の1文 */
export const CONECF_ONLY_LINE = 'コネックエフだけのご契約はありません。';
export const SET_PLAN_APPLY_LINE = 'お申し込みは運営事務局までご連絡ください。';
/** 契約していない店が「コネックエフに切り替える」を押したときに返す文（サーバー） */
export const SET_PLAN_NEED_MESSAGE = `${CONECF_OPTION_LINE}${SET_PLAN_APPLY_LINE}`;

/**
 * セットを契約しているか。★ actions/crm.ts の isCrmActive と同じ決まり（crm_until の日付が今日（JST の暦日）以降）。
 * @param crmUntil salons.crm_until（YYYY-MM-DD…／無ければ null）
 * @param todayJst 今日（JST）の YYYY-MM-DD
 */
export function isSetPlanActive(crmUntil: string | null | undefined, todayJst: string): boolean {
  if (!crmUntil) return false;
  return String(crmUntil).slice(0, 10) >= todayJst;
}

// ★★ 第1243便（2026-10-06・カッキーさんの決定）: セットを OFF にした店は、コネックエフも止める。
//   ・止める店＝コネックエフに切り替え済み（conecf_enabled_at あり）で、セットの契約が無い店。
//     切り替えていない店（フクエスリンク・マイページで編集している店）は対象外。
//   ・止めるもの＝コネックエフでの保存・取り込みと、各サイトへの送信（手動・自動）。設定には触らない＝ON に戻せば元どおり。
//   ・★ コネックエフに切り替えた店は、セラピストと出勤をマイページでは直せない。止めているあいだは、どこからも直せなくなる。
//     本当の解約のときは、運営が「マイページでの編集に戻す」（conecf_enabled_at を空にする）までがセット。
/** 止めている店の画面・保存のエラーに出す文 */
export const CONECF_STOPPED_MESSAGE =
  `${SET_PLAN_NAME}のご契約が確認できないため、コネックエフでの保存と各サイトへの更新を止めています。お心当たりのない場合は、運営事務局までご連絡ください。`;

export function isConecfStopped(
  salon: { conecfEnabledAt: string | null | undefined; crmUntil: string | null | undefined },
  todayJst: string,
): boolean {
  if (!salon.conecfEnabledAt) return false;
  return !isSetPlanActive(salon.crmUntil, todayJst);
}

// ★★ 第1291便（2026-10-07）: 入口の守りを揃える。
//   ① 各サイトを【書き換える】流れは、コネックエフに切り替えた店だけ（第1260便の決まり）。
//      これまでは「向きを変えるとき」と自動の周だけが見ていた。運営が切り替えを戻した店（conecf_enabled_at を空にした店）に
//      向き（フクエスから反映）が残っていると、手で押した送信は通っていた → 全フローの入口でも見る。
//   ② コネックエフの画面からの公開／非公開は、「止めている店」の守りが無かった（ほかの保存は止まるのに、これだけ通った）。
/** 切り替えていない店が、各サイトを書き換える操作をしたときに返す文（向きを変えるときの文と同じ） */
export const CONECF_NEED_SWITCH_MESSAGE =
  'フクエスから各サイトへの反映は、コネックエフに切り替えた店舗様がお使いいただけます。先にコネックエフのホームで「コネックエフに切り替える」を押してください';

/**
 * 中継の流れを始めてよいか。★ 止めるときだけ文を返す。
 *   ・止めている店（切り替え済み・セットの契約なし）… 読むだけの流れも止める（第1243便のまま）
 *   ・切り替えていない店 … 書き換える流れだけ止める（★ 読むだけ＝フクエスリンクの取り込み・接続テストは通す）
 */
export function conecfFlowBlockMessage(
  salon: { conecfEnabledAt: string | null | undefined; crmUntil: string | null | undefined },
  todayJst: string,
  opts: { write: boolean },
): string | null {
  if (isConecfStopped(salon, todayJst)) return CONECF_STOPPED_MESSAGE;
  if (opts.write && !salon.conecfEnabledAt) return CONECF_NEED_SWITCH_MESSAGE;
  return null;
}

/** コネックエフの画面からの保存（公開／非公開など）を受けてよいか。★ 断るときだけ文を返す */
export function conecfScreenBlockMessage(
  salon: { conecfEnabledAt: string | null | undefined; crmUntil: string | null | undefined },
  todayJst: string,
): string | null {
  if (!salon.conecfEnabledAt) return '保存するには、ホームで「コネックエフに切り替える」を押してください';
  return isConecfStopped(salon, todayJst) ? CONECF_STOPPED_MESSAGE : null;
}
