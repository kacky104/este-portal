'use client';

// 反映の早見表（第299便・2026-09-12・カッキーさんの指示で【別ページ】に）。
//
// ★★★ なぜホームから出したか
//   ★ 第212便からホームの下に折りたたみ（<details>）で置いていたが、
//     ホームは【いまの状態と3つの設定】の画面。★ 早見表は【仕組みの説明】で、読む場面が違う。
//   ★ 折りたたみは「開くもの」だと気づかれにくく、開くとホームが縦に長くなる。
//   → ★ 左サイドバー「連携の記録」の下に「反映の早見表」を置き、1画面1機能にそろえた（MediaShell の骨格）。
//
// ★★ 中身は第298便のまま動かしていない（★ 描き方も、印の色も、そのまま持ってきた）。
//   ★ 値は mediaMatrix.ts（番人 check:mediamatrix あり）。★ この画面は並べるだけ。
//   ★ 上の箱＝出勤・写メ日記などの3表（自動で回るもの）。★ 下の箱＝セラピストの2表（向きごとに1枚）。

import { MEDIA_MATRIX, MATRIX_SITES, MATRIX_ROWS, MATRIX_FOOTNOTES, NO as MATRIX_NO, NA as MATRIX_NA, SEE as MATRIX_SEE, OK as MATRIX_OK, MAYBE as MATRIX_MAYBE } from '@/lib/mediaMatrix';
import { THERAPIST_TABLES } from '@/lib/mediaMatrix';

