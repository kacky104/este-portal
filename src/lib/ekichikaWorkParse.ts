// 駅ちか（ranking-deli.jp）管理画面の「出勤管理」(/admin/girlswork/) を読み・書き戻すための
// 純粋関数群（第38便）。★ 送信そのものはここでは行わない。HTML と構造体の相互変換と、
// 「送ったものが本当に入ったか」の照合だけを持つ。
//
// ★ このファイルは純粋関数のみ。Supabase も React も fetch も import しない（禁則180）。
//
// ★★★ なぜ照合が本体なのか（第38便の実測）
//   出勤更新フォームは【部分更新の口が無い】。37人×7日が丸ごと1回のPOSTで上書きされる。
//   さらに次の2つが重なる:
//     ・POSTに日付が入っていない。[0]〜[6] は「サーバが考える今日」からの添え字。
//       深夜0時をまたぐと丸ごと1日ずれる
//     ・37人で818フィールド。PHP の max_input_vars 既定は 1000。100人規模なら 2200 で超え、
//       超えた分は【エラーも警告も出さずに捨てられる】＝その女性の出勤が消える
//   つまり「送ったつもり」ではなく【確信を持って壊す】形の事故が起きる。
//   → 送る前に止める（assert 系）＋ 送った後に読み直して突き合わせる（verifyAfterWrite）。
//
// 取得元の構造（2026-08-27 実測・THE LABYRINTH shopid 37168 の /admin/girlswork/）:
//   <form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/" method="post">
//     <input name="fuel_csrf_token" type="hidden" value="…128文字…">
//     <dl><dt><span>08/27(木)</span></dt><dd><span>3</span></dd></dl>   ← 日付と【その日の出勤人数】
//     …7日ぶん（今日から7日間。翌週へのリンクは無い）…
//     <li><p></p><span>さら</span></li>                                  ← 名前
//     <li><div>
//       <input name="girl_work[5232208][0][girl_id]" value="5232208" type="hidden">  ← 日0だけ
//       <select name="girl_work[5232208][0][start_time]">
//         <optgroup><option value="00:00" selected="selected">0:00</option>…</optgroup>
//       </select>
//       ～
//       <select name="girl_work[5232208][0][end_time]">…</select>
//       <input name="girl_work[5232208][0][work_flg]" value="1" checked="checked" type="checkbox">
//     </div></li>
//     …7日ぶん × 在籍人数ぶん…
//     <input name="work_btn" value="" type="submit">
//
// ★★★ 時刻は 24時超え表記。value="27:00" の表示は "3:00"（＝翌3時）。
//   HH:MM として素朴に扱い 27:00 を弾いたり 03:00 に丸めたりすると壊れる。
//   0:00〜47:30 の 30分刻みとして扱うこと（分に直して比較する）。
//
// ★ 休みは【work_flg のキーが存在しない】で表現される。false を送るのではない。
//   チェックボックスなので、未チェックのぶんは送信自体に現れない。

export const WORK_DAYS = 7;

/** PHP の max_input_vars の既定値。駅ちか側が上げているかは未確認（第38便）。 */
export const PHP_MAX_INPUT_VARS_DEFAULT = 1000;

export type WorkCell = {
  /** 駅ちか表記の開始時刻。"20:00"。24時超えあり */
  start: string;
  /** 駅ちか表記の終了時刻。"27:00" は翌3時 */
  end: string;
  /** 出勤なら true。false は「休み」＝送信時にキーごと出さない */
  work: boolean;
};

export type GirlWork = {
  girlId: string;
  /** 画面から拾えた名前。照合には使わない（人が読むためだけ） */
  name: string;
  /** 必ず 7 件。index 0 が「サーバが考える今日」 */
  days: WorkCell[];
};

export type WorkPage = {
  csrfToken: string;
  /** form の action。例: https://ranking-deli.jp/admin/girlswork/1/ */
  action: string;
  /** "08/27(木)" の形。必ず 7 件 */
  dateLabels: string[];
  /** 画面に出ている日別の出勤人数。必ず 7 件。★ 照合の第2の目 */
  headerCounts: number[];
  girls: GirlWork[];
};

export type WorkChange = {
  girlId: string;
  /** 0〜6 */
  dayIndex: number;
  cell: WorkCell;
};

