import { db } from './db.ts';
import type {
  AppointmentRecord,
  BusinessHour,
  DayAvailabilitySummary,
  DayOff,
  ServiceItem,
  TimeSlotOption,
  TimeSlotRule,
} from '../types/barbershop.ts';

export function timeToMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentMinutesOfDay(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function getDayOfWeekFromDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getDay(); // 0 = Sun ... 6 = Sat
}

export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function getSlotInterval(): number {
  const row = db
    .prepare("SELECT value FROM shop_settings WHERE key = 'slot_interval_minutes'")
    .get() as { value: string } | undefined;
  const parsed = Number(row?.value || '30');
  return [15, 20, 30, 45, 60].includes(parsed) ? parsed : 30;
}

export function computeSlotsForDate(
  dateStr: string,
  durationMinutes: number
): {
  is_past: boolean;
  is_open_day: boolean;
  is_day_off: boolean;
  day_off_reason?: string;
  slots: TimeSlotOption[];
} {
  const todayStr = getTodayDateString();
  const isPast = dateStr < todayStr;
  if (isPast) {
    return { is_past: true, is_open_day: false, is_day_off: false, slots: [] };
  }

  const dayOff = db
    .prepare('SELECT id, date, reason FROM days_off WHERE date = ?')
    .get(dateStr) as DayOff | undefined;

  if (dayOff) {
    return {
      is_past: false,
      is_open_day: false,
      is_day_off: true,
      day_off_reason: dayOff.reason,
      slots: [],
    };
  }

  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const hours = db
    .prepare('SELECT * FROM business_hours WHERE day_of_week = ?')
    .get(dayOfWeek) as BusinessHour | undefined;

  if (!hours || hours.is_open === 0) {
    return {
      is_past: false,
      is_open_day: false,
      is_day_off: false,
      slots: [],
    };
  }

  const openMin = timeToMinutes(hours.open_time);
  const closeMin = timeToMinutes(hours.close_time);
  const interval = getSlotInterval();

  const rules = db
    .prepare("SELECT * FROM time_slot_rules WHERE scope = 'global' OR (scope = 'date' AND target_date = ?)")
    .all(dateStr) as unknown as TimeSlotRule[];

  const candidateMinutes = new Set<number>();
  for (let m = openMin; m + durationMinutes <= closeMin; m += interval) {
    candidateMinutes.add(m);
  }

  // Add explicitly added custom slots
  for (const r of rules) {
    if (r.rule_type === 'add') {
      const m = timeToMinutes(r.slot_time);
      if (m >= 0 && m + durationMinutes <= 23 * 60 + 59) {
        candidateMinutes.add(m);
      }
    }
  }

  // Blocked intervals (a blocked slot blocks [blockMin, blockMin + interval))
  const blockedIntervals = rules
    .filter((r) => r.rule_type === 'block')
    .map((r) => {
      const start = timeToMinutes(r.slot_time);
      return { start, end: start + interval };
    })
    .filter((b) => b.start >= 0);

  // Active appointments on that date
  const existingAppts = db
    .prepare(
      "SELECT start_time, end_time FROM appointments WHERE appointment_date = ? AND status != 'cancelled'"
    )
    .all(dateStr) as Array<{ start_time: string; end_time: string }>;

  const bookedIntervals = existingAppts.map((a) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }));

  const isToday = dateStr === todayStr;
  const nowMinutes = getCurrentMinutesOfDay();

  const sortedCandidates = Array.from(candidateMinutes).sort((a, b) => a - b);

  const slots: TimeSlotOption[] = sortedCandidates.map((startMin) => {
    const endMin = startMin + durationMinutes;
    const startStr = minutesToTime(startMin);
    const endStr = minutesToTime(endMin);

    if (isToday && startMin <= nowMinutes + 15) {
      return {
        time: startStr,
        end_time: endStr,
        available: false,
        reason: 'Créneau passé',
      };
    }

    const hitsBlocked = blockedIntervals.some(
      (b) => startMin < b.end && endMin > b.start
    );
    if (hitsBlocked) {
      return {
        time: startStr,
        end_time: endStr,
        available: false,
        reason: 'Indisponible',
      };
    }

    const hitsBooked = bookedIntervals.some(
      (b) => startMin < b.end && endMin > b.start
    );
    if (hitsBooked) {
      return {
        time: startStr,
        end_time: endStr,
        available: false,
        reason: 'Déjà réservé',
      };
    }

    return {
      time: startStr,
      end_time: endStr,
      available: true,
    };
  });

  return {
    is_past: false,
    is_open_day: true,
    is_day_off: false,
    slots,
  };
}

