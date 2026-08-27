#!/usr/bin/env bash
set -euo pipefail

# ── 他媒体への中継役（第38便・論点② C-2「引き取り型」）─────────────────────
#
# ★★★ このファイルは「リポジトリが正本、VPSがコピー」。import.sh と同じ作法。
#   配置（Windowsのリポジトリから）:
#     scp scripts/relay.sh root@160.251.174.184:/root/relay.sh
#     ssh root@160.251.174.184 "chmod +x /root/relay.sh"
#
# ★★★ このスクリプトは【中身を理解しない】。
#   フクエスから「このリクエストを投げて」というジョブを引き取り、宛先を検査して投げ、
#   結果をそのまま返すだけ。ログイン処理も照合処理も持たない。
#   → だからここは滅多に変更されない。第36便の「VPS上にしか無く版管理されないコード」
#     問題が構造的に起きない。**この性質を壊す変更をしないこと。**
#   ★ 何かをここに書きたくなったら、それはフクエス側に書くべきもの。
#
# 使い方:
#   /root/relay.sh          … 既定50秒ぶん回して終わる
#   /root/relay.sh 20       … 20秒ぶん
#
# crontab:
#   * * * * * set -a; . /root/import.env; /usr/bin/bash /root/relay.sh >> /root/relay.log 2>&1
#   ★ 毎分起動し、1回の起動の中でポーリングする。
#     出勤の更新は login→read→write→再read の4往復。1分に1件しか引かない形だと
#     1サイクル4分かかる。起動の中で回すことで1分弱に収まる。
#   ★ flock があるので、前の周が長引いても二重に走らない。

SPAN="${1:-50}"
BASE="https://fukues.com"
SECRET="${CRON_SECRET:?set CRON_SECRET}"

# ★ サーキットブレーカー（禁則273）。import.sh と同じファイルを共有する。
#   駅ちかが「重い」と言ってきたら、取り込みも中継もまとめて引く。
BACKOFF_FILE=/root/import.backoff
if [ -f "$BACKOFF_FILE" ]; then
  UNTIL_TS="$(cat "$BACKOFF_FILE" 2>/dev/null || echo 0)"
  case "$UNTIL_TS" in ""|*[!0-9]*) UNTIL_TS=0 ;; esac
  if [ "$(date +%s)" -lt "$UNTIL_TS" ]; then
    echo "=== $(TZ=Asia/Tokyo date '+%F %T') relay: backoff 中 -> skip ==="
    exit 0
  fi
fi

exec 9>/root/relay.lock
flock -n 9 || { echo "relay: already running -> skip"; exit 0; }

python3 - "$BASE" "$SECRET" "$SPAN" "$BACKOFF_FILE" <<'PY'
import sys, json, time, base64, gzip, subprocess, os
from urllib.parse import urlparse

BASE, SECRET, SPAN, BACKOFF_FILE = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]

# ★★★ VPS 側の allowlist。フクエス側にも同じ表がある（src/lib/relayJob.ts）。
#   片方だけに頼らない。フクエス側が壊れても、ここで止まる。
ALLOWED_HOSTS = {"ranking-deli.jp"}
MAX_TIME = 30          # 1リクエストの上限（秒）
BACKOFF_SEC = 1800     # 429/5xx を見たら30分引く
IDLE_SLEEP = 5         # ジョブが無いときの待ち

HDR = "/tmp/relay.h"
BDY = "/tmp/relay.b"

def log(msg):
    print("%s relay: %s" % (time.strftime("%F %T"), msg), flush=True)

def call(path, payload):
    r = subprocess.run(
        ["curl", "-s", "--max-time", "60", "-X", "POST", path,
         "-H", "Authorization: Bearer " + SECRET,
         "-H", "Content-Type: application/json",
         "--data-binary", "@-"],
        input=json.dumps(payload), capture_output=True, text=True)
    try:
        return json.loads(r.stdout or "{}")
    except Exception:
        return {"ok": False, "error": "フクエスの応答をJSONとして読めない: " + (r.stdout or "")[:200]}

def check_url(url):
    """★ 宛先の検査。フクエス側と同じ規則（完全一致・https・ポートなし・ユーザー情報なし）。"""
    u = urlparse(url)
    if u.scheme != "https":      return "https 以外は投げない: %s" % u.scheme
    if u.username or u.password: return "ユーザー情報つきURLは投げない"
    if u.port:                   return "ポート指定つきURLは投げない"
    if u.hostname not in ALLOWED_HOSTS:
        # ★ 前方一致・後方一致で書かないこと（ranking-deli.jp.evil.com が通る）
        return "許可していない宛先: %s" % u.hostname
    return None

