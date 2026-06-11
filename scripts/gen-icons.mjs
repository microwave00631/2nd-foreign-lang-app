// PWAアイコン生成スクリプト(依存なし・Node標準のみ)。
// 紺背景 + 青い円 + 白い「本」風の図形を描いた単純なアイコンを出力する。
// 使い方: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size, draw) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x, y, size);
      const p = row + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BG = [0x1a, 0x1d, 0x29];
const BLUE = [0x5b, 0x8d, 0xef];
const WHITE = [0xff, 0xff, 0xff];

function draw(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const d = Math.hypot(x - cx, y - cy);
  if (d > size * 0.42) return BG;
  // 円の中に開いた本(2つの台形風の白い面)
  const nx = (x - cx) / size;
  const ny = (y - cy) / size;
  const inBook =
    ny > -0.13 + Math.abs(nx) * 0.18 &&
    ny < 0.16 + Math.abs(nx) * 0.05 &&
    Math.abs(nx) < 0.24;
  const spine = Math.abs(nx) < 0.012 && ny > -0.14 && ny < 0.17;
  if (inBook && !spine) return WHITE;
  return BLUE;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.png`, makePng(size, draw));
  console.log(`public/icons/icon-${size}.png generated`);
}