export function getMonthAvailability(
  year: number,
  month: number,
  durationMinutes: number
): DayAvailabilitySummary[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const results: DayAvailabilitySummary[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const info = computeSlotsForDate(dateStr, durationMinutes);
    results.push({
      date: dateStr,
      is_past: info.is_past,
      is_open_day: info.is_open_day,
      is_day_off: info.is_day_off,
      day_off_reason: info.day_off_reason,
      available_count: info.slots.filter((s) => s.available).length,
    });
  }
  return results;
}

export interface CreateBookingInput {
  serviceId: number;
  date: string;
  startTime: string;
  firstName: string;
  lastName: string;
  phone: string;
}

export type BookingCreationResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; statusCode: number; error: string };

export function createBookingAtomic(input: CreateBookingInput): BookingCreationResult {
  const cleanFirst = input.firstName.trim();
  const cleanLast = input.lastName.trim();
  const cleanPhone = input.phone.replace(/\s+/g, ' ').trim();

  if (cleanFirst.length < 2 || cleanFirst.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le prénom doit contenir entre 2 et 60 caractères.' };
  }
  if (cleanLast.length < 2 || cleanLast.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le nom doit contenir entre 2 et 60 caractères.' };
  }

  const digitsOnly = cleanPhone.replace(/[^\d+]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Veuillez saisir un numéro de téléphone valide (ex. 25 180 013).',
    };
  }

  if (!isValidDateString(input.date)) {
    return { ok: false, statusCode: 400, error: 'La date sélectionnée est invalide.' };
  }

  if (!/^\d{2}:\d{2}$/.test(input.startTime)) {
    return { ok: false, statusCode: 400, error: 'L’horaire sélectionné est invalide.' };
  }

  try {
    db.exec('BEGIN IMMEDIATE');

    const service = db
      .prepare('SELECT * FROM services WHERE id = ? AND is_active = 1')
      .get(input.serviceId) as ServiceItem | undefined;

    if (!service) {
      db.exec('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'La prestation sélectionnée est introuvable.' };
    }

    const availability = computeSlotsForDate(input.date, service.duration_minutes);
    if (availability.is_past) {
      db.exec('ROLLBACK');
      return { ok: false, statusCode: 400, error: 'Impossible de réserver une date passée.' };
    }
    if (availability.is_day_off || !availability.is_open_day) {
      db.exec('ROLLBACK');
      return {
        ok: false,
        statusCode: 400,
        error: 'Le salon est fermé à cette date. Veuillez choisir un autre jour.',
      };
    }

    const matchingSlot = availability.slots.find((s) => s.time === input.startTime);
    if (!matchingSlot || !matchingSlot.available) {
      db.exec('ROLLBACK');
      return {
        ok: false,
        statusCode: 409,
        error: 'Ce créneau vient d’être réservé ou n’est plus disponible. Veuillez choisir un autre horaire.',
      };
    }

    // Upsert customer by normalized phone
    const normalizedPhoneKey = digitsOnly;
    const existingCustomer = db
      .prepare("SELECT id FROM customers WHERE replace(replace(phone, ' ', ''), '-', '') = ?")
      .get(normalizedPhoneKey) as { id: number } | undefined;

    let customerId: number;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
        cleanFirst,
        cleanLast,
        cleanPhone,
        customerId
      );
    } else {
      const res = db
        .prepare('INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)')
        .run(cleanFirst, cleanLast, cleanPhone);
      customerId = Number(res.lastInsertRowid);
    }

    const compactDate = input.date.replace(/-/g, '').slice(2);
    const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const reference = `HC-${compactDate}-${randSuffix}`;

    const insertResult = db
      .prepare(`
        INSERT INTO appointments (
          reference, customer_id, service_id, service_name,
          appointment_date, start_time, end_time, duration_minutes, price, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', '')
      `)
      .run(
        reference,
        customerId,
        service.id,
        service.name,
        input.date,
        matchingSlot.time,
        matchingSlot.end_time,
        service.duration_minutes,
        service.price
      );

    const newId = Number(insertResult.lastInsertRowid);
    const created = db
      .prepare(`
        SELECT a.*, c.first_name, c.last_name, c.phone
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        WHERE a.id = ?
      `)
      .get(newId) as unknown as AppointmentRecord;

    db.exec('COMMIT');
    return { ok: true, appointment: created };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    console.error('Booking error:', err);
    return {
      ok: false,
      statusCode: 500,
      error: 'Une erreur technique est survenue lors de l’enregistrement du rendez-vous.',
    };
  }
}

