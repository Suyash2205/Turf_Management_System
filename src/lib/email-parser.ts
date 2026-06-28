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
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8377;/gi, "₹")
    .replace(/&#?\w+;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTime12to24(hour: string, minute: string, ampm: string): string {
  let h = parseInt(hour, 10);
  const upper = ampm.toUpperCase();
  if (upper === "PM" && h !== 12) h += 12;
  if (upper === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

function parseTimeRangeLine(
  line: string
): { start: string; end: string } | null {
  const match24 = line.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  if (match24) {
    return { start: match24[1], end: match24[2] };
  }

  const match12 = line.match(
    /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i
  );
  if (match12) {
    return {
      start: parseTime12to24(match12[1], match12[2], match12[3]),
      end: parseTime12to24(match12[4], match12[5], match12[6]),
    };
  }

  return null;
}

function parsePriceFromLine(line: string): number | null {
  const match = line.match(/^[₹]?\s*([\d,]+(?:\.\d{1,2})?)$/);
  if (!match) return null;
  return parseFloat(match[1].replace(/,/g, ""));
}

type SlotGroup = {
  bookingDate: Date;
  slots: Array<{
    start: string;
    end: string;
    turfName?: string;
    price?: number;
  }>;
};

function sumSlotPrices(dayGroups: SlotGroup[]) {
  return dayGroups.reduce(
    (sum, group) =>
      sum + group.slots.reduce((daySum, slot) => daySum + (slot.price || 0), 0),
    0
  );
}

function fillMissingSlotTemplates(dayGroups: SlotGroup[]): SlotGroup[] {
  const template = dayGroups.find((group) => group.slots.length > 0)?.slots;
  if (!template?.length) return dayGroups;

  return dayGroups.map((group) => ({
    ...group,
    slots:
      group.slots.length > 0
        ? group.slots
        : template.map((slot) => ({ ...slot })),
  }));
}

function getRecurringIntervalDays(dates: Date[]): number | null {
  if (dates.length < 2) return 7;

  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    intervals.push(
      Math.round(
        (dates[i].getTime() - dates[i - 1].getTime()) / (24 * 60 * 60 * 1000)
      )
    );
  }

  const weekly = intervals.every((days) => days === 7);
  if (weekly) return 7;

  const monthly = intervals.every((days) => days >= 28 && days <= 31);
  if (monthly) return 30;

  const allSame = intervals.every((days) => days === intervals[0]);
  return allSame ? intervals[0] : null;
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonthsUtc(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** Expand weekly/monthly bulk bookings when bill total exceeds visible sample slots. */
function expandBulkRecurringDayGroups(
  dayGroups: SlotGroup[],
  bill: ReturnType<typeof parseBillDetails>
): SlotGroup[] {
  const billTotal = bill.slotPrice ?? bill.amountToCollect ?? 0;
  if (!billTotal || dayGroups.length === 0) return dayGroups;

  const filled = fillMissingSlotTemplates(dayGroups);
  const visibleTotal = sumSlotPrices(filled);
  if (visibleTotal <= 0) return filled;

  const perDayAmount = visibleTotal / filled.length;
  const impliedSessions = Math.round(billTotal / perDayAmount);
  if (impliedSessions <= filled.length) return filled;

  const sorted = [...filled].sort(
    (a, b) => a.bookingDate.getTime() - b.bookingDate.getTime()
  );
  const intervalDays = getRecurringIntervalDays(
    sorted.map((group) => group.bookingDate)
  );
  if (!intervalDays) return filled;

  const template = sorted.find((group) => group.slots.length > 0)?.slots ?? [];
  if (template.length === 0) return filled;

  const expanded: SlotGroup[] = [];
  let current = new Date(sorted[0].bookingDate);

  for (let i = 0; i < impliedSessions; i++) {
    expanded.push({
      bookingDate: new Date(current),
      slots: template.map((slot) => ({ ...slot })),
    });
    current =
      intervalDays >= 28
        ? addMonthsUtc(current, 1)
        : addDaysUtc(current, intervalDays);
  }

  return expanded;
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

export function parseBookingId(subject: string, text: string): string | null {
  const subjectMatch = subject.match(
    /KheloMore:\s*([A-Z0-9-]+)/i
  );
  if (subjectMatch) return subjectMatch[1];
  const modifiedSubjectMatch = subject.match(
    /Booking\s+id\s+([A-Z0-9-]+)\s+has\s+been\s+(?:modified|cancelled)/i
  );
  if (modifiedSubjectMatch) return modifiedSubjectMatch[1];

  const bodyMatch = text.match(
    /Booking Details[\s\S]*?\b(\d{4}-\d+-[A-Z0-9]+)\b/i
  );
  return bodyMatch ? bodyMatch[1] : null;
}

function isBookingIdLine(line: string): boolean {
  return (
    /^(?:ID:\s*)?\d{4}-\d+-[A-Z0-9]+$/i.test(line) ||
    /^ID:\s*\d{4}-\d+-[A-Z0-9]+$/i.test(line)
  );
}

function isTemplatePlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const v = value.trim();
  return /^\$[a-zA-Z][\w]*$/.test(v) || /^\$\{[^}]+\}$/.test(v);
}

function cleanParsedField(value: string | undefined): string {
  if (!value || isTemplatePlaceholder(value)) return "";
  return value.trim();
}

function parseUserDetails(text: string) {
  const nameMatch = text.match(/Name:\s*([^\n]+)/i);
  const phoneMatch = text.match(/Mobile No\.?\s*:\s*([^\n]+)/i);
  const emailMatch = text.match(/Email ID:\s*(\S+)/i);
  const bookedByMatch = text.match(/Booked by\s+([^\n•]+)/i);

  let customerName =
    cleanParsedField(nameMatch?.[1]) || cleanParsedField(bookedByMatch?.[1]);

  const rawPhone = cleanParsedField(phoneMatch?.[1]);
  const customerPhone = rawPhone?.replace(/\s/g, "");

  let customerEmail = emailMatch?.[1]?.trim();
  if (customerEmail && isTemplatePlaceholder(customerEmail)) {
    customerEmail = undefined;
  } else if (customerEmail && !customerEmail.includes("@")) {
    customerEmail = undefined;
  }

  if (!customerName && customerPhone) {
    customerName = `Guest (${customerPhone})`;
  }

  return {
    customerName,
    customerPhone: customerPhone || undefined,
    customerEmail,
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
        !/^booking details$/i.test(line) && !isBookingIdLine(line)
    );

  const venueName = lines[0];
  const location = lines[1];

  return {
    venueName: venueName || undefined,
    location: location || undefined,
  };
}

function parseSlots(
  text: string,
  options?: {
    cancelledOnly?: boolean;
  }
) {
  const section = text.match(
    /Slot Details([\s\S]*?)(?:Bill Details|Important Instructions|$)/i
  )?.[1];

  if (!section) {
    return {
      dayGroups: [] as Array<{
        bookingDate: Date;
        slots: Array<{
          start: string;
          end: string;
          turfName?: string;
          price?: number;
        }>;
      }>,
    };
  }

  const rawLines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const lines: string[] = [];
  for (const line of rawLines) {
    if (lines.length && line === lines[lines.length - 1]) continue;
    lines.push(line);
  }

  const dateLinePattern =
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+'?\d{2,4})/i;

  const dayGroups: Array<{
    bookingDate: Date;
    slots: Array<{
      start: string;
      end: string;
      turfName?: string;
      price?: number;
    }>;
  }> = [];

  let currentDate =
    parseKhelomoreDate(
      section.match(dateLinePattern)?.[1] || ""
    ) ?? null;

  function ensureCurrentDay() {
    if (!currentDate) return null;
    let group = dayGroups.find(
      (day) =>
        day.bookingDate.toISOString().slice(0, 10) ===
        currentDate!.toISOString().slice(0, 10)
    );
    if (!group) {
      group = { bookingDate: currentDate, slots: [] };
      dayGroups.push(group);
    }
    return group;
  }

  for (let i = 0; i < lines.length; i++) {
    const dateMatch = lines[i].match(dateLinePattern);
    if (dateMatch) {
      currentDate = parseKhelomoreDate(dateMatch[1]);
      ensureCurrentDay();
      continue;
    }

    const timeRange = parseTimeRangeLine(lines[i]);
    if (!timeRange) continue;

    const day = ensureCurrentDay();
    if (!day) continue;

    let turfName: string | undefined;
    let price: number | undefined;
    let cancelled = false;

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      if (dateLinePattern.test(lines[j])) break;
      if (parseTimeRangeLine(lines[j])) break;
      if (/^cancelled$/i.test(lines[j])) {
        cancelled = true;
      }
      if (
        !turfName &&
        /^[A-Za-z]/.test(lines[j]) &&
        !/^(Slot|Bill|Important|Pay balance|Share|Check|Any changes|Cancelled)/i.test(
          lines[j]
        )
      ) {
        turfName = lines[j];
      }
      const parsedPrice = parsePriceFromLine(lines[j]);
      if (parsedPrice != null && price == null) {
        price = parsedPrice;
      }
    }

    if (options?.cancelledOnly && !cancelled) continue;

    day.slots.push({
      start: timeRange.start,
      end: timeRange.end,
      turfName,
      price,
    });
  }

  return { dayGroups: dayGroups.filter((group) => group.slots.length > 0) };
}

function extractLabeledAmount(section: string, label: string): number | undefined {
  const lines = section
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    if (!new RegExp(`^${label.replace(/[()]/g, "\\$&")}$`, "i").test(lines[i])) {
      continue;
    }
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const match = lines[j].match(/^([\d,]+(?:\.\d{2})?)$/);
      if (match) return parseFloat(match[1].replace(/,/g, ""));
    }
  }
  return undefined;
}

