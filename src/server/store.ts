import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  HAZEM_DEFAULT_HOURS,
  HAZEM_DEFAULT_SERVICES,
  HAZEM_DEFAULT_SETTINGS,
  HAZEM_GALLERY_PHOTOS,
  initializeDatabaseSeed,
} from './db.ts';
import { hashPassword, verifyPassword } from './auth.ts';
import {
  computeSlotsForDate,
  createAppointmentAdmin,
  createBookingAtomic,
  getCurrentMinutesOfDay,
  getDayOfWeekFromDate,
  getMonthAvailability,
  getTodayDateString,
  isValidDateString,
  minutesToTime,
  timeToMinutes,
  updateAppointmentAdmin,
} from './availability.ts';
import type {
  AdminOverviewStats,
  AppointmentRecord,
  AppointmentStatus,
  BusinessHour,
  DayAvailabilitySummary,
  DayOff,
  GalleryImage,
  PublicBootstrapData,
  ServiceItem,
  ShopSettings,
  TimeSlotOption,
  TimeSlotRule,
} from '../types/barbershop.ts';
import type {
  BookingCreationResult,
  CreateAppointmentAdminInput,
  CreateBookingInput,
  UpdateAppointmentAdminInput,
} from './availability.ts';

function stripSecretWrapper(raw: string): string {
  let s = raw.trim();
  // Handle users accidentally pasting `KEY=value` into a Secret
  if (/^[A-Z0-9_]+\s*=/.test(s) && !s.startsWith('http') && !s.startsWith('postgres')) {
    s = s.replace(/^[A-Z0-9_]+\s*=\s*/i, '').trim();
  }
  return s.replace(/^["'`]+|["'`]+$/g, '').trim();
}

function normalizeSupabaseUrl(raw: string): string {
  let s = stripSecretWrapper(raw);
  if (!s) return '';

  // Handle PostgreSQL direct connection strings (e.g. postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres)
  const pgMatch = s.match(/@db\.([a-z0-9-]+)\.supabase\.co/i);
  if (pgMatch) {
    return `https://${pgMatch[1]}.supabase.co`;
  }

  // Handle Supabase dashboard URLs (e.g. https://supabase.com/dashboard/project/<ref>)
  const dashMatch = s.match(/supabase\.com\/(?:dashboard\/)?projects?\/([a-z0-9]+)/i);
  if (dashMatch) {
    return `https://${dashMatch[1]}.supabase.co`;
  }

  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }

  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    // Always return bare origin (strips /rest/v1, trailing slashes, paths, or query params)
    return parsed.origin;
  } catch {
    return '';
  }
}

const rawSupabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawSupabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseKey = stripSecretWrapper(rawSupabaseKey);

let supabaseClient: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    console.error('Supabase client initialization failed, falling back to SQLite:', err);
    supabaseClient = null;
  }
} else if (rawSupabaseUrl.trim()) {
  console.warn('SUPABASE_URL provided could not be parsed as a valid URL; falling back to SQLite.');
}

let supabaseSeeded = false;
let lastSeedFailureAt = 0;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseClient && supabaseSeeded);
}

function getSqliteSettingsMap(): ShopSettings {
  const rows = db.prepare('SELECT key, value FROM shop_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const map: Record<string, string> = { ...HAZEM_DEFAULT_SETTINGS };
  for (const r of rows) {
    if (typeof r.value === 'string' && r.value.length > 0) {
      map[r.key] = r.value;
    }
  }
  return map as unknown as ShopSettings;
}

function getSqlitePublicBootstrap(): PublicBootstrapData {
  const services = db
    .prepare('SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order ASC, id ASC')
    .all() as unknown as ServiceItem[];
  const businessHours = db
    .prepare(
      'SELECT * FROM business_hours ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC'
    )
    .all() as unknown as BusinessHour[];
  const daysOff = db
    .prepare('SELECT * FROM days_off WHERE date >= ? ORDER BY date ASC')
    .all(getTodayDateString()) as unknown as DayOff[];
  const gallery = db
    .prepare('SELECT * FROM gallery_images ORDER BY sort_order ASC, id DESC')
    .all() as unknown as GalleryImage[];
  const settings = getSqliteSettingsMap();
  return { services, businessHours, daysOff, gallery, settings };
}

async function ensureSupabaseSeeded(): Promise<boolean> {
  if (!supabaseClient) return false;
  if (supabaseSeeded) return true;
  if (lastSeedFailureAt && Date.now() - lastSeedFailureAt < 10000) {
    return false;
  }
  supabaseSeeded = true;

  try {
    const { count: svcCount, error: svcCheckErr } = await supabaseClient
      .from('services')
      .select('id', { count: 'exact', head: true });
    if (svcCheckErr) {
      supabaseSeeded = false;
      lastSeedFailureAt = Date.now();
      console.error('Supabase schema check failed (did you run supabase-schema.sql?):', svcCheckErr.message);
      return false;
    }

    if (!svcCount || svcCount === 0) {
      await supabaseClient.from('services').insert(
        HAZEM_DEFAULT_SERVICES.map(([name, description, price, duration_minutes, image_url, sort_order]) => ({
          name,
          description,
          price,
          duration_minutes,
          image_url,
          is_active: 1,
          sort_order,
        }))
      );
    }

    const { count: hoursCount } = await supabaseClient
      .from('business_hours')
      .select('day_of_week', { count: 'exact', head: true });
    if (!hoursCount || hoursCount === 0) {
      await supabaseClient.from('business_hours').insert(
        HAZEM_DEFAULT_HOURS.map(([day_of_week, day_name, is_open, open_time, close_time]) => ({
          day_of_week,
          day_name,
          is_open,
          open_time,
          close_time,
        }))
      );
    }

    const { count: galCount } = await supabaseClient
      .from('gallery_images')
      .select('id', { count: 'exact', head: true });
    if (!galCount || galCount === 0) {
      await supabaseClient.from('gallery_images').insert(
        HAZEM_GALLERY_PHOTOS.map(([title, category, image_url, sort_order]) => ({
          title,
          category,
          image_url,
          sort_order,
        }))
      );
    }

    const { data: existingSettings } = await supabaseClient.from('shop_settings').select('key');
    const existingKeys = new Set((existingSettings || []).map((r: { key: string }) => r.key));
    const missingSettings = Object.entries(HAZEM_DEFAULT_SETTINGS)
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, value]) => ({ key, value }));
    if (missingSettings.length > 0) {
      await supabaseClient.from('shop_settings').upsert(missingSettings, { onConflict: 'key' });
    }

    const { count: adminCount } = await supabaseClient
      .from('admin_users')
      .select('id', { count: 'exact', head: true });
    if (!adminCount || adminCount === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'hazem123';
      await supabaseClient.from('admin_users').insert({
        username,
        password_hash: hashPassword(password),
        display_name: 'Hazem',
      });
    }
    lastSeedFailureAt = 0;
    return true;
  } catch (err) {
    supabaseSeeded = false;
    lastSeedFailureAt = Date.now();
    console.error('Supabase initial seed error:', err);
    return false;
  }
}

