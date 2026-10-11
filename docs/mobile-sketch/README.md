# Phác thảo giao diện mobile (điện thoại nằm ngang)

Bản **concept** để xem thử game trông ra sao trên điện thoại, trước khi quyết
định port. Một file HTML tự chứa, dữ liệu giả, **không** nối với `src/` và không
có luật chơi thật — bấm được qua các màn để cảm nhận bố cục và cách chạm.

## Mở xem

- **Trên máy tính**: `npm run dev` rồi mở
  `http://localhost:5174/docs/mobile-sketch/index.html`. Trang hiện trong khung
  điện thoại, thanh trên cùng đổi được cỡ máy (iPhone 16 Pro, iPhone SE, Pixel 8,
  iPad mini) và chủ đề.
- **Trên điện thoại thật**: cùng Wi-Fi, mở
  `http://<IP máy tính>:5174/docs/mobile-sketch/index.html` rồi xoay ngang.
  Trang tự bỏ khung và chiếm trọn màn hình.

Menu **☰** góc trái dưới bật thẳng từng hộp thoại (mua đất, Cơ Hội, Thời Cuộc,
thiếu tiền, giao dịch, cây kỹ năng, thắng ván) mà không cần lắc đúng ô.

## Ý chính của bố cục

- Ba cột: **người chơi** (trái, chạm để xem đối thủ) · **bàn cờ** (giữa, chạm ô
  để xem thẻ đất thay cho hover) · **hành động** (phải, nút chính to, lưới nút
  phụ, nhật ký lượt, thanh Thời Cuộc, đồng hồ).
- Thông tin sâu mở bằng **tấm trượt** từ hai cạnh, bàn cờ vẫn hở; quyết định
  nhanh dùng hộp giữa màn; cây kỹ năng **toàn màn dạng tab** thay cho 5 cột.
- Ảnh tham khảo trong `shots/`.
