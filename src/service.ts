import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildIcsBase64 } from "./ics.js";
import { sign } from "./sign.js";
import { store } from "./store.js";
import type {
  AvailabilitySlot,
  LedgerEntry,
  Reservation,
  Table,
  TablebookConfig,
} from "./types.js";

const CONFIG_PATH = process.env.TABLES_CONFIG ?? "config/tables.json";

export const config: TablebookConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function slotDate(date: string, time: string): Date {
  // Interpreted in the server's local timezone — run the server in the
  // restaurant's timezone (see config.restaurant.timezone).
  return new Date(`${date}T${time}:00`);
}

function overlaps(r: Reservation, date: string, timeMins: number, seatingMins: number): boolean {
  if (r.date !== date) return false;
  const rStart = toMinutes(r.time);
  const rEnd = rStart + seatingMins;
  const sEnd = timeMins + seatingMins;
  return timeMins < rEnd && rStart < sEnd;
}

/** Tables free for a given date + "HH:MM" slot. */
function freeTables(date: string, time: string): Table[] {
  const t = toMinutes(time);
  const active = store.activeReservations();
  return config.tables.filter(
    (table) =>
      !active.some(
        (r) => r.tableId === table.id && overlaps(r, date, t, config.seatingMinutes),
      ),
  );
}

function slotsForDate(date: string): string[] {
  const weekday = WEEKDAYS[new Date(`${date}T12:00:00`).getDay()];
  const hours = config.hours[weekday];
  if (!hours) return [];
  const open = toMinutes(hours.open);
  const lastSeating = toMinutes(hours.close) - config.seatingMinutes;
  const out: string[] = [];
  for (let t = open; t <= lastSeating; t += config.slotMinutes) out.push(fromMinutes(t));
  return out;
}

export interface AvailabilityQuery {
  date?: string; // YYYY-MM-DD; omit for the full booking window
  party?: number; // filter to slots that can seat this many
  days?: number; // how many days to scan when no date given
}

/** The paid GET /availability artifact. */
export function getAvailability(q: AvailabilityQuery) {
  const days = Math.min(q.days ?? config.bookingWindowDays, config.bookingWindowDays);
  const dates: string[] = [];
  if (q.date) {
    dates.push(q.date);
  } else {
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() + i * 86_400_000);
      dates.push(d.toISOString().slice(0, 10));
    }
  }

  const now = Date.now();
  const slots: AvailabilitySlot[] = [];
  for (const date of dates) {
    for (const time of slotsForDate(date)) {
      if (slotDate(date, time).getTime() <= now) continue; // past slots
      let free = freeTables(date, time);
      if (q.party) free = free.filter((t) => t.seats >= q.party!);
      if (free.length === 0) continue;
      const maxSeats = Math.max(...free.map((t) => t.seats));
      slots.push({
        date,
        time,
        partySizes: Array.from({ length: maxSeats }, (_, i) => i + 1),
        tableTypes: [...new Set(free.map((t) => t.type))],
        openTables: free.length,
      });
    }
  }

  return {
    restaurant: config.restaurant,
    slotMinutes: config.slotMinutes,
    seatingMinutes: config.seatingMinutes,
    refundPolicy: config.refundPolicy,
    generatedAt: new Date().toISOString(),
    slots,
  };
}

export interface BookRequest {
  date: string;
  time: string;
  party: number;
  name: string;
  notes?: string;
  payerWallet?: string;
}