const BOOTSTRAP_CACHE_TTL_MS = 15_000;
let publicBootstrapCache: { data: PublicBootstrapData; expiresAt: number } | null = null;

export function invalidatePublicBootstrapCache(): void {
  publicBootstrapCache = null;
}

export async function initDataStore(): Promise<void> {
  initializeDatabaseSeed();
  if (supabaseClient) {
    await ensureSupabaseSeeded();
  }
  invalidatePublicBootstrapCache();
}

export function subscribeSupabaseRealtime(onChange: () => void): () => void {
  if (!supabaseClient) return () => {};
  try {
    const channel = supabaseClient
      .channel('hazem-coiff-sync')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        invalidatePublicBootstrapCache();
        onChange();
      })
      .subscribe();

    return () => {
      supabaseClient?.removeChannel(channel);
    };
  } catch (err) {
    console.error('Supabase realtime subscription skipped:', err);
    return () => {};
  }
}

// ---------------- PUBLIC DATA ----------------

export async function getPublicBootstrap(): Promise<PublicBootstrapData> {
  if (publicBootstrapCache && Date.now() < publicBootstrapCache.expiresAt) {
    return publicBootstrapCache.data;
  }

  if (!supabaseClient) {
    const data = getSqlitePublicBootstrap();
    publicBootstrapCache = { data, expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS };
    return data;
  }

  const ready = await ensureSupabaseSeeded();
  if (!ready) {
    const data = getSqlitePublicBootstrap();
    publicBootstrapCache = { data, expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS };
    return data;
  }

  try {
    const today = getTodayDateString();

    const [svcsRes, hoursRes, offRes, galRes, setRes] = await Promise.all([
      supabaseClient
        .from('services')
        .select('*')
        .eq('is_active', 1)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true }),
      supabaseClient.from('business_hours').select('*'),
      supabaseClient.from('days_off').select('*').gte('date', today).order('date', { ascending: true }),
      supabaseClient
        .from('gallery_images')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: false }),
      supabaseClient.from('shop_settings').select('*'),
    ]);

    if (svcsRes.error) throw new Error(svcsRes.error.message);
    if (hoursRes.error) throw new Error(hoursRes.error.message);
    if (offRes.error) throw new Error(offRes.error.message);
    if (galRes.error) throw new Error(galRes.error.message);
    if (setRes.error) throw new Error(setRes.error.message);

    const businessHours = ((hoursRes.data || []) as BusinessHour[]).sort((a, b) => {
      const da = a.day_of_week === 0 ? 7 : a.day_of_week;
      const dbDay = b.day_of_week === 0 ? 7 : b.day_of_week;
      return da - dbDay;
    });

    const settingsMap: Record<string, string> = { ...HAZEM_DEFAULT_SETTINGS };
    for (const row of (setRes.data || []) as Array<{ key: string; value: string }>) {
      settingsMap[row.key] = row.value;
    }

    const result: PublicBootstrapData = {
      services: (svcsRes.data || []) as ServiceItem[],
      businessHours,
      daysOff: (offRes.data || []) as DayOff[],
      gallery: (galRes.data || []) as GalleryImage[],
      settings: settingsMap as unknown as ShopSettings,
    };
    publicBootstrapCache = { data: result, expiresAt: Date.now() + BOOTSTRAP_CACHE_TTL_MS };
    return result;
  } catch (err) {
    console.error('Supabase bootstrap failed, falling back to SQLite:', err);
    return getSqlitePublicBootstrap();
  }
}

export async function getActiveServiceDuration(serviceId: number): Promise<number | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const row = db
      .prepare('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1')
      .get(serviceId) as { duration_minutes: number } | undefined;
    return row ? row.duration_minutes : null;
  }
  const { data, error } = await supabaseClient
    .from('services')
    .select('duration_minutes')
    .eq('id', serviceId)
    .eq('is_active', 1)
    .maybeSingle();
  if (error) {
    const row = db
      .prepare('SELECT duration_minutes FROM services WHERE id = ? AND is_active = 1')
      .get(serviceId) as { duration_minutes: number } | undefined;
    return row ? row.duration_minutes : null;
  }
  return data ? Number(data.duration_minutes) : null;
}

