/**
 * In ra SQL nạp bảng `skill_meta` (id, nhánh, tầng, loại, tên) từ data/skills.js
 * — bảng tra cho các view thống kê, để SQL không phải gõ tay 50 dòng và không
 * lệch với mã khi cân bằng lại cây.
 *
 *   node scripts/skill-meta-sql.mjs > supabase/migrations/0002_skill_meta.sql
 *
 * Chạy lại mỗi khi thêm / đổi tên / đổi nhánh một ô, rồi dán vào SQL Editor
 * (câu lệnh là upsert nên chạy lại bao nhiêu lần cũng được).
 */
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { SKILLS, BRANCHES } = await vite.ssrLoadModule('/src/data/skills.js');
await vite.close();

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const out = [];
out.push('-- Sinh bởi scripts/skill-meta-sql.mjs — đừng sửa tay, chạy lại script.');
out.push('insert into public.skill_meta (skill_id, branch, branch_name, tier, kind, name) values');
out.push(SKILLS.map((s) => {
  const b = BRANCHES.find((x) => x.key === s.branch);
  return `  (${q(s.id)}, ${q(s.branch)}, ${q(b?.name ?? s.branch)}, ${s.tier}, ${q(s.kind)}, ${q(s.name)})`;
}).join(',\n'));
out.push('on conflict (skill_id) do update set branch = excluded.branch, branch_name = excluded.branch_name,');
out.push('  tier = excluded.tier, kind = excluded.kind, name = excluded.name;');
console.log(out.join('\n'));
