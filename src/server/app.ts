import 'dotenv/config';
import express from 'express';
import type { NextFunction, Response } from 'express';
import path from 'node:path';
import {
  checkRateLimit,
  clearRateLimit,
  getClientIp,
  requireAdminAuth,
  signAdminToken,
} from './auth.ts';
import type { AuthenticatedRequest } from './auth.ts';
import { isValidDateString } from './availability.ts';
import {
  addDayOffAsync,
  addGalleryAsync,
  addSlotRuleAsync,
  authenticateAdmin,
  computeSlotsForDateAsync,
  createAppointmentAdminAsync,
  createBookingAsync,
  createServiceAsync,
  deleteAppointmentAsync,
  deleteDayOffAsync,
  deleteGalleryAsync,
  deleteServiceAsync,
  deleteSlotRuleAsync,
  getActiveServiceDuration,
  getAdminOverviewAsync,
  getMediaAssetAsync,
  getMonthAvailabilityAsync,
  getPublicBootstrap,
  initDataStore,
  listAdminServicesAsync,
  listAppointmentsAsync,
  listDaysOffAsync,
  listGalleryAsync,
  listSlotRulesAsync,
  saveMediaAssetAsync,
  subscribeSupabaseRealtime,
  updateAdminPasswordAsync,
  updateAppointmentFullAsync,
  updateAppointmentStatusAsync,
  updateGalleryAsync,
  updateHoursAsync,
  updateServiceAsync,
  updateSettingsAsync,
} from './store.ts';
import type { AppointmentStatus, BusinessHour } from '../types/barbershop.ts';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