function computeSlotsFromInputs(params: {
  dateStr: string;
  durationMinutes: number;
  todayStr: string;
  nowMinutes: number;
  dayOff?: DayOff | null;
  hours?: BusinessHour | null;
  interval: number;
  rules: TimeSlotRule[];
  existingAppts: Array<{ start_time: string; end_time: string }>;
}): {
  is_past: boolean;
  is_open_day: boolean;
  is_day_off: boolean;
  day_off_reason?: string;
  slots: TimeSlotOption[];
} {
  const { dateStr, durationMinutes, todayStr, nowMinutes, dayOff, hours, interval, rules, existingAppts } =
    params;

  if (dateStr < todayStr) {
    return { is_past: true, is_open_day: false, is_day_off: false, slots: [] };
  }
  if (dayOff) {
    return {
      is_past: false,
      is_open_day: false,
      is_day_off: true,
      day_off_reason: dayOff.reason,
      slots: [],
    };
  }
  if (!hours || hours.is_open === 0) {
    return { is_past: false, is_open_day: false, is_day_off: false, slots: [] };
  }

  const openMin = timeToMinutes(hours.open_time);
  const closeMin = timeToMinutes(hours.close_time);

  const candidateMinutes = new Set<number>();
  for (let m = openMin; m + durationMinutes <= closeMin; m += interval) {
    candidateMinutes.add(m);
  }
  for (const r of rules) {
    if (r.rule_type === 'add') {
      const m = timeToMinutes(r.slot_time);
      if (m >= 0 && m + durationMinutes <= 23 * 60 + 59) {
        candidateMinutes.add(m);
      }
    }
  }

  const blockedIntervals = rules
    .filter((r) => r.rule_type === 'block')
    .map((r) => {
      const start = timeToMinutes(r.slot_time);
      return { start, end: start + interval };
    })
    .filter((b) => b.start >= 0);

  const bookedIntervals = existingAppts.map((a) => ({
    start: timeToMinutes(a.start_time),
    end: timeToMinutes(a.end_time),
  }));

  const isToday = dateStr === todayStr;
  const sortedCandidates = Array.from(candidateMinutes).sort((a, b) => a - b);

  const slots: TimeSlotOption[] = sortedCandidates.map((startMin) => {
    const endMin = startMin + durationMinutes;
    const startStr = minutesToTime(startMin);
    const endStr = minutesToTime(endMin);

    if (isToday && startMin <= nowMinutes + 15) {
      return { time: startStr, end_time: endStr, available: false, reason: 'Créneau passé' };
    }
    if (blockedIntervals.some((b) => startMin < b.end && endMin > b.start)) {
      return { time: startStr, end_time: endStr, available: false, reason: 'Indisponible' };
    }
    if (bookedIntervals.some((b) => startMin < b.end && endMin > b.start)) {
      return { time: startStr, end_time: endStr, available: false, reason: 'Déjà réservé' };
    }
    return { time: startStr, end_time: endStr, available: true };
  });

  return { is_past: false, is_open_day: true, is_day_off: false, slots };
}

export async function getMonthAvailabilityAsync(
  year: number,
  month: number,
  durationMinutes: number
): Promise<DayAvailabilitySummary[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return getMonthAvailability(year, month, durationMinutes);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const [hoursRes, offRes, rulesRes, apptsRes, intervalRes] = await Promise.all([
    supabaseClient.from('business_hours').select('*'),
    supabaseClient.from('days_off').select('*').gte('date', monthStart).lte('date', monthEnd),
    supabaseClient.from('time_slot_rules').select('*'),
    supabaseClient
      .from('appointments')
      .select('appointment_date, start_time, end_time')
      .gte('appointment_date', monthStart)
      .lte('appointment_date', monthEnd)
      .neq('status', 'cancelled'),
    supabaseClient
      .from('shop_settings')
      .select('value')
      .eq('key', 'slot_interval_minutes')
      .maybeSingle(),
  ]);

  const parsedInterval = Number(intervalRes.data?.value || '30');
  const interval = [15, 20, 30, 45, 60].includes(parsedInterval) ? parsedInterval : 30;
  const hoursMap = new Map<number, BusinessHour>(
    ((hoursRes.data || []) as BusinessHour[]).map((h) => [h.day_of_week, h])
  );
  const offMap = new Map<string, DayOff>(
    ((offRes.data || []) as DayOff[]).map((d) => [d.date, d])
  );
  const allRules = (rulesRes.data || []) as TimeSlotRule[];
  const allAppts = (apptsRes.data || []) as Array<{
    appointment_date: string;
    start_time: string;
    end_time: string;
  }>;

  const todayStr = getTodayDateString();
  const nowMinutes = getCurrentMinutesOfDay();
  const results: DayAvailabilitySummary[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = getDayOfWeekFromDate(dateStr);
    const rulesForDay = allRules.filter(
      (r) => r.scope === 'global' || (r.scope === 'date' && r.target_date === dateStr)
    );
    const apptsForDay = allAppts.filter((a) => a.appointment_date === dateStr);

    const info = computeSlotsFromInputs({
      dateStr,
      durationMinutes,
      todayStr,
      nowMinutes,
      dayOff: offMap.get(dateStr) || null,
      hours: hoursMap.get(dayOfWeek) || null,
      interval,
      rules: rulesForDay,
      existingAppts: apptsForDay,
    });

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

export async function computeSlotsForDateAsync(
  dateStr: string,
  durationMinutes: number
): Promise<{
  is_past: boolean;
  is_open_day: boolean;
  is_day_off: boolean;
  day_off_reason?: string;
  slots: TimeSlotOption[];
}> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return computeSlotsForDate(dateStr, durationMinutes);
  }

  const dayOfWeek = getDayOfWeekFromDate(dateStr);
  const [offRes, hoursRes, rulesRes, apptsRes, intervalRes] = await Promise.all([
    supabaseClient.from('days_off').select('*').eq('date', dateStr).maybeSingle(),
    supabaseClient.from('business_hours').select('*').eq('day_of_week', dayOfWeek).maybeSingle(),
    supabaseClient
      .from('time_slot_rules')
      .select('*')
      .or(`scope.eq.global,and(scope.eq.date,target_date.eq.${dateStr})`),
    supabaseClient
      .from('appointments')
      .select('start_time, end_time')
      .eq('appointment_date', dateStr)
      .neq('status', 'cancelled'),
    supabaseClient
      .from('shop_settings')
      .select('value')
      .eq('key', 'slot_interval_minutes')
      .maybeSingle(),
  ]);

  const parsedInterval = Number(intervalRes.data?.value || '30');
  const interval = [15, 20, 30, 45, 60].includes(parsedInterval) ? parsedInterval : 30;

  return computeSlotsFromInputs({
    dateStr,
    durationMinutes,
    todayStr: getTodayDateString(),
    nowMinutes: getCurrentMinutesOfDay(),
    dayOff: (offRes.data as DayOff | null) || null,
    hours: (hoursRes.data as BusinessHour | null) || null,
    interval,
    rules: (rulesRes.data || []) as TimeSlotRule[],
    existingAppts: (apptsRes.data || []) as Array<{ start_time: string; end_time: string }>,
  });
}

