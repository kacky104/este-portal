"""タイプA（LUXE）の配色別キービジュアルを書き出す（2026-08-12）。

    python tools-gen-hp-a-kv.py            # public/hp-a/ に置いた元写真から作る
    python tools-gen-hp-a-kv.py 別フォルダ  # 元写真の置き場所を変える

入力（既定は public/hp-a/ 直下・どれも横長の元写真。git には入れない）:
    黒demo.jpg        → アイボリーブラック（gold）
    deepmazetop.jpg   → ディープマゼンタ（magenta）
    rosyennapc.jpg    → ローシェンナ（sienna）
    a-bantop.jpg      → バーントアンバー（umber）

出力（public/hp-a/ 直下・これだけを git に入れる）:
    hero-pc-{色}.webp   PC用 2400×960
    hero-sp-{色}.webp   スマホ用 1080×760（モデルを中心に縦長で切る）
    thumb-{色}.webp     デザイン一覧のサムネ 640×360

※ 最初は1枚の写真の暗部に色を差して4色を作っていたが、並べたときの差が弱かったので
   2026-08-12 に「配色ごとに別撮りの写真」へ切り替えた。色加工はしない＝元写真のまま。

配色を足すときは SOURCES に1行足して、hpSite.ts の HP_BUNDLED_HERO_COLORS と
DesignThumb.tsx の HP_THUMB_COLORS にも同じキーを足すこと。
"""

import os
import sys

from PIL import Image

DIR = sys.argv[1] if len(sys.argv) > 1 else 'public/hp-a'
OUT_DIR = 'public/hp-a'

SOURCES = {
    'gold':    '黒demo.jpg',
    'magenta': 'deepmazetop.jpg',
    'sienna':  'rosyennapc.jpg',
    'umber':   'a-bantop.jpg',
}

# スマホ用を切り出すときの横方向の中心（0=左端・1=右端）。モデルの立ち位置に合わせる。
SP_FOCUS_X = 0.52


def crop_to(im, ratio):
    """中央基準で指定比率に切る。"""
    w, h = im.size
    if w / h > ratio:
        nw = int(h * ratio)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(w / ratio)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for key, filename in SOURCES.items():
        src = Image.open(os.path.join(DIR, filename)).convert('RGB')
        w, h = src.size

        pc = crop_to(src, 2400 / 960).resize((2400, 960), Image.LANCZOS)
        nw = int(h * (1080 / 760))
        x0 = max(0, min(w - nw, int(w * SP_FOCUS_X) - nw // 2))
        sp = src.crop((x0, 0, x0 + nw, h)).resize((1080, 760), Image.LANCZOS)
        th = crop_to(src, 16 / 9).resize((640, 360), Image.LANCZOS)

        for im, name in ((pc, 'hero-pc'), (sp, 'hero-sp'), (th, 'thumb')):
            path = f'{OUT_DIR}/{name}-{key}.webp'
            im.save(path, 'WEBP', quality=84, method=6)
            print(path, im.size)


if __name__ == '__main__':
    main()
