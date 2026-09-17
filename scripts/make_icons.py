# -*- coding: utf-8 -*-
"""WorkOut Note のアイコン生成（赤地 #D23B38 に白のダンベル）。

使い方:  python scripts/make_icons.py
出力先:  app/icons/  (icon-192.png, icon-512.png, apple-touch-icon.png, favicon-32.png, favicon.ico)

マスカブル対応: 図柄は中央の安全領域（直径80%の円）の内側に収めている。
"""
from pathlib import Path
from PIL import Image, ImageDraw

RED = (0xD2, 0x3B, 0x38, 255)
WHITE = (255, 255, 255, 255)
OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
SS = 4  # スーパーサンプリング倍率（縮小してアンチエイリアス）


def draw_icon(size: int, scale: float = 1.0) -> Image.Image:
    """size px の正方形アイコン。scale は図柄の拡大率（favicon は少し大きく描く）。"""
    s = size * SS
    img = Image.new("RGBA", (s, s), RED)
    d = ImageDraw.Draw(img)
    c = s / 2

    def rect(x0, x1, half_h, radius):
        # x0, x1, half_h は中心からの比率（-0.5〜0.5）
        d.rounded_rectangle(
            [c + x0 * s * scale, c - half_h * s * scale, c + x1 * s * scale, c + half_h * s * scale],
            radius=radius * s * scale, fill=WHITE)

    rect(-0.32, 0.32, 0.028, 0.02)          # シャフト
    for sign in (-1, 1):
        a, b = sorted((sign * 0.115, sign * 0.205))
        rect(a, b, 0.18, 0.03)              # 内側プレート（大）
        a, b = sorted((sign * 0.22, sign * 0.285))
        rect(a, b, 0.12, 0.025)             # 外側プレート（小）
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    draw_icon(192).save(OUT / "icon-192.png", optimize=True)
    draw_icon(512).save(OUT / "icon-512.png", optimize=True)
    draw_icon(180).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)   # iOS は透過なし
    draw_icon(32, 1.2).save(OUT / "favicon-32.png", optimize=True)
    draw_icon(64, 1.2).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    for p in sorted(OUT.iterdir()):
        print(f"{p.name}\t{p.stat().st_size} bytes")


if __name__ == "__main__":
    main()
