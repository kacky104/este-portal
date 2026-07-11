import type { SalonTheme } from '@/app/lib/themes';
import { AutoFitText } from '@/app/components/AutoFitText';

// salons.courses(JSON) の1要素。duration＝行ラベル（例「70分」「指名料」「極液」）、price＝表示用料金文字列（例「¥11,000」）。
// duration_min＝ネット予約の枠計算用の数値(分)。時間としてパースできた行のみ数値、それ以外は null/未設定（内部用・表示には使わない）。
export type Course = { name: string; duration: string; price: string; description?: string; duration_min?: number | null };

// コースメニュー・料金表の「内容描画部分」。
// 同名コースをカテゴリとしてグループ化し、ピンク●＋カテゴリ名／各行（ラベル左・料金右・区切り線）／税込注記を描画する。
// CollapsibleCourses（折り畳みブロック）と /salon/[id]/price ページの両方で共有してデザインのズレを防ぐ。
//   large=true（/price と詳細ページの折り畳みブロックで使用）：文字サイズと行間・余白を約1.5倍に拡大。デフォルト（小）は現在未使用。
export function CoursesContent({ courses, theme, large = false }: { courses: Course[]; theme: SalonTheme; large?: boolean }) {
  // 同名コースをグループ化（従来の表示ロジックを踏襲）。
  const grouped = Array.from(
    courses.reduce((map, c) => {
      if (!map.has(c.name)) map.set(c.name, []);
      map.get(c.name)!.push(c);
      return map;
    }, new Map<string, Course[]>())
  );

  // large=true のときだけ約1.5倍に拡大（行間・余白も自然に保つ）。
  const groupGap = large ? 'space-y-7' : 'space-y-5';
  const headerMb = large ? 'mb-3' : 'mb-2';
  const dotCls   = large ? 'w-2.5 h-2.5' : 'w-2 h-2';
  const nameCls  = large ? 'text-[21px]' : 'text-sm';
  const rowsGap  = large ? 'space-y-2.5' : 'space-y-1.5';
  const rowCls   = large ? 'text-[21px] pb-2' : 'text-sm pb-1';
  const noteCls  = large ? 'text-[17px]' : 'text-[11px]';

  return (
    <>
      <div className={groupGap}>
        {grouped.map(([name, items]) => (
          <div key={name}>
            <div className={`flex items-center gap-2 ${headerMb}`}>
              <span className={`${dotCls} rounded-full bg-pink-400 flex-shrink-0`} />
              {large ? (
                <h3 className="min-w-0 flex-1">
                  <AutoFitText text={name} max={21} min={14} className="font-bold" style={{ color: theme.heading }} />
                </h3>
              ) : (
                <h3 className={`${nameCls} font-bold min-w-0 break-words`} style={{ color: theme.heading }}>{name}</h3>
              )}
            </div>
            <div className={`pl-4 ${rowsGap}`}>
              {items.map((item, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 ${rowCls} border-b last:border-0 last:pb-0`} style={{ borderColor: theme.cardBorder }}>
                  <span className="min-w-0 break-words" style={{ color: theme.body }}>{item.duration}</span>
                  <span className="font-bold text-pink-600 flex-shrink-0 break-words text-right">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className={`${noteCls} mt-5 opacity-70`} style={{ color: theme.body }}>※ 表示料金はすべて税込み価格です。</p>
    </>
  );
}
