export interface OcrResult {
  senderName: string | null;
  amount: number | null;
  rawText: string;
}

function parseAmountFromText(text: string): number | null {
  const patterns = [
    /(?:paid|sent|amount|₹|rs\.?)\s*[:\-]?\s*(?:₹|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:₹|rs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\b([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?)/i,
  ];

  const amounts: number[] = [];
  for (const pattern of patterns) {
    const matches = text.matchAll(new RegExp(pattern.source, "gi"));
    for (const match of matches) {
      const val = parseFloat(match[1].replace(/,/g, ""));
      if (val > 0 && val < 1000000) amounts.push(val);
    }
  }

  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

function parseSenderFromText(text: string): string | null {
  const patterns = [
    /(?:from|paid by|sender|sent by|payer)\s*[:\-]?\s*([A-Za-z][A-Za-z\s.]{2,40})/i,
    /(?:to|received by)\s*[:\-]?\s*([A-Za-z][A-Za-z\s.]{2,40})/i,
    /(?:UPI\s*(?:ID|Ref)?)\s*[:\-]?\s*([a-z0-9._-]+@[a-z]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(line)) {
      return line;
    }
  }

  return null;
}

export async function extractPaymentFromImage(
  imageBuffer: Buffer,
  timeoutMs = 8000
): Promise<OcrResult> {
  const ocrPromise = (async () => {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");

    try {
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);

      return {
        senderName: parseSenderFromText(text),
        amount: parseAmountFromText(text),
        rawText: text,
      };
    } finally {
      await worker.terminate();
    }
  })();

  const timeoutPromise = new Promise<OcrResult>((_, reject) => {
    setTimeout(() => reject(new Error("OCR timeout")), timeoutMs);
  });

  return Promise.race([ocrPromise, timeoutPromise]);
}

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function namesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  return na.includes(nb) || nb.includes(na) || na === nb;
}

export function amountsMatch(
  a: number | null,
  b: number | null,
  tolerance = 1
): boolean {
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tolerance;
}