export type VerifyProblem = {
  kind:
    | 'girl_count_mismatch'
    | 'girl_missing'
    | 'date_shifted'
    | 'cell_mismatch'
    | 'header_count_mismatch';
  detail: string;
};

// ────────────────────────────── 時刻 ──────────────────────────────

/** "27:00" → 1620（0:00からの分）。24時超えを潰さない。 */
export function ekichikaTimeToMinutes(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) throw new Error('駅ちかの時刻表記ではない: ' + JSON.stringify(t));
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 47 || min > 59) throw new Error('駅ちかの時刻の範囲外: ' + t);
  return h * 60 + min;
}

/** 1620 → "27:00"。 */
export function minutesToEkichikaTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 47 * 60 + 59) {
    throw new Error('駅ちかの時刻に直せない分: ' + minutes);
  }
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// ────────────────────────────── パース ──────────────────────────────

function normalize(html: string): string {
  return html.replace(/\s+/g, ' ');
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(name + '="([^"]*)"');
  const m = re.exec(tag);
  return m ? m[1] : null;
}

/**
 * その select が実際に送る値を返す。
 *
 * ★★★ selected 属性が1つも無い select がある（2026-08-27 実測: 518個中 224個＝43%。
 *   休みの日の end_time に多い）。そのときブラウザは【先頭の option】を選ぶので、
 *   ここでも同じにする。空を返すと、読んだ値をそのまま返したつもりで
 *   【時刻を空で上書き】しにいくことになる。
 *   ※ この挙動は実物のHTMLを1回通すまで見えなかった。fixture では再現しない。
 */
function selectedOptionValue(inner: string): string {
  // <option value="00:00" selected="selected"> と <option selected value="…"> の両方に耐える
  const options = inner.match(/<option\b[^>]*>/g) ?? [];
  if (options.length === 0) return '';
  for (const o of options) {
    if (/\bselected\b/.test(o)) {
      const v = attr(o, 'value');
      if (v !== null) return v;
    }
  }
  const first = options[0];
  return first ? (attr(first, 'value') ?? '') : '';
}

/**
 * /admin/girlswork/ のHTMLを構造体にする。
 * ★ 見つからなかったものは空のまま返す。壊れているかどうかの判断は checkWorkPage に任せる
 *   （ここで例外を投げると「取れなかった」と「取れたが空」の区別がつかなくなる）。
 */
