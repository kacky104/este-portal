// 予約の日時を「営業日」で言う（第2046便・2026-11-23・カッキーさん）。★ 純粋関数だけ。
//
// ★ きっかけ: ネット予約の通知メールが「11/28(土) 01:00〜02:40」と書いていたため、店舗様が 28日（土）を見てしまった。
//   フクエスCRM は朝6時より前を前の日の営業日にまとめる（11/28 1:00 は 11/27 の「翌1時」）。
// ★ 深夜（JST の 0:00〜6:00 に始まる予約）だけ、営業日で書いてカレンダーの日付を添える:
//     「11/27(金) の深夜 翌1:00〜翌2:40（日付は 11/28(土) 1:00〜2:40）」
//   それ以外は今までどおり「11/28(土) 20:00〜21:40」。
// ★ 区切りの 6:00 はフクエスCRM（mypage/crm/_schedule/shared.tsx の DAY_START_MIN）・ネット予約の枠（SCHEDULE_DAY_START_MIN）と同じ。

export const BOOKING_DAY_START_MIN = 6 * 60;

const WD: Record<string, string> = { Sun: '日', Mon: '月', Tue: '火', Wed: '水', Thu: '木', Fri: '金', Sat: '土' };

type Parts = { month: number; day: number; hour: number; minute: number; weekday: string };

function jst(d: Date): Parts {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: WD[String(p.weekday)] ?? '' };
}

const pad = (n: number) => String(n).padStart(2, '0');
const isNight = (p: Parts) => p.hour * 60 + p.minute < BOOKING_DAY_START_MIN;

/** 深夜なら、その営業日（前の日）の 月・日・曜日 */
function businessDay(start: Date): Parts {
  return jst(new Date(start.getTime() - 24 * 3600 * 1000));
}

/** 通知メールの「日時」 */
export function bookingSlotLabel(startISO: string, endISO: string): string {
  const s = new Date(startISO); const e = new Date(endISO);
  const ps = jst(s); const pe = jst(e);
  const hm = (p: Parts) => `${pad(p.hour)}:${pad(p.minute)}`;
  // ★ 夜に始まって日付をまたぐ予約は、終わりに「翌」を付ける（23:30〜翌1:10）
  if (!isNight(ps)) return `${ps.month}/${ps.day}(${ps.weekday}) ${hm(ps)}〜${isNight(pe) && pe.day !== ps.day ? `翌${pe.hour}:${pad(pe.minute)}` : hm(pe)}`;
  const b = businessDay(s);
  const night = (p: Parts) => `翌${p.hour}:${pad(p.minute)}`;
  // ★ 終わりが朝6時を過ぎていたら「翌」を付けない（深夜に始まって朝まで続く予約はまずないが、表記を崩さない）
  const endTxt = isNight(pe) ? night(pe) : `${pe.hour}:${pad(pe.minute)}`;
  return `${b.month}/${b.day}(${b.weekday}) の深夜 ${night(ps)}〜${endTxt}（日付は ${ps.month}/${ps.day}(${ps.weekday}) ${ps.hour}:${pad(ps.minute)}〜${pe.hour}:${pad(pe.minute)}）`;
}

/** 電話通知の読み上げ（「11月3日、火曜日、午後8時30分」の形） */
export function speakBookingDateTime(iso: string): string {
  const d = new Date(iso);
  const p = jst(d);
  const min = p.minute > 0 ? `${p.minute}分` : '';
  if (!isNight(p)) {
    const ampm = p.hour < 12 ? '午前' : '午後';
    const h = p.hour % 12 === 0 && p.hour >= 12 ? 12 : p.hour % 12;
    return `${p.month}月${p.day}日、${p.weekday}曜日、${ampm}${h}時${min}`;
  }
  const b = businessDay(d);
  return `${b.month}月${b.day}日、${b.weekday}曜日の深夜、${p.hour}時${min}、日付では${p.month}月${p.day}日`;
}
