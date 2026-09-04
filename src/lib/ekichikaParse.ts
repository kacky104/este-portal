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
//       commuting_no_data … 未入力。★第30便から「休み」と同じ扱い（is_active=false）。
//         旧仕様は「触らない＝スキップ」だったが、駅ちかで出勤を取り消して未入力に戻した日の
//         古い出勤がフクエスに残り続ける不具合を生んだ（禁則206）。取り込み対象店は駅ちかが
//         正本なので「駅ちかに出ていない＝出勤なし」で揃える。

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
  schedule: EkichikaDay[];   // 出勤（最大7日。未入力日も 'off' として含める＝第30便）
  /**
   * ★★★ 日付まわりで気になったこと（第153便）。★ 空なら何も無かった。
   *   ★ 黙って直さない。★ ずれを直した【という事実】を呼び出し側が記録できるようにする。
   */
  scheduleWarnings: string[];
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

/**
 * ★★★ 出勤表の行から日付ラベルを読む（第153便・2026-09-05）。
 *
 * ★★ 実物:  <tr class="date_sun"><th>08/23(日)</th><td>…
 *   ★ 年は書いていない。★ 曜日は使わない（年を決めれば曜日は決まるので、二重に持たない）。
 */
export function readDateLabel(rowHtml: string): string | null {
  const m = String(rowHtml ?? '').match(/<th[^>]*>[\s\S]{0,20}?(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (!(mm >= 1 && mm <= 12) || !(dd >= 1 && dd <= 31)) return null;
  return String(mm).padStart(2, '0') + '/' + String(dd).padStart(2, '0');
}

/**
 * ★★★ 'MM/DD' に年を当てて 'YYYY-MM-DD' にする（第153便）。
 *
 * ★★ 駅ちかは年を書かないので、こちらで決めるしかない。
 *   ★ 基準日（baseISO）から**いちばん近い年**を選ぶ。★ 12/31 ⇄ 01/01 の年またぎがこれで通る。
 *   ★ 2/30 のような実在しない日は null（★ 勝手に 3/1 へ丸めない）。
 */
export function labelToISO(label: string, baseISO: string): string | null {
  const m = /^(\d{2})\/(\d{2})$/.exec(String(label ?? ''));
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  const baseT = Date.parse(String(baseISO ?? '') + 'T00:00:00Z');
  if (!Number.isFinite(baseT)) return null;
  const baseY = Number(String(baseISO).slice(0, 4));
  let best: string | null = null;
  let bestDiff = Infinity;
  for (const y of [baseY - 1, baseY, baseY + 1]) {
    const t = Date.UTC(y, mm - 1, dd);
    const dt = new Date(t);
    // ★ 実在しない日を弾く（Date.UTC は 2/30 を 3/2 に繰り上げてしまう）
    if (dt.getUTCMonth() !== mm - 1 || dt.getUTCDate() !== dd) continue;
    const diff = Math.abs(t - baseT);
    // ★★★ 基準日から半年より遠い日は選ばない（第153便）。
    //   ★ 出勤表は7日ぶん。★ 1年先の日を当てるのは、どう考えても読み違えている。
    //   ★★ 年の候補は1年ずつ離れているので、±180日に絞ると【年が1つに決まる】。
    //     ★ 例: 平年の 3/1 を基準に '02/29' が来たら、近くに実在しないので null。
    //       ★ 1年先の閏日に飛ばさない（★ 飛ばすと、その日に出勤を書いてしまう）。
    if (diff > 180 * 86400000) continue;
    if (diff < bestDiff) {
      bestDiff = diff;
      const pad = (n: number) => String(n).padStart(2, '0');
      best = dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    }
  }
  return best;
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
  // カップは <p class="bust-size">D</p>。未設定の店は "-" や空になるので、その場合は無しにする
  // （そのまま使うと body_type が "B86(-)" のように壊れる）。
  const cupRaw = pick(/<p\s+class="bust-size">([^<]*)<\/p>/, html);
  const cup = cupRaw && /^[A-Z]+$/.test(cupRaw) ? cupRaw : null;

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
  const warnings: string[] = [];
  const schedStart = html.indexOf('1週間の出勤予定');
  if (schedStart >= 0) {
    const after = html.slice(schedStart, schedStart + 4000);
    const tableM = after.match(/<table>([\s\S]*?)<\/table>/);
    // ★★★ 第153便: 「行が1つも無かった」と「行はあったが1つも取れなかった」を分ける。
    //   ★ 下の「お問い合わせ」の受け皿が、後者にまで効いてしまうと【全員の7日ぶんを休みにする】。
    let rowCount = 0;
    if (tableM) {
      const rows = [...tableM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      rowCount = rows.length;
      rows.forEach((row, i) => {
        const td = row[1];
        // ★★★ 第153便: 【渡された日付を信じない】。★ 駅ちかが書いている日付ラベルを正本にする。
        //   ★ 2026-08-29 のこのファイルの注記にあった「読み取り側は塞いでいない」を塞ぐもの。
        //   ★★ 2026-09-05 深夜に実害を確認: 深夜0〜6時の周が1日ずれて取り込んでいた。
        const guess = addDays(todayISO, i);
        const label = readDateLabel(td);
        const fromLabel = label === null ? null : labelToISO(label, todayISO);
        // ★★★ 行ごとの妥当性（第153便）。★ labelToISO の ±180日とは【役割が違う】:
        //   ・labelToISO の ±180日 … 年を1つに決めるための境目（どの MM/DD も必ず1年に決まる）
        //   ・ここの ±7日        … 読み違えを弾くための境目
        //   ★ 表は7日ぶん。★ 見込み（guess）から7日より離れた日は、どう読んでも読み違え。
        //     ★ 深夜のずれは1日。★ 7日あれば、正しいずれは全部通る。
        const far = fromLabel !== null &&
          Math.abs(Date.parse(fromLabel + 'T00:00:00Z') - Date.parse(guess + 'T00:00:00Z')) > 7 * 86400000;
        if (far) {
          warnings.push((i + 1) + '行目の日付が ' + fromLabel + ' で、見込みの ' + guess + ' から離れすぎているため、この日は触っていません');
          return;
        }
        if (fromLabel === null) {
          // ★★★ ラベルが読めない行は【触らない】。★ 決め打ちに戻さない（禁則207 と同じ筋）。
          //   ★ 間違った日付に出勤を書くくらいなら、その日を更新しないほうがよい。
          warnings.push((i + 1) + '行目の日付を読み取れなかったので、この日は触っていません');
          return;
        }
        if (fromLabel !== guess) {
          // ★ 直すが、直したことを黙らせない（★ 「静かに直る」がいちばん怖い）
          warnings.push('駅ちかの' + (i + 1) + '行目は ' + fromLabel + ' でした（こちらの見込みは ' + guess + '）。駅ちかに合わせました');
        }
        const date = fromLabel;
        if (/class="start"/.test(td)) {
          const start = normTime(pick(/<li\s+class="start">([^<]+)<\/li>/, td));
          const end = normTime(pick(/<li\s+class="end">([^<]+)<\/li>/, td));
          schedule.push({ date, status: 'work', start, end });
        } else if (/class="none"/.test(td) || /class="commuting_no_data"/.test(td)) {
          // none（ー＝休み）も commuting_no_data（未入力）も「出勤なし」に倒す。
          // ★ 第30便（2026-08-24）で「未入力＝触らない」から変更。
          //   旧仕様だと、店が駅ちかで一度入れた出勤を後から取り消して未入力に戻したとき、
          //   フクエス側に取り消し前の古い出勤が残り続けた（実測4件・禁則206）。
          //   取り込み対象店は駅ちかが正本なので「駅ちかに出ていない＝出勤なし」で揃える。
          schedule.push({ date, status: 'off', start: null, end: null });
        }
        // ★ 上記3クラスのどれでもない＝想定外のマークアップ。触らずスキップする。
        //   駅ちかのレイアウト変更で class 名が変わったとき、全員の出勤を一斉に
        //   消してしまわないための安全弁（禁則207）。この場合は unmatched ではなく
        //   「出勤が更新されない」形で現れるので、runs の schedules 数の急減で気づく。
      });
    }

    // ★ 「出勤予定を公開していない」ケース（第32便・2026-08-25）
    //   駅ちかは、予定を入れていないセラピストの個人ページで、出勤表の代わりに
    //   「お店にお問い合わせください」＋電話番号を出す。これは想定外のマークアップでは
    //   なく、駅ちかが明示的に「予定は無い」と言っている状態。
    //   禁則207の安全弁がここにも効いてしまい、フクエス側の古い出勤が永久に残っていた
    //   （実測: アイリスで85名が「照合できているのに出勤だけ古い」状態・禁則220）。
    //   なので、この文言が出ているときだけ7日ぶんを「出勤なし」に倒す。
    //   ★ 安全弁は殺していない。文言が無いまま行が1つも取れない場合（＝レイアウト変更）は
    //     従来どおり触らずスキップする。
    //   ★★★ 第153便で条件を狭めた: `schedule.length === 0` だけでは危ない。
    //     ★ 「お店にお問い合わせください」は commuting_no_data の行の中にも書いてある文言。
    //     ★★ 行はあるのに1つも取れなかったとき（＝レイアウト変更・日付を読めない）にも
    //       この文言は見つかるので、**全員の7日ぶんを休みにしてしまう**。
    //     → ★ 「出勤表そのものが無い」＝【行が1つも無い】ときだけに限る。
    //     ★ これは第153便で日付ラベルを見るようにしたことで新しく開いた穴でもあり、
    //       禁則207（レイアウト変更で一斉に消さない）の元からの抜けでもある。
    if (schedule.length === 0 && rowCount === 0) {
      const afterText = after.replace(/<[^>]*>/g, '');
      if (afterText.includes('お問い合わせ')) {
        for (let i = 0; i < 7; i++) {
          schedule.push({ date: addDays(todayISO, i), status: 'off', start: null, end: null });
        }
      }
    }
  }

  return { name, age, height, bust, cup, waist, hip, bodyType, schedule, scheduleWarnings: warnings };
}
