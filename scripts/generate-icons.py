#!/usr/bin/env python3
"""Generate LocalChat app icons.

Mark: a speech bubble (chat) enclosing a keyhole (private / on-device).
Palette comes from design-system/MASTER.md.

Usage: python3 scripts/generate-icons.py
Writes PNGs into assets/images/ and the vector source to assets/images/logo.svg.
"""

from pathlib import Path

from PIL import Image, ImageDraw

TEAL = (13, 148, 136, 255)  # --color-primary #0D9488
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"

SS = 4  # supersampling factor


def draw_mark(size, color, scale=1.0, dy=0.0):
    """Render the bubble+keyhole mark on a transparent canvas of `size` px.

    `scale` is the mark width as a fraction of the canvas (1.0 = the default
    full-bleed proportion). `dy` shifts the mark vertically, in canvas fractions.
    """
    s = size * SS
    img = Image.new("RGBA", (s, s), CLEAR)
    d = ImageDraw.Draw(img)

    cx = s / 2
    cy = s / 2 + dy * s

    # --- speech bubble body -------------------------------------------------
    bw = 0.62 * s * scale
    bh = 0.52 * s * scale
    r = 0.145 * s * scale
    left, top = cx - bw / 2, cy - bh / 2 - 0.035 * s * scale
    d.rounded_rectangle([left, top, left + bw, top + bh], radius=r, fill=color)

    # --- tail ---------------------------------------------------------------
    tail_w = 0.30 * bw
    tail_h = 0.34 * bh
    tx = left + 0.16 * bw
    ty = top + bh - 2
    tip = (tx + 0.02 * bw, ty + tail_h)
    d.polygon([(tx, ty - 0.35 * tail_h), (tx + tail_w, ty), tip], fill=color)
    tipr = 0.030 * s * scale
    d.ellipse([tip[0] - tipr, tip[1] - tipr, tip[0] + tipr, tip[1] + tipr], fill=color)

    # --- keyhole (punched out) ---------------------------------------------
    kcx = cx
    kcy = top + bh * 0.42
    kr = 0.082 * s * scale
    d.ellipse([kcx - kr, kcy - kr, kcx + kr, kcy + kr], fill=CLEAR)

    stem_top = kcy + kr * 0.30
    stem_bot = top + bh * 0.755
    half_top = kr * 0.42
    half_bot = kr * 0.80
    d.polygon(
        [
            (kcx - half_top, stem_top),
            (kcx + half_top, stem_top),
            (kcx + half_bot, stem_bot),
            (kcx - half_bot, stem_bot),
        ],
        fill=CLEAR,
    )

    return img.resize((size, size), Image.LANCZOS)


def on_teal(size, scale=1.0, radius=None):
    """Mark in white over a teal plate (square, or rounded if radius given)."""
    bg = Image.new("RGBA", (size, size), CLEAR)
    plate = Image.new("RGBA", (size, size), TEAL)
    if radius:
        mask = Image.new("L", (size * SS, size * SS), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size * SS - 1, size * SS - 1], radius=radius * SS, fill=255
        )
        plate.putalpha(mask.resize((size, size), Image.LANCZOS))
    bg.alpha_composite(plate)
    bg.alpha_composite(draw_mark(size, WHITE, scale=scale))
    return bg


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # iOS / store icon: full bleed, system applies the mask.
    on_teal(1024).save(OUT / "icon.png")

    # Android adaptive: foreground must live inside the 66% safe zone.
    Image.new("RGBA", (1024, 1024), TEAL).save(OUT / "android-icon-background.png")
    draw_mark(1024, WHITE, scale=0.66).save(OUT / "android-icon-foreground.png")
    draw_mark(1024, WHITE, scale=0.66).save(OUT / "android-icon-monochrome.png")

    # Splash: teal mark on the light splash background (#FAFAF8), contain-fit.
    draw_mark(1024, TEAL, scale=0.85).save(OUT / "splash-icon.png")

    # Web favicon: rounded teal plate so it reads on any tab background.
    on_teal(48, radius=10).save(OUT / "favicon.png")

    # Marketing / README sizes.
    on_teal(512, radius=112).save(OUT / "logo-512.png")

    print("wrote:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
