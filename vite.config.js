import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5174 },
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
