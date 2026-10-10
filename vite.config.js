import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  server: { port: 5174 },
  /* Mã commit để `games.app_version` phân biệt số liệu trước / sau một lần cân
     bằng. Vercel đặt sẵn biến này; chạy tay thì là 'dev'. */
  define: { __APP_VERSION__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || 'dev') },
  build: {
    /**
     * Tách Phaser và Supabase ra tệp riêng.
     *
     * Không đổi tổng số byte, nhưng đổi chuyện phải tải lại bao nhiêu: mã ván
     * cờ sửa vài dòng là bundle chung đổi tên, còn hai thư viện này thì hàng
     * tháng mới nhúc nhích. Người được mời vào phòng lần thứ hai chỉ tải phần
     * đã đổi thay vì cả 1,8 MB.
     */
    rollupOptions: {
      // Hai trang: bàn cờ và trang cân bằng kỹ năng (/stats.html)
      input: { main: page('index.html'), stats: page('stats.html') },
      output: {
        manualChunks: {
          phaser: ['phaser'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    // Phaser một mình đã hơn 1 MB — ngưỡng mặc định 500 kB chỉ tổ kêu vô ích.
    chunkSizeWarningLimit: 1600,
  },
});