function parseBillDetails(text: string) {
  const section =
    text.match(/Bill Details([\s\S]*?)(?:Important Instructions|$)/i)?.[1] ||
    text;

  const slotPrice = extractLabeledAmount(section, "Slot(s) Price");
  const couponMatch = section.match(/Coupon[\s\S]*?-₹?\s*([\d,]+)/i);
  const amountReceived = extractLabeledAmount(section, "Amount Received");
  const amountToCollect =
    extractLabeledAmount(section, "Amount to be Collected") ??
    extractLabeledAmount(section, "Amount Pending");

  return {
    slotPrice,
    couponAmount: couponMatch
      ? parseFloat(couponMatch[1].replace(/,/g, ""))
      : undefined,
    amountReceived,
    amountToCollect,
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

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildBookingFromDayGroup(
  common: Omit<ParsedBookingEmail, "bookingDate" | "startTime" | "endTime" | "totalAmount" | "slotPrice" | "turfName" | "externalId">,
  group: {
    bookingDate: Date;
    slots: Array<{
      start: string;
      end: string;
      turfName?: string;
      price?: number;
    }>;
  },
  bill: ReturnType<typeof parseBillDetails>,
  baseExternalId: string | null,
  allDaySlotTotal: number,
  totalDayCount: number,
  isSingleDay: boolean
): ParsedBookingEmail | null {
  const daySlotTotal = group.slots.reduce(
    (sum, slot) => sum + (slot.price || 0),
    0
  );
  const amountReceived = bill.amountReceived ?? 0;
  const { paidOnKhelomore } = common;

  let totalAmount = daySlotTotal;
  if (paidOnKhelomore && isSingleDay && amountReceived > 0) {
    totalAmount = amountReceived;
  } else if (paidOnKhelomore && daySlotTotal > 0) {
    totalAmount = daySlotTotal;
  } else if (daySlotTotal > 0) {
    totalAmount = daySlotTotal;
  } else if (allDaySlotTotal > 0 && bill.amountToCollect) {
    totalAmount = Math.round(
      (bill.amountToCollect * daySlotTotal) / allDaySlotTotal
    );
  } else if (allDaySlotTotal > 0 && bill.slotPrice) {
    totalAmount = Math.round((bill.slotPrice * daySlotTotal) / allDaySlotTotal);
  } else if (totalDayCount > 1 && bill.amountToCollect) {
    totalAmount = Math.round(bill.amountToCollect / totalDayCount);
  } else if (totalDayCount > 1 && bill.slotPrice) {
    totalAmount = Math.round(bill.slotPrice / totalDayCount);
  } else {
    totalAmount = bill.amountToCollect ?? bill.slotPrice ?? 0;
  }

  if (!totalAmount || totalAmount <= 0) return null;

  const turfNames = [
    ...new Set(group.slots.map((slot) => slot.turfName).filter(Boolean)),
  ];
  const dateKey = formatDateKey(group.bookingDate);
  const externalId =
    baseExternalId && totalDayCount > 1
      ? `${baseExternalId}#${dateKey}`
      : baseExternalId || undefined;

  return {
    ...common,
    bookingDate: group.bookingDate,
    startTime: group.slots[0]?.start,
    endTime: group.slots.at(-1)?.end,
    totalAmount,
    slotPrice: daySlotTotal || undefined,
    paidOnKhelomore,
    externalId,
    turfName: turfNames.length === 1 ? turfNames[0] : turfNames.join(", "),
  };
}

export function parseKhelomoreEmails(
  subject: string,
  body: string
): ParsedBookingEmail[] {
  const text = normalizeEmailBody(body);
  const user = parseUserDetails(text);
  const venue = parseVenueDetails(text);
  const bill = parseBillDetails(text);
  let { dayGroups } = parseSlots(text);
  dayGroups = expandBulkRecurringDayGroups(dayGroups, bill);
  const baseExternalId = parseBookingId(subject, text);

  if (!user.customerName) {
    user.customerName = baseExternalId
      ? `Guest (${baseExternalId.split("-").pop()})`
      : "Guest booking";
  }

  if (!user.customerName || dayGroups.length === 0) return [];

  const amountReceived = bill.amountReceived ?? 0;
  const paidOnKhelomore =
    amountReceived > 0 && /Status:\s*Completed/i.test(text);

  const allDaySlotTotal = dayGroups.reduce(
    (sum, group) =>
      sum + group.slots.reduce((daySum, slot) => daySum + (slot.price || 0), 0),
    0
  );

  const common = {
    customerName: user.customerName,
    customerPhone: user.customerPhone,
    customerEmail: user.customerEmail,
    couponAmount: bill.couponAmount,
    venueName: venue.venueName,
    location: venue.location,
    paidOnKhelomore,
  };

  const bookings = dayGroups
    .map((group) =>
      buildBookingFromDayGroup(
        common,
        group,
        bill,
        baseExternalId,
        allDaySlotTotal,
        dayGroups.length,
        dayGroups.length === 1
      )
    )
    .filter((booking): booking is ParsedBookingEmail => booking != null);

  if (bookings.length === 1 && baseExternalId) {
    bookings[0].externalId = baseExternalId;
  }

  return bookings;
}

export function parseKhelomoreEmail(
  subject: string,
  body: string
): ParsedBookingEmail | null {
  return parseKhelomoreEmails(subject, body)[0] ?? null;
}

export function isKhelomoreCancelledEmail(body: string): boolean {
  const text = normalizeEmailBody(body);
  const normalized = text.toLowerCase();
  return (
    /status:\s*cancelled/i.test(text) ||
    /status[\s\S]{0,160}cancelled/i.test(text) ||
    normalized.includes("venue booking is cancelled")
  );
}

/** Returns cancelled day-wise bookings to remove. `[]` means remove all under booking id. */
export function parseKhelomoreCancelledBookings(
  subject: string,
  body: string
): ParsedBookingEmail[] | null {
  if (!isKhelomoreCancelledEmail(body)) return null;

  const text = normalizeEmailBody(body);
  const venue = parseVenueDetails(text);
  const user = parseUserDetails(text);
  const baseExternalId = parseBookingId(subject, text);
  const { dayGroups } = parseSlots(text, { cancelledOnly: true });

  if (dayGroups.length === 0) return [];

  const customerName =
    user.customerName ||
    (baseExternalId ? `Guest (${baseExternalId.split("-").pop()})` : "Guest booking");

  return dayGroups.map((group) => {
    const dateKey = formatDateKey(group.bookingDate);
    const turfNames = [
      ...new Set(group.slots.map((slot) => slot.turfName).filter(Boolean)),
    ];

    return {
      customerName,
      customerPhone: user.customerPhone,
      customerEmail: user.customerEmail,
      bookingDate: group.bookingDate,
      startTime: group.slots[0]?.start,
      endTime: group.slots.at(-1)?.end,
      totalAmount: 0,
      paidOnKhelomore: false,
      externalId: baseExternalId ? `${baseExternalId}#${dateKey}` : undefined,
      venueName: venue.venueName,
      turfName: turfNames.length === 1 ? turfNames[0] : turfNames.join(", "),
    };
  });
}

export function isKhelomoreBookingEmail(from: string, subject: string): boolean {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase();

  const fromMatches =
    fromLower.includes("info@khelomore.com") ||
    fromLower.includes("khelomore.com");

  const subjectMatches =
    subjectLower.includes("you have a new booking from khelomore") ||
    (subjectLower.includes("booking id") &&
      (subjectLower.includes("has been modified") ||
        subjectLower.includes("has been cancelled")));

  return fromMatches && subjectMatches;
}

/** Gmail raw query fragment for Khelomore booking-change emails. */
export function khelomoreChangeEmailSubjectQuery() {
  return '(subject:"has been modified" OR subject:"has been cancelled")';
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
ID: 2026-272-SIDR
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