export function parseWorkPage(html: string): WorkPage {
  const h = normalize(html);

  let csrfToken = '';
  for (const tag of h.match(/<input\b[^>]*>/g) ?? []) {
    if (attr(tag, 'name') === 'fuel_csrf_token') {
      csrfToken = attr(tag, 'value') ?? '';
      break;
    }
  }

  // ★★★ 「girlswork を含む最初の form」では検索フォームを掴む（2026-08-27 実測）。
  //   実物の form は4本あり、girlswork を含むものが2本ある:
  //     id="frmSearch" action=".../admin/girlswork"      ← 検索。番号が付かない
  //     id="frmfix"    action=".../admin/girlswork/1/"   ← 出勤の更新。こちらが正しい
  //   検索の方へ37人ぶんを投げても【何も起きない】。エラーにもならないので、
  //   「送ったのに反映されない」という形で静かに外れる。id で選ぶこと。
  let action = '';
  const formTags = h.match(/<form\b[^>]*>/g) ?? [];
  for (const tag of formTags) {
    if (attr(tag, 'id') === 'frmfix') {
      action = attr(tag, 'action') ?? '';
      break;
    }
  }
  if (!action) {
    // id が変わっても、番号付きの action なら更新側とみなす
    for (const tag of formTags) {
      const a = attr(tag, 'action') ?? '';
      if (/girlswork\/\d+\/?$/.test(a)) {
        action = a;
        break;
      }
    }
  }

  const dateLabels: string[] = [];
  const headerCounts: number[] = [];
  const headerRe =
    /<dt\b[^>]*> ?<span\b[^>]*> ?(\d{1,2}\/\d{1,2}\([^)<]+\)) ?<\/span> ?<\/dt> ?<dd\b[^>]*> ?<span\b[^>]*> ?(\d+) ?<\/span>/g;
  let hm: RegExpExecArray | null;
  while ((hm = headerRe.exec(h)) !== null) {
    dateLabels.push(hm[1]);
    headerCounts.push(Number(hm[2]));
  }

  // 出現順を保つ。Map の挿入順がそのまま画面の並び
  const byId = new Map<string, GirlWork>();
  const ensure = (girlId: string): GirlWork => {
    let g = byId.get(girlId);
    if (!g) {
      g = {
        girlId,
        name: '',
        days: Array.from({ length: WORK_DAYS }, () => ({ start: '', end: '', work: false })),
      };
      byId.set(girlId, g);
    }
    return g;
  };

  const selectRe =
    /<select\b[^>]*name="girl_work\[(\d+)\]\[(\d)\]\[(start_time|end_time)\]"[^>]*>(.*?)<\/select>/g;
  let sm: RegExpExecArray | null;
  while ((sm = selectRe.exec(h)) !== null) {
    const day = Number(sm[2]);
    if (day < 0 || day >= WORK_DAYS) continue;
    const g = ensure(sm[1]);
    const value = selectedOptionValue(sm[4]);
    if (sm[3] === 'start_time') g.days[day].start = value;
    else g.days[day].end = value;
  }

  for (const tag of h.match(/<input\b[^>]*>/g) ?? []) {
    const name = attr(tag, 'name') ?? '';
    const m = /^girl_work\[(\d+)\]\[(\d)\]\[work_flg\]$/.exec(name);
    if (!m) continue;
    const day = Number(m[2]);
    if (day < 0 || day >= WORK_DAYS) continue;
    ensure(m[1]).days[day].work = /\bchecked\b/.test(tag);
  }

  // 名前は best-effort。girl_id の hidden の直前にある <span>…</span> を拾う。
  // ★ 取れなくても照合には影響しない（キーは girlId）。
  for (const [girlId, g] of byId) {
    const at = h.indexOf('girl_work[' + girlId + '][0][girl_id]');
    if (at < 0) continue;
    const before = h.slice(Math.max(0, at - 400), at);
    const spans = before.match(/<span\b[^>]*>([^<]{1,24})<\/span>/g) ?? [];
    const last = spans[spans.length - 1];
    if (last) {
      const inner = /<span\b[^>]*>([^<]*)<\/span>/.exec(last);
      if (inner) g.name = inner[1].trim();
    }
  }

  return { csrfToken, action, dateLabels, headerCounts, girls: [...byId.values()] };
}

// ────────────────────── 送る前に止める（assert 系） ──────────────────────

/** 壊れて見えるところを列挙する。空配列なら「読めている」。 */
export function checkWorkPage(page: WorkPage): string[] {
  const problems: string[] = [];
  if (!page.csrfToken) problems.push('fuel_csrf_token が取れていない');
  if (!page.action) {
    problems.push('form の action が取れていない');
  } else if (!/girlswork\/\d+\/?$/.test(page.action)) {
    // ★ 検索フォーム(.../girlswork)を掴んでいると、投げても静かに何も起きない
    problems.push(
      '送信先が更新用に見えない: ' + page.action + '（.../girlswork/<番号>/ のはず。検索フォームを掴んでいないか）',
    );
  }
  if (page.dateLabels.length !== WORK_DAYS) {
    problems.push('日付ヘッダーが ' + page.dateLabels.length + ' 件（' + WORK_DAYS + ' 件のはず）');
  }
  if (page.headerCounts.length !== WORK_DAYS) {
    problems.push('日別出勤人数が ' + page.headerCounts.length + ' 件（' + WORK_DAYS + ' 件のはず）');
  }
  if (page.girls.length === 0) problems.push('女性が1人も取れていない');
  for (const g of page.girls) {
    if (g.days.length !== WORK_DAYS) {
      problems.push(g.girlId + ': 日数が ' + g.days.length + ' 件');
      continue;
    }
    for (let d = 0; d < WORK_DAYS; d++) {
      if (!g.days[d].start || !g.days[d].end) {
        problems.push(g.girlId + ': 日' + d + ' の時刻が取れていない');
      }
    }
  }
  return problems;
}

