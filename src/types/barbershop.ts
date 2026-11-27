export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface ServiceItem {
  id: number;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  image_url: string;
  is_active: number;
  sort_order: number;
}

export interface BusinessHour {
  day_of_week: number; // 0 = Dimanche ... 6 = Samedi
  day_name: string;
  is_open: number;
  open_time: string;
  close_time: string;
}

export interface DayOff {
  id: number;
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface TimeSlotRule {
  id: number;
  scope: 'global' | 'date';
  target_date: string | null;
  slot_time: string;
  rule_type: 'add' | 'block';
  label: string;
}

export interface TimeSlotOption {
  time: string;
  end_time: string;
  available: boolean;
  reason?: string;
}

export interface DayAvailabilitySummary {
  date: string;
  is_past: boolean;
  is_open_day: boolean;
  is_day_off: boolean;
  day_off_reason?: string;
  available_count: number;
}

export interface AppointmentRecord {
  id: number;
  reference: string;
  customer_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  service_id: number;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  price: number;
  status: AppointmentStatus;
  notes: string;
  created_at: string;
}

export interface GalleryImage {
  id: number;
  title: string;
  category: string;
  image_url: string;
  sort_order: number;
}

export interface ShopSettings {
  shop_name: string;
  tagline: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  instagram_url: string;
  facebook_url: string;
  slot_interval_minutes: string;
  about_title: string;
  about_bio: string;
  barber_name: string;
  barber_role: string;
  hero_image: string;
  about_image: string;
  logo_image: string;
}

export interface PublicBootstrapData {
  services: ServiceItem[];
  businessHours: BusinessHour[];
  daysOff: DayOff[];
  gallery: GalleryImage[];
  settings: ShopSettings;
}

export interface AdminOverviewStats {
  todayDate: string;
  todayCount: number;
  upcomingCount: number;
  totalBookings: number;
  totalCustomers: number;
  confirmedRevenue: number;
  todayAppointments: AppointmentRecord[];
}
