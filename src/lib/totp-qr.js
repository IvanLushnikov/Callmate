/** Local TOTP QR — never send otpauth URI to third-party QR APIs. */
import qrcode from "./qrcode-generator.js";

/**
 * @param {string} text otpauth URI
 * @param {number} [size=180]
 * @returns {string} data URL (PNG) or empty string on failure
 */
export function otpauthQrDataUrl(text, size = 180) {
  if (!text || typeof document === "undefined") return "";
  try {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const cell = size / count;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#111111";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(Math.floor(col * cell), Math.floor(row * cell), Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}