export async function createBookingAsync(input: CreateBookingInput): Promise<BookingCreationResult> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return createBookingAtomic(input);
  }

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

  const { data: service } = await supabaseClient
    .from('services')
    .select('*')
    .eq('id', input.serviceId)
    .eq('is_active', 1)
    .maybeSingle();

  if (!service) {
    return { ok: false, statusCode: 404, error: 'La prestation sélectionnée est introuvable.' };
  }

  const availability = await computeSlotsForDateAsync(input.date, service.duration_minutes);
  if (availability.is_past) {
    return { ok: false, statusCode: 400, error: 'Impossible de réserver une date passée.' };
  }
  if (availability.is_day_off || !availability.is_open_day) {
    return {
      ok: false,
      statusCode: 400,
      error: 'Le salon est fermé à cette date. Veuillez choisir un autre jour.',
    };
  }

  const matchingSlot = availability.slots.find((s) => s.time === input.startTime);
  if (!matchingSlot || !matchingSlot.available) {
    return {
      ok: false,
      statusCode: 409,
      error: 'Ce créneau vient d’être réservé ou n’est plus disponible. Veuillez choisir un autre horaire.',
    };
  }

  // Upsert customer
  const { data: existingCustomers } = await supabaseClient.from('customers').select('id, phone');
  const existingCustomer = (existingCustomers || []).find(
    (c: { id: number; phone: string }) => c.phone.replace(/[\s-]/g, '') === digitsOnly
  );

  let customerId: number;
  if (existingCustomer) {
    customerId = existingCustomer.id;
    await supabaseClient
      .from('customers')
      .update({ first_name: cleanFirst, last_name: cleanLast, phone: cleanPhone })
      .eq('id', customerId);
  } else {
    const { data: insertedCust, error: custErr } = await supabaseClient
      .from('customers')
      .insert({ first_name: cleanFirst, last_name: cleanLast, phone: cleanPhone })
      .select('id')
      .single();
    if (custErr || !insertedCust) {
      return { ok: false, statusCode: 500, error: 'Impossible d’enregistrer le client.' };
    }
    customerId = insertedCust.id;
  }

  const compactDate = input.date.replace(/-/g, '').slice(2);
  const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const reference = `HC-${compactDate}-${randSuffix}`;

  const { data: insertedAppt, error: apptErr } = await supabaseClient
    .from('appointments')
    .insert({
      reference,
      customer_id: customerId,
      service_id: service.id,
      service_name: service.name,
      appointment_date: input.date,
      start_time: matchingSlot.time,
      end_time: matchingSlot.end_time,
      duration_minutes: service.duration_minutes,
      price: service.price,
      status: 'confirmed',
      notes: '',
    })
    .select('*')
    .single();

  if (apptErr || !insertedAppt) {
    return { ok: false, statusCode: 500, error: 'Erreur lors de la création du rendez-vous.' };
  }

  return {
    ok: true,
    appointment: {
      ...(insertedAppt as AppointmentRecord),
      first_name: cleanFirst,
      last_name: cleanLast,
      phone: cleanPhone,
    },
  };
}

// ---------------- ADMIN AUTH ----------------

export async function authenticateAdmin(
  username: string,
  password: string
): Promise<{ id: number; username: string; displayName: string } | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const admin = db
      .prepare('SELECT id, username, password_hash, display_name FROM admin_users WHERE username = ?')
      .get(username) as
      | { id: number; username: string; password_hash: string; display_name: string }
      | undefined;

    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return null;
    }
    return { id: admin.id, username: admin.username, displayName: admin.display_name };
  }

  await ensureSupabaseSeeded();
  const { data: admin } = await supabaseClient
    .from('admin_users')
    .select('id, username, password_hash, display_name')
    .eq('username', username)
    .maybeSingle();

  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return null;
  }
  return { id: admin.id, username: admin.username, displayName: admin.display_name };
}

export async function updateAdminPasswordAsync(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const verified = await authenticateAdmin(username, currentPassword);
  if (!verified) {
    return { ok: false, error: 'Mot de passe actuel incorrect.' };
  }
  if (newPassword.length < 6 || newPassword.length > 100) {
    return {
      ok: false,
      error: 'Le nouveau mot de passe doit contenir entre 6 et 100 caractères.',
    };
  }

  const newHash = hashPassword(newPassword);

  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE username = ?').run(newHash, username);
    return { ok: true };
  }

  const { error } = await supabaseClient
    .from('admin_users')
    .update({ password_hash: newHash })
    .eq('username', username);

  if (error) {
    return { ok: false, error: 'Impossible de mettre à jour le mot de passe.' };
  }
  return { ok: true };
}

// ---------------- ADMIN DASHBOARD ----------------

type JoinedAppointmentRow = AppointmentRecord & {
  customers?: { first_name: string; last_name: string; phone: string } | null;
};

function flattenJoinedAppointment(row: JoinedAppointmentRow): AppointmentRecord {
  const c = row.customers;
  return {
    id: row.id,
    reference: row.reference,
    customer_id: row.customer_id,
    service_id: row.service_id,
    service_name: row.service_name,
    appointment_date: row.appointment_date,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_minutes: row.duration_minutes,
    price: row.price,
    status: row.status,
    notes: row.notes || '',
    created_at: row.created_at,
    first_name: c?.first_name ?? row.first_name ?? '',
    last_name: c?.last_name ?? row.last_name ?? '',
    phone: c?.phone ?? row.phone ?? '',
  };
}

