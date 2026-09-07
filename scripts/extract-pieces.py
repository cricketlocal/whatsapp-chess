"""Cut carved piece photos off the grey studio backdrop and save game PNGs."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path(
    r"C:\Users\PaulWilkinson\.grok\sessions"
    r"\C%3A%5CUsers%5CPaulWilkinson\01a04893-8cfb-7891-9f18-60c0393641de\images"
)
ROOT = Path(__file__).resolve().parents[1]
PIECES_OUT = ROOT / "public" / "pieces-carved"
TEX_OUT = ROOT / "public" / "textures"

MAP = {
    "wK": "19.jpg",
    "bK": "21.jpg",
    "wR": "23.jpg",
    "wN": "6.jpg",
    "wP": "27.jpg",
    "wQ": "17.jpg",
    "wB": "20.jpg",
    "bN": "24.jpg",
    "bB": "22.jpg",
    "bP": "26.jpg",
    "bR": "25.jpg",
    "bQ": "18.jpg",
}


def flood_from_edges(cand: np.ndarray) -> np.ndarray:
    h, w = cand.shape
    vis = np.zeros(h * w, dtype=np.uint8)
    flat = cand.ravel()
    q = np.empty(h * w, dtype=np.int32)
    head = 0
    tail = 0

    def push(i: int) -> None:
        nonlocal tail
        if vis[i] or not flat[i]:
            return
        vis[i] = 1
        q[tail] = i
        tail += 1

    for x in range(w):
        push(x)
        push((h - 1) * w + x)
    for y in range(h):
        push(y * w)
        push(y * w + w - 1)
    while head < tail:
        i = int(q[head])
        head += 1
        y, x = divmod(i, w)
        if x > 0:
            push(i - 1)
        if x < w - 1:
            push(i + 1)
        if y > 0:
            push(i - w)
        if y < h - 1:
            push(i + w)
    return vis.reshape(h, w)


def extract_piece(src_path: Path, out_path: Path, size: int = 320) -> tuple[int, int]:
    rgb = np.array(Image.open(src_path).convert("RGB"))
    h, w = rgb.shape[:2]
    s = 48
    corners = np.concatenate(
        [
            rgb[:s, :s].reshape(-1, 3),
            rgb[:s, -s:].reshape(-1, 3),
            rgb[-s:, :s].reshape(-1, 3),
            rgb[-s:, -s:].reshape(-1, 3),
        ],
        axis=0,
    )
    bg = corners.mean(axis=0)
    dist = np.sqrt(((rgb.astype(np.float32) - bg) ** 2).sum(axis=2))
    mean = rgb.astype(np.float32).mean(axis=2)
    chroma = rgb.astype(np.float32).std(axis=2)
    # Studio + contact-shadow only. Dark carved wood is far from mid-grey.
    cand = dist < 46.0
    vis = flood_from_edges(cand).astype(bool)
    shadow = (chroma < 14) & (mean > 88) & (mean < 168) & (dist < 78)
    grown = vis.copy()
    for _ in range(28):
        d = grown.copy()
        d[1:, :] |= grown[:-1, :]
        d[:-1, :] |= grown[1:, :]
        d[:, 1:] |= grown[:, :-1]
        d[:, :-1] |= grown[:, 1:]
        nxt = (d & shadow) | vis
        if nxt.sum() == grown.sum():
            break
        grown = nxt
    vis2 = grown
    alpha = np.where(vis2, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(radius=0.8))
    alpha_arr = np.array(alpha_img)
    ys0, xs0 = np.where(alpha_arr > 18)
    if xs0.size:
        y_bottom = int(ys0.max())
        y0b = max(y_bottom - int(h * 0.1), 0)
        sl = slice(y0b, y_bottom + 1)
        chroma_b = rgb[sl].astype(np.float32).std(axis=2)
        mean_b = rgb[sl].astype(np.float32).mean(axis=2)
        puddle = (chroma_b < 15) & (mean_b > 78) & (mean_b < 175)
        alpha_arr[sl] = np.where(puddle, 0, alpha_arr[sl])
    rgba = np.dstack([rgb, alpha_arr])
    ys, xs = np.where(alpha_arr > 18)
    if xs.size == 0:
        raise SystemExit(f"empty mask for {src_path}")
    pad = 12
    x0 = max(int(xs.min()) - pad, 0)
    x1 = min(int(xs.max()) + pad + 1, w)
    y0 = max(int(ys.min()) - pad, 0)
    y1 = min(int(ys.max()) + pad + 1, h)
    crop = Image.fromarray(rgba[y0:y1, x0:x1], "RGBA")
    cw, ch = crop.size
    side = max(cw, ch)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - cw) // 2, side - ch), crop)
    out = canvas.resize((size, size), Image.Resampling.LANCZOS)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path, "PNG", optimize=True)
    return out.size[0], out_path.stat().st_size


def save_textures() -> None:
    TEX_OUT.mkdir(parents=True, exist_ok=True)
    marble = Image.open(SRC / "4.jpg").convert("RGB").resize((768, 768), Image.Resampling.LANCZOS)
    marble.save(TEX_OUT / "marble.jpg", quality=88, optimize=True)
    grey = Image.open(SRC / "16.jpg").convert("RGB").resize((768, 768), Image.Resampling.LANCZOS)
    grey.save(TEX_OUT / "grey-marble.jpg", quality=88, optimize=True)


def main() -> None:
    save_textures()
    print("textures", TEX_OUT / "marble.jpg", TEX_OUT / "grey-marble.jpg")
    PIECES_OUT.mkdir(parents=True, exist_ok=True)
    for name, src in MAP.items():
        path = SRC / src
        out = PIECES_OUT / f"{name}.png"
        side, nbytes = extract_piece(path, out)
        print(f"{name} <- {src}  {side}px  {nbytes} bytes")


if __name__ == "__main__":
    main()
