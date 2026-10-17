/**
 * Quản trị phòng trên máy chủ ván cờ.
 *
 *   npm run rooms -- list               liệt kê phòng (tối đa 40 phòng đầu kèm tình trạng)
 *   npm run rooms -- wipe ABCD          xoá một phòng
 *   npm run rooms -- wipe               xoá hết, hỏi xác nhận trước
 *   npm run rooms -- wipe --yes         xoá hết, không hỏi
 *
 * Máy chủ: `--server <url>`, hoặc biến GAME_SERVER, hoặc VITE_GAME_SERVER trong
 * .env; mặc định `wrangler dev` trên máy. ws:// / wss:// tự đổi sang http(s)://.
 * Khoá: biến ADMIN_TOKEN, hoặc ADMIN_TOKEN trong .env (không có tiền tố VITE_
 * nên Vite không đưa vào bundle). Trên Cloudflare đặt bằng
 *   npx wrangler secret put ADMIN_TOKEN --config server/wrangler.toml
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

function dotenv() {
  try {
    return Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
      .split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]));
  } catch { return {}; }
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const yes = args.includes('--yes');
if (yes) args.splice(args.indexOf('--yes'), 1);
const env = dotenv();
const server = (flag('--server') || process.env.GAME_SERVER || env.VITE_GAME_SERVER || 'ws://localhost:8787')
  .replace(/^ws(s?):\/\//, 'http$1://').replace(/\/+$/, '');
const token = process.env.ADMIN_TOKEN || env.ADMIN_TOKEN;
const [cmd, code] = args;

if (!token) {
  console.error('Thiếu ADMIN_TOKEN (biến môi trường hoặc trong .env).');
  process.exit(1);
}

async function call(path, method = 'GET') {
  const res = await fetch(`${server}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${body.error ?? ''} (${server}${path})`);
  return body;
}

if (cmd === 'list') {
  const r = await call('/admin/rooms');
  console.log(`${r.total} phòng trên ${server}`);
  if (r.rooms.length) {
    console.table(r.rooms.map((x) => ({
      mã: x.code, 'tạo lúc': x.createdAt, 'giai đoạn': x.phase, ghế: x.seats, 'đang nối': x.online,
      lượt: x.turnNo ?? '', 'hết ván': x.over ?? '', 'người chơi': (x.names ?? []).join(', '),
    })));
  }
  if (r.total > r.rooms.length) console.log(`(chỉ hiện ${r.rooms.length} phòng đầu)`);
} else if (cmd === 'wipe' && code) {
  const r = await call(`/admin/wipe?code=${encodeURIComponent(code)}`, 'POST');
  console.log(`Đã xoá phòng ${r.wiped.join(', ')}. Còn ${r.left} phòng.`);
} else if (cmd === 'wipe') {
  const { total } = await call('/admin/rooms');
  if (!total) { console.log('Không có phòng nào.'); process.exit(0); }
  if (!yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`Xoá hết ${total} phòng trên ${server}? Người đang chơi sẽ bị đưa về màn hình đầu. Gõ XOA để xác nhận: `);
    rl.close();
    if (ans.trim() !== 'XOA') { console.log('Huỷ.'); process.exit(0); }
  }
  let wiped = 0;
  for (;;) {
    const r = await call('/admin/wipe', 'POST');
    wiped += r.wiped.length;
    if (!r.left || !r.wiped.length) break;
  }
  console.log(`Đã xoá ${wiped} phòng.`);
} else {
  console.log('Dùng: npm run rooms -- list | wipe [MÃ] [--yes] [--server URL]');
  process.exit(cmd ? 1 : 0);
}
