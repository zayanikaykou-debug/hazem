import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { hashPassword, verifyPassword } from './auth.ts';

interface SqliteStatementLike {
  all: (...args: unknown[]) => unknown[];
  get: (...args: unknown[]) => unknown;
  run: (...args: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
}

export interface SqliteDbLike {
  exec: (sql: string) => void;
  prepare: (sql: string) => SqliteStatementLike;
}

function createSqliteInstance(): { db: SqliteDbLike; available: boolean } {
  try {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (path: string) => SqliteDbLike;
    };

    const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const dbPath =
      process.env.DB_PATH ||
      (isServerless ? path.join(os.tmpdir(), 'barbershop.db') : './data/barbershop.db');
    const resolved = path.resolve(dbPath);
    const dbDir = path.dirname(resolved);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const instance = new DatabaseSync(resolved);
    instance.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price REAL NOT NULL,
        duration_minutes INTEGER NOT NULL,
        image_url TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS appointments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reference TEXT NOT NULL UNIQUE,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        service_id INTEGER NOT NULL REFERENCES services(id),
        service_name TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'completed', 'cancelled')) DEFAULT 'confirmed',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_appointments_date_status
        ON appointments(appointment_date, status);

      CREATE TABLE IF NOT EXISTS business_hours (
        day_of_week INTEGER PRIMARY KEY,
        day_name TEXT NOT NULL,
        is_open INTEGER NOT NULL DEFAULT 1,
        open_time TEXT NOT NULL,
        close_time TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS days_off (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL UNIQUE,
        reason TEXT NOT NULL DEFAULT 'Fermeture exceptionnelle'
      );

      CREATE TABLE IF NOT EXISTS time_slot_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL CHECK(scope IN ('global', 'date')),
        target_date TEXT,
        slot_time TEXT NOT NULL,
        rule_type TEXT NOT NULL CHECK(rule_type IN ('add', 'block')),
        label TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS gallery_images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        image_url TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS shop_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS media_assets (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        data_base64 TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    return { db: instance, available: true };
  } catch (err) {
    console.warn('Local SQLite unavailable in this runtime (using Supabase):', (err as Error).message);
    const noopStmt: SqliteStatementLike = {
      all: () => [],
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    };
    return {
      db: {
        exec: () => {},
        prepare: () => noopStmt,
      },
      available: false,
    };
  }
}

const sqliteInit = createSqliteInstance();
export const db: SqliteDbLike = sqliteInit.db;
export const isSqliteAvailable: boolean = sqliteInit.available;

function formatLocalDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const HAZEM_DEFAULT_HOURS = [
  [1, 'Lundi', 1, '13:00', '20:30'],
  [2, 'Mardi', 1, '10:00', '20:30'],
  [3, 'Mercredi', 1, '10:00', '20:30'],
  [4, 'Jeudi', 1, '10:00', '20:30'],
  [5, 'Vendredi', 1, '10:00', '20:30'],
  [6, 'Samedi', 1, '10:00', '20:30'],
  [0, 'Dimanche', 1, '10:00', '20:30'],
] as const;

export const HAZEM_DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: 'Hazem Coiff',
  tagline: 'Salon de coiffure & Barbier · Boumhel El Bassatine',
  address: '52 Av. de Paris',
  city: 'Boumhel El Bassatine',
  phone: '25 180 013',
  email: 'hazemcoiffmegrine@gmail.com',
  instagram_url: 'https://www.instagram.com/hazemcoiff/',
  facebook_url: 'https://www.facebook.com/profile.php?id=61552967307064',
  slot_interval_minutes: '30',
  barber_name: 'Hazem',
  barber_role: 'Maître Coiffeur & Barbier · Note 5,0 / 5 (15 avis)',
  about_title: 'Le souci du détail, l’accueil et la maîtrise du geste.',
  about_bio:
    'Installé au 52 Avenue de Paris à Boumhel El Bassatine, Hazem Coiff vous accueille 7 jours sur 7 dans une salle propre, moderne et soigneusement équipée. Chaque coupe, coiffure de mariage, brushing ou taille de barbe est réalisé avec écoute, précision et attention aux moindres détails.',
  hero_image: '/assets/aistudio/image_1a42b0d4.png',
  about_image: '/assets/aistudio/Capture_d__cran_2026-11-12_200313_cbb7a2be.png',
  logo_image: '/assets/aistudio/image_0d689771.png',
};

