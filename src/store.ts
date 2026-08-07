import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { LedgerEntry, Reservation } from "./types.js";

/**
 * File-backed persistence. State lives in data/*.json so a restart never
 * loses reservations. No database required.
 */

const DATA_DIR = process.env.DATA_DIR ?? "data";
const RESERVATIONS_FILE = `${DATA_DIR}/reservations.json`;
const LEDGER_FILE = `${DATA_DIR}/ledger.json`;

function load<T>(file: string, fallback: T): T {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    // corrupt file — start fresh rather than crash
  }
  return fallback;
}

function save(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2));
}

export class Store {
  private reservations: Reservation[] = load<Reservation[]>(RESERVATIONS_FILE, []);
  private ledger: LedgerEntry[] = load<LedgerEntry[]>(LEDGER_FILE, []);

  allReservations(): Reservation[] {
    return this.reservations;
  }

  activeReservations(): Reservation[] {
    return this.reservations.filter((r) => r.status === "confirmed");
  }

  getReservation(id: string): Reservation | undefined {
    return this.reservations.find((r) => r.reservationId === id);
  }

  addReservation(r: Reservation): void {
    this.reservations.push(r);
    save(RESERVATIONS_FILE, this.reservations);
  }

  updateReservation(r: Reservation): void {
    const i = this.reservations.findIndex((x) => x.reservationId === r.reservationId);
    if (i >= 0) this.reservations[i] = r;
    save(RESERVATIONS_FILE, this.reservations);
  }

  addLedgerEntry(e: LedgerEntry): void {
    this.ledger.push(e);
    save(LEDGER_FILE, this.ledger);
  }

  ledgerFor(reservationId: string): LedgerEntry[] {
    return this.ledger.filter((e) => e.reservationId === reservationId);
  }
}

export const store = new Store();
