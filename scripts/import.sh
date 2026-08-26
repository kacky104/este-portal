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
# crontab（第36便）:
#   5 * * * *  set -a; . /root/import.env; /usr/bin/bash /root/import.sh list >> /root/import.log 2>&1
#   20 3 * * * set -a; . /root/import.env; /usr/bin/bash /root/import.sh full >> /root/import.log 2>&1
#   ※ 03:20 にしてあるのは 03:05 の list 周と flock で衝突させないため（禁則231）。

MODE="${1:-full}"

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
data=json.load(sys.stdin)
for t in data.get("targets",[]):
    shop=t["shopUrl"]; ext=str(t["externalId"]); sid=t["sourceId"]
    use_list = (MODE=="list" and bool(t.get("listMode")))
    ids=[]; pages=[]
    # 一覧(girlslist)を辿る。castId の抽出はどちらのモードでも要る。
    # ★ ページ送りを必ず辿ること。アイリスは100人/ページで2ページある（第36便で実測）。
    #   1ページ目だけ読むと101番目以降が「在籍から消えた子」に化けて掃除で倒れる。
    for pg in range(1,6):
        lu=shop.rstrip("/")+"/girlslist/"+("" if pg==1 else "page%d/"%pg)
        lh=subprocess.run(["curl","-s","-A",UA,lu],capture_output=True,text=True).stdout
        found=list(dict.fromkeys(re.findall(r"/%s/(\d+)/"%ext,lh)))
        new=[c for c in found if c not in ids]
        if not new: break
        ids+=new
        if use_list: pages.append(lh)   # ★ list モードのときだけHTMLを保持して送る
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
        h=subprocess.run(["curl","-s","-A",UA,u],capture_output=True,text=True).stdout
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