export const HAZEM_DEFAULT_SERVICES = [
  [
    'Coupe classique',
    'Diagnostic morphologique, coupe sur mesure aux ciseaux et finitions précises au coupe-chou, suivie d’un brushing soigné.',
    20,
    30,
    '/src/assets/images/service_classic_cut_1794507920274.jpg',
    1,
  ],
  [
    'Dégradé (Fade)',
    'Dégradé à blanc, bas ou progressif d’une netteté chirurgicale, contours sculptés et transition sans aucune démarcation.',
    25,
    40,
    '/src/assets/images/service_skin_fade_1794507920405.jpg',
    2,
  ],
  [
    'Coupe + Barbe',
    'Notre formule signature : coupe personnalisée, brushing, taille et tracé de barbe au rasoir, serviette chaude et soin hydratant.',
    35,
    60,
    '/src/assets/images/service_cut_beard_1794507920251.jpg',
    3,
  ],
  [
    'Taille de barbe',
    'Restructuration complète des volumes, tracé des joues et du cou à la lame, application d’huile nourrissante.',
    15,
    30,
    '/src/assets/images/service_beard_trim_1794507921722.jpg',
    4,
  ],
  [
    'Rasage traditionnel',
    'Rituel authentique : serviettes chaudes, montage au blaireau, double passage au rasoir droit et soin apaisant après-rasage.',
    25,
    45,
    '/src/assets/images/service_hot_shave_1794507921391.jpg',
    5,
  ],
  [
    'Coupe enfant',
    'Coupe adaptée et patiente pour les jeunes clients, réalisée avec douceur aux ciseaux ou à la tondeuse.',
    15,
    30,
    '/src/assets/images/service_classic_cut_1794507920274.jpg',
    6,
  ],
] as const;

export const HAZEM_GALLERY_PHOTOS = [
  ['Dégradé propre & finitions', 'Dégradés', '/assets/aistudio/image_f9fbb45e.png', 1],
  ['Coupe & barbe soignée', 'Coupes', '/assets/aistudio/image_efcc1f05.png', 2],
  ['Accueil & satisfaction client', 'Salon', '/assets/aistudio/image_ed194fa6.png', 3],
  ['Coiffure mariage & événement', 'Coupes', '/assets/aistudio/image_0a6acb80.png', 4],
] as const;

