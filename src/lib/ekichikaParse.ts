// 駅ちか（ranking-deli.jp）の個人ページHTMLを構造化データに変換するパーサー（第28便）。
//
// ★ このファイルは純粋関数のみ。Supabase も React も import しない（禁則180・サーバー/クライアント両用）。
// 中継役VPSが送ってきた生HTMLを、フクエスの /api/import/ingest がこれで解析する。
// 駅ちかのレイアウトが変わったら直すのはこのファイルだけ（VPSは触らない）。
//
// 取得元の構造（2026-08-23 実測・enju個人ページ）:
//   名前  : <h2 class="profile-name">さあや</h2>
//   カップ: <p class="bust-size">D</p>
//   サイズ: <p class="data-size"> 25歳/ 164cm B:87 W:54 H:85 </p>
//   出勤  : <h3>1週間の出勤予定</h3><div class="inner"><table>
//             <tr class="date_sun"><th>08/23(日)</th><td>
//               <li class="start">14:00</li><li class="arrow">▼</li><li class="end">翌2:00</li></td></tr>
//             <tr ...><th>08/24(月)</th><td><li class="commuting_no_data">お店にお問い合わせください</li></td></tr>
//             <tr ...><th>08/26(水)</th><td><li class="none">ー</li></td></tr>
//   ※ td 内の状態は3種:
//       start/end   … 出勤（時刻あり）
//       none (ー)    … 休み（is_active=false で確定）
//       commuting_no_data … 未入力（触らない＝スキップ。fukues の既存値を壊さない）

export type EkichikaDay = {
  date: string;          // 'YYYY-MM-DD'
  status: 'work' | 'off' | 'unknown';
  start: string | null;  // 'HH:MM'（status==='work' のみ）
  end: string | null;    // 'HH:MM'（翌日跨ぎは「翌」を外した素の時刻。表示側が「翌」を付ける）
};

export type EkichikaCast = {
  name: string | null;
  age: string | null;        // '25'
  height: string | null;     // '164'
  bust: string | null;       // '87'
  cup: string | null;        // 'D'（無いこともある）
  waist: string | null;      // '54'
  hip: string | null;        // '85'
  bodyType: string | null;   // 'T164 B87(D) W54 H85'（fukues の body_type 表記）
  schedule: EkichikaDay[];   // 出勤（最大7日・未入力日は含めない）
};

function pick(re: RegExp, html: string): string | null {
  const m = html.match(re);
  return m && m[1] != null ? m[1].trim() : null;
}

/**
 * 名前照合用の正規化。駅ちか側とフクエス側の名前を突き合わせるとき、両方をこれに通してから
 * 完全一致で照合する。全角英数→半角、カタカナ→ひらがな、年齢(23)や記号・空白を除去。
 * ★ 取り込み側（parse）と照合側（ingest）で必ず同じ関数を使うこと（ズレると照合できない）。
 */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = raw.normalize('NFKC');            // 全角英数・記号を半角へ
  s = s.replace(/\([^)]*\)/g, '');          // (23) など括弧内を除去
  s = s.replace(/[0-9]+/g, '');             // 素の数字を除去
  s = s.replace(/[ァ-ヶ]/g, (c) =>  // カタカナ→ひらがな
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
  s = s.replace(/[\s　]+/g, '');        // 空白（半角・全角）除去
  s = s.replace(/[★☆♪♬♡❤︎♥、。・,.!！?？~〜ー-]/g, ''); // 装飾記号・区切りを除去
  return s.trim();
}

/** 'YYYY-MM-DD' に i 日足す（UTCベースでズレなく計算）。 */
function addDays(iso: string, i: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + i * 86400000;
  const dt = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

/** '翌2:00' / '14:00' → '02:00' / '14:00'（HH:MM 2桁ゼロ埋め）。 */
function normTime(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.replace(/翌/g, '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * 駅ちか個人ページHTMLを解析する。
 * @param html    個人ページの生HTML
 * @param todayISO 取り込み実行日（'YYYY-MM-DD'・JST）。出勤表の1行目＝この日として日付を割り当てる。
 */
export function parseEkichikaCast(html: string, todayISO: string): EkichikaCast {
  const name = pick(/<h2\s+class="profile-name">([^<]+)<\/h2>/, html);
  const cup = pick(/<p\s+class="bust-size">([^<]*)<\/p>/, html);

  const dataSize = pick(/<p\s+class="data-size">([\s\S]*?)<\/p>/, html) ?? '';
  const age = pick(/(\d+)\s*歳/, dataSize);
  const height = pick(/(\d+)\s*cm/, dataSize);
  const bust = pick(/B\s*[:：]?\s*(\d+)/, dataSize);
  const waist = pick(/W\s*[:：]?\s*(\d+)/, dataSize);
  const hip = pick(/H\s*[:：]?\s*(\d+)/, dataSize);

  // body_type を fukues 表記で組み立てる（既存データと同じ形式）。欠けた要素は出さない。
  const parts: string[] = [];
  if (height) parts.push(`T${height}`);
  if (bust) parts.push(cup ? `B${bust}(${cup})` : `B${bust}`);
  if (waist) parts.push(`W${waist}`);
  if (hip) parts.push(`H${hip}`);
  const bodyType = parts.length ? parts.join(' ') : null;

  // 出勤表。「1週間の出勤予定」以降の最初の <table> を対象にする。
  const schedule: EkichikaDay[] = [];
  const schedStart = html.indexOf('1週間の出勤予定');
  if (schedStart >= 0) {
    const after = html.slice(schedStart, schedStart + 4000);
    const tableM = after.match(/<table>([\s\S]*?)<\/table>/);
    if (tableM) {
      const rows = [...tableM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      rows.forEach((row, i) => {
        const td = row[1];
        const date = addDays(todayISO, i);
        if (/class="none"/.test(td)) {
          schedule.push({ date, status: 'off', start: null, end: null });
        } else if (/class="start"/.test(td)) {
          const start = normTime(pick(/<li\s+class="start">([^<]+)<\/li>/, td));
          const end = normTime(pick(/<li\s+class="end">([^<]+)<\/li>/, td));
          schedule.push({ date, status: 'work', start, end });
        }
        // commuting_no_data（未入力）はスキップ＝配列に含めない（既存値を壊さない）
      });
    }
  }

  return { name, age, height, bust, cup, waist, hip, bodyType, schedule };
}
