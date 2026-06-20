import type { SalonTheme } from '@/app/lib/themes';

// salons.courses(JSON) の1要素。duration＝行ラベル（例「70分」「指名料」「極液」）、price＝表示用料金文字列（例「¥11,000」）。
export type Course = { name: string; duration: string; price: string; description?: string };

// コースメニュー・料金表の「内容描画部分」。
// 同名コースをカテゴリとしてグループ化し、ピンク●＋カテゴリ名／各行（ラベル左・料金右・区切り線）／税込注記を描画する。
// CollapsibleCourses（折り畳みブロック）と /salon/[id]/price ページの両方で共有してデザインのズレを防ぐ。
export function CoursesContent({ courses, theme }: { courses: Course[]; theme: SalonTheme }) {
  // 同名コースをグループ化（従来の表示ロジックを踏襲）。
  const grouped = Array.from(
    courses.reduce((map, c) => {
      if (!map.has(c.name)) map.set(c.name, []);
      map.get(c.name)!.push(c);
      return map;
    }, new Map<string, Course[]>())
  );

  return (
    <>
      <div className="space-y-5">
        {grouped.map(([name, items]) => (
          <div key={name}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
              <h3 className="text-sm font-bold min-w-0 break-words" style={{ color: theme.heading }}>{name}</h3>
            </div>
            <div className="pl-4 space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm border-b pb-1 last:border-0 last:pb-0" style={{ borderColor: theme.cardBorder }}>
                  <span className="min-w-0 break-words" style={{ color: theme.body }}>{item.duration}</span>
                  <span className="font-bold text-pink-600 flex-shrink-0 break-words text-right">{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] mt-5 opacity-70" style={{ color: theme.body }}>※ 表示料金はすべて税込み価格です。</p>
    </>
  );
}