export async function getAdminOverviewAsync(): Promise<AdminOverviewStats> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const todayDate = getTodayDateString();
    const todayAppointments = db
      .prepare(`
        SELECT a.*, c.first_name, c.last_name, c.phone
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        WHERE a.appointment_date = ?
        ORDER BY a.start_time ASC
      `)
      .all(todayDate) as unknown as AppointmentRecord[];

    const todayCountRow = db
      .prepare("SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ? AND status != 'cancelled'")
      .get(todayDate) as { count: number };
    const upcomingCountRow = db
      .prepare("SELECT COUNT(*) as count FROM appointments WHERE appointment_date >= ? AND status IN ('pending', 'confirmed')")
      .get(todayDate) as { count: number };
    const totalBookingsRow = db
      .prepare('SELECT COUNT(*) as count FROM appointments')
      .get() as { count: number };
    const totalCustomersRow = db
      .prepare('SELECT COUNT(*) as count FROM customers')
      .get() as { count: number };
    const revenueRow = db
      .prepare("SELECT COALESCE(SUM(price), 0) as total FROM appointments WHERE status IN ('confirmed', 'completed')")
      .get() as { total: number };

    return {
      todayDate,
      todayCount: todayCountRow.count,
      upcomingCount: upcomingCountRow.count,
      totalBookings: totalBookingsRow.count,
      totalCustomers: totalCustomersRow.count,
      confirmedRevenue: revenueRow.total,
      todayAppointments,
    };
  }

  const todayDate = getTodayDateString();
  const [apptsRes, custCountRes] = await Promise.all([
    supabaseClient
      .from('appointments')
      .select('*, customers(first_name, last_name, phone)')
      .order('start_time', { ascending: true }),
    supabaseClient.from('customers').select('id', { count: 'exact', head: true }),
  ]);

  const all = ((apptsRes.data || []) as JoinedAppointmentRow[]).map(flattenJoinedAppointment);
  const todayAppointments = all.filter((a) => a.appointment_date === todayDate);

  return {
    todayDate,
    todayCount: todayAppointments.filter((a) => a.status !== 'cancelled').length,
    upcomingCount: all.filter(
      (a) => a.appointment_date >= todayDate && (a.status === 'pending' || a.status === 'confirmed')
    ).length,
    totalBookings: all.length,
    totalCustomers: custCountRes.count || 0,
    confirmedRevenue: all
      .filter((a) => a.status === 'confirmed' || a.status === 'completed')
      .reduce((acc, a) => acc + Number(a.price || 0), 0),
    todayAppointments,
  };
}

export async function listAppointmentsAsync(filters: {
  search?: string;
  date?: string;
  status?: string;
}): Promise<AppointmentRecord[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const search = (filters.search || '').trim().toLowerCase();
    const dateFilter = (filters.date || '').trim();
    const statusFilter = (filters.status || '').trim();

    let query = `
      SELECT a.*, c.first_name, c.last_name, c.phone
      FROM appointments a
      JOIN customers c ON a.customer_id = c.id
      WHERE 1 = 1
    `;
    const params: string[] = [];

    if (dateFilter && isValidDateString(dateFilter)) {
      query += ' AND a.appointment_date = ?';
      params.push(dateFilter);
    }
    if (statusFilter && ['pending', 'confirmed', 'completed', 'cancelled'].includes(statusFilter)) {
      query += ' AND a.status = ?';
      params.push(statusFilter);
    }
    if (search) {
      query += ` AND (
        lower(c.first_name) LIKE ?
        OR lower(c.last_name) LIKE ?
        OR lower(c.first_name || ' ' || c.last_name) LIKE ?
        OR lower(c.phone) LIKE ?
        OR lower(a.reference) LIKE ?
      )`;
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
    query += ' ORDER BY a.appointment_date DESC, a.start_time ASC';
    return db.prepare(query).all(...params) as unknown as AppointmentRecord[];
  }

  let q = supabaseClient
    .from('appointments')
    .select('*, customers(first_name, last_name, phone)')
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (filters.date && isValidDateString(filters.date)) {
    q = q.eq('appointment_date', filters.date);
  }
  if (filters.status && ['pending', 'confirmed', 'completed', 'cancelled'].includes(filters.status)) {
    q = q.eq('status', filters.status);
  }

  const { data } = await q;
  let rows = ((data || []) as JoinedAppointmentRow[]).map(flattenJoinedAppointment);
  const search = (filters.search || '').trim().toLowerCase();
  if (search) {
    rows = rows.filter((r) => {
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (
        r.first_name.toLowerCase().includes(search) ||
        r.last_name.toLowerCase().includes(search) ||
        fullName.includes(search) ||
        r.phone.toLowerCase().includes(search) ||
        r.reference.toLowerCase().includes(search)
      );
    });
  }
  return rows;
}

export async function updateAppointmentStatusAsync(
  id: number,
  status: AppointmentStatus
): Promise<AppointmentRecord | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const info = db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, id);
    if (info.changes === 0) return null;
    return db
      .prepare(`
        SELECT a.*, c.first_name, c.last_name, c.phone
        FROM appointments a
        JOIN customers c ON a.customer_id = c.id
        WHERE a.id = ?
      `)
      .get(id) as unknown as AppointmentRecord;
  }

  const { data, error } = await supabaseClient
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select('*, customers(first_name, last_name, phone)')
    .maybeSingle();

  if (error || !data) return null;
  return flattenJoinedAppointment(data as JoinedAppointmentRow);
}

