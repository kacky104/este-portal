#!/usr/bin/env bash
set -euo pipefail

# ── 外部媒体取り込み・中継役VPSのスクリプト（第28便／第36便で mode を追加）──────
#
# ★★★ このファイルは「リポジトリが正本、VPSがコピー」。
#   第36便まで、このスクリプトはVPS上にしか無く版管理されていなかった。中身を確認するたび
#   ssh して cat する必要があり、壊したときに戻す先も無かった。ここに置いたので、
#   変更するときは必ず「リポジトリを直す → VPSへコピーする」の順にすること。
#   配置（Windowsのリポジトリから）:
#     scp scripts/import.sh root@160.251.174.184:/root/import.sh
#     ssh root@160.251.174.184 "chmod +x /root/import.sh"
#
# 使い方:
#   /root/import.sh list   … 毎時の周。girlslist方式の店（listMode=true）は個人ページを取らない。
#   /root/import.sh full   … 1日1回の周。全店の個人ページを取って週間予定を維持する。
#   /root/import.sh        … 引数なし＝full（従来の挙動）。
#
# ★★★ 2本立てにした理由（第36便で実測）
#   このスクリプトは毎周 girlslist を取っていたのに、castId を正規表現で抜いたあとHTMLを
#   捨てていた。その捨てていたHTMLに本日の出勤時刻・名前・年齢・サイズが全部載っていた。
#   つまり手元にある情報を捨てて、同じものを個人ページ330件で取り直していた。
#     1周 343リクエスト・約12分  →  毎時13リクエスト・約20秒 ＋ 1日1回330リクエスト
#     駅ちかへの負荷: 8,232件/日 → 642件/日
#   週間予定だけは一覧に載っていないので、full の周が要る。
#
# ★ 引数なしを従来の挙動にしてあるので、crontab を変えるまでは何も変わらない。
#   切り戻しは crontab の list を消すだけでよい（このスクリプトも受け口も戻さなくてよい）。
#
# crontab（第36便・15分間隔）:
#   5,20,35,50 * * * * set -a; . /root/import.env; /usr/bin/bash /root/import.sh list >> /root/import.log 2>&1
#   25 3 * * *         set -a; . /root/import.env; /usr/bin/bash /root/import.sh full >> /root/import.log 2>&1
#
# ★★★ 2026-08-29 訂正 — full を 03:25 にした。03:20 のままでは【一度も走らなかった】。
#   第36便のコメントはこう書いていた:
#     「flock があるので事故にはならず、skip されても次の周で拾える」
#   ★★ これは **list には当てはまるが full には当てはまらない。**
#     list は15分後に次の周がある。★ full は1日1回で、次の周が【翌日の同じ時刻】しかない。
#     3:20 に list（crontab で先に書いてある方）が flock を取り、full は
#       flock -n 9 || { echo "already running -> skip"; exit 0; }
#     で即終了する。★ しかも mode を印字する前に抜けるので、ログに mode=full が1行も残らない。
#     → 翌日も同じ負け方をするので、**毎日負け続けて一度も走らない。**
#
#   実害（2026-08-29 に発見・第36便の 08-26 から3日間）:
#     ・当日ぶんは list が維持していたので、画面上は正常に見えていた
#     ・★ 明日以降の週間予定が 08-26 03:29 のまま止まっていた
#     ・★ salon_import_runs が更新されず、名簿の突き合わせの根拠が古いままだった
#
#   ★★★ 教訓: 「skip されても次の周で拾える」は【周が複数あるもの】にしか言えない。
#     1日1回の周は、skip されたら次が無い。★ 頻度の違うものを同じ理屈で扱わないこと。
#
#   ★ 見張りの注意（第51便で入れるなら）:
#     salon_import_sources.last_run_at は **list が15分ごとに更新する**ので、
#     この事故では【ずっと新しいまま】だった。★ last_run_at を見ても捕まらない。
#     full が走ったかは salon_import_runs の最終、または
#     未来日の therapist_schedules.imported_at で見ること。
#     ★★ 1つの時計で2つの周を見張ることはできない。
#
# ★ 駅ちかへの負荷（第36便実測）:
#     今朝              343件/周・毎時 = 343件/時
#     girlslist方式     13件/周（空振り6件込み）
#     終端判定の改良後   7件/周 → 15分間隔で 28件/時（今朝の1/12）
#   ★ 店舗が増えたら「頻度」ではなく「総量」で見ること。100店なら1周あたり約110件になり、
#     15分間隔では 440件/時＝今朝より重い。上限を決めて頻度のほうを落とすこと。

