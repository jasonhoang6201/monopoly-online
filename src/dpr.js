/**
 * Tỉ lệ điểm ảnh vật lý của màn hình.
 *
 * Phaser ở chế độ Scale.RESIZE đặt `canvas.width` bằng số điểm ảnh CSS,
 * nên trên màn Retina khung vẽ bị trình duyệt phóng to → chữ và nét bị mờ.
 * Ta tự nhân kích thước khung vẽ với DPR rồi thu nhỏ lại bằng CSS.
 * Chặn ở 3 để máy 4K/5K không phải vẽ quá nhiều điểm ảnh.
 */
export const DPR = Math.min(window.devicePixelRatio || 1, 3);

/** Đổi kích thước tính bằng điểm ảnh CSS sang điểm ảnh khung vẽ. */
export const px = (cssPx) => cssPx * DPR;
