"""タイプA（LUXE）の配色別キービジュアルを1枚の元写真から作る（2026-08-12）。

    python tools-gen-hp-a-kv.py 元写真.png

出力（public/hp-a/ 直下）:
    hero-pc-{色}.webp   PC用 2400×960
    hero-sp-{色}.webp   スマホ用 1080×760
    thumb-{色}.webp     デザイン一覧のサムネ 640×360

やっていること: 同じ写真の【暗部だけ】に配色の色を差す。
肌のような明るい所はほぼ元のままなので、色フィルタを掛けたような不自然さが出ない。
アイボリーブラック（gold）は無加工＝元写真そのもの。

タイプSは別経路（public/hp-s/・HpTemplate の hero-pc{-色}.webp）で同じことをしている。
配色を足すときは RECIPES に1行足して、hpSite.ts の HP_BUNDLED_HERO_COLORS と
DesignThumb.tsx の HP_THUMB_COLORS にも同じキーを足すこと。
"""

import os
import sys

from PIL import Image, ImageChops

SRC = sys.argv[1] if len(sys.argv) > 1 else 'kv-a.png'
OUT_DIR = 'public/hp-a'

# (暗部に足す色, ガンマ)。ガンマが大きいほど「本当に暗い所」にしか色が乗らない。
RECIPES = {
    'gold':    None,                  # アイボリーブラック＝元のまま
    'magenta': ((48, 3, 17), 2.2),    # ディープマゼンタ＝青みの赤
    'sienna':  ((48, 29, 7), 2.2),    # ローシェンナ＝黄土
    'umber':   ((42, 17, 5), 2.2),    # バーントアンバー＝焦げ茶
}


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


def grade(im, tint, gamma):
    lum = im.convert('L')
    mask = lum.point(lambda v: int(255 * ((1 - v / 255) ** gamma)))
    layers = [ImageChops.multiply(Image.new('L', im.size, c), mask) for c in tint]
    return ImageChops.add(im, Image.merge('RGB', layers))


def main():
    src = Image.open(SRC).convert('RGB')
    w, h = src.size

    pc = crop_to(src, 2400 / 960).resize((2400, 960), Image.LANCZOS)
    # スマホ用はモデル（画面中央やや右）を中心に縦長で切る
    nw = int(h * (1080 / 760))
    x0 = max(0, min(w - nw, int(w * 0.52) - nw // 2))
    sp = src.crop((x0, 0, x0 + nw, h)).resize((1080, 760), Image.LANCZOS)
    th = crop_to(src, 16 / 9).resize((640, 360), Image.LANCZOS)

    os.makedirs(OUT_DIR, exist_ok=True)
    for key, recipe in RECIPES.items():
        for base, name in ((pc, 'hero-pc'), (sp, 'hero-sp'), (th, 'thumb')):
            im = base if recipe is None else grade(base, *recipe)
            path = f'{OUT_DIR}/{name}-{key}.webp'
            im.save(path, 'WEBP', quality=82, method=6)
            print(path, im.size)


if __name__ == '__main__':
    main()
