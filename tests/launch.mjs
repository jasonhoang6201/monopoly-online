import { chromium } from 'playwright';

/**
 * Mở Chrome cho kiểm thử — luôn qua hàm này, đừng gọi thẳng `chromium.launch`.
 *
 * Chrome do Playwright bật lên chạy chế độ headless, mà headless trên macOS
 * không xin được ngữ cảnh đồ hoạ của hệ thống nên WebGL rơi về SwiftShader:
 * toàn bộ việc vẽ làm bằng CPU, trải trên mọi lõi. Bàn cờ Phaser vẽ lại cả
 * khung hình mỗi nhịp, nên suốt bài kiểm thử máy chạy hết công suất chỉ để
 * dựng được 8 khung hình một giây — vừa nóng máy vừa kéo dài mọi thao tác chờ.
 *
 * `--use-angle=metal` trả việc vẽ về GPU thật. Cùng một cảnh: ~780% CPU / 8 fps
 * xuống còn ~45% CPU / 117 fps. Cờ này chỉ có nghĩa trên macOS; hệ khác bỏ qua.
 */
export function launchChrome(opts = {}) {
  const gpuArgs = process.platform === 'darwin' ? ['--use-angle=metal'] : [];
  return chromium.launch({
    channel: 'chrome',
    ...opts,
    args: [...gpuArgs, ...(opts.args ?? [])],
  });
}