export async function updateAppointmentFullAsync(
  id: number,
  input: UpdateAppointmentAdminInput
): Promise<BookingCreationResult> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return updateAppointmentAdmin(id, input);
  }

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

  const { data: existing } = await supabaseClient
    .from('appointments')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!existing) {
    return { ok: false, statusCode: 404, error: 'Rendez-vous introuvable.' };
  }

  const { data: service } = await supabaseClient
    .from('services')
    .select('*')
    .eq('id', input.serviceId)
    .maybeSingle();
  if (!service) {
    return { ok: false, statusCode: 404, error: 'Prestation introuvable.' };
  }

  const startMin = timeToMinutes(input.startTime);
  const endMin = startMin + service.duration_minutes;
  const endTime = minutesToTime(endMin);

  if (input.status !== 'cancelled') {
    const { data: otherAppts } = await supabaseClient
      .from('appointments')
      .select('start_time, end_time')
      .eq('appointment_date', input.date)
      .neq('status', 'cancelled')
      .neq('id', id);

    const conflict = (otherAppts || []).some((a: { start_time: string; end_time: string }) => {
      const s = timeToMinutes(a.start_time);
      const e = timeToMinutes(a.end_time);
      return startMin < e && endMin > s;
    });

    if (conflict) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Cet horaire chevauche déjà un autre rendez-vous à cette date.',
      };
    }
  }

  const { data: allCust } = await supabaseClient.from('customers').select('id, phone');
  const conflictCust = (allCust || []).find(
    (c: { id: number; phone: string }) =>
      c.id !== existing.customer_id && c.phone.replace(/[\s-]/g, '') === digitsOnly
  );
  const targetCustomerId = conflictCust ? conflictCust.id : existing.customer_id;

  await supabaseClient
    .from('customers')
    .update({ first_name: cleanFirst, last_name: cleanLast, phone: cleanPhone })
    .eq('id', targetCustomerId);

  const { data: updated, error } = await supabaseClient
    .from('appointments')
    .update({
      customer_id: targetCustomerId,
      service_id: service.id,
      service_name: service.name,
      appointment_date: input.date,
      start_time: input.startTime,
      end_time: endTime,
      duration_minutes: service.duration_minutes,
      price: service.price,
      status: input.status,
      notes: cleanNotes,
    })
    .eq('id', id)
    .select('*, customers(first_name, last_name, phone)')
    .single();

  if (error || !updated) {
    return { ok: false, statusCode: 500, error: 'Erreur lors de la modification du rendez-vous.' };
  }

  return { ok: true, appointment: flattenJoinedAppointment(updated as JoinedAppointmentRow) };
}

export async function createAppointmentAdminAsync(
  input: CreateAppointmentAdminInput
): Promise<BookingCreationResult> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return createAppointmentAdmin(input);
  }

  const cleanFirst = input.firstName.trim();
  const cleanLast = input.lastName.trim();
  const cleanPhone = input.phone.replace(/\s+/g, ' ').trim();
  const cleanNotes = (input.notes || '').trim();
  const status: AppointmentStatus = input.status || 'confirmed';

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

  const { data: service } = await supabaseClient
    .from('services')
    .select('*')
    .eq('id', input.serviceId)
    .maybeSingle();

  if (!service) {
    return { ok: false, statusCode: 404, error: 'La prestation sélectionnée est introuvable.' };
  }

  const startMin = timeToMinutes(input.startTime);
  const endMin = startMin + service.duration_minutes;
  const endTime = minutesToTime(endMin);

  if (status !== 'cancelled') {
    const { data: existingAppts } = await supabaseClient
      .from('appointments')
      .select('start_time, end_time')
      .eq('appointment_date', input.date)
      .neq('status', 'cancelled');

    const conflict = (existingAppts || []).some((a: { start_time: string; end_time: string }) => {
      const s = timeToMinutes(a.start_time);
      const e = timeToMinutes(a.end_time);
      return startMin < e && endMin > s;
    });

    if (conflict) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Cet horaire est déjà pris par un autre rendez-vous à cette date.',
      };
    }
  }

  const { data: existingCustomers } = await supabaseClient.from('customers').select('id, phone');
  const existingCustomer = (existingCustomers || []).find(
    (c: { id: number; phone: string }) => c.phone.replace(/[\s-]/g, '') === digitsOnly
  );

  let customerId: number;
  if (existingCustomer) {
    customerId = existingCustomer.id;
    await supabaseClient
      .from('customers')
      .update({ first_name: cleanFirst, last_name: cleanLast, phone: cleanPhone })
      .eq('id', customerId);
  } else {
    const { data: insertedCust, error: custErr } = await supabaseClient
      .from('customers')
      .insert({ first_name: cleanFirst, last_name: cleanLast, phone: cleanPhone })
      .select('id')
      .single();
    if (custErr || !insertedCust) {
      return { ok: false, statusCode: 500, error: 'Impossible d’enregistrer le client.' };
    }
    customerId = insertedCust.id;
  }

  const compactDate = input.date.replace(/-/g, '').slice(2);
  const randSuffix = String(Math.floor(1000 + Math.random() * 9000));
  const reference = `HC-${compactDate}-${randSuffix}`;

  const { data: insertedAppt, error: apptErr } = await supabaseClient
    .from('appointments')
    .insert({
      reference,
      customer_id: customerId,
      service_id: service.id,
      service_name: service.name,
      appointment_date: input.date,
      start_time: input.startTime,
      end_time: endTime,
      duration_minutes: service.duration_minutes,
      price: service.price,
      status,
      notes: cleanNotes,
    })
    .select('*')
    .single();

  if (apptErr || !insertedAppt) {
    return { ok: false, statusCode: 500, error: 'Erreur lors de la création du rendez-vous.' };
  }

  return {
    ok: true,
    appointment: {
      ...(insertedAppt as AppointmentRecord),
      first_name: cleanFirst,
      last_name: cleanLast,
      phone: cleanPhone,
    },
  };
}

export async function deleteAppointmentAsync(id: number): Promise<boolean> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const info = db.prepare('DELETE FROM appointments WHERE id = ?').run(id);
    return info.changes > 0;
  }
  const { data } = await supabaseClient
    .from('appointments')
    .delete()
    .eq('id', id)
    .select('id');
  return Boolean(data && data.length > 0);
}

// ---------------- SERVICES ----------------

export async function listAdminServicesAsync(): Promise<ServiceItem[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return db
      .prepare('SELECT * FROM services ORDER BY sort_order ASC, id ASC')
      .all() as unknown as ServiceItem[];
  }
  const { data } = await supabaseClient
    .from('services')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  return (data || []) as ServiceItem[];
}

export async function createServiceAsync(payload: {
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  image_url: string;
}): Promise<ServiceItem> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM services')
      .get() as { m: number };
    const result = db
      .prepare(
        'INSERT INTO services (name, description, price, duration_minutes, image_url, is_active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
      )
      .run(
        payload.name,
        payload.description,
        payload.price,
        payload.duration_minutes,
        payload.image_url,
        maxOrder.m + 1
      );
    invalidatePublicBootstrapCache();
    return db
      .prepare('SELECT * FROM services WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as unknown as ServiceItem;
  }

  const { data: existing } = await supabaseClient
    .from('services')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const maxOrder = existing?.[0]?.sort_order || 0;

  const { data, error } = await supabaseClient
    .from('services')
    .insert({ ...payload, is_active: 1, sort_order: maxOrder + 1 })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erreur création prestation.');
  invalidatePublicBootstrapCache();
  return data as ServiceItem;
}