export function MatrixBoard() {
  return (
    <div className="space-y-3">

      {/* ── ★★★ 反映の早見表（第212便・2026-09-07・カッキーさん）────────
          ★ 「設定を変えると、何が・どこへ・どれくらいで反映されるか」を1枚で。★ Excel の表のように。
          ★ 第299便: 折りたたみをやめて、そのまま見せる（★ この画面に来た時点で読む気でいる）。
          ★ 値は mediaMatrix.ts（cron の間隔・受け口の条件から）。 */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-5">
        {/* ★ 第215便（2026-09-08・カッキーさん）: 添え書きは「各項目設定をした場合」 */}
        <p className="text-[15px] font-bold text-slate-700">
          反映の早見表 <span className="text-[13px] font-medium text-slate-400 ml-1">— 各項目設定をした場合</span>
        </p>
        {MEDIA_MATRIX.map((sec) => (
          <div key={sec.key}>
            {/* ★ 第215便（2026-09-08・カッキーさん）: 見出しの下の但し書きは消した。★ 表と補足だけで足りる */}
            <p className="text-[14.5px] font-black text-slate-800 mb-2">{sec.title}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[460px] text-[13.5px] border border-slate-200">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left font-bold text-[12px] text-slate-400 px-3 py-2 border-b border-slate-200 w-[120px]"></th>
                    {/* ★ 見出しは区画ごとに差し替えられる（「駅ちかから反映」の1列目は行き先の「フクエス」・第215便） */}
                    {(sec.headers ?? MATRIX_SITES).map((site) => (
                      <th key={site} className="text-center font-bold text-[12.5px] text-slate-600 px-2 py-2 border-b border-l border-slate-200 whitespace-nowrap">{site}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_ROWS.map((row) => (
                    <tr key={row} className="border-t border-slate-100">
                      <th className="text-left font-bold text-slate-700 px-3 py-2 whitespace-nowrap bg-slate-50/60">{row}</th>
                      {sec.cells[row].map((cell, i) => (
                        <td
                          key={i}
                          className={`text-center px-2 py-2 border-l border-slate-100 whitespace-nowrap tabular-nums ${
                            cell === MATRIX_NO || cell === MATRIX_NA ? 'text-slate-300' : cell === MATRIX_SEE || cell === '準備中' ? 'text-slate-400' : 'font-bold text-emerald-700'
                          }`}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ★ 表のすぐ下の注（※ のマスの説明・第215便）。★ 無ければ出さない */}
            {sec.remark && <p className="mt-1.5 text-[12.5px] text-slate-400 leading-relaxed">{sec.remark}</p>}
          </div>
        ))}
        {/* ★ 早見表の下の補足5行は第298便で外した（カッキーさんの添削）。★ 空なら何も出さない */}
        {MATRIX_FOOTNOTES.length > 0 && (
          <ul className="text-[12.5px] text-slate-400 leading-relaxed space-y-0.5">
            {MATRIX_FOOTNOTES.map((f) => <li key={f}>・{f}</li>)}
          </ul>
        )}
      </div>

      {/* ── ★★★ セラピストの反映（第298便・2026-09-12・カッキーさんの指示で作り直し）──
          ★ 上の3表とは【別の箱】。★ 向きごとに1枚ずつ、【項目 × 何が起きるか】を文で書く（第三者が読む）。
          ★ 第297便の「登録を押す／1枚／読み直す」は、何が流れるのかが読めなかったので捨てた。
          ★ 値は mediaMatrix.ts（番人あり）。★ マスは長い文なので折り返す（上の表と違い nowrap にしない）。 */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5 space-y-5">
        {THERAPIST_TABLES.map((t, ti) => (
          <div key={t.key} className={ti > 0 ? 'pt-4 border-t border-slate-200' : ''}>
            <p className="text-[14.5px] font-black text-slate-800">{t.title}</p>
            {/* ★ 1行目を持たない表もある（エステラブ・エスランの現状・第298便） */}
            {t.lead ? <p className="mt-1 mb-2 text-[12.5px] text-slate-500 leading-relaxed">{t.lead}</p> : <div className="mb-2" />}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px] border border-slate-200">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left font-bold text-[12px] text-slate-400 px-3 py-2 border-b border-slate-200 w-[150px]">項目</th>
                    {t.headers.map((h) => (
                      <th key={h} className="text-center font-bold text-[12.5px] text-slate-600 px-2 py-2 border-b border-l border-slate-200 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((row) => (
                    <tr key={row.label} className="border-t border-slate-100 align-top">
                      <th className="text-left font-bold text-slate-700 px-3 py-2 bg-slate-50/60 leading-snug">{row.label}</th>
                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          // ★★ 見出しが空の1列目は【印だけの細い列】（★ 持たない表もある・第298便）。
                          //   ★ 幅はその列だけに付ける。★ ほかの列に付けると、〇 が入ったサイトの列まで細くなる。
                          className={`px-2.5 py-2 border-l border-slate-100 leading-snug ${
                            i === 0 && t.headers[0] === ''
                              ? 'text-center font-black text-[16px] w-[44px] ' + (cell === MATRIX_NO ? 'text-slate-300' : 'text-emerald-700')
                              : cell === MATRIX_NO || cell === MATRIX_NA
                                ? 'text-center text-slate-300'
                                : cell === MATRIX_OK
                                  ? 'text-center font-black text-emerald-700 text-[16px]'
                                  : cell === MATRIX_MAYBE
                                  ? 'text-center font-black text-amber-500 text-[16px]'
                                  // ★★ 印（〇 / ✕ / △）で始まるマスは【中央そろえ】（第298便・カッキーさんの添削）。
                                  //   ★ 左そろえだと、印だけの行と印が縦に並ばず、目で追えない。
                                  : cell.startsWith(MATRIX_OK) || cell.startsWith(MATRIX_NO) || cell.startsWith(MATRIX_MAYBE)
                                    // ★ 改行（\n）を入れたマスは、そこで行を分ける（1行目に印・2行目に説明）
                                    ? 'text-center text-emerald-800 whitespace-pre-line'
                                    : cell.startsWith('送れません') || cell.startsWith('準備中')
                                      ? 'text-left text-slate-400'
                                      : 'text-left text-emerald-800'
                          }`}
                        >
                          {/* ★★ 「〇（10文字まで）」「✕各サイトでの登録が必要」のように印で始まるマスは、
                              ★ 印だけ太く大きくする（第298便）。★ 印だけのマスと同じ見え方にそろえる
                              （★ 同じ 〇・✕ が、列によって細く見えないように）。 */}
                          {!(i === 0 && t.headers[0] === '') && (cell.startsWith(MATRIX_OK) || cell.startsWith(MATRIX_NO) || cell.startsWith(MATRIX_MAYBE)) && cell !== MATRIX_OK && cell !== MATRIX_NO && cell !== MATRIX_MAYBE ? (
                            <>
                              <span className={`font-black text-[16px] ${cell.startsWith(MATRIX_OK) ? 'text-emerald-700' : cell.startsWith(MATRIX_MAYBE) ? 'text-amber-500' : 'text-slate-300'}`}>
                                {cell.slice(0, 1)}
                              </span>
                              {cell.slice(1)}
                            </>
                          ) : (
                            cell
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ★ 補足が無い表もある（第298便・※ を見出しの下へ移した）。★ 空の箱を出さない */}
            {t.notes.length > 0 && (
              <ul className="mt-2 text-[12.5px] text-slate-400 leading-relaxed space-y-0.5">
                {t.notes.map((f) => <li key={f}>・{f}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
