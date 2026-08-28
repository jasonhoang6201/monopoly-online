/**
 * Kết nối Supabase — chỉ dùng Realtime (WebSocket), không đụng tới bảng nào.
 *
 * Khoá đặt trong `.env.local` (xem `.env.example`). Thiếu khoá thì `supabase`
 * là `null` và game rơi về chế độ một máy — không văng lỗi lúc khởi động.
 */
import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (URL && ANON_KEY)
  ? createClient(URL, ANON_KEY, {
      auth: { persistSession: false },
      // Một ván cờ hiếm khi vượt 20 thông điệp/giây; đặt trần để khỏi bị chặn.
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null;

/** Đã cấu hình khoá chưa — dùng để bật/tắt nút "Chơi online" ở màn hình chờ. */
export const isConfigured = () => supabase !== null;