MODE="${1:-full}"

# ★★★ サーキットブレーカー（第36便・禁則273）
#   駅ちかが 429（多すぎる）や 5xx を返したら、30分は取りに行かない。
#   「相手が重いと言ってきたら引く」のが取得側のいちばん基本的な作法で、
#   リクエスト数を絞ること以上に大事。解除は /root/import.backoff を消すだけ。
BACKOFF_FILE=/root/import.backoff
if [ -f "$BACKOFF_FILE" ]; then
  UNTIL_TS="$(cat "$BACKOFF_FILE" 2>/dev/null || echo 0)"
  # ★ 中身が空・壊れているときに [ -lt ] がエラーになり、set -e で取り込みごと
  #   静かに止まるのを防ぐ。数字でなければ 0（＝すぐ解除）扱いにする。
  case "$UNTIL_TS" in ""|*[!0-9]*) UNTIL_TS=0 ;; esac
  NOW_TS="$(date +%s)"
  if [ "$NOW_TS" -lt "$UNTIL_TS" ]; then
    echo "=== $(TZ=Asia/Tokyo date '+%F %T') backoff 中（$(TZ=Asia/Tokyo date -d "@$UNTIL_TS" '+%F %T') まで）-> skip ==="
    exit 0
  fi
  rm -f "$BACKOFF_FILE"
  echo "=== $(TZ=Asia/Tokyo date '+%F %T') backoff 解除 ==="
fi

exec 9>/root/import.lock
flock -n 9 || { echo "already running -> skip"; exit 0; }

BASE="https://fukues.com"
SECRET="${CRON_SECRET:?set CRON_SECRET}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
TODAY="$(TZ=Asia/Tokyo date +%F)"

# ★ set -e の下で `[ ... ] && Q=...` と書くと、条件が偽のときに終了コード1でスクリプトごと落ちる。
#   if 文にしてあるのはそのため。
Q=""
if [ "$MODE" = "list" ]; then Q="?mode=list"; fi

echo "=== $(TZ=Asia/Tokyo date '+%F %T') mode=$MODE ==="

curl -s -H "Authorization: Bearer $SECRET" "$BASE/api/import/targets$Q" | python3 -c '
import sys,json,re,subprocess,time
BASE=sys.argv[1]; SECRET=sys.argv[2]; UA=sys.argv[3]; TODAY=sys.argv[4]; MODE=sys.argv[5]
CHUNK=10
BACKOFF_FILE="/root/import.backoff"
BACKOFF_SEC=1800