export async function updateServiceAsync(
  id: number,
  payload: {
    name: string;
    description: string;
    price: number;
    duration_minutes: number;
    image_url: string;
    is_active: number;
  }
): Promise<ServiceItem | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const info = db
      .prepare(
        "UPDATE services SET name = ?, description = ?, price = ?, duration_minutes = ?, image_url = COALESCE(NULLIF(?, ''), image_url), is_active = ? WHERE id = ?"
      )
      .run(
        payload.name,
        payload.description,
        payload.price,
        payload.duration_minutes,
        payload.image_url,
        payload.is_active,
        id
      );
    if (info.changes === 0) return null;
    invalidatePublicBootstrapCache();
    return db.prepare('SELECT * FROM services WHERE id = ?').get(id) as unknown as ServiceItem;
  }

  const updateFields: Record<string, unknown> = {
    name: payload.name,
    description: payload.description,
    price: payload.price,
    duration_minutes: payload.duration_minutes,
    is_active: payload.is_active,
  };
  if (payload.image_url) {
    updateFields.image_url = payload.image_url;
  }

  const { data, error } = await supabaseClient
    .from('services')
    .update(updateFields)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) return null;
  invalidatePublicBootstrapCache();
  return data as ServiceItem;
}

export async function deleteServiceAsync(id: number): Promise<{ archived?: boolean; deleted?: boolean }> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const usedInAppts = db
      .prepare('SELECT COUNT(*) as count FROM appointments WHERE service_id = ?')
      .get(id) as { count: number };
    if (usedInAppts.count > 0) {
      db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(id);
      invalidatePublicBootstrapCache();
      return { archived: true };
    }
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    invalidatePublicBootstrapCache();
    return { deleted: true };
  }

  const { count } = await supabaseClient
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('service_id', id);

  if (count && count > 0) {
    await supabaseClient.from('services').update({ is_active: 0 }).eq('id', id);
    invalidatePublicBootstrapCache();
    return { archived: true };
  }
  await supabaseClient.from('services').delete().eq('id', id);
  invalidatePublicBootstrapCache();
  return { deleted: true };
}

// ---------------- HOURS, DAYS OFF, SLOT RULES ----------------

export async function updateHoursAsync(
  hours: BusinessHour[],
  interval: number
): Promise<{ businessHours: BusinessHour[]; slot_interval_minutes: string }> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.exec('BEGIN');
    try {
      const stmt = db.prepare(
        'UPDATE business_hours SET is_open = ?, open_time = ?, close_time = ? WHERE day_of_week = ?'
      );
      for (const h of hours) {
        stmt.run(h.is_open ? 1 : 0, h.open_time, h.close_time, Number(h.day_of_week));
      }
      if ([15, 20, 30, 45, 60].includes(interval)) {
        db.prepare(
          "INSERT INTO shop_settings (key, value) VALUES ('slot_interval_minutes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        ).run(String(interval));
      }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      throw e;
    }

    const updatedHours = db
      .prepare(
        'SELECT * FROM business_hours ORDER BY CASE WHEN day_of_week = 0 THEN 7 ELSE day_of_week END ASC'
      )
      .all() as unknown as BusinessHour[];
    invalidatePublicBootstrapCache();
    return { businessHours: updatedHours, slot_interval_minutes: String(interval) };
  }

  await supabaseClient.from('business_hours').upsert(
    hours.map((h) => ({
      day_of_week: Number(h.day_of_week),
      day_name: h.day_name,
      is_open: h.is_open ? 1 : 0,
      open_time: h.open_time,
      close_time: h.close_time,
    })),
    { onConflict: 'day_of_week' }
  );

  if ([15, 20, 30, 45, 60].includes(interval)) {
    await supabaseClient
      .from('shop_settings')
      .upsert({ key: 'slot_interval_minutes', value: String(interval) }, { onConflict: 'key' });
  }

  const { data } = await supabaseClient.from('business_hours').select('*');
  const sorted = ((data || []) as BusinessHour[]).sort((a, b) => {
    const da = a.day_of_week === 0 ? 7 : a.day_of_week;
    const dbDay = b.day_of_week === 0 ? 7 : b.day_of_week;
    return da - dbDay;
  });
  invalidatePublicBootstrapCache();
  return { businessHours: sorted, slot_interval_minutes: String(interval) };
}

export async function listDaysOffAsync(): Promise<DayOff[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return db.prepare('SELECT * FROM days_off ORDER BY date ASC').all() as unknown as DayOff[];
  }
  const { data } = await supabaseClient.from('days_off').select('*').order('date', { ascending: true });
  return (data || []) as DayOff[];
}

export async function addDayOffAsync(date: string, reason: string): Promise<DayOff | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    try {
      const info = db
        .prepare('INSERT INTO days_off (date, reason) VALUES (?, ?)')
        .run(date, reason || 'Fermeture exceptionnelle');
      invalidatePublicBootstrapCache();
      return db
        .prepare('SELECT * FROM days_off WHERE id = ?')
        .get(Number(info.lastInsertRowid)) as unknown as DayOff;
    } catch {
      return null;
    }
  }
  const { data, error } = await supabaseClient
    .from('days_off')
    .insert({ date, reason: reason || 'Fermeture exceptionnelle' })
    .select('*')
    .single();
  if (error || !data) return null;
  invalidatePublicBootstrapCache();
  return data as DayOff;
}

export async function deleteDayOffAsync(id: number): Promise<void> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.prepare('DELETE FROM days_off WHERE id = ?').run(id);
    invalidatePublicBootstrapCache();
    return;
  }
  await supabaseClient.from('days_off').delete().eq('id', id);
  invalidatePublicBootstrapCache();
}

