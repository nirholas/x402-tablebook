/** Shared types for x402-tablebook. */

export interface RestaurantInfo {
  name: string;
  description: string;
  timezone: string;
  address: string;
  phone: string;
}

export interface DayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export interface Table {
  id: string;
  name: string;
  seats: number;
  type: string;
}

export interface RefundPolicy {
  holdPrice: string;
  freeCancellationHours: number;
  description: string;
}

export interface TablebookConfig {
  restaurant: RestaurantInfo;
  hours: Record<string, DayHours | null>;
  slotMinutes: number;
  seatingMinutes: number;
  bookingWindowDays: number;
  tables: Table[];
  refundPolicy: RefundPolicy;
}

export interface AvailabilitySlot {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  partySizes: number[]; // party sizes that can still be seated at this slot
  tableTypes: string[]; // table types with at least one free table
  openTables: number;
}

export interface Reservation {
  reservationId: string;
  status: "confirmed" | "cancelled";
  date: string;
  time: string;
  party: number;
  name: string;
  notes?: string;
  tableId: string;
  tableName: string;
  tableType: string;
  payerWallet?: string;
  cancelToken: string;
  createdAt: string;
  cancelledAt?: string;
}

export interface LedgerEntry {
  entryId: string;
  reservationId: string;
  kind: "hold" | "refund" | "forfeit";
  amount: string;
  wallet?: string;
  reason: string;
  at: string;
}
