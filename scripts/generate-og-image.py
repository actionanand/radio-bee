#!/usr/bin/env python3
"""Build RadioBee's static 1200x630 social preview from the official app icon.

Run: python3 scripts/generate-og-image.py
Requires Pillow (installed by the GitHub Pages and PR workflows).
No browser or Angular runtime is involved: share crawlers read index.html directly.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ICON = ROOT / "src/assets/icon/radio-bee.png"
OUTPUT = ROOT / "src/assets/social/radio-bee-og.png"
WIDTH, HEIGHT = 1200, 630


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    family = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu") / family,
        Path("/usr/local/share/fonts") / family,
        Path("/usr/share/fonts/truetype/liberation2") / (
            "LiberationSans-Bold.ttf" if bold else "LiberationSans-Regular.ttf"
        ),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    try:
        return ImageFont.truetype(family, size)
    except OSError as exc:
        raise RuntimeError("A DejaVu or Liberation Sans TTF font is required") from exc


def make_image() -> None:
    if not ICON.is_file():
        raise FileNotFoundError(f"Official RadioBee icon missing: {ICON}")

    # A clean high-contrast share card; all important elements stay away from edges.
    image = Image.new("RGB", (WIDTH, HEIGHT), (250, 249, 245))
    pixels = image.load()
    for y in range(HEIGHT):
        ratio = y / (HEIGHT - 1)
        color = (
            round(250 - 7 * ratio),
            round(249 + 2 * ratio),
            round(245 + 3 * ratio),
        )
        for x in range(WIDTH):
            pixels[x, y] = color
    draw = ImageDraw.Draw(image)
    draw.ellipse((970, -235, 1430, 230), fill=(227, 239, 232))
    draw.ellipse((-245, 480, 210, 885), fill=(231, 240, 231))
    draw.rounded_rectangle((82, 80, 1118, 550), radius=42, fill=(255, 255, 253))

    # Soft shadow behind the real app icon, with a neutral tile to support both
    # transparent and nontransparent icon artwork.
    shadow = Image.new("RGBA", (WIDTH, HEIGHT))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((118, 158, 404, 444), radius=56, fill=(22, 62, 49, 40))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    image = Image.alpha_composite(image.convert("RGBA"), shadow)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((115, 150, 405, 440), radius=54, fill=(247, 249, 245, 255))

    icon = Image.open(ICON).convert("RGBA")
    icon.thumbnail((266, 266), Image.Resampling.LANCZOS)
    icon_x = 260 - icon.width // 2
    icon_y = 295 - icon.height // 2
    image.alpha_composite(icon, (icon_x, icon_y))
    draw = ImageDraw.Draw(image)

    heading = (23, 61, 47, 255)
    accent = (47, 105, 72, 255)
    secondary = (66, 82, 73, 255)
    draw.text((476, 186), "INTERNET RADIO", font=font(23, bold=True), fill=accent, stroke_width=0)
    draw.text((468, 228), "RadioBee", font=font(94, bold=True), fill=heading)
    draw.rounded_rectangle((474, 358, 556, 365), radius=3, fill=accent)
    draw.text((470, 390), "Stay tuned. Stay buzzing.", font=font(36), fill=secondary)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    rgb = image.convert("RGB")
    rgb.save(OUTPUT, format="PNG", optimize=True, compress_level=9)
    # Palette optimization is useful to keep WhatsApp previews quick on mobile.
    if OUTPUT.stat().st_size > 400_000:
        rgb.quantize(colors=192, method=Image.Quantize.MEDIANCUT).save(
            OUTPUT, format="PNG", optimize=True, compress_level=9
        )
    size = OUTPUT.stat().st_size
    if size > 600_000:
        raise RuntimeError(f"OG image is too large ({size} bytes); optimize the source icon")
    print(f"Generated {OUTPUT.relative_to(ROOT)} ({WIDTH}x{HEIGHT}, {size} bytes)")


if __name__ == "__main__":
    make_image()