export interface UpdateAppointmentAdminInput {
  serviceId: number;
  date: string;
  startTime: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes: string;
}

export function updateAppointmentAdmin(
  appointmentId: number,
  input: UpdateAppointmentAdminInput
): BookingCreationResult {
  const cleanFirst = input.firstName.trim();
  const cleanLast = input.lastName.trim();
  const cleanPhone = input.phone.replace(/\s+/g, ' ').trim();
  const cleanNotes = input.notes.trim();

  if (cleanFirst.length < 2 || cleanFirst.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le prénom doit contenir entre 2 et 60 caractères.' };
  }
  if (cleanLast.length < 2 || cleanLast.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le nom doit contenir entre 2 et 60 caractères.' };
  }
  const digitsOnly = cleanPhone.replace(/[^\d+]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return { ok: false, statusCode: 400, error: 'Numéro de téléphone invalide.' };
  }
  if (!isValidDateString(input.date)) {
    return { ok: false, statusCode: 400, error: 'La date sélectionnée est invalide.' };
  }
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) {
    return { ok: false, statusCode: 400, error: 'L’horaire sélectionné est invalide.' };
  }
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(input.status)) {
    return { ok: false, statusCode: 400, error: 'Statut invalide.' };
  }

  try {
    db.exec('BEGIN IMMEDIATE');

    const existing = db
      .prepare('SELECT * FROM appointments WHERE id = ?')
      .get(appointmentId) as { id: number; customer_id: number } | undefined;

    if (!existing) {
      db.exec('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'Rendez-vous introuvable.' };
    }

    const service = db
      .prepare('SELECT * FROM services WHERE id = ?')
      .get(input.serviceId) as ServiceItem | undefined;

    if (!service) {
      db.exec('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'Prestation introuvable.' };
    }

    const startMin = timeToMinutes(input.startTime);
    const endMin = startMin + service.duration_minutes;
    const endTime = minutesToTime(endMin);

    if (input.status !== 'cancelled') {
      const otherAppts = db
        .prepare(
          "SELECT start_time, end_time FROM appointments WHERE appointment_date = ? AND status != 'cancelled' AND id != ?"
        )
        .all(input.date, appointmentId) as Array<{ start_time: string; end_time: string }>;

      const conflict = otherAppts.some((a) => {
        const s = timeToMinutes(a.start_time);
        const e = timeToMinutes(a.end_time);
        return startMin < e && endMin > s;
      });

      if (conflict) {
        db.exec('ROLLBACK');
        return {
          ok: false,
          statusCode: 409,
          error: 'Cet horaire chevauche déjà un autre rendez-vous à cette date.',
        };
      }
    }

    // Safely handle customer update without hitting UNIQUE constraint on phone
    const conflictingCustomer = db
      .prepare(
        "SELECT id FROM customers WHERE replace(replace(phone, ' ', ''), '-', '') = ? AND id != ?"
      )
      .get(digitsOnly, existing.customer_id) as { id: number } | undefined;

    let targetCustomerId = existing.customer_id;
    if (conflictingCustomer) {
      targetCustomerId = conflictingCustomer.id;
      db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
        cleanFirst,
        cleanLast,
        cleanPhone,
        targetCustomerId
      );
    } else {
      db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
        cleanFirst,
        cleanLast,
        cleanPhone,
        targetCustomerId
      );
    }

    db.prepare(`
      UPDATE appointments
      SET customer_id = ?, service_id = ?, service_name = ?, appointment_date = ?,
          start_time = ?, end_time = ?, duration_minutes = ?, price = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(
      targetCustomerId,
      service.id,
      service.name,
      input.date,
      input.startTime,
      endTime,
      service.duration_minutes,
      service.price,
      input.status,
      cleanNotes,
      appointmentId
    );

    const updated = db
      .prepare(`
        SELECT a.*, c.first_name, c.last_name, c.phone
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        WHERE a.id = ?
      `)
      .get(appointmentId) as unknown as AppointmentRecord;

    db.exec('COMMIT');
    return { ok: true, appointment: updated };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Update appointment error:', err);
    return {
      ok: false,
      statusCode: 500,
      error: 'Erreur lors de la modification du rendez-vous.',
    };
  }
}

export interface CreateAppointmentAdminInput {
  serviceId: number;
  date: string;
  startTime: string;
  firstName: string;
  lastName: string;
  phone: string;
  status?: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
}

export function createAppointmentAdmin(input: CreateAppointmentAdminInput): BookingCreationResult {
  const cleanFirst = input.firstName.trim();
  const cleanLast = input.lastName.trim();
  const cleanPhone = input.phone.replace(/\s+/g, ' ').trim();
  const cleanNotes = (input.notes || '').trim();
  const status = input.status || 'confirmed';

  if (cleanFirst.length < 2 || cleanFirst.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le prénom doit contenir entre 2 et 60 caractères.' };
  }
  if (cleanLast.length < 2 || cleanLast.length > 60) {
    return { ok: false, statusCode: 400, error: 'Le nom doit contenir entre 2 et 60 caractères.' };
  }
  const digitsOnly = cleanPhone.replace(/[^\d+]/g, '');
  if (digitsOnly.length < 8 || digitsOnly.length > 15) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Veuillez saisir un numéro de téléphone valide (ex. 25 180 013).',
    };
  }
  if (!isValidDateString(input.date)) {
    return { ok: false, statusCode: 400, error: 'La date sélectionnée est invalide.' };
  }
  if (!/^\d{2}:\d{2}$/.test(input.startTime)) {
    return { ok: false, statusCode: 400, error: 'L’horaire sélectionné est invalide.' };
  }
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return { ok: false, statusCode: 400, error: 'Statut invalide.' };
  }

  try {
    db.exec('BEGIN IMMEDIATE');

    const service = db
      .prepare('SELECT * FROM services WHERE id = ?')
      .get(input.serviceId) as ServiceItem | undefined;

    if (!service) {
      db.exec('ROLLBACK');
      return { ok: false, statusCode: 404, error: 'La prestation sélectionnée est introuvable.' };
    }

    const startMin = timeToMinutes(input.startTime);
    const endMin = startMin + service.duration_minutes;
    const endTime = minutesToTime(endMin);

    if (status !== 'cancelled') {
      const existingAppts = db
        .prepare(
          "SELECT start_time, end_time FROM appointments WHERE appointment_date = ? AND status != 'cancelled'"
        )
        .all(input.date) as Array<{ start_time: string; end_time: string }>;

      const conflict = existingAppts.some((a) => {
        const s = timeToMinutes(a.start_time);
        const e = timeToMinutes(a.end_time);
        return startMin < e && endMin > s;
      });

      if (conflict) {
        db.exec('ROLLBACK');
        return {
          ok: false,
          statusCode: 409,
          error: 'Cet horaire est déjà pris par un autre rendez-vous à cette date.',
        };
      }
    }

    const existingCustomer = db
      .prepare("SELECT id FROM customers WHERE replace(replace(phone, ' ', ''), '-', '') = ?")
      .get(digitsOnly) as { id: number } | undefined;

    let customerId: number;
    if (existingCustomer) {
      customerId = existingCustomer.id;
      db.prepare('UPDATE customers SET first_name = ?, last_name = ?, phone = ? WHERE id = ?').run(
        cleanFirst,
        cleanLast,
        cleanPhone,
        customerId
      );
    } else {
      const res = db
        .prepare('INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?)')
        .run(cleanFirst, cleanLast, cleanPhone);
      customerId = Number(res.lastInsertRowid);
    }

    const compactDate = input.date.replace(/-/g, '').slice(2);
    const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
    const reference = `HC-${compactDate}-${randSuffix}`;

    const insertResult = db
      .prepare(`
        INSERT INTO appointments (
          reference, customer_id, service_id, service_name,
          appointment_date, start_time, end_time, duration_minutes, price, status, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        reference,
        customerId,
        service.id,
        service.name,
        input.date,
        input.startTime,
        endTime,
        service.duration_minutes,
        service.price,
        status,
        cleanNotes
      );

    const newId = Number(insertResult.lastInsertRowid);
    const created = db
      .prepare(`
        SELECT a.*, c.first_name, c.last_name, c.phone
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        WHERE a.id = ?
      `)
      .get(newId) as unknown as AppointmentRecord;

    db.exec('COMMIT');
    return { ok: true, appointment: created };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    console.error('Admin create appointment error:', err);
    return {
      ok: false,
      statusCode: 500,
      error: 'Erreur lors de l’enregistrement du rendez-vous.',
    };
  }
}
