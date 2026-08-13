"""タイプC（MODE）の配色別キービジュアルを書き出す（2026-08-13）。

    python tools-gen-hp-c-kv.py            # public/hp-c/ に置いた元写真から作る
    python tools-gen-hp-c-kv.py 別フォルダ  # 元写真の置き場所を変える

入力（既定は public/hp-c/ 直下・どれも 2400×960 の横長）:
    modepc.jpg      → オフホワイト（mono）
    modeparple.jpg  → フクシャパープル（purple）
    nayellopc.jpg   → ネープルイエロー（yellow）
    sukarettpc.jpg  → スカーレット（red）

出力（public/hp-c/ 直下）:
    hero-pc-{色}.webp   PC用 2400×960
    hero-sp-{色}.webp   スマホ用 1080×760（モデルを中心に縦長で切る）
    thumb-{色}.webp     デザイン一覧のサムネ 640×360

タイプA・Bと同じ作り（tools-gen-hp-b-kv.py）。色加工はしない＝元写真そのまま。
配色を足すときは SOURCES に1行足して、hpSite.ts の HP_BUNDLED_HERO_COLORS と
DesignThumb.tsx の HP_THUMB_COLORS にも同じキーを足すこと。
"""

import os
import sys

from PIL import Image

DIR = sys.argv[1] if len(sys.argv) > 1 else 'public/hp-c'
OUT_DIR = 'public/hp-c'

SOURCES = {
    'mono':   'modepc.jpg',
    'purple': 'modeparple.jpg',
    'yellow': 'nayellopc.jpg',
    'red':    'sukarettpc.jpg',
}

# 切り出すときの横方向の中心（0=左端・1=右端）。
# タイプCの元写真は4枚とも【モデルが左寄り】（タイプB=右寄りの逆）。
# 0.28 は左端でクランプされて「左端から切る」になり、モデルが枠の左〜中央に収まる。
SP_FOCUS_X = 0.28
THUMB_FOCUS_X = 0.30


def crop_to(im, ratio, focus_x=0.5):
    """指定比率に切る。focus_x は横方向の中心（0=左端・1=右端）。"""
    w, h = im.size
    if w / h > ratio:
        nw = int(h * ratio)
        x = max(0, min(w - nw, int(w * focus_x) - nw // 2))
        return im.crop((x, 0, x + nw, h))
    nh = int(w / ratio)
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for key, filename in SOURCES.items():
        src = Image.open(os.path.join(DIR, filename)).convert('RGB')

        pc = crop_to(src, 2400 / 960).resize((2400, 960), Image.LANCZOS)
        sp = crop_to(src, 1080 / 760, SP_FOCUS_X).resize((1080, 760), Image.LANCZOS)
        th = crop_to(src, 16 / 9, THUMB_FOCUS_X).resize((640, 360), Image.LANCZOS)

        for im, name in ((pc, 'hero-pc'), (sp, 'hero-sp'), (th, 'thumb')):
            path = f'{OUT_DIR}/{name}-{key}.webp'
            im.save(path, 'WEBP', quality=84, method=6)
            print(path, im.size)


if __name__ == '__main__':
    main()