export function initializeDatabaseSeed(): void {
  if (!isSqliteAvailable) return;

  // One-time migration if previous placeholder shop 'Maison Valmont' was seeded
  const existingShopName = db
    .prepare("SELECT value FROM shop_settings WHERE key = 'shop_name'")
    .get() as { value: string } | undefined;

  if (existingShopName && existingShopName.value === 'Maison Valmont') {
    const upsertSetting = db.prepare(
      'INSERT INTO shop_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    );
    for (const [k, v] of Object.entries(HAZEM_DEFAULT_SETTINGS)) {
      upsertSetting.run(k, v);
    }

    const upsertHour = db.prepare(
      'INSERT INTO business_hours (day_of_week, day_name, is_open, open_time, close_time) VALUES (?, ?, ?, ?, ?) ON CONFLICT(day_of_week) DO UPDATE SET day_name = excluded.day_name, is_open = excluded.is_open, open_time = excluded.open_time, close_time = excluded.close_time'
    );
    for (const h of HAZEM_DEFAULT_HOURS) {
      upsertHour.run(...h);
    }

    db.prepare("UPDATE admin_users SET display_name = 'Hazem' WHERE username = 'admin'").run();

    // Update default service prices to realistic Tunisian Dinars (DT)
    const priceUpdates: Array<[string, number]> = [
      ['Coupe classique', 20],
      ['Dégradé (Fade)', 25],
      ['Coupe + Barbe', 35],
      ['Taille de barbe', 15],
      ['Rasage traditionnel', 25],
      ['Coupe enfant', 15],
    ];
    const updatePriceStmt = db.prepare('UPDATE services SET price = ? WHERE name = ?');
    for (const [name, price] of priceUpdates) {
      updatePriceStmt.run(price, name);
    }

    db.prepare(
      "UPDATE gallery_images SET title = 'Salon Hazem Coiff — Salle & Équipement' WHERE title = 'L’Atelier du Marais'"
    ).run();
  }

  // Update placeholder contact email to official Gmail if still on previous placeholder
  const existingEmail = db
    .prepare("SELECT value FROM shop_settings WHERE key = 'email'")
    .get() as { value: string } | undefined;
  if (existingEmail && existingEmail.value === 'contact@hazemcoiff.tn') {
    db.prepare("UPDATE shop_settings SET value = 'hazemcoiffmegrine@gmail.com' WHERE key = 'email'").run();
  }

  const existingIg = db
    .prepare("SELECT value FROM shop_settings WHERE key = 'instagram_url'")
    .get() as { value: string } | undefined;
  if (existingIg && existingIg.value === 'https://instagram.com') {
    db.prepare(
      "UPDATE shop_settings SET value = 'https://www.instagram.com/hazemcoiff/' WHERE key = 'instagram_url'"
    ).run();
  }

  const existingFb = db
    .prepare("SELECT value FROM shop_settings WHERE key = 'facebook_url'")
    .get() as { value: string } | undefined;
  if (existingFb && existingFb.value === 'https://facebook.com') {
    db.prepare(
      "UPDATE shop_settings SET value = 'https://www.facebook.com/profile.php?id=61552967307064' WHERE key = 'facebook_url'"
    ).run();
  }

  // Ensure hero_image, about_image, and logo_image settings exist
  const insertIgnoreSetting = db.prepare(
    'INSERT OR IGNORE INTO shop_settings (key, value) VALUES (?, ?)'
  );
  insertIgnoreSetting.run('hero_image', HAZEM_DEFAULT_SETTINGS.hero_image);
  insertIgnoreSetting.run('about_image', HAZEM_DEFAULT_SETTINGS.about_image);
  insertIgnoreSetting.run('logo_image', HAZEM_DEFAULT_SETTINGS.logo_image);

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM services').get() as { count: number };
  if (serviceCount.count === 0) {
    const insertService = db.prepare(
      'INSERT INTO services (name, description, price, duration_minutes, image_url, is_active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)'
    );
    for (const s of HAZEM_DEFAULT_SERVICES) {
      insertService.run(...s);
    }
  }

  const hoursCount = db.prepare('SELECT COUNT(*) as count FROM business_hours').get() as { count: number };
  if (hoursCount.count === 0) {
    const insertHour = db.prepare(
      'INSERT INTO business_hours (day_of_week, day_name, is_open, open_time, close_time) VALUES (?, ?, ?, ?, ?)'
    );
    for (const h of HAZEM_DEFAULT_HOURS) {
      insertHour.run(...h);
    }
  }

  const oldGalleryRow = db
    .prepare("SELECT id FROM gallery_images WHERE title = 'Salon Hazem Coiff — Salle & Équipement'")
    .get();
  if (oldGalleryRow) {
    db.prepare('DELETE FROM gallery_images').run();
    const insertGallery = db.prepare(
      'INSERT INTO gallery_images (title, category, image_url, sort_order) VALUES (?, ?, ?, ?)'
    );
    for (const g of HAZEM_GALLERY_PHOTOS) {
      insertGallery.run(...g);
    }
  }

  const galleryCount = db.prepare('SELECT COUNT(*) as count FROM gallery_images').get() as { count: number };
  if (galleryCount.count === 0) {
    const insertGallery = db.prepare(
      'INSERT INTO gallery_images (title, category, image_url, sort_order) VALUES (?, ?, ?, ?)'
    );
    for (const g of HAZEM_GALLERY_PHOTOS) {
      insertGallery.run(...g);
    }
  }

  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM shop_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    const insertSetting = db.prepare('INSERT INTO shop_settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(HAZEM_DEFAULT_SETTINGS)) {
      insertSetting.run(k, v);
    }
  }

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get() as { count: number };
  if (adminCount.count === 0) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'hazem123';
    db.prepare('INSERT INTO admin_users (username, password_hash, display_name) VALUES (?, ?, ?)').run(
      username,
      hashPassword(password),
      'Hazem'
    );
  } else {
    const existingAdmin = db
      .prepare("SELECT id, password_hash FROM admin_users WHERE username = 'admin'")
      .get() as { id: number; password_hash: string } | undefined;
    if (existingAdmin && verifyPassword('Valmont2026!', existingAdmin.password_hash)) {
      const targetPassword = process.env.ADMIN_PASSWORD || 'hazem123';
      db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(
        hashPassword(targetPassword),
        existingAdmin.id
      );
    }
  }

  // Clean up old pre-rebrand placeholder appointments (Maison Valmont / Test Client) if present
  const legacyPlaceholder = db
    .prepare("SELECT COUNT(*) as count FROM appointments WHERE reference LIKE 'MV-%'")
    .get() as { count: number };
  if (legacyPlaceholder.count > 0) {
    db.prepare("DELETE FROM appointments WHERE reference LIKE 'MV-%' OR reference = 'HC-261115-1652'").run();
    db.prepare(
      "DELETE FROM customers WHERE phone LIKE '06 %' OR phone LIKE '07 %' OR (first_name = 'Test' AND last_name = 'Client')"
    ).run();
  }

  const apptCount = db.prepare('SELECT COUNT(*) as count FROM appointments').get() as { count: number };
  if (apptCount.count === 0) {
    const yesterday = formatLocalDate(-1);
    const today = formatLocalDate(0);
    const tomorrow = formatLocalDate(1);
    const dayAfter = formatLocalDate(2);
    const inThreeDays = formatLocalDate(3);

    const upsertCustomer = db.prepare(
      'INSERT INTO customers (first_name, last_name, phone) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET first_name = excluded.first_name, last_name = excluded.last_name'
    );
    const getCustomerId = (first: string, last: string, phone: string): number => {
      upsertCustomer.run(first, last, phone);
      const row = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone) as { id: number };
      return row.id;
    };

    const cAhmed = getCustomerId('Ahmed', 'Ben Ali', '25 412 890');
    const cYoussef = getCustomerId('Youssef', 'Trabelsi', '52 719 450');
    const cMehdi = getCustomerId('Mehdi', 'Gharbi', '98 304 621');
    const cBilel = getCustomerId('Bilel', 'Jaziri', '22 891 340');
    const cAmine = getCustomerId('Amine', 'Mansouri', '55 640 218');
    const cSkander = getCustomerId('Skander', 'Bouazizi', '29 514 703');
    const cRami = getCustomerId('Rami', 'Khelifi', '94 128 560');
    const cHamza = getCustomerId('Hamza', 'Mejri', '24 775 912');
    const cOussama = getCustomerId('Oussama', 'Chaabane', '50 932 145');
    const cNizar = getCustomerId('Nizar', 'Haddad', '27 380 614');
    const cFiras = getCustomerId('Firas', 'Belhaj', '97 215 809');
    const cSami = getCustomerId('Sami', 'Tounsi', '58 461 230');

    const insertAppt = db.prepare(`
      INSERT INTO appointments (
        reference, customer_id, service_id, service_name,
        appointment_date, start_time, end_time, duration_minutes, price, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const compact = (d: string) => d.replace(/-/g, '').slice(2);

    // Yesterday (completed / cancelled history)
    insertAppt.run(`HC-${compact(yesterday)}-1012`, cSami, 3, 'Coupe + Barbe', yesterday, '11:00', '12:00', 60, 35, 'completed', 'Client fidèle');
    insertAppt.run(`HC-${compact(yesterday)}-1045`, cFiras, 2, 'Dégradé (Fade)', yesterday, '15:30', '16:10', 40, 25, 'completed', '');
    insertAppt.run(`HC-${compact(yesterday)}-1078`, cNizar, 1, 'Coupe classique', yesterday, '18:00', '18:30', 30, 20, 'cancelled', 'Reporté par le client');

    // Today (busy schedule for Vue d'ensemble & Calendar)
    insertAppt.run(`HC-${compact(today)}-2014`, cAhmed, 3, 'Coupe + Barbe', today, '10:30', '11:30', 60, 35, 'completed', 'Dégradé bas + contour barbe');
    insertAppt.run(`HC-${compact(today)}-2039`, cYoussef, 2, 'Dégradé (Fade)', today, '12:00', '12:40', 40, 25, 'confirmed', '');
    insertAppt.run(`HC-${compact(today)}-2061`, cMehdi, 1, 'Coupe classique', today, '14:30', '15:00', 30, 20, 'confirmed', 'Ciseaux sur le dessus');
    insertAppt.run(`HC-${compact(today)}-2085`, cBilel, 5, 'Rasage traditionnel', today, '16:00', '16:45', 45, 25, 'confirmed', 'Serviette chaude');
    insertAppt.run(`HC-${compact(today)}-2103`, cAmine, 4, 'Taille de barbe', today, '18:00', '18:30', 30, 15, 'pending', 'En attente de confirmation');

    // Tomorrow
    insertAppt.run(`HC-${compact(tomorrow)}-3022`, cSkander, 3, 'Coupe + Barbe', tomorrow, '11:00', '12:00', 60, 35, 'confirmed', 'Coiffure événement');
    insertAppt.run(`HC-${compact(tomorrow)}-3058`, cRami, 2, 'Dégradé (Fade)', tomorrow, '15:00', '15:40', 40, 25, 'confirmed', '');

    // Day +2 & +3
    insertAppt.run(`HC-${compact(dayAfter)}-4019`, cHamza, 1, 'Coupe classique', dayAfter, '13:30', '14:00', 30, 20, 'pending', '');
    insertAppt.run(`HC-${compact(inThreeDays)}-5011`, cOussama, 6, 'Coupe enfant', inThreeDays, '16:30', '17:00', 30, 15, 'confirmed', 'Avec son père');
  }
}