# 駅ちかから1ページ取る。429/5xx が返ったら30分の停止を書いて即座に終わる（禁則273）。
# ★ 200 以外（404など）はその店だけスキップする。全体は止めない。
def fetch(u):
    out=subprocess.run(["curl","-s","-A",UA,"-w","\n%{http_code}",u],capture_output=True,text=True).stdout
    i=out.rfind("\n")
    body,code=(out[:i],out[i+1:].strip()) if i>=0 else ("","000")
    if code=="429" or code.startswith("5"):
        with open(BACKOFF_FILE,"w") as f: f.write(str(int(time.time())+BACKOFF_SEC))
        print("★★★ %s が %s を返した。%d分停止する（解除: rm %s）" % (u,code,BACKOFF_SEC//60,BACKOFF_FILE),flush=True)
        raise SystemExit(2)
    if code!="200":
        print("★ %s が %s を返した（スキップ）" % (u,code),flush=True)
        return ""
    return body

data=json.load(sys.stdin)
for t in data.get("targets",[]):
    shop=t["shopUrl"]; ext=str(t["externalId"]); sid=t["sourceId"]
    use_list = (MODE=="list" and bool(t.get("listMode")))
    ids=[]; pages=[]
    # 一覧(girlslist)を辿る。castId の抽出はどちらのモードでも要る。
    # ★★★ ページ送りを必ず辿ること。アイリスは100人/ページで2ページある（第36便で実測・禁則256）。
    #   1ページ目だけ読むと101番目以降が「在籍から消えた子」に化けて掃除で倒れる。
    #
    # ★★ 終端の判定（第36便で改良）。
    #   以前は「次のページを取ってみて、新しいIDが無ければ終わり」としていた。確実だが、
    #   1ページで収まる店でも毎回1回よけいに取りに行っていた（6店で13件のうち6件が空振り）。
    #   いまは【次ページへのリンクがある】か【このページが PAGE_SIZE 人ぶん埋まっている】の
    #   どちらかが成り立つときだけ次を取る。6店で 13件 → 7件 になる。
    #   ★ 2つの信号を併用しているのは、片方の前提が崩れても止まらないようにするため:
    #       ・リンクの書式が変わった → 「100人ぶん埋まっている」で拾う
    #       ・1ページの人数が変わった → 「次ページへのリンク」で拾う
    #     取りこぼしの代償が大きい（消えた子として掃除で倒れる）ので、ここは二重にしておく。
    PAGE_SIZE=100
    for pg in range(1,6):
        lu=shop.rstrip("/")+"/girlslist/"+("" if pg==1 else "page%d/"%pg)
        lh=fetch(lu)
        found=list(dict.fromkeys(re.findall(r"/%s/(\d+)/"%ext,lh)))
        new=[c for c in found if c not in ids]
        if not new: break
        ids+=new
        if use_list: pages.append(lh)   # ★ list モードのときだけHTMLを保持して送る
        has_next = ("/girlslist/page%d/"%(pg+1)) in lh
        if not has_next and len(found) < PAGE_SIZE: break   # ← どちらも成り立たないときだけ終わり
        time.sleep(1)
    print("source",sid,"mode","list" if use_list else "full","ids",len(ids),flush=True)
    if use_list:
        if not pages:
            print("source",sid,"pages 0 -> skipped (no list page)",flush=True); continue
        body=json.dumps({"sourceId":sid,"todayISO":TODAY,"pages":pages,"apply":True})
        r=subprocess.run(["curl","-s","-X","POST","-H","Authorization: Bearer "+SECRET,"-H","Content-Type: application/json","--data-binary","@-",BASE+"/api/import/ingest-list"],input=body,capture_output=True,text=True)
        print("source",sid,"list ->",r.stdout[:600],flush=True)
        continue
    casts=[]
    for cid in ids:
        u=shop.rstrip("/")+"/"+cid+"/"
        h=fetch(u)
        casts.append({"castId":cid,"html":h}); time.sleep(1)
    if not casts:
        print("source",sid,"casts 0 -> skipped (no cast ids found)",flush=True); continue
    n=(len(casts)+CHUNK-1)//CHUNK
    for i in range(0,len(casts),CHUNK):
        part=casts[i:i+CHUNK]
        body=json.dumps({"sourceId":sid,"todayISO":TODAY,"casts":part})
        r=subprocess.run(["curl","-s","-X","POST","-H","Authorization: Bearer "+SECRET,"-H","Content-Type: application/json","--data-binary","@-",BASE+"/api/import/ingest"],input=body,capture_output=True,text=True)
        print("source",sid,"chunk",i//CHUNK+1,"of",n,"casts",len(part),"->",r.stdout,flush=True)
' "$BASE" "$SECRET" "$UA" "$TODAY" "$MODE"