export class BookingError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The paid POST /book artifact: confirmed reservation + ICS + refund terms. */
export function book(req: BookRequest) {
  const { date, time, party, name } = req;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new BookingError(400, "INVALID_DATE", "date must be YYYY-MM-DD");
  if (!time || !/^\d{2}:\d{2}$/.test(time))
    throw new BookingError(400, "INVALID_TIME", "time must be HH:MM (24h)");
  if (!Number.isInteger(party) || party < 1)
    throw new BookingError(400, "INVALID_PARTY", "party must be a positive integer");
  if (!name || typeof name !== "string")
    throw new BookingError(400, "INVALID_NAME", "name is required");
  if (!slotsForDate(date).includes(time))
    throw new BookingError(409, "OUTSIDE_HOURS", `no seating at ${time} on ${date}`);
  if (slotDate(date, time).getTime() <= Date.now())
    throw new BookingError(409, "SLOT_IN_PAST", "that slot has already passed");

  const candidates = freeTables(date, time)
    .filter((t) => t.seats >= party)
    .sort((a, b) => a.seats - b.seats);
  const table = candidates[0];
  if (!table)
    throw new BookingError(
      409,
      "NO_TABLE",
      `no free table for a party of ${party} at ${time} on ${date} — call GET /availability for open slots`,
    );

  const reservationId = `res_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const cancelToken = sign({ reservationId, purpose: "cancel" }).slice(0, 32);

  const reservation: Reservation = {
    reservationId,
    status: "confirmed",
    date,
    time,
    party,
    name,
    notes: req.notes,
    tableId: table.id,
    tableName: table.name,
    tableType: table.type,
    payerWallet: req.payerWallet,
    cancelToken,
    createdAt: new Date().toISOString(),
  };
  store.addReservation(reservation);

  const hold: LedgerEntry = {
    entryId: `led_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    reservationId,
    kind: "hold",
    amount: config.refundPolicy.holdPrice,
    wallet: req.payerWallet,
    reason: "refundable reservation hold paid via x402",
    at: new Date().toISOString(),
  };
  store.addLedgerEntry(hold);

  const ics = buildIcsBase64({
    uid: `${reservationId}@x402-tablebook`,
    start: slotDate(date, time),
    durationMinutes: config.seatingMinutes,
    summary: `${config.restaurant.name} — table for ${party} (${name})`,
    description: `Reservation ${reservationId} at ${config.restaurant.name}. ${config.refundPolicy.description}`,
    location: config.restaurant.address,
  });

  const confirmation = {
    reservationId,
    status: "confirmed" as const,
    restaurant: config.restaurant.name,
    confirmedTime: `${date}T${time}`,
    party,
    name,
    table: { id: table.id, name: table.name, type: table.type, seats: table.seats },
    refundTerms: config.refundPolicy,
    cancelToken,
    cancelEndpoint: `POST /cancel/${reservationId}`,
    ledgerEntry: hold,
    ics,
    createdAt: reservation.createdAt,
  };
  return { ...confirmation, signature: sign(confirmation) };
}

/** Free POST /cancel/:id — auth by cancelToken issued to the booker at /book. */
export function cancel(reservationId: string, cancelToken: string | undefined) {
  const r = store.getReservation(reservationId);
  if (!r) throw new BookingError(404, "NOT_FOUND", `no reservation ${reservationId}`);
  if (!cancelToken || cancelToken !== r.cancelToken)
    throw new BookingError(403, "BAD_CANCEL_TOKEN", "cancelToken does not match this reservation");
  if (r.status === "cancelled")
    throw new BookingError(409, "ALREADY_CANCELLED", "reservation is already cancelled");

  const msUntilSeating = slotDate(r.date, r.time).getTime() - Date.now();
  const refundable = msUntilSeating >= config.refundPolicy.freeCancellationHours * 3_600_000;

  r.status = "cancelled";
  r.cancelledAt = new Date().toISOString();
  store.updateReservation(r);

  const entry: LedgerEntry = {
    entryId: `led_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    reservationId,
    kind: refundable ? "refund" : "forfeit",
    amount: config.refundPolicy.holdPrice,
    wallet: r.payerWallet,
    reason: refundable
      ? `cancelled ${(msUntilSeating / 3_600_000).toFixed(1)}h before seating — hold refunded`
      : `cancelled inside the ${config.refundPolicy.freeCancellationHours}h window — hold forfeited`,
    at: new Date().toISOString(),
  };
  store.addLedgerEntry(entry);

  const record = {
    reservationId,
    status: "cancelled" as const,
    cancelledAt: r.cancelledAt,
    refunded: refundable,
    refundLedgerEntry: entry,
    ledger: store.ledgerFor(reservationId),
  };
  return { ...record, signature: sign(record) };
}

/** Free GET /reservations/:id lookup (requires cancelToken). */
export function getReservation(reservationId: string, cancelToken: string | undefined) {
  const r = store.getReservation(reservationId);
  if (!r) throw new BookingError(404, "NOT_FOUND", `no reservation ${reservationId}`);
  if (!cancelToken || cancelToken !== r.cancelToken)
    throw new BookingError(403, "BAD_CANCEL_TOKEN", "cancelToken does not match this reservation");
  return { ...r, ledger: store.ledgerFor(reservationId) };
}