export async function listSlotRulesAsync(): Promise<TimeSlotRule[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return db
      .prepare('SELECT * FROM time_slot_rules ORDER BY scope ASC, target_date ASC, slot_time ASC')
      .all() as unknown as TimeSlotRule[];
  }
  const { data } = await supabaseClient
    .from('time_slot_rules')
    .select('*')
    .order('scope', { ascending: true })
    .order('slot_time', { ascending: true });
  return (data || []) as TimeSlotRule[];
}

export async function addSlotRuleAsync(payload: {
  scope: 'global' | 'date';
  target_date: string | null;
  slot_time: string;
  rule_type: 'add' | 'block';
  label: string;
}): Promise<TimeSlotRule> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const info = db
      .prepare(
        'INSERT INTO time_slot_rules (scope, target_date, slot_time, rule_type, label) VALUES (?, ?, ?, ?, ?)'
      )
      .run(payload.scope, payload.target_date, payload.slot_time, payload.rule_type, payload.label);
    return db
      .prepare('SELECT * FROM time_slot_rules WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as TimeSlotRule;
  }
  const { data, error } = await supabaseClient
    .from('time_slot_rules')
    .insert(payload)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erreur création règle.');
  return data as TimeSlotRule;
}

export async function deleteSlotRuleAsync(id: number): Promise<void> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.prepare('DELETE FROM time_slot_rules WHERE id = ?').run(id);
    return;
  }
  await supabaseClient.from('time_slot_rules').delete().eq('id', id);
}

// ---------------- GALLERY ----------------

export async function listGalleryAsync(): Promise<GalleryImage[]> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    return db
      .prepare('SELECT * FROM gallery_images ORDER BY sort_order ASC, id DESC')
      .all() as unknown as GalleryImage[];
  }
  const { data } = await supabaseClient
    .from('gallery_images')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('id', { ascending: false });
  return (data || []) as GalleryImage[];
}

export async function addGalleryAsync(payload: {
  title: string;
  category: string;
  image_url: string;
}): Promise<GalleryImage> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM gallery_images')
      .get() as { m: number };
    const info = db
      .prepare('INSERT INTO gallery_images (title, category, image_url, sort_order) VALUES (?, ?, ?, ?)')
      .run(payload.title, payload.category, payload.image_url, maxOrder.m + 1);
    invalidatePublicBootstrapCache();
    return db
      .prepare('SELECT * FROM gallery_images WHERE id = ?')
      .get(Number(info.lastInsertRowid)) as unknown as GalleryImage;
  }

  const { data: existing } = await supabaseClient
    .from('gallery_images')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1);
  const maxOrder = existing?.[0]?.sort_order || 0;

  const { data, error } = await supabaseClient
    .from('gallery_images')
    .insert({ ...payload, sort_order: maxOrder + 1 })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Erreur ajout galerie.');
  invalidatePublicBootstrapCache();
  return data as GalleryImage;
}

export async function updateGalleryAsync(
  id: number,
  payload: { title: string; category: string; image_url: string }
): Promise<GalleryImage | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const info = db
      .prepare('UPDATE gallery_images SET title = ?, category = ?, image_url = ? WHERE id = ?')
      .run(payload.title, payload.category, payload.image_url, id);
    if (info.changes === 0) return null;
    invalidatePublicBootstrapCache();
    return db.prepare('SELECT * FROM gallery_images WHERE id = ?').get(id) as unknown as GalleryImage;
  }
  const { data, error } = await supabaseClient
    .from('gallery_images')
    .update(payload)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) return null;
  invalidatePublicBootstrapCache();
  return data as GalleryImage;
}

export async function deleteGalleryAsync(id: number): Promise<void> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.prepare('DELETE FROM gallery_images WHERE id = ?').run(id);
    invalidatePublicBootstrapCache();
    return;
  }
  await supabaseClient.from('gallery_images').delete().eq('id', id);
  invalidatePublicBootstrapCache();
}

// ---------------- SETTINGS ----------------

export async function updateSettingsAsync(
  updates: Array<{ key: string; value: string }>
): Promise<ShopSettings> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const stmt = db.prepare(
      'INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    for (const item of updates) {
      stmt.run(item.key, item.value);
    }
    invalidatePublicBootstrapCache();
    return getSqliteSettingsMap();
  }

  if (updates.length > 0) {
    await supabaseClient.from('shop_settings').upsert(updates, { onConflict: 'key' });
  }
  const { data } = await supabaseClient.from('shop_settings').select('*');
  const map: Record<string, string> = { ...HAZEM_DEFAULT_SETTINGS };
  for (const row of (data || []) as Array<{ key: string; value: string }>) {
    map[row.key] = row.value;
  }
  invalidatePublicBootstrapCache();
  return map as unknown as ShopSettings;
}

// ---------------- PERSISTENT MEDIA ASSETS ----------------

export async function saveMediaAssetAsync(
  id: string,
  filename: string,
  mimeType: string,
  dataBase64: string
): Promise<string> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    db.prepare(
      'INSERT INTO media_assets (id, filename, mime_type, data_base64) VALUES (?, ?, ?, ?)'
    ).run(id, filename, mimeType, dataBase64);
    return `/api/media/${id}`;
  }

  const { error } = await supabaseClient.from('media_assets').insert({
    id,
    filename,
    mime_type: mimeType,
    data_base64: dataBase64,
  });
  if (error) {
    throw new Error(error.message);
  }
  return `/api/media/${id}`;
}

export async function getMediaAssetAsync(
  id: string
): Promise<{ mimeType: string; buffer: Buffer } | null> {
  if (!supabaseClient || !(await ensureSupabaseSeeded())) {
    const row = db
      .prepare('SELECT mime_type, data_base64 FROM media_assets WHERE id = ?')
      .get(id) as { mime_type: string; data_base64: string } | undefined;
    if (!row) return null;
    return { mimeType: row.mime_type, buffer: Buffer.from(row.data_base64, 'base64') };
  }

  const { data } = await supabaseClient
    .from('media_assets')
    .select('mime_type, data_base64')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    mimeType: String(data.mime_type),
    buffer: Buffer.from(String(data.data_base64), 'base64'),
  };
}
