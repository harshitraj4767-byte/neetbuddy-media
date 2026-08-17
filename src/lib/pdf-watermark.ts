// Client-only helper: download a PDF stamped with the app logo as a soft, centered watermark.
// Uses the app icon PNG (already has rounded/smooth edges) at 0.16 opacity in the center of every page.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const LOGO_URL = "/icons/icon-192.png";

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { credentials: "omit" });
  if (!r.ok) throw new Error(`Failed to fetch: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

let cachedLogo: Uint8Array | null = null;
async function loadLogo(): Promise<Uint8Array> {
  if (cachedLogo) return cachedLogo;
  cachedLogo = await fetchBytes(LOGO_URL);
  return cachedLogo;
}

export async function downloadWatermarkedPdf(pdfUrl: string, filename: string): Promise<void> {
  try {
    const [pdfBytes, logoBytes] = await Promise.all([fetchBytes(pdfUrl), loadLogo()]);
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const logo = await doc.embedPng(logoBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      // Logo sized to ~45% of the shorter page edge, centered.
      const logoSize = Math.min(width, height) * 0.45;
      page.drawImage(logo, {
        x: (width - logoSize) / 2,
        y: (height - logoSize) / 2,
        width: logoSize,
        height: logoSize,
        opacity: 0.17,
      });
      // Small footer tag so every page reads as ours.
      const tag = "neetbuddy.app";
      const tagSize = 9;
      const tagW = font.widthOfTextAtSize(tag, tagSize);
      page.drawText(tag, {
        x: width - tagW - 18,
        y: 14,
        size: tagSize,
        font,
        color: rgb(0.5, 0.5, 0.5),
        opacity: 0.55,
      });
    }

    const out = await doc.save();
    const buf = new Uint8Array(out).slice().buffer;
    const blob = new Blob([buf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch {
    // Fallback: direct download without watermark rather than failing silently.
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = filename;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
