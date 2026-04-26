import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";

function drawRect(png, x0, y0, x1, y1, rgba) {
  const w = png.width;
  const h = png.height;
  const [r, g, b, a] = rgba;
  const xa = Math.max(0, Math.min(w, Math.floor(x0)));
  const xb = Math.max(0, Math.min(w, Math.ceil(x1)));
  const ya = Math.max(0, Math.min(h, Math.floor(y0)));
  const yb = Math.max(0, Math.min(h, Math.ceil(y1)));
  for (let y = ya; y < yb; y++) {
    for (let x = xa; x < xb; x++) {
      const idx = (w * y + x) << 2;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
}

function drawSimpleAIIcon(size) {
  const png = new PNG({ width: size, height: size });
  // Background #050505
  drawRect(png, 0, 0, size, size, [5, 5, 5, 255]);

  // Inner badge (simple centered square) #111111 with subtle border
  const pad = Math.round(size * 0.14);
  drawRect(png, pad, pad, size - pad, size - pad, [17, 17, 17, 255]);
  const b = Math.max(1, Math.round(size * 0.01));
  // border #262626
  drawRect(png, pad, pad, size - pad, pad + b, [38, 38, 38, 255]);
  drawRect(png, pad, size - pad - b, size - pad, size - pad, [38, 38, 38, 255]);
  drawRect(png, pad, pad, pad + b, size - pad, [38, 38, 38, 255]);
  drawRect(png, size - pad - b, pad, size - pad, size - pad, [38, 38, 38, 255]);

  // Ultra-minimal "AI" monogram: blocky letters using rectangles (no font dependency).
  // This is intentionally simple/temporary.
  const cx = size / 2;
  const cy = size / 2;
  const letterH = size * 0.36;
  const letterW = size * 0.12;
  const gap = size * 0.06;
  const top = cy - letterH / 2;
  const bottom = cy + letterH / 2;

  // "A" (left): two legs + crossbar
  const aLeft = cx - gap - letterW * 1.5;
  drawRect(png, aLeft, top, aLeft + letterW, bottom, [245, 245, 245, 255]);
  drawRect(png, aLeft + letterW * 1.6, top, aLeft + letterW * 2.6, bottom, [245, 245, 245, 255]);
  drawRect(png, aLeft, cy - letterW * 0.3, aLeft + letterW * 2.6, cy + letterW * 0.7, [245, 245, 245, 255]);

  // "I" (right): single stem
  const iLeft = cx + gap + letterW * 0.3;
  drawRect(png, iLeft, top, iLeft + letterW, bottom, [245, 245, 245, 255]);

  // Violet underline accent #9333ea
  const ulW = size * 0.38;
  const ulH = Math.max(2, Math.round(size * 0.04));
  drawRect(png, cx - ulW / 2, bottom + size * 0.06, cx + ulW / 2, bottom + size * 0.06 + ulH, [147, 51, 234, 255]);

  return png;
}

function writePng(outPath, png) {
  mkdirSync(dirname(outPath), { recursive: true });
  const buf = PNG.sync.write(png);
  writeFileSync(outPath, buf);
}

const root = resolve(process.cwd());
writePng(resolve(root, "public/icon-192.png"), drawSimpleAIIcon(192));
writePng(resolve(root, "public/icon-512.png"), drawSimpleAIIcon(512));
writePng(resolve(root, "public/apple-touch-icon.png"), drawSimpleAIIcon(180));

console.log("Generated PWA icons in public/.");

