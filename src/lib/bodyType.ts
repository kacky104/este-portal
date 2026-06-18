// セラピストの body_type 文字列（例: "T158 B88(D) W58 H86"）の解析・整形。

export type BodyType = {
  height: string | null;
  bust:   string | null;
  cup:    string | null;
  waist:  string | null;
  hip:    string | null;
};

/** body_type 文字列を {height, bust, cup, waist, hip} に分解する。未設定は null。 */
export function parseBodyType(raw: string | null): BodyType | null {
  if (!raw) return null;
  const hMatch   = raw.match(/T(\d+)/);
  const bMatch   = raw.match(/B(\d+)\(([A-Za-z]+)\)/);
  const wMatch   = raw.match(/W(\d+)/);
  const hipMatch = raw.match(/H(\d+)/);
  return {
    height: hMatch?.[1]   ?? null,
    bust:   bMatch?.[1]   ?? null,
    cup:    bMatch?.[2]   ?? null,
    waist:  wMatch?.[1]   ?? null,
    hip:    hipMatch?.[1] ?? null,
  };
}

/**
 * "T158 B88(D) W58 H86" 形式の文字列を返す。未設定の項目は省略。
 * 何も無い場合は空文字を返す（呼び出し側で非表示判定に使う）。
 */
export function formatBodySizes(raw: string | null): string {
  const b = parseBodyType(raw);
  if (!b) return '';
  const parts: string[] = [];
  if (b.height) parts.push(`T${b.height}`);
  if (b.bust)   parts.push(b.cup ? `B${b.bust}(${b.cup})` : `B${b.bust}`);
  if (b.waist)  parts.push(`W${b.waist}`);
  if (b.hip)    parts.push(`H${b.hip}`);
  return parts.join(' ');
}
