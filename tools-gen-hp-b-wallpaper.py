"""タイプBの壁紙（水彩の葉）を配色ごとに色替えして書き出す（2026-08-13）。

    python tools-gen-hp-b-wallpaper.py

入力（git に入れてある元画像。リーフグリーン用がそのまま原本）:
    public/hp-b/wallpaper-green.webp   1000×1000・継ぎ目なしのタイル

出力（public/hp-b/ 直下）:
    public/hp-b/wallpaper-terra.webp   テラコッタ（素焼き）
    public/hp-b/wallpaper-blue.webp    スモークブルー
    public/hp-b/wallpaper-pink.webp    ロゼピンク

やっていること: HSV の色相だけを回す（明度・柄はそのまま）。
元画像の葉の色相はおよそ 71°。そこから各配色の色相へ回し、
配色によっては彩度を少しだけ整えている（青は濁りやすいので気持ち上げる）。
色相を回すだけなので継ぎ目なしのタイルはそのまま保たれる。

配色を足すときは TARGETS に1行足して、styles.ts の該当配色ブロックに
::before の background-image を1行足すこと。
"""

import colorsys

import numpy as np
from PIL import Image

SRC = 'public/hp-b/wallpaper-green.webp'
SRC_HUE = 71.0  # 元画像の葉の色相（実測した最頻値）

# key: (目標の色相, 彩度の倍率)
TARGETS = {
    'terra': (22.0, 1.00),   # 素焼き・黄土〜赤茶
    'blue':  (207.0, 1.08),  # 霞んだ水色
    'pink':  (337.0, 1.00),  # 淡い薔薇色
}


def main():
    src = Image.open(SRC).convert('RGB')
    arr = np.asarray(src).astype(np.float32) / 255.0
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]

    mx, mn = arr.max(-1), arr.min(-1)
    v = mx
    d = mx - mn
    s = np.where(mx == 0, 0, d / np.maximum(mx, 1e-6))

    h = np.zeros_like(mx)
    m = d > 1e-6
    idx = m & (mx == r)
    h[idx] = ((g - b)[idx] / d[idx]) % 6
    idx = m & (mx == g)
    h[idx] = ((b - r)[idx] / d[idx]) + 2
    idx = m & (mx == b)
    h[idx] = ((r - g)[idx] / d[idx]) + 4
    h = (h / 6.0) % 1.0

    for key, (hue, sat) in TARGETS.items():
        shift = ((hue - SRC_HUE) / 360.0) % 1.0
        h2 = (h + shift) % 1.0
        s2 = np.clip(s * sat, 0, 1)
        out = np.stack(hsv_to_rgb(h2, s2, v), axis=-1)
        img = Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), 'RGB')
        path = f'public/hp-b/wallpaper-{key}.webp'
        img.save(path, 'WEBP', quality=82, method=6)
        print(path, img.size)


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
    i = i.astype(np.int32) % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return r, g, b


if __name__ == '__main__':
    main()
