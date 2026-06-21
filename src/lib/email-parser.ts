export interface ParsedBookingEmail {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  bookingDate: Date;
  startTime?: string;
  endTime?: string;
  totalAmount: number;
  slotPrice?: number;
  couponAmount?: number;
  paidOnKhelomore: boolean;
  externalId?: string;
  venueName?: string;
  turfName?: string;
  location?: string;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function normalizeEmailBody(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseKhelomoreDate(value: string): Date | null {
  const match = value.match(
    /(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+'?(\d{2,4})/i
  );
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase().slice(0, 3)];
  let year = parseInt(match[3], 10);
  if (year < 100) year += 2000;

  return new Date(Date.UTC(year, month, day, 12, 0, 0));
}

function parseAmount(value: string): number | null {
  const match = value.match(/₹?\s*([\d,]+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

function parseBookingId(subject: string, text: string): string | null {
  const subjectMatch = subject.match(
    /KheloMore:\s*([A-Z0-9-]+)/i
  );
  if (subjectMatch) return subjectMatch[1];

  const bodyMatch = text.match(
    /Booking Details[\s\S]*?\b(\d{4}-\d+-[A-Z0-9]+)\b/i
  );
  return bodyMatch ? bodyMatch[1] : null;
}

function parseUserDetails(text: string) {
  const nameMatch = text.match(/Name:\s*([^\n]+)/i);
  const phoneMatch = text.match(/Mobile No\.:\s*(\+?\d[\d\s-]{8,14})/i);
  const emailMatch = text.match(/Email ID:\s*(\S+@\S+)/i);
  const bookedByMatch = text.match(/Booked by\s+([^\n•]+)/i);

  return {
    customerName: (nameMatch?.[1] || bookedByMatch?.[1] || "").trim(),
    customerPhone: phoneMatch?.[1]?.replace(/\s/g, ""),
    customerEmail: emailMatch?.[1]?.trim(),
  };
}

function parseVenueDetails(text: string) {
  const section = text.match(
    /Booking Details([\s\S]*?)(?:Slot Details|Bill Details|$)/i
  )?.[1];

  if (!section) return { venueName: undefined, location: undefined };

  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^booking details$/i.test(line) &&
        !/^\d{4}-\d+-[A-Z0-9]+$/i.test(line)
    );

  const venueName = lines[0];
  const location = lines[1];

  return {
    venueName: venueName || undefined,
    location: location || undefined,
  };
}

function parseSlots(text: string) {
  const section = text.match(
    /Slot Details([\s\S]*?)(?:Bill Details|Important Instructions|$)/i
  )?.[1];

  if (!section) return { bookingDate: null, slots: [] as Array<{ start: string; end: string; turfName?: string; price?: number }> };

  const bookingDate = parseKhelomoreDate(
    section.match(/(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+'?\d{2,4})/i)?.[1] || ""
  );

  const slots: Array<{ start: string; end: string; turfName?: string; price?: number }> = [];
  const timeMatches = [...section.matchAll(/(\d{2}:\d{2})-(\d{2}:\d{2})/g)];

  for (const match of timeMatches) {
    const start = match[1];
    const end = match[2];
    const after = section.slice(match.index! + match[0].length, match.index! + match[0].length + 120);
    const turfMatch = after.match(/([A-Za-z][A-Za-z0-9\s.'-]{2,40})/);
    const priceMatch = after.match(/₹\s*([\d,]+)/);

    slots.push({
      start,
      end,
      turfName: turfMatch?.[1]?.trim(),
      price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : undefined,
    });
  }

  return { bookingDate, slots };
}

function parseBillDetails(text: string) {
  const section = text.match(/Bill Details([\s\S]*?)(?:Important Instructions|$)/i)?.[1] || text;

  const slotPriceMatch = section.match(/Slot\(s\)\s*Price\s*₹?\s*([\d,]+)/i);
  const couponMatch = section.match(/Coupon[\s\S]*?-₹?\s*([\d,]+)/i);
  const amountReceivedMatch = section.match(/Amount Received\s*₹?\s*([\d,]+)/i);

  return {
    slotPrice: slotPriceMatch ? parseFloat(slotPriceMatch[1].replace(/,/g, "")) : undefined,
    couponAmount: couponMatch ? parseFloat(couponMatch[1].replace(/,/g, "")) : undefined,
    amountReceived: amountReceivedMatch
      ? parseFloat(amountReceivedMatch[1].replace(/,/g, ""))
      : undefined,
  };
}

function normalizeMatchValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function getVenueFilterConfig() {
  return {
    venueName: process.env.KHELOMORE_VENUE_NAME?.trim() || "",
    turfName: process.env.KHELOMORE_TURF_NAME?.trim() || "",
  };
}

export function matchesVenueFilter(parsed: ParsedBookingEmail): boolean {
  const { venueName, turfName } = getVenueFilterConfig();

  if (!venueName) return false;

  if (!parsed.venueName) return false;
  const expectedVenue = normalizeMatchValue(venueName);
  const actualVenue = normalizeMatchValue(parsed.venueName);
  if (!actualVenue.includes(expectedVenue) && !expectedVenue.includes(actualVenue)) {
    return false;
  }

  // Optional: only apply turf filter if explicitly configured
  if (turfName) {
    if (!parsed.turfName) return false;
    const expectedTurf = normalizeMatchValue(turfName);
    const actualTurf = normalizeMatchValue(parsed.turfName);
    if (!actualTurf.includes(expectedTurf) && !expectedTurf.includes(actualTurf)) {
      return false;
    }
  }

  return true;
}

export function parseKhelomoreEmail(
  subject: string,
  body: string
): ParsedBookingEmail | null {
  const text = normalizeEmailBody(body);
  const user = parseUserDetails(text);
  const venue = parseVenueDetails(text);
  const { bookingDate, slots } = parseSlots(text);
  const bill = parseBillDetails(text);
  const externalId = parseBookingId(subject, text);

  if (!user.customerName || !bookingDate) return null;

  const paidOnKhelomore = /Status:\s*Completed/i.test(text);
  const totalAmount =
    bill.amountReceived ??
    bill.slotPrice ??
    slots.reduce((sum, slot) => sum + (slot.price || 0), 0);

  if (!totalAmount || totalAmount <= 0) return null;

  const startTime = slots[0]?.start;
  const endTime = slots.at(-1)?.end;
  const turfNames = [...new Set(slots.map((slot) => slot.turfName).filter(Boolean))];

  return {
    customerName: user.customerName,
    customerPhone: user.customerPhone,
    customerEmail: user.customerEmail,
    bookingDate,
    startTime,
    endTime,
    totalAmount,
    slotPrice: bill.slotPrice,
    couponAmount: bill.couponAmount,
    paidOnKhelomore,
    externalId: externalId || undefined,
    venueName: venue.venueName,
    turfName: turfNames.length === 1 ? turfNames[0] : turfNames.join(", "),
    location: venue.location,
  };
}

export function isKhelomoreBookingEmail(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  const fromMatches =
    fromLower.includes("info@khelomore.com") ||
    fromLower.includes("khelomore.com");

  const subjectMatches = subjectLower.includes(
    "you have a new booking from khelomore"
  );

  return fromMatches && subjectMatches;
}

export const SAMPLE_KHELOMORE_EMAIL = `
Status: Completed • Sun, 21st Jun '26, 10:11
Booked by Mohit Kherada
Hi, A booking is completed at your venue!

User Details
Name: Mohit Kherada
Mobile No.: 7400276265
Email ID: mrkherada@gmail.com

Booking Details
2026-272-SIDR
Lush Sports
Mira Road East Mumbai

Slot Details
28 Jun '26
08:00-09:00
Perth Turf
₹1000
09:00-10:00
Perth Turf
₹1000

Bill Details
Sun, 21st Jun '26, 10:11
Slot(s) Price ₹2000
Coupon (KHELO30M) -₹70
Amount Received ₹ 1890
`;