// Security headers (iframe-safe)
app.use((_req, res, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

let initPromise: Promise<void> | null = null;
let realtimeSubscribed = false;

export async function ensureInitialized(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await initDataStore();
      const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
      if (!isServerless && !realtimeSubscribed) {
        realtimeSubscribed = true;
        subscribeSupabaseRealtime(() => {
          broadcastPublicUpdate('supabase_realtime');
        });
      }
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

function isSafeImageUrl(url: string): boolean {
  if (!url) return true;
  if (url.startsWith('/api/media/') || url.startsWith('/assets/') || url.startsWith('/src/assets/')) {
    return !url.includes('..');
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isSafeExternalUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// ---------------- REAL-TIME LIVE SYNC (SSE) ----------------

const sseClients = new Set<Response>();

export function broadcastPublicUpdate(reason = 'updated'): void {
  const payload = JSON.stringify({ type: 'refresh', reason, ts: Date.now() });
  for (const client of sseClients) {
    try {
      client.write(`data: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

app.get('/api/public/events', (req, res) => {
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  if (isServerless) {
    res.setHeader('Connection', 'close');
    res.flushHeaders?.();
    res.write(
      `retry: 25000\n\ndata: ${JSON.stringify({
        type: 'connected',
        serverless: true,
        ts: Date.now(),
      })}\n\n`
    );
    res.end();
    return;
  }

  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// ---------------- PERSISTENT MEDIA SERVING ----------------

app.get('/api/media/:id', async (req, res) => {
  try {
    await ensureInitialized();
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9._-]/g, '');
    if (!id) {
      res.status(400).end();
      return;
    }
    const asset = await getMediaAssetAsync(id);
    if (!asset) {
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(asset.buffer);
  } catch (error) {
    console.error('Media serve error:', error);
    res.status(500).end();
  }
});

// ---------------- PUBLIC ROUTES ----------------

app.get('/api/public/bootstrap', async (_req, res) => {
  try {
    await ensureInitialized();
    res.setHeader('Cache-Control', 'no-store');
    const data = await getPublicBootstrap();
    res.json(data);
  } catch (error) {
    console.error('Bootstrap error:', error);
    res.status(500).json({ error: 'Impossible de charger les données du salon.' });
  }
});

app.get('/api/availability/month', async (req, res) => {
  try {
    await ensureInitialized();
    res.setHeader('Cache-Control', 'no-store');
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    const serviceId = Number(req.query.serviceId);

    if (!year || !month || month < 1 || month > 12 || !serviceId) {
      res.status(400).json({ error: 'Paramètres de calendrier invalides.' });
      return;
    }

    const duration = await getActiveServiceDuration(serviceId);
    if (!duration) {
      res.status(404).json({ error: 'Prestation introuvable.' });
      return;
    }

    const days = await getMonthAvailabilityAsync(year, month, duration);
    res.json({ days });
  } catch (error) {
    console.error('Month availability error:', error);
    res.status(500).json({ error: 'Erreur lors du calcul des disponibilités.' });
  }
});

app.get('/api/availability/slots', async (req, res) => {
  try {
    await ensureInitialized();
    res.setHeader('Cache-Control', 'no-store');
    const date = String(req.query.date || '');
    const serviceId = Number(req.query.serviceId);

    if (!isValidDateString(date) || !serviceId) {
      res.status(400).json({ error: 'Date ou prestation invalide.' });
      return;
    }

    const duration = await getActiveServiceDuration(serviceId);
    if (!duration) {
      res.status(404).json({ error: 'Prestation introuvable.' });
      return;
    }

    const result = await computeSlotsForDateAsync(date, duration);
    res.json(result);
  } catch (error) {
    console.error('Slots error:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des créneaux.' });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    await ensureInitialized();
    const ip = getClientIp(req);
    const limit = checkRateLimit(`book:${ip}`, 12, 10 * 60 * 1000);
    if (!limit.allowed) {
      res.status(429).json({
        error: 'Trop de réservations envoyées. Veuillez patienter quelques minutes.',
      });
      return;
    }

    const { serviceId, date, startTime, firstName, lastName, phone } = req.body || {};
    const result = await createBookingAsync({
      serviceId: Number(serviceId),
      date: String(date || ''),
      startTime: String(startTime || ''),
      firstName: String(firstName || ''),
      lastName: String(lastName || ''),
      phone: String(phone || ''),
    });

    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    broadcastPublicUpdate('appointment_created');
    res.status(201).json({
      message: 'Votre rendez-vous a été confirmé avec succès ! Merci de votre confiance.',
      appointment: result.appointment,
    });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Erreur lors de l’enregistrement du rendez-vous.' });
  }
});

// ---------------- ADMIN AUTH ----------------

app.post('/api/admin/login', async (req, res) => {
  try {
    await ensureInitialized();
    const ip = getClientIp(req);
    const rateKey = `login:${ip}`;
    const limit = checkRateLimit(rateKey, 8, 15 * 60 * 1000);
    if (!limit.allowed) {
      res.status(429).json({
        error: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.',
      });
      return;
    }

    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      res.status(400).json({ error: 'Veuillez renseigner votre nom et votre mot de passe.' });
      return;
    }

    const admin = await authenticateAdmin(username, password);
    if (!admin) {
      res.status(401).json({ error: 'Nom ou mot de passe incorrect.' });
      return;
    }

    clearRateLimit(rateKey);
    const token = signAdminToken({
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    });

    res.json({
      token,
      user: admin,
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Erreur technique lors de la connexion.' });
  }
});

app.get('/api/admin/me', requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  await ensureInitialized();
  res.json({ user: req.admin });
});

app.post('/api/admin/change-password', requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await ensureInitialized();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!req.admin?.username || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'Veuillez renseigner les mots de passe requis.' });
      return;
    }
    const result = await updateAdminPasswordAsync(
      req.admin.username,
      currentPassword,
      newPassword
    );
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, message: 'Mot de passe mis à jour avec succès.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du mot de passe.' });
  }
});

// ---------------- ADMIN DASHBOARD & MANAGEMENT ----------------

app.get('/api/admin/overview', requireAdminAuth, async (_req, res) => {
  try {
    await ensureInitialized();
    const data = await getAdminOverviewAsync();
    res.json(data);
  } catch (error) {
    console.error('Overview error:', error);
    res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
});

app.get('/api/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const appointments = await listAppointmentsAsync({
      search: String(req.query.search || ''),
      date: String(req.query.date || ''),
      status: String(req.query.status || ''),
    });
    res.json({ appointments });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des rendez-vous.' });
  }
});

app.post('/api/admin/appointments', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const { serviceId, date, startTime, firstName, lastName, phone, status, notes } = req.body || {};
    const result = await createAppointmentAdminAsync({
      serviceId: Number(serviceId),
      date: String(date || ''),
      startTime: String(startTime || ''),
      firstName: String(firstName || ''),
      lastName: String(lastName || ''),
      phone: String(phone || ''),
      status: (status ? String(status) : 'confirmed') as AppointmentStatus,
      notes: String(notes || ''),
    });

    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    broadcastPublicUpdate('appointment_created');
    res.status(201).json({ appointment: result.appointment });
  } catch (error) {
    console.error('Admin create appointment error:', error);
    res.status(500).json({ error: 'Erreur lors de la création du rendez-vous.' });
  }
});

app.patch('/api/admin/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    const status = String(req.body?.status || '') as AppointmentStatus;
    if (!id || !['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      res.status(400).json({ error: 'Statut invalide.' });
      return;
    }

    const updated = await updateAppointmentStatusAsync(id, status);
    if (!updated) {
      res.status(404).json({ error: 'Rendez-vous introuvable.' });
      return;
    }

    broadcastPublicUpdate('appointment_status');
    res.json({ appointment: updated });
  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour du statut.' });
  }
});

app.put('/api/admin/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Identifiant de rendez-vous invalide.' });
      return;
    }

    const { serviceId, date, startTime, firstName, lastName, phone, status, notes } = req.body || {};
    const result = await updateAppointmentFullAsync(id, {
      serviceId: Number(serviceId),
      date: String(date || ''),
      startTime: String(startTime || ''),
      firstName: String(firstName || ''),
      lastName: String(lastName || ''),
      phone: String(phone || ''),
      status: String(status || 'confirmed') as AppointmentStatus,
      notes: String(notes || ''),
    });

    if (!result.ok) {
      res.status(result.statusCode).json({ error: result.error });
      return;
    }

    broadcastPublicUpdate('appointment_updated');
    res.json({ appointment: result.appointment });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Erreur lors de la modification du rendez-vous.' });
  }
});

app.delete('/api/admin/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    const deleted = await deleteAppointmentAsync(id);
    if (!deleted) {
      res.status(404).json({ error: 'Rendez-vous introuvable.' });
      return;
    }
    broadcastPublicUpdate('appointment_deleted');
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Services CRUD
app.get('/api/admin/services', requireAdminAuth, async (_req, res) => {
  try {
    await ensureInitialized();
    const services = await listAdminServicesAsync();
    res.json({ services });
  } catch (error) {
    console.error('List services error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des prestations.' });
  }
});

app.post('/api/admin/services', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const price = Number(req.body?.price);
    const duration = Number(req.body?.duration_minutes);
    const imageUrl =
      String(req.body?.image_url || '').trim() ||
      '/src/assets/images/service_classic_cut_1794507920274.jpg';

    if (!name || !description || Number.isNaN(price) || price <= 0 || Number.isNaN(duration) || duration < 10) {
      res.status(400).json({ error: 'Veuillez fournir un nom, une description, un tarif et une durée valides.' });
      return;
    }
    if (!isSafeImageUrl(imageUrl)) {
      res.status(400).json({ error: 'URL d’image invalide.' });
      return;
    }

    const created = await createServiceAsync({
      name,
      description,
      price,
      duration_minutes: duration,
      image_url: imageUrl,
    });

    broadcastPublicUpdate('service_created');
    res.status(201).json({ service: created });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la prestation.' });
  }
});

app.put('/api/admin/services/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const price = Number(req.body?.price);
    const duration = Number(req.body?.duration_minutes);
    const imageUrl = String(req.body?.image_url || '').trim();
    const isActive = req.body?.is_active === 0 ? 0 : 1;

    if (!id || !name || !description || Number.isNaN(price) || price <= 0 || Number.isNaN(duration) || duration < 10) {
      res.status(400).json({ error: 'Données de prestation invalides.' });
      return;
    }
    if (!isSafeImageUrl(imageUrl)) {
      res.status(400).json({ error: 'URL d’image invalide.' });
      return;
    }

    const updated = await updateServiceAsync(id, {
      name,
      description,
      price,
      duration_minutes: duration,
      image_url: imageUrl,
      is_active: isActive,
    });

    if (!updated) {
      res.status(404).json({ error: 'Prestation introuvable.' });
      return;
    }

    broadcastPublicUpdate('service_updated');
    res.json({ service: updated });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

app.delete('/api/admin/services/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    const result = await deleteServiceAsync(id);
    broadcastPublicUpdate('service_deleted');
    res.json(result);
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Opening hours & slot interval
app.put('/api/admin/hours', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const hours = req.body?.hours as BusinessHour[] | undefined;
    const interval = Number(req.body?.slot_interval_minutes || 30);

    if (!Array.isArray(hours) || hours.length === 0) {
      res.status(400).json({ error: 'Horaires invalides.' });
      return;
    }
    for (const h of hours) {
      if (!/^\d{2}:\d{2}$/.test(h.open_time) || !/^\d{2}:\d{2}$/.test(h.close_time)) {
        res.status(400).json({ error: 'Format horaire invalide.' });
        return;
      }
    }

    const result = await updateHoursAsync(hours, interval);
    broadcastPublicUpdate('hours_updated');
    res.json(result);
  } catch (error) {
    console.error('Hours update error:', error);
    res.status(400).json({ error: 'Impossible de mettre à jour les horaires.' });
  }
});

// Days off
app.get('/api/admin/days-off', requireAdminAuth, async (_req, res) => {
  try {
    await ensureInitialized();
    const daysOff = await listDaysOffAsync();
    res.json({ daysOff });
  } catch (error) {
    console.error('Days off list error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des fermetures.' });
  }
});

app.post('/api/admin/days-off', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const date = String(req.body?.date || '').trim();
    const reason = String(req.body?.reason || 'Fermeture exceptionnelle').trim();

    if (!isValidDateString(date)) {
      res.status(400).json({ error: 'Date invalide.' });
      return;
    }

    const created = await addDayOffAsync(date, reason);
    if (!created) {
      res.status(409).json({ error: 'Cette date est déjà marquée comme fermée.' });
      return;
    }

    broadcastPublicUpdate('day_off_added');
    res.status(201).json({ dayOff: created });
  } catch (error) {
    console.error('Add day off error:', error);
    res.status(500).json({ error: 'Erreur lors de l’ajout.' });
  }
});

app.delete('/api/admin/days-off/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    await deleteDayOffAsync(id);
    broadcastPublicUpdate('day_off_removed');
    res.json({ deleted: true });
  } catch (error) {
    console.error('Remove day off error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Time slot rules
app.get('/api/admin/slot-rules', requireAdminAuth, async (_req, res) => {
  try {
    await ensureInitialized();
    const rules = await listSlotRulesAsync();
    res.json({ rules });
  } catch (error) {
    console.error('Slot rules error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement des règles.' });
  }
});

app.post('/api/admin/slot-rules', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const scope = req.body?.scope === 'date' ? 'date' : 'global';
    const targetDate = scope === 'date' ? String(req.body?.target_date || '').trim() : null;
    const slotTime = String(req.body?.slot_time || '').trim();
    const ruleType = req.body?.rule_type === 'block' ? 'block' : 'add';
    const label = String(req.body?.label || '').trim();

    if (!/^\d{2}:\d{2}$/.test(slotTime)) {
      res.status(400).json({ error: 'Format horaire invalide (HH:MM).' });
      return;
    }
    if (scope === 'date' && (!targetDate || !isValidDateString(targetDate))) {
      res.status(400).json({ error: 'Date cible invalide.' });
      return;
    }

    const created = await addSlotRuleAsync({
      scope,
      target_date: targetDate,
      slot_time: slotTime,
      rule_type: ruleType,
      label,
    });
    broadcastPublicUpdate('slot_rule_added');
    res.status(201).json({ rule: created });
  } catch (error) {
    console.error('Add slot rule error:', error);
    res.status(500).json({ error: 'Erreur lors de l’ajout.' });
  }
});

app.delete('/api/admin/slot-rules/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    await deleteSlotRuleAsync(id);
    broadcastPublicUpdate('slot_rule_removed');
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete slot rule error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Gallery management
app.get('/api/admin/gallery', requireAdminAuth, async (_req, res) => {
  try {
    await ensureInitialized();
    const gallery = await listGalleryAsync();
    res.json({ gallery });
  } catch (error) {
    console.error('Gallery list error:', error);
    res.status(500).json({ error: 'Erreur lors du chargement de la galerie.' });
  }
});

app.post('/api/admin/gallery', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'Coupes').trim();
    const imageUrl = String(req.body?.image_url || '').trim();

    if (!title || !imageUrl || !isSafeImageUrl(imageUrl)) {
      res.status(400).json({ error: 'Titre et URL de l’image valides requis.' });
      return;
    }

    const created = await addGalleryAsync({ title, category, image_url: imageUrl });
    broadcastPublicUpdate('gallery_added');
    res.status(201).json({ image: created });
  } catch (error) {
    console.error('Add gallery error:', error);
    res.status(500).json({ error: 'Erreur lors de l’ajout à la galerie.' });
  }
});

app.put('/api/admin/gallery/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'Coupes').trim();
    const imageUrl = String(req.body?.image_url || '').trim();

    if (!id || !title || !imageUrl || !isSafeImageUrl(imageUrl)) {
      res.status(400).json({ error: 'Titre et image valides requis.' });
      return;
    }

    const updated = await updateGalleryAsync(id, { title, category, image_url: imageUrl });
    if (!updated) {
      res.status(404).json({ error: 'Image introuvable.' });
      return;
    }

    broadcastPublicUpdate('gallery_updated');
    res.json({ image: updated });
  } catch (error) {
    console.error('Update gallery error:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour.' });
  }
});

app.delete('/api/admin/gallery/:id', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const id = Number(req.params.id);
    await deleteGalleryAsync(id);
    broadcastPublicUpdate('gallery_deleted');
    res.json({ deleted: true });
  } catch (error) {
    console.error('Delete gallery error:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression.' });
  }
});

// Persistent Image File Upload (stored in Supabase/SQLite media_assets -> /api/media/:id)
app.post('/api/admin/upload', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const filename = String(req.body?.filename || 'image.png');
    const dataUrl = String(req.body?.dataUrl || '');

    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({
        error: 'Format d’image non supporté. Utilisez PNG, JPG, WEBP ou GIF.',
      });
      return;
    }

    const mimeType = match[1];
    const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1];
    const base64Data = match[2];
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      res.status(400).json({ error: 'L’image dépasse la taille maximale de 8 Mo.' });
      return;
    }

    const baseName =
      path
        .basename(filename, path.extname(filename))
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'photo';

    const assetId = `${Date.now()}-${baseName}.${ext}`;
    const url = await saveMediaAssetAsync(assetId, filename, mimeType, base64Data);

    res.status(201).json({ url });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Impossible d’enregistrer le fichier image.' });
  }
});

// Contact & Shop settings
app.put('/api/admin/settings', requireAdminAuth, async (req, res) => {
  try {
    await ensureInitialized();
    const allowedKeys = [
      'shop_name',
      'tagline',
      'address',
      'city',
      'phone',
      'email',
      'instagram_url',
      'facebook_url',
      'barber_name',
      'barber_role',
      'about_title',
      'about_bio',
      'hero_image',
      'about_image',
      'logo_image',
    ];

    const payload = req.body || {};
    const updates: Array<{ key: string; value: string }> = [];
    for (const key of allowedKeys) {
      if (typeof payload[key] === 'string') {
        const val = payload[key].trim();
        if ((key === 'instagram_url' || key === 'facebook_url') && !isSafeExternalUrl(val)) {
          res.status(400).json({ error: 'URL de réseau social invalide (https:// requis).' });
          return;
        }
        if ((key === 'hero_image' || key === 'about_image' || key === 'logo_image') && !isSafeImageUrl(val)) {
          res.status(400).json({ error: 'URL d’image invalide.' });
          return;
        }
        updates.push({ key, value: val });
      }
    }

    const settings = await updateSettingsAsync(updates);
    broadcastPublicUpdate('settings_updated');
    res.json({ settings });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Erreur lors de l’enregistrement des paramètres.' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API introuvable.' });
});