export function assertWorkPage(page: WorkPage): void {
  const problems = checkWorkPage(page);
  if (problems.length > 0) {
    throw new Error('出勤管理ページを読めていない:\n- ' + problems.join('\n- '));
  }
}

/** ISO日付("2026-08-27") → 画面の "08/27" 部分。 */
export function isoToDateLabelPrefix(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error('ISO日付ではない: ' + JSON.stringify(iso));
  return m[2] + '/' + m[3];
}

/**
 * ★★★ 深夜またぎの検出。
 * POSTに日付は入らないので、[0] が本当に「自分が思っている今日」かを送信直前に確かめる。
 * ずれていたら送らない。次の周に回す。
 */
export function assertTodayIsIndex0(page: WorkPage, todayISO: string): void {
  const want = isoToDateLabelPrefix(todayISO);
  const got = page.dateLabels[0] ?? '(なし)';
  if (!got.startsWith(want)) {
    throw new Error(
      '日付がずれている。送らずに中止する。こちらの今日=' +
        want +
        ' / 画面の先頭=' +
        got +
        '（深夜0時をまたいだ可能性。POSTに日付は入らないので、ここで止めるしかない）',
    );
  }
}

// ────────────────────── 差し替え（read-modify-write） ──────────────────────

/**
 * ページから読んだ現在値に、変更したいぶんだけ上書きした配列を返す。
 * ★ 正本は【駅ちか側の現在値】。フクエスが知らない女性の行も、読んだままそっくり返すこと。
 *   「知らない子は触らない」では消える（フォームに部分更新の口が無いため）。
 * ★ 知らない girlId への変更は例外にする。黙って無視すると「送ったつもり」になる。
 */
export function applyChanges(page: WorkPage, changes: WorkChange[]): GirlWork[] {
  const girls: GirlWork[] = page.girls.map((g) => ({
    girlId: g.girlId,
    name: g.name,
    days: g.days.map((c) => ({ start: c.start, end: c.end, work: c.work })),
  }));
  const index = new Map(girls.map((g) => [g.girlId, g]));

  for (const ch of changes) {
    const g = index.get(ch.girlId);
    if (!g) {
      throw new Error(
        'この掲載枠に居ない girlId への変更: ' +
          ch.girlId +
          '（castId は掲載枠ごとに別。枠を取り違えていないか確かめること）',
      );
    }
    if (!Number.isInteger(ch.dayIndex) || ch.dayIndex < 0 || ch.dayIndex >= WORK_DAYS) {
      throw new Error('日の添え字が範囲外: ' + ch.dayIndex);
    }
    // 時刻として成立しないものはここで弾く（24時超えは正常）
    ekichikaTimeToMinutes(ch.cell.start);
    ekichikaTimeToMinutes(ch.cell.end);
    g.days[ch.dayIndex] = { start: ch.cell.start, end: ch.cell.end, work: ch.cell.work };
  }
  return girls;
}

// ────────────────────────── 送信内容を組み立てる ──────────────────────────

/**
 * POST するフィールドを画面と同じ順で組み立てる。
 * ★ work_flg は true のときだけ出す（チェックボックスなので、休みは「キーが無い」）。
 * ★ girl_id は日0にだけ付く（画面と同じ）。
 */
export function buildPayload(page: WorkPage, girls: GirlWork[]): Array<[string, string]> {
  const fields: Array<[string, string]> = [['fuel_csrf_token', page.csrfToken]];
  for (const g of girls) {
    for (let d = 0; d < WORK_DAYS; d++) {
      const prefix = 'girl_work[' + g.girlId + '][' + d + ']';
      if (d === 0) fields.push([prefix + '[girl_id]', g.girlId]);
      fields.push([prefix + '[start_time]', g.days[d].start]);
      fields.push([prefix + '[end_time]', g.days[d].end]);
      if (g.days[d].work) fields.push([prefix + '[work_flg]', '1']);
    }
  }
  fields.push(['work_btn', '']);
  return fields;
}

