// ponytail: one-off icon generator. Produces a valid 1024x1024 PNG (dark with accent
// keypad grid) so `npx tauri icon` can derive the full Tauri icon set. No image deps.
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 1024;
const BG = [28, 28, 30];
const ACCENT = [255, 159, 10];
const KEY = [212, 212, 214];

const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 2;

const margin = 144;
const gap = 24;
const cellSize = Math.floor((SIZE - margin * 2 - gap * 3) / 4);
const topPad = 320;

function colorAt(x: number, y: number): number[] {
  for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
    for (let colIdx = 0; colIdx < 4; colIdx++) {
      const x0 = margin + colIdx * (cellSize + gap);
      const y0 = topPad + rowIdx * (cellSize + gap);
      if (y >= y0 && y < y0 + cellSize && x >= x0 && x < x0 + cellSize) {
        return colIdx === 3 ? ACCENT : KEY;
      }
    }
  }
  return BG;
}

const rows: Buffer[] = [];
for (let y = 0; y < SIZE; y++) {
  const r = Buffer.alloc(1 + SIZE * 3);
  r[0] = 0;
  for (let x = 0; x < SIZE; x++) {
    const c = colorAt(x, y);
    r[1 + x * 3] = c[0];
    r[1 + x * 3 + 1] = c[1];
    r[1 + x * 3 + 2] = c[2];
  }
  rows.push(r);
}
const idat = zlib.deflateSync(Buffer.concat(rows));

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
]);

writeFileSync('./icon-source.png', png);
console.log(`wrote icon-source.png (${png.length} bytes, ${SIZE}x${SIZE})`);