def send(job):
    """駅ちかへ1回投げて、(status, headers, body) を返す。"""
    for f in (HDR, BDY):
        try: os.remove(f)
        except OSError: pass

    req = job["request"]
    args = ["curl", "-s", "--max-time", str(MAX_TIME), "-D", HDR, "-o", BDY,
            "-w", "%{http_code}", "-X", req["method"], req["url"]]
    for k, v in (req.get("headers") or {}).items():
        args += ["-H", "%s: %s" % (k, v)]
    # ★ リダイレクトを追わない（-L を付けない）。302 と Location は
    #   フクエス側が見て判断する。ここで追うと「中身を理解しない」が崩れる。
    body = req.get("body") or ""
    if req["method"] == "POST":
        args += ["--data-binary", "@-"]
        r = subprocess.run(args, input=body, capture_output=True, text=True)
    else:
        r = subprocess.run(args, capture_output=True, text=True)

    code = (r.stdout or "0").strip()
    status = int(code) if code.isdigit() else 0

    headers = {}
    try:
        with open(HDR, "r", errors="replace") as f:
            for line in f:
                if ":" not in line: continue
                k, v = line.split(":", 1)
                k = k.strip().lower(); v = v.strip()
                if k == "set-cookie":
                    headers.setdefault("set-cookie", []).append(v)
                else:
                    headers[k] = v
    except OSError:
        pass

    raw = b""
    try:
        with open(BDY, "rb") as f:
            raw = f.read()
    except OSError:
        pass
    return status, headers, base64.b64encode(gzip.compress(raw)).decode("ascii")

deadline = time.time() + SPAN
picked = 0
empty = 0
while time.time() < deadline:
    got = call(BASE + "/api/relay/lease", {})
    if not got.get("ok"):
        log("lease 失敗: %s" % str(got.get("error"))[:200]); break
    job = got.get("job")
    if not job:
        # ★ 0件のときも理由が返ってくる（フクエス側でそう作ってある）
        empty += 1
        # ★★★ 空振りで居座らない。
        #   毎分起動して50秒ポーリングし続けると、ジョブが無い日でも
        #   1日1万回以上フクエスを叩くことになる（関数呼び出しの空回り）。
        #   ・この周でまだ1件も扱っていない → すぐ抜ける（次の分の周で拾う。最大60秒待ち）
        #   ・扱ったあとの空振り → 2回続いたら抜ける（続きのジョブを取りこぼさないため）
        #   ★ 出勤の書き込みは1日数回。待ち時間より、空回りを減らすほうが大事。
        if picked == 0 or empty >= 2:
            break
        time.sleep(IDLE_SLEEP); continue
    empty = 0

    picked += 1
    jid = job["id"]
    ng = check_url(job["request"]["url"])
    if ng:
        log("job %s を拒否: %s" % (jid, ng))
        call(BASE + "/api/relay/result", {"jobId": jid, "error": "VPS側のallowlistで拒否: " + ng})
        continue

    try:
        status, headers, packed = send(job)
    except Exception as e:
        log("job %s 送信で例外: %s" % (jid, str(e)[:200]))
        call(BASE + "/api/relay/result", {"jobId": jid, "error": "VPS側で例外: " + str(e)[:200]})
        continue

    # ★ 中身は見ない。purpose も url も出さない（ログに秘密や宛先の詳細を残さない）
    log("job %s -> %d (%d bytes packed)" % (jid, status, len(packed)))
    res = call(BASE + "/api/relay/result",
               {"jobId": jid, "status": status, "headers": headers, "bodyPacked": packed})
    if not res.get("ok"):
        log("result 受け取り拒否: %s" % str(res.get("note") or res.get("error"))[:200])

    # ★ 相手が「重い」と言ってきたら引く（禁則273）。結果は返したうえで止める。
    if status == 429 or 500 <= status <= 599:
        with open(BACKOFF_FILE, "w") as f:
            f.write(str(int(time.time()) + BACKOFF_SEC))
        log("★★★ 駅ちかが %d を返した。%d分停止する（解除: rm %s）" % (status, BACKOFF_SEC // 60, BACKOFF_FILE))
        break

log("この周で扱ったジョブ: %d 件" % picked)
PY
