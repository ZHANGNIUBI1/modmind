from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "logo.png"
RESOURCES = ROOT / "resources"
RENDERER_ASSETS = ROOT / "src" / "renderer" / "src" / "assets"
RENDERER_PUBLIC = ROOT / "src" / "renderer" / "public"


def remove_connected_white_background(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.int16)
    border = np.concatenate((rgb[:16].reshape(-1, 3), rgb[-16:].reshape(-1, 3), rgb[:, :16].reshape(-1, 3), rgb[:, -16:].reshape(-1, 3)))
    background = np.median(border, axis=0)
    difference = np.max(np.abs(rgb - background), axis=2)
    candidate = (rgb.min(axis=2) >= 205) & (difference <= 55)
    padded = Image.fromarray(np.pad(candidate, 1, constant_values=True).astype(np.uint8) * 255, "L").copy()
    ImageDraw.floodfill(padded, (0, 0), 128)
    connected = np.array(padded, dtype=np.uint8)[1:-1, 1:-1] == 128
    edge_region = np.array(Image.fromarray(connected.astype(np.uint8) * 255, "L").filter(ImageFilter.MaxFilter(5))) > 0
    delta = np.maximum(background - rgb, 0).max(axis=2)
    alpha = np.full(rgb.shape[:2], 255, dtype=np.uint8)
    alpha[edge_region] = np.clip(delta[edge_region], 0, 255).astype(np.uint8)
    alpha[alpha < 12] = 0
    alpha_float = alpha.astype(np.float32) / 255.0
    output_rgb = rgb.astype(np.float32)
    visible = (alpha > 0) & edge_region
    for channel in range(3):
        output_rgb[:, :, channel][visible] = (output_rgb[:, :, channel][visible] - background[channel] * (1.0 - alpha_float[visible])) / alpha_float[visible]
    return Image.fromarray(np.dstack((np.clip(output_rgb, 0, 255).astype(np.uint8), alpha)), "RGBA")


def square_crop(image: Image.Image, padding_ratio: float = 0.08) -> Image.Image:
    bounds = image.getchannel("A").getbbox()
    if bounds is None:
        raise RuntimeError("Background removal produced an empty image")
    left, top, right, bottom = bounds
    width, height = right - left, bottom - top
    padding = round(max(width, height) * padding_ratio)
    side = max(width, height) + padding * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(image.crop(bounds), ((side - width) // 2, (side - height) // 2))
    return canvas


def main() -> None:
    RESOURCES.mkdir(parents=True, exist_ok=True)
    RENDERER_ASSETS.mkdir(parents=True, exist_ok=True)
    RENDERER_PUBLIC.mkdir(parents=True, exist_ok=True)
    extracted = remove_connected_white_background(Image.open(SOURCE))
    icon_master = square_crop(extracted).resize((1024, 1024), Image.Resampling.LANCZOS)
    icon_512 = icon_master.resize((512, 512), Image.Resampling.LANCZOS)
    extracted.save(RESOURCES / "logo.png", optimize=True)
    icon_512.save(RESOURCES / "icon.png", optimize=True)
    icon_512.save(RENDERER_ASSETS / "logo.png", optimize=True)
    icon_master.resize((64, 64), Image.Resampling.LANCZOS).save(RENDERER_PUBLIC / "favicon.png", optimize=True)
    icon_512.save(RESOURCES / "icon.ico", format="ICO", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    alpha = np.asarray(extracted.getchannel("A"))
    print(f"transparent={np.mean(alpha == 0):.1%}; bounds={extracted.getchannel('A').getbbox()}")


if __name__ == "__main__":
    main()
