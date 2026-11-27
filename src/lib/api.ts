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
} from '../types/barbershop';

const ADMIN_TOKEN_KEY = 'maison_valmont_admin_token';

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const err = new Error('Réponse serveur invalide.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || 'Une erreur est survenue.') as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

function adminHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// Public APIs
export async function fetchPublicBootstrap(): Promise<PublicBootstrapData> {
  try {
    return await requestJson<PublicBootstrapData>('/api/public/bootstrap');
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return requestJson<PublicBootstrapData>('/api/public/bootstrap');
  }
}

export function fetchMonthAvailability(
  year: number,
  month: number,
  serviceId: number
): Promise<{ days: DayAvailabilitySummary[] }> {
  return requestJson<{ days: DayAvailabilitySummary[] }>(
    `/api/availability/month?year=${year}&month=${month}&serviceId=${serviceId}`
  );
}

export function fetchDaySlots(
  date: string,
  serviceId: number
): Promise<{
  is_past: boolean;
  is_open_day: boolean;
  is_day_off: boolean;
  day_off_reason?: string;
  slots: TimeSlotOption[];
}> {
  return requestJson(`/api/availability/slots?date=${encodeURIComponent(date)}&serviceId=${serviceId}`);
}

export function submitBooking(payload: {
  serviceId: number;
  date: string;
  startTime: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<{ message: string; appointment: AppointmentRecord }> {
  return requestJson('/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Admin Auth
export function loginAdmin(
  username: string,
  password: string
): Promise<{ token: string; user: { id: number; username: string; displayName: string } }> {
  return requestJson('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function verifyAdminSession(
  token: string
): Promise<{ user: { id: number; username: string; displayName: string } }> {
  return requestJson('/api/admin/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Admin Dashboard APIs
export function fetchAdminOverview(token: string): Promise<AdminOverviewStats> {
  return requestJson('/api/admin/overview', { headers: adminHeaders(token) });
}

export function fetchAdminAppointments(
  token: string,
  params: { search?: string; date?: string; status?: string }
): Promise<{ appointments: AppointmentRecord[] }> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.date) qs.set('date', params.date);
  if (params.status) qs.set('status', params.status);
  return requestJson(`/api/admin/appointments?${qs.toString()}`, {
    headers: adminHeaders(token),
  });
}

export function updateAppointmentStatus(
  token: string,
  id: number,
  status: AppointmentStatus
): Promise<{ appointment: AppointmentRecord }> {
  return requestJson(`/api/admin/appointments/${id}/status`, {
    method: 'PATCH',
    headers: adminHeaders(token),
    body: JSON.stringify({ status }),
  });
}

export function createAdminAppointment(
  token: string,
  payload: {
    serviceId: number;
    date: string;
    startTime: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: AppointmentStatus;
    notes: string;
  }
): Promise<{ appointment: AppointmentRecord }> {
  return requestJson('/api/admin/appointments', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateAdminAppointment(
  token: string,
  id: number,
  payload: {
    serviceId: number;
    date: string;
    startTime: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: AppointmentStatus;
    notes: string;
  }
): Promise<{ appointment: AppointmentRecord }> {
  return requestJson(`/api/admin/appointments/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteAdminAppointment(
  token: string,
  id: number
): Promise<{ deleted: boolean }> {
  return requestJson(`/api/admin/appointments/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
}

export function fetchAdminServices(token: string): Promise<{ services: ServiceItem[] }> {
  return requestJson('/api/admin/services', { headers: adminHeaders(token) });
}

export function createService(
  token: string,
  payload: Omit<ServiceItem, 'id' | 'is_active' | 'sort_order'>
): Promise<{ service: ServiceItem }> {
  return requestJson('/api/admin/services', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateService(
  token: string,
  id: number,
  payload: Partial<ServiceItem>
): Promise<{ service: ServiceItem }> {
  return requestJson(`/api/admin/services/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function deleteService(token: string, id: number): Promise<{ deleted?: boolean; archived?: boolean }> {
  return requestJson(`/api/admin/services/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
}

export function updateBusinessHours(
  token: string,
  hours: BusinessHour[],
  slotIntervalMinutes: number
): Promise<{ businessHours: BusinessHour[]; slot_interval_minutes: string }> {
  return requestJson('/api/admin/hours', {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify({ hours, slot_interval_minutes: slotIntervalMinutes }),
  });
}

export function fetchDaysOff(token: string): Promise<{ daysOff: DayOff[] }> {
  return requestJson('/api/admin/days-off', { headers: adminHeaders(token) });
}

export function addDayOff(
  token: string,
  date: string,
  reason: string
): Promise<{ dayOff: DayOff }> {
  return requestJson('/api/admin/days-off', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ date, reason }),
  });
}

export function removeDayOff(token: string, id: number): Promise<{ deleted: boolean }> {
  return requestJson(`/api/admin/days-off/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
}

export function fetchSlotRules(token: string): Promise<{ rules: TimeSlotRule[] }> {
  return requestJson('/api/admin/slot-rules', { headers: adminHeaders(token) });
}

export function addSlotRule(
  token: string,
  payload: Omit<TimeSlotRule, 'id'>
): Promise<{ rule: TimeSlotRule }> {
  return requestJson('/api/admin/slot-rules', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function removeSlotRule(token: string, id: number): Promise<{ deleted: boolean }> {
  return requestJson(`/api/admin/slot-rules/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
  });
}

export function fetchAdminGallery(token: string): Promise<{ gallery: GalleryImage[] }> {
  return requestJson('/api/admin/gallery', { headers: adminHeaders(token) });
}

export function addGalleryImage(
  token: string,
  payload: { title: string; category: string; image_url: string }
): Promise<{ image: GalleryImage }> {
  return requestJson('/api/admin/gallery', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function updateGalleryImage(
  token: string,
  id: number,
  payload: { title: string; category: string; image_url: string }
): Promise<{ image: GalleryImage }> {
  return requestJson(`/api/admin/gallery/${id}`, {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

export function removeGalleryImage(token: string, id: number): Promise<{ deleted: boolean }> {
  return requestJson(`/api/admin/gallery/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(token),
    body: undefined,
  });
}

async function compressImageFile(file: File): Promise<{ filename: string; dataUrl: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire le fichier sélectionné.'));
    reader.readAsDataURL(file);
  });

  if (file.type === 'image/gif' || file.size < 45 * 1024) {
    return { filename: file.name, dataUrl: rawDataUrl };
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = rawDataUrl;
    });

    const maxDim = 1600;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { filename: file.name, dataUrl: rawDataUrl };
    ctx.drawImage(img, 0, 0, width, height);

    const webpUrl = canvas.toDataURL('image/webp', 0.82);
    if (webpUrl.startsWith('data:image/webp') && webpUrl.length < rawDataUrl.length) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return { filename: `${base}.webp`, dataUrl: webpUrl };
    }
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.84);
    if (jpegUrl.startsWith('data:image/jpeg') && jpegUrl.length < rawDataUrl.length) {
      const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
      return { filename: `${base}.jpg`, dataUrl: jpegUrl };
    }
    return { filename: file.name, dataUrl: rawDataUrl };
  } catch {
    return { filename: file.name, dataUrl: rawDataUrl };
  }
}

export async function uploadAdminImage(token: string, file: File): Promise<{ url: string }> {
  const prepared = await compressImageFile(file);
  return requestJson<{ url: string }>('/api/admin/upload', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify(prepared),
  });
}

export function changeAdminPassword(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; message: string }> {
  return requestJson('/api/admin/change-password', {
    method: 'POST',
    headers: adminHeaders(token),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function updateShopSettings(
  token: string,
  payload: Partial<ShopSettings>
): Promise<{ settings: ShopSettings }> {
  return requestJson('/api/admin/settings', {
    method: 'PUT',
    headers: adminHeaders(token),
    body: JSON.stringify(payload),
  });
}

// Formatting helpers in French (France)
export function formatDateFr(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatShortDateFr(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
}

export function formatPriceFr(price: number): string {
  return `${Number(price).toFixed(0)} DT`;
}

export function isValidFrenchPhone(phone: string): boolean {
  const digits = phone.replace(/[^\d+]/g, '');
  if (/^[24579]\d{7}$/.test(digits)) return true;
  if (/^\+216[24579]\d{7}$/.test(digits)) return true;
  if (/^0[1-9]\d{8}$/.test(digits)) return true;
  if (/^\+33[1-9]\d{8}$/.test(digits)) return true;
  return digits.length >= 8 && digits.length <= 15;
}