export function encodePayload(fields: Array<[string, string]>): string {
  return fields
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

/**
 * ★★★ PHP の max_input_vars を超えていないか。
 * 超えると【エラーも警告も無く】後ろが捨てられ、全件上書きと重なって出勤が消える。
 * 分割送信はできない（部分更新の口が無い）ので、超えたら送らずに人を呼ぶしかない。
 */
export function assertWithinInputVars(
  fields: Array<[string, string]>,
  limit: number = PHP_MAX_INPUT_VARS_DEFAULT,
): void {
  if (fields.length > limit) {
    throw new Error(
      'POSTのフィールド数が ' +
        fields.length +
        ' 件で上限 ' +
        limit +
        ' 件を超える。送らずに中止する。' +
        '（PHP の max_input_vars を超えると超過分が黙って捨てられ、全件上書きなので出勤が消える。' +
        'このフォームは分割送信できない）',
    );
  }
}

/** その日に出勤する人数。画面の日別人数と突き合わせるために使う。 */
export function countWorkingByDay(girls: GirlWork[]): number[] {
  const counts = new Array<number>(WORK_DAYS).fill(0);
  for (const g of girls) {
    for (let d = 0; d < WORK_DAYS; d++) if (g.days[d].work) counts[d] += 1;
  }
  return counts;
}

// ────────────────────────── 送ったあとに突き合わせる ──────────────────────────

/**
 * ★★★ write-then-verify の本体。
 * 送った内容(sent) と、送信後に読み直したページ(after) を突き合わせる。
 * 見ているのは3系統:
 *   1. 人数        … 切り捨て(max_input_vars)の主症状。まずここで出る
 *   2. セルの中身  … 1件ずつの照合
 *   3. 日別出勤人数… 画面側が自分で数えた値。★ こちらの計算と独立した第2の目
 * expectedDateLabels を渡すと、送信前後で日付がずれていないかも見る。
 */
export function verifyAfterWrite(
  sent: GirlWork[],
  after: WorkPage,
  opts?: { expectedDateLabels?: string[] },
): { ok: boolean; problems: VerifyProblem[] } {
  const problems: VerifyProblem[] = [];

  if (after.girls.length !== sent.length) {
    problems.push({
      kind: 'girl_count_mismatch',
      detail:
        '送った ' +
        sent.length +
        '人 / 戻ってきた ' +
        after.girls.length +
        '人。数が合わない（max_input_vars による切り捨ての疑い）',
    });
  }

  const expected = opts?.expectedDateLabels;
  if (expected && expected.join(',') !== after.dateLabels.join(',')) {
    problems.push({
      kind: 'date_shifted',
      detail: '日付が変わっている: 送信前 [' + expected.join(', ') + '] → 送信後 [' + after.dateLabels.join(', ') + ']',
    });
  }

  const afterIndex = new Map(after.girls.map((g) => [g.girlId, g]));
  for (const g of sent) {
    const a = afterIndex.get(g.girlId);
    if (!a) {
      problems.push({
        kind: 'girl_missing',
        detail: g.girlId + (g.name ? '（' + g.name + '）' : '') + ' が送信後のページに居ない',
      });
      continue;
    }
    for (let d = 0; d < WORK_DAYS; d++) {
      const s = g.days[d];
      const t = a.days[d];
      const same =
        s.work === t.work &&
        (!s.work ||
          (ekichikaTimeToMinutes(s.start) === ekichikaTimeToMinutes(t.start) &&
            ekichikaTimeToMinutes(s.end) === ekichikaTimeToMinutes(t.end)));
      if (!same) {
        problems.push({
          kind: 'cell_mismatch',
          detail:
            g.girlId +
            (g.name ? '（' + g.name + '）' : '') +
            ' 日' +
            d +
            ': 送った ' +
            describeCell(s) +
            ' / 戻り ' +
            describeCell(t),
        });
      }
    }
  }

  const want = countWorkingByDay(sent);
  for (let d = 0; d < WORK_DAYS; d++) {
    const got = after.headerCounts[d];
    if (typeof got === 'number' && got !== want[d]) {
      problems.push({
        kind: 'header_count_mismatch',
        detail:
          '日' + d + '（' + (after.dateLabels[d] ?? '?') + '）の出勤人数: こちらの計算 ' + want[d] + '人 / 画面 ' + got + '人',
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

function describeCell(c: WorkCell): string {
  return c.work ? c.start + '〜' + c.end : '休み';
}
