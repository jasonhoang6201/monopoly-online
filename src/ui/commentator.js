/**
 * Bình luận viên — một dòng chữ nổi ở góc lòng bàn cờ, kèm giọng đọc tiếng Việt.
 *
 * Chỉ **kể**, không bao giờ đổi ván: nhận một khoảnh khắc (ai trả ai, ai vào
 * tù…) rồi nói một câu về nó. Máy cầm lái gửi kèm một số `v` để máy nào cũng
 * rút đúng một câu — cả bàn đọc cùng một lời bình, như ngồi chung một khán đài.
 *
 * Giọng đọc dùng Web Speech API sẵn trong trình duyệt, không gọi dịch vụ nào.
 * Máy không có giọng tiếng Việt thì chỉ hiện chữ: giọng Anh đọc tiếng Việt
 * nghe như đọc mật mã, thà im còn hơn.
 */
import { LINES, fill } from '../data/commentary.js';
import { audio } from '../audio/audio.js';

/**
 * Độ ưu tiên của từng loại câu. Đang nói dở một câu mà câu mới không quan
 * trọng hơn thì câu mới bị bỏ — trả thuê lẻ tẻ mười lượt liền mà câu nào
 * cũng đọc thì bình luận viên thành cái loa phường.
 */
const PRIORITY = {
  rent: 1, buy: 1, jail: 1, trade: 1, goland: 1, event: 2,
  jailAgain: 2, jailDoubles: 2, buyFull: 2, nearmiss: 2, ghostVote: 2,
  rentBig: 3, rentRival: 3, rival: 3, bankrupt: 3, win: 4,
};

/** Câu hay gặp (ưu tiên 1) chỉ nói khoảng chừng này phần — đủ để bàn có tiếng người, chưa tới mức ồn. */
const CHATTER = 0.55;

/** Một câu đứng trên bàn bao lâu. */
const SHOW_MS = 5200;

const VOICE_KEY = 'blv-voice';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readPref() {
  try { return localStorage.getItem(VOICE_KEY) !== 'off'; } catch { return true; }
}

function writePref(on) {
  try { localStorage.setItem(VOICE_KEY, on ? 'on' : 'off'); } catch { /* chế độ riêng tư: thôi, không nhớ */ }
}

export class Commentator {
  constructor() {
    this.voiceOn = readPref();
    this.voice = null;
    this.until = 0;       // câu đang đứng tới lúc nào
    this.level = 0;       // độ ưu tiên của câu đang đứng
    this.hideTimer = 0;
    this.pickVoice();
    // Chrome nạp danh sách giọng sau trang, phải nghe sự kiện này mới thấy
    window.speechSynthesis?.addEventListener?.('voiceschanged', () => this.pickVoice());
  }

  /** Máy này có giọng đọc tiếng Việt không — nút bật giọng chỉ có nghĩa khi có. */
  get canSpeak() { return !!this.voice; }

  pickVoice() {
    const all = window.speechSynthesis?.getVoices?.() ?? [];
    this.voice = all.find((v) => /^vi(-|_|$)/i.test(v.lang)) ?? null;
    this.onVoices?.();
  }

  toggleVoice() {
    this.voiceOn = !this.voiceOn;
    writePref(this.voiceOn);
    if (!this.voiceOn) window.speechSynthesis?.cancel();
    return this.voiceOn;
  }

  el() {
    let el = document.getElementById('commentator');
    if (!el) {
      el = document.createElement('div');
      el.id = 'commentator';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<span class="blv-mic" aria-hidden="true">🎙️</span><span class="blv-text"></span>';
      document.getElementById('board-hud')?.appendChild(el);
    }
    return el;
  }

  /**
   * Nói một câu.
   * @param {string} kind loại khoảnh khắc — khoá của `LINES`
   * @param {Record<string, {name:string, css?:string}|string|number>} vars chỗ
   *   trống; người chơi truyền `{name, css}` để in đậm đúng màu quân
   * @param {number} v số rút câu, máy cầm lái gieo
   */
  say(kind, vars, v = Math.floor(Math.random() * 1e6)) {
    const list = LINES[kind];
    if (!list?.length) return;
    const level = PRIORITY[kind] ?? 1;
    // Câu vặt: rút thăm theo cùng số `v`, nên cả bàn cùng nói hoặc cùng im
    if (level === 1 && (v % 100) / 100 >= CHATTER) return;
    const now = Date.now();
    if (now < this.until && level <= this.level) return;

    const line = list[v % list.length];
    const plain = {}, rich = {};
    for (const [k, x] of Object.entries(vars ?? {})) {
      if (x && typeof x === 'object') {
        plain[k] = x.name;
        rich[k] = `<b style="color:${x.css ?? 'inherit'}">${esc(x.name)}</b>`;
      } else {
        plain[k] = String(x ?? '');
        rich[k] = `<b>${esc(x)}</b>`;
      }
    }

    const el = this.el();
    el.querySelector('.blv-text').innerHTML = fill(esc(line), rich);
    el.classList.remove('show', 'hot');
    void el.offsetWidth;   // chạy lại hoạt cảnh nảy lên cho câu mới
    el.classList.add('show');
    el.classList.toggle('hot', level >= 3);
    this.until = now + SHOW_MS;
    this.level = level;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => { el.classList.remove('show'); this.level = 0; }, SHOW_MS);

    this.speak(fill(line, plain), level);
  }

  speak(text, level) {
    const tts = window.speechSynthesis;
    // Tắt hiệu ứng âm thanh là muốn bàn im — giọng đọc cũng là âm thanh
    if (!tts || !this.voice || !this.voiceOn || !audio.sfxOn) return;
    // Câu quan trọng hơn thì cắt ngang câu đang đọc
    if (tts.speaking) {
      if (level < 2) return;
      tts.cancel();
    }
    const u = new SpeechSynthesisUtterance(text.replace(/\$/g, ' đô'));
    u.voice = this.voice;
    u.lang = this.voice.lang;
    u.rate = level >= 3 ? 1.12 : 1.05;
    u.pitch = level >= 3 ? 1.15 : 1;
    u.volume = 0.9;
    tts.speak(u);
  }

  clear() {
    clearTimeout(this.hideTimer);
    this.until = 0;
    this.level = 0;
    document.getElementById('commentator')?.classList.remove('show');
    window.speechSynthesis?.cancel();
  }
}

export const commentator = new Commentator();
