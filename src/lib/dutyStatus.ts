export function checkDutyStatus(workHours: string): { isOnDuty: boolean; startHourStr: string } {
  if (!workHours) {
    return { isOnDuty: false, startHourStr: '12:00' };
  }

  // 1. どんな波線（〜、～、~）が使われていてもハイフンに統一
  const normalized = workHours.replace(/〜/g, '-').replace(/～/g, '-').replace(/~/g, '-');
  if (!normalized.includes('-')) {
    return { isOnDuty: false, startHourStr: '12:00' };
  }

  // 2. 開始と終了にバラす
  const [startRaw, endRaw] = normalized.split('-');
  const startHourStr = startRaw.trim();

  // 「翌」という文字が入っていたら取り除く
  const endClean = endRaw.replace(/翌/g, '').trim();

  // 3. 時と分を数字にする
  const [startHour, startMin] = startHourStr.split(':').map(Number);
  const [endHour, endMin] = endClean.split(':').map(Number);

  const startInMinutes = startHour * 60 + (startMin || 0);
  let endInMinutes = endHour * 60 + (endMin || 0);

  // 4. 終了時間が開始時間より小さい、または元データに「翌」があれば +24h
  if (endInMinutes < startInMinutes || endRaw.includes('翌')) {
    endInMinutes += 24 * 60;
  }

  // 5. Intl API で確実に現在の日本時間を取得
  const options = { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false } as const;
  const jstString = new Intl.DateTimeFormat('ja-JP', options).format(new Date());
  const [currentHour, currentMinute] = jstString.split(':').map(Number);

  let currentTimeInMinutes = currentHour * 60 + currentMinute;

  // 深夜早朝（翌日）にいる場合は +24h して比較
  if (currentTimeInMinutes < startInMinutes && currentTimeInMinutes <= (endInMinutes - 24 * 60)) {
    currentTimeInMinutes += 24 * 60;
  }

  // 6. 判定
  const isOnDuty = currentTimeInMinutes >= startInMinutes && currentTimeInMinutes <= endInMinutes;

  return { isOnDuty, startHourStr };
}
