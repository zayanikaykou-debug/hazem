import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Image as ImageIcon,
  LayoutDashboard,
  List,
  Lock,
  LogOut,
  Plus,
  Scissors,
  Search,
  Settings,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AdminOverviewStats,
  AppointmentRecord,
  AppointmentStatus,
  BusinessHour,
  DayOff,
  GalleryImage,
  ServiceItem,
  ShopSettings,
  TimeSlotRule,
} from '../types/barbershop';
import {
  addDayOff,
  addGalleryImage,
  addSlotRule,
  changeAdminPassword,
  createService,
  deleteAdminAppointment,
  deleteService,
  fetchAdminAppointments,
  fetchAdminGallery,
  fetchAdminOverview,
  fetchAdminServices,
  fetchDaysOff,
  fetchSlotRules,
  formatPriceFr,
  formatShortDateFr,
  getStoredAdminToken,
  loginAdmin,
  removeDayOff,
  removeGalleryImage,
  removeSlotRule,
  setStoredAdminToken,
  updateAdminAppointment,
  updateAppointmentStatus,
  updateBusinessHours,
  updateGalleryImage,
  updateService,
  updateShopSettings,
  uploadAdminImage,
  verifyAdminSession,
} from '../lib/api';
import { PRESET_IMAGE_OPTIONS } from '../lib/images';
import { BarberImage } from './BarberImage';
import { ManualAppointmentModal } from './admin/ManualAppointmentModal';
import { AppointmentsCalendarView } from './admin/AppointmentsCalendarView';

interface AdminDashboardProps {
  initialHours: BusinessHour[];
  initialSettings: ShopSettings;
  onExitAdmin: () => void;
  onDataMutated: () => void;
}

type AdminTab = 'overview' | 'appointments' | 'services' | 'schedule' | 'gallery' | 'settings';

const EASE_LUXE = [0.22, 1, 0.36, 1] as const;

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pending: 'text-amber-200 border-amber-500/35 bg-amber-950/40',
  confirmed: 'text-emerald-200 border-emerald-500/35 bg-emerald-950/40',
  completed: 'text-[#CFCFD3] border-[#CFCFD3]/35 bg-white/5',
  cancelled: 'text-red-200 border-red-500/35 bg-red-950/40',
};

export function AdminDashboard({
  initialHours,
  initialSettings,
  onExitAdmin,
  onDataMutated,
}: AdminDashboardProps) {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());
  const [checkingAuth, setCheckingAuth] = useState(Boolean(getStoredAdminToken()));
  const [adminUser, setAdminUser] = useState<{ username: string; displayName: string } | null>(
    null
  );
  const justLoggedInTokenRef = useRef<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [overview, setOverview] = useState<AdminOverviewStats | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [appointmentsView, setAppointmentsView] = useState<'calendar' | 'list'>('calendar');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualPrefill, setManualPrefill] = useState<{ date?: string; time?: string }>({});

  const [editingAppointment, setEditingAppointment] = useState<{
    id: number;
    reference: string;
    serviceId: number;
    date: string;
    startTime: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: AppointmentStatus;
    notes: string;
  } | null>(null);
  const [confirmDeleteApptId, setConfirmDeleteApptId] = useState<number | null>(null);

  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [newService, setNewService] = useState({
    name: '',
    description: '',
    price: 25,
    duration_minutes: 30,
    image_url: PRESET_IMAGE_OPTIONS[0].value,
  });
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const [hours, setHours] = useState<BusinessHour[]>(initialHours);
  const [slotInterval, setSlotInterval] = useState<number>(
    Number(initialSettings.slot_interval_minutes || 30)
  );
  const [daysOff, setDaysOff] = useState<DayOff[]>([]);
  const [newDayOffDate, setNewDayOffDate] = useState('');
  const [newDayOffReason, setNewDayOffReason] = useState('Fermeture exceptionnelle');

  const [slotRules, setSlotRules] = useState<TimeSlotRule[]>([]);
  const [newRuleScope, setNewRuleScope] = useState<'global' | 'date'>('global');
  const [newRuleDate, setNewRuleDate] = useState('');
  const [newRuleTime, setNewRuleTime] = useState('13:00');
  const [newRuleType, setNewRuleType] = useState<'add' | 'block'>('block');
  const [newRuleLabel, setNewRuleLabel] = useState('Pause déjeuner');

  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [newGalleryTitle, setNewGalleryTitle] = useState('');
  const [newGalleryCat, setNewGalleryCat] = useState('Coupes');
  const [newGalleryUrl, setNewGalleryUrl] = useState<string>(PRESET_IMAGE_OPTIONS[0].value);

  const [settingsForm, setSettingsForm] = useState<ShopSettings>(initialSettings);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    setHours(initialHours);
    setSettingsForm(initialSettings);
    setSlotInterval(Number(initialSettings.slot_interval_minutes || 30));
  }, [initialHours, initialSettings]);

  useEffect(() => {
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    if (justLoggedInTokenRef.current === token) {
      justLoggedInTokenRef.current = null;
      setCheckingAuth(false);
      return;
    }
    setCheckingAuth(true);
    verifyAdminSession(token)
      .then((res) => {
        setAdminUser(res.user);
      })
      .catch((err: unknown) => {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          setStoredAdminToken(null);
          setToken(null);
          setAdminUser(null);
          setLoginError('Session expirée. Veuillez vous reconnecter.');
        } else {
          // Transient error: clear stored token cleanly with message
          setStoredAdminToken(null);
          setToken(null);
          setAdminUser(null);
        }
      })
      .finally(() => {
        setCheckingAuth(false);
      });
  }, [token]);

  const loadAllAdminData = useCallback(async () => {
    if (!token || !adminUser) return;
    try {
      const [ov, appts, svcs, dOff, rules, gal] = await Promise.all([
        fetchAdminOverview(token),
        fetchAdminAppointments(token, {}),
        fetchAdminServices(token),
        fetchDaysOff(token),
        fetchSlotRules(token),
        fetchAdminGallery(token),
      ]);
      setOverview(ov);
      setAppointments(appts.appointments);
      setServices(svcs.services);
      setDaysOff(dOff.daysOff);
      setSlotRules(rules.rules);
      setGallery(gal.gallery);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 401) {
        setStoredAdminToken(null);
        setToken(null);
        setAdminUser(null);
        setLoginError('Session expirée ou invalide. Veuillez vous reconnecter.');
      } else {
        console.error('Failed loading admin data:', err);
      }
    }
  }, [token, adminUser]);

  useEffect(() => {
    loadAllAdminData();
  }, [loadAllAdminData]);

  useEffect(() => {
    const handleSync = () => {
      loadAllAdminData();
    };
    window.addEventListener('hazem:sync', handleSync);
    return () => window.removeEventListener('hazem:sync', handleSync);
  }, [loadAllAdminData]);

  const toMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return -1;
    return h * 60 + m;
  };

  const matchesTimeOverlap = (appt: AppointmentRecord, qTime: string): boolean => {
    if (!qTime) return true;
    const qMin = toMinutes(qTime);
    const sMin = toMinutes(appt.start_time);
    const eMin = toMinutes(appt.end_time);
    if (qMin < 0 || sMin < 0 || eMin < 0) {
      return appt.start_time.startsWith(qTime);
    }
    return qMin >= sMin && qMin < eMin;
  };

  const calendarAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((appt) => {
      if (statusFilter && appt.status !== statusFilter) return false;
      if (q) {
        const fullName = `${appt.first_name} ${appt.last_name}`.toLowerCase();
        const hit =
          appt.first_name.toLowerCase().includes(q) ||
          appt.last_name.toLowerCase().includes(q) ||
          fullName.includes(q) ||
          appt.phone.toLowerCase().includes(q) ||
          appt.reference.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [appointments, searchQuery, statusFilter]);

  const filteredAppointments = useMemo(() => {
    return calendarAppointments.filter((appt) => {
      if (dateFilter && appt.appointment_date !== dateFilter) return false;
      if (timeFilter && !matchesTimeOverlap(appt, timeFilter)) return false;
      return true;
    });
  }, [calendarAppointments, dateFilter, timeFilter]);

  const timeCheckDate = dateFilter || selectedCalendarDate;

  const timeCheckStatus = useMemo(() => {
    if (!timeFilter) return null;
    const activeOnDate = appointments.filter(
      (a) => a.appointment_date === timeCheckDate && a.status !== 'cancelled'
    );
    const blockingAppt = activeOnDate.find((a) => matchesTimeOverlap(a, timeFilter)) || null;
    const dayOffEntry = daysOff.find((d) => d.date === timeCheckDate) || null;
    const [y, m, d] = timeCheckDate.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const dayHours = hours.find((h) => h.day_of_week === weekday) || null;
    const qMin = toMinutes(timeFilter);
    const outsideHours =
      !dayHours ||
      dayHours.is_open === 0 ||
      qMin < toMinutes(dayHours.open_time) ||
      qMin >= toMinutes(dayHours.close_time);

    const allDatesWithTime = appointments.filter(
      (a) => a.status !== 'cancelled' && matchesTimeOverlap(a, timeFilter)
    );

    return {
      date: timeCheckDate,
      time: timeFilter,
      blockingAppt,
      dayOffEntry,
      outsideHours,
      dayHours,
      allDatesWithTimeCount: allDatesWithTime.length,
    };
  }, [appointments, daysOff, hours, timeCheckDate, timeFilter]);

  const openManualModal = (prefillDate?: string, prefillTime?: string) => {
    setManualPrefill({
      date: prefillDate || selectedCalendarDate,
      time: prefillTime || (timeFilter || '14:00'),
    });
    setManualModalOpen(true);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await loginAdmin(username.trim(), password);
      justLoggedInTokenRef.current = res.token;
      setStoredAdminToken(res.token);
      setAdminUser(res.user);
      setToken(res.token);
      setPassword('');
    } catch (err: unknown) {
      const errorObj = err as Error;
      setLoginError(errorObj.message || 'Échec de connexion.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setStoredAdminToken(null);
    setToken(null);
    setAdminUser(null);
  };

  const handleStatusChange = async (id: number, status: AppointmentStatus) => {
    if (!token) return;
    try {
      await updateAppointmentStatus(token, id, status);
      showToast('success', `Rendez-vous marqué comme « ${STATUS_LABELS[status]} ».`);
      await loadAllAdminData();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleSaveAppointmentEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingAppointment) return;
    try {
      await updateAdminAppointment(token, editingAppointment.id, {
        serviceId: editingAppointment.serviceId,
        date: editingAppointment.date,
        startTime: editingAppointment.startTime,
        firstName: editingAppointment.firstName,
        lastName: editingAppointment.lastName,
        phone: editingAppointment.phone,
        status: editingAppointment.status,
        notes: editingAppointment.notes,
      });
      setEditingAppointment(null);
      showToast('success', 'Rendez-vous modifié avec succès.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleDeleteAppointment = async (id: number) => {
    if (!token) return;
    try {
      await deleteAdminAppointment(token, id);
      setConfirmDeleteApptId(null);
      showToast('success', 'Rendez-vous supprimé.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleFileUpload = async (
    key: string,
    file: File | undefined,
    onSuccess: (url: string) => Promise<void> | void
  ) => {
    if (!token || !file) return;
    setUploadingKey(key);
    try {
      const res = await uploadAdminImage(token, file);
      await onSuccess(res.url);
    } catch (err: unknown) {
      showToast('error', (err as Error).message || 'Échec de l’envoi du fichier.');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await createService(token, newService);
      setShowNewServiceForm(false);
      setNewService({
        name: '',
        description: '',
        price: 35,
        duration_minutes: 30,
        image_url: PRESET_IMAGE_OPTIONS[1].value,
      });
      showToast('success', 'Nouvelle prestation ajoutée.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleSaveServiceEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingService) return;
    try {
      await updateService(token, editingService.id, editingService);
      setEditingService(null);
      showToast('success', 'Prestation mise à jour.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!token) return;
    try {
      const res = await deleteService(token, id);
      showToast(
        'success',
        res.archived
          ? 'Prestation archivée (des rendez-vous historiques y sont liés).'
          : 'Prestation supprimée.'
      );
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleSaveHours = async () => {
    if (!token) return;
    try {
      await updateBusinessHours(token, hours, slotInterval);
      showToast('success', 'Horaires d’ouverture enregistrés.');
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleAddDayOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newDayOffDate) return;
    try {
      await addDayOff(token, newDayOffDate, newDayOffReason);
      setNewDayOffDate('');
      showToast('success', 'Jour de fermeture ajouté.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleRemoveDayOff = async (id: number) => {
    if (!token) return;
    await removeDayOff(token, id);
    showToast('success', 'Jour de fermeture retiré.');
    await loadAllAdminData();
    onDataMutated();
  };

  const handleAddSlotRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await addSlotRule(token, {
        scope: newRuleScope,
        target_date: newRuleScope === 'date' ? newRuleDate : null,
        slot_time: newRuleTime,
        rule_type: newRuleType,
        label: newRuleLabel,
      });
      showToast(
        'success',
        newRuleType === 'add' ? 'Créneau supplémentaire ajouté.' : 'Créneau bloqué.'
      );
      await loadAllAdminData();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleRemoveSlotRule = async (id: number) => {
    if (!token) return;
    await removeSlotRule(token, id);
    showToast('success', 'Règle de créneau supprimée.');
    await loadAllAdminData();
  };

  const handleAddGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await addGalleryImage(token, {
        title: newGalleryTitle,
        category: newGalleryCat,
        image_url: newGalleryUrl,
      });
      setNewGalleryTitle('');
      showToast('success', 'Image ajoutée à la galerie.');
      await loadAllAdminData();
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleDeleteGallery = async (id: number) => {
    if (!token) return;
    await removeGalleryImage(token, id);
    showToast('success', 'Image retirée de la galerie.');
    await loadAllAdminData();
    onDataMutated();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await updateShopSettings(token, settingsForm);
      showToast('success', 'Informations du salon mises à jour.');
      onDataMutated();
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingPwd(true);
    try {
      const res = await changeAdminPassword(token, currentPwd, newPwd);
      setCurrentPwd('');
      setNewPwd('');
      showToast('success', res.message || 'Mot de passe mis à jour.');
    } catch (err: unknown) {
      showToast('error', (err as Error).message);
    } finally {
      setSavingPwd(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#000000] flex items-center justify-center p-4">
        <p className="text-sm text-[#8C8889]">Vérification de la session administrateur...</p>
      </div>
    );
  }

  if (!token || !adminUser) {
    return (
      <div className="min-h-screen bg-[#000000] flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_LUXE }}
          className="w-full max-w-md bg-[#0D0D0F] border border-[#8C8889]/25 rounded-xl p-8"
        >
          <button
            type="button"
            onClick={onExitAdmin}
            className="inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour au site public</span>
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[#FFFFFF]/10 border border-[#CFCFD3]/30 flex items-center justify-center text-[#FFFFFF]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-[#8C8889]">Espace Barbier</p>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[#FFFFFF]">
                Connexion sécurisée
              </h1>
            </div>
          </div>
          <p className="text-sm text-[#8C8889] mb-6">
            Accédez à la gestion des rendez-vous, des prestations et des horaires du salon.
          </p>

          {loginError && (
            <div className="mb-4 p-3.5 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-username" className="block text-xs font-medium text-[#CFCFD3] mb-1.5">
                Nom
              </label>
              <input
                id="admin-username"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded-lg text-sm text-[#FFFFFF] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label htmlFor="admin-password" className="block text-xs font-medium text-[#CFCFD3] mb-1.5">
                Mot de passe
              </label>
              <input
                id="admin-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded-lg text-sm text-[#FFFFFF] focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] disabled:opacity-60 rounded-lg transition-colors duration-200 cursor-pointer"
            >
              {loggingIn ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  const NAV_ITEMS: Array<{ id: AdminTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
    { id: 'appointments', label: 'Rendez-vous', icon: Calendar },
    { id: 'services', label: 'Prestations', icon: Scissors },
    { id: 'schedule', label: 'Horaires & Créneaux', icon: Clock },
    { id: 'gallery', label: 'Photos & Galerie', icon: ImageIcon },
    { id: 'settings', label: 'Paramètres', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-[#09090A] border-b lg:border-b-0 lg:border-r border-[#8C8889]/20 flex flex-col shrink-0">
        <div className="p-5 border-b border-[#8C8889]/20 flex items-center justify-between lg:block">
          <div>
            <p className="font-[family-name:var(--font-display)] italic text-xl font-semibold text-[#FFFFFF]">
              {settingsForm.shop_name}
            </p>
            <p className="text-xs text-[#8C8889] mt-0.5">Espace Gestion</p>
          </div>
          <button
            type="button"
            onClick={onExitAdmin}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#CFCFD3] border border-[#8C8889]/30 rounded cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Site</span>
          </button>
        </div>

        <nav className="p-3 flex lg:flex-col gap-1 overflow-x-auto flex-1" aria-label="Menu administration">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#FFFFFF] text-[#000000] font-semibold'
                    : 'text-[#8C8889] hover:text-[#FFFFFF] hover:bg-white/[0.04]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden lg:block p-4 border-t border-[#8C8889]/20 space-y-2">
          <p className="text-xs text-[#8C8889] px-1">
            Connecté : <span className="text-[#FFFFFF]">{adminUser.displayName}</span>
          </p>
          <button
            type="button"
            onClick={onExitAdmin}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#FFFFFF] bg-[#141416] hover:bg-[#1E1E22] border border-[#8C8889]/25 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voir le site public</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-red-300 hover:bg-red-950/30 border border-[#8C8889]/25 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-6xl">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: EASE_LUXE }}
              role="status"
              className={`mb-6 p-4 rounded-lg border text-sm flex items-center justify-between gap-4 ${
                toast.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/50 border-red-500/40 text-red-200'
              }`}
            >
              <span>{toast.text}</span>
              <button type="button" onClick={() => setToast(null)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE_LUXE }}
          >
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                      Vue d’ensemble
                    </h1>
                    <p className="text-sm text-[#8C8889] mt-1">
                      Activité du salon au {overview ? formatShortDateFr(overview.todayDate) : 'jour'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openManualModal()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Nouveau client / RDV</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('appointments')}
                      className="px-4 py-2 text-xs font-medium text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/30 rounded transition-colors cursor-pointer"
                    >
                      Voir le calendrier
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg">
                    <p className="text-xs text-[#8C8889] mb-2">Rendez-vous aujourd’hui</p>
                    <p className="font-[family-name:var(--font-mono)] text-3xl font-semibold text-[#FFFFFF] tabular-nums">
                      {overview?.todayCount ?? 0}
                    </p>
                  </div>
                  <div className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg">
                    <p className="text-xs text-[#8C8889] mb-2">Rendez-vous à venir</p>
                    <p className="font-[family-name:var(--font-mono)] text-3xl font-semibold text-[#CFCFD3] tabular-nums">
                      {overview?.upcomingCount ?? 0}
                    </p>
                  </div>
                  <div className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg">
                    <p className="text-xs text-[#8C8889] mb-2">Total des réservations</p>
                    <p className="font-[family-name:var(--font-mono)] text-3xl font-semibold text-[#CFCFD3] tabular-nums">
                      {overview?.totalBookings ?? 0}
                    </p>
                  </div>
                  <div className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg">
                    <p className="text-xs text-[#8C8889] mb-2">Clients enregistrés</p>
                    <p className="font-[family-name:var(--font-mono)] text-3xl font-semibold text-[#CFCFD3] tabular-nums">
                      {overview?.totalCustomers ?? 0}
                    </p>
                  </div>
                </div>

                <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#8C8889]/20 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-[#FFFFFF]">Programme du jour</h2>
                    <span className="text-xs font-[family-name:var(--font-mono)] text-[#CFCFD3] tabular-nums">
                      CA validé : {formatPriceFr(overview?.confirmedRevenue ?? 0)}
                    </span>
                  </div>

                  {!overview || overview.todayAppointments.length === 0 ? (
                    <div className="p-8 text-center text-sm text-[#8C8889]">
                      Aucun rendez-vous prévu pour aujourd’hui.
                    </div>
                  ) : (
                    <div className="divide-y divide-[#8C8889]/20">
                      {overview.todayAppointments.map((appt) => (
                        <div
                          key={appt.id}
                          className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                        >
                          <div className="flex items-start sm:items-center gap-4">
                            <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#FFFFFF] tabular-nums">
                              {appt.start_time}
                            </span>
                            <div>
                              <p className="text-sm font-semibold text-[#FFFFFF]">
                                {appt.first_name} {appt.last_name}
                              </p>
                              <p className="text-xs text-[#8C8889] tabular-nums">
                                {appt.service_name} · {appt.phone} · {formatPriceFr(appt.price)}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2.5 py-1 text-xs font-medium border rounded ${
                                STATUS_STYLES[appt.status]
                              }`}
                            >
                              {STATUS_LABELS[appt.status]}
                            </span>
                            {appt.status !== 'completed' && appt.status !== 'cancelled' && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(appt.id, 'completed')}
                                className="px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-[#FFFFFF] hover:text-[#000000] rounded cursor-pointer transition-colors"
                              >
                                Terminer
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: APPOINTMENTS MANAGEMENT */}
            {activeTab === 'appointments' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                      Gestion des rendez-vous
                    </h1>
                    <p className="text-sm text-[#8C8889] mt-1">
                      Consultez le calendrier, vérifiez si une heure est prise ou ajoutez un client manuellement.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="inline-flex rounded-lg bg-[#0D0D0F] border border-[#8C8889]/25 p-1">
                      <button
                        type="button"
                        onClick={() => setAppointmentsView('calendar')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          appointmentsView === 'calendar'
                            ? 'bg-[#FFFFFF] text-[#000000] font-semibold'
                            : 'text-[#8C8889] hover:text-[#FFFFFF]'
                        }`}
                      >
                        <CalendarDays className="w-3.5 h-3.5" />
                        <span>Calendrier</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAppointmentsView('list')}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          appointmentsView === 'list'
                            ? 'bg-[#FFFFFF] text-[#000000] font-semibold'
                            : 'text-[#8C8889] hover:text-[#FFFFFF]'
                        }`}
                      >
                        <List className="w-3.5 h-3.5" />
                        <span>Liste</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openManualModal()}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Ajouter un client</span>
                    </button>
                  </div>
                </div>

                {/* Search + Date + Time Check + Status Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-4">
                  <div className="lg:col-span-4 relative">
                    <Search className="w-4 h-4 text-[#8C8889] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher nom, téléphone, réf..."
                      className="w-full pl-10 pr-4 py-2.5 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <input
                      type="date"
                      value={dateFilter}
                      onChange={(e) => {
                        setDateFilter(e.target.value);
                        if (e.target.value) setSelectedCalendarDate(e.target.value);
                      }}
                      aria-label="Filtrer par date"
                      className="w-full px-3 py-2.5 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                    />
                  </div>

                  <div className="lg:col-span-2 relative">
                    <Clock className="w-4 h-4 text-[#8C8889] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="time"
                      value={timeFilter}
                      onChange={(e) => setTimeFilter(e.target.value)}
                      aria-label="Vérifier ou rechercher une heure"
                      title="Vérifier si une heure est déjà prise"
                      className="w-full pl-9 pr-2 py-2.5 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm font-mono text-[#FFFFFF] focus:outline-none"
                    />
                  </div>

                  <div className="lg:col-span-3 flex gap-2">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label="Filtrer par statut"
                      className="flex-1 px-3 py-2.5 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                    >
                      <option value="">Tous les statuts</option>
                      <option value="confirmed">Confirmé</option>
                      <option value="pending">En attente</option>
                      <option value="completed">Terminé</option>
                      <option value="cancelled">Annulé</option>
                    </select>
                    {(searchQuery || dateFilter || timeFilter || statusFilter) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setDateFilter('');
                          setTimeFilter('');
                          setStatusFilter('');
                        }}
                        className="px-3 py-2.5 bg-[#161619] border border-[#8C8889]/25 rounded text-xs text-[#CFCFD3] hover:text-[#FFFFFF] cursor-pointer"
                      >
                        Effacer
                      </button>
                    )}
                  </div>
                </div>

                {/* Instant Time Availability Result Banner */}
                {timeCheckStatus && (
                  <div
                    className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                      timeCheckStatus.blockingAppt
                        ? 'bg-red-950/35 border-red-500/40 text-red-100'
                        : timeCheckStatus.dayOffEntry || timeCheckStatus.outsideHours
                          ? 'bg-amber-950/35 border-amber-500/40 text-amber-100'
                          : 'bg-emerald-950/35 border-emerald-500/40 text-emerald-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {timeCheckStatus.blockingAppt ? (
                        <AlertCircle className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
                      ) : timeCheckStatus.dayOffEntry || timeCheckStatus.outsideHours ? (
                        <AlertCircle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0 mt-0.5" />
                      )}
                      <div>
                        {timeCheckStatus.blockingAppt ? (
                          <>
                            <p className="text-sm font-semibold">
                              Heure déjà prise à {timeCheckStatus.time} le{' '}
                              {formatShortDateFr(timeCheckStatus.date)}
                            </p>
                            <p className="text-xs opacity-90 mt-0.5">
                              Client :{' '}
                              <span className="font-semibold">
                                {timeCheckStatus.blockingAppt.first_name}{' '}
                                {timeCheckStatus.blockingAppt.last_name}
                              </span>{' '}
                              ({timeCheckStatus.blockingAppt.phone}) ·{' '}
                              {timeCheckStatus.blockingAppt.service_name} de{' '}
                              <span className="font-mono">
                                {timeCheckStatus.blockingAppt.start_time} à{' '}
                                {timeCheckStatus.blockingAppt.end_time}
                              </span>
                            </p>
                          </>
                        ) : timeCheckStatus.dayOffEntry ? (
                          <>
                            <p className="text-sm font-semibold">
                              Jour de fermeture le {formatShortDateFr(timeCheckStatus.date)}
                            </p>
                            <p className="text-xs opacity-90 mt-0.5">
                              Motif : {timeCheckStatus.dayOffEntry.reason}. Aucun client à{' '}
                              {timeCheckStatus.time}.
                            </p>
                          </>
                        ) : timeCheckStatus.outsideHours ? (
                          <>
                            <p className="text-sm font-semibold">
                              Aucun client à {timeCheckStatus.time} le{' '}
                              {formatShortDateFr(timeCheckStatus.date)} (hors horaires d’ouverture)
                            </p>
                            <p className="text-xs opacity-90 mt-0.5">
                              {timeCheckStatus.dayHours && timeCheckStatus.dayHours.is_open === 1
                                ? `Ouvert de ${timeCheckStatus.dayHours.open_time} à ${timeCheckStatus.dayHours.close_time}.`
                                : 'Salon habituellement fermé ce jour-là.'}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold">
                              Créneau libre à {timeCheckStatus.time} le{' '}
                              {formatShortDateFr(timeCheckStatus.date)}
                            </p>
                            <p className="text-xs opacity-90 mt-0.5">
                              Aucun rendez-vous prévu à cette heure.{' '}
                              {timeCheckStatus.allDatesWithTimeCount > 0 &&
                                `(${timeCheckStatus.allDatesWithTimeCount} autre(s) RDV à ${timeCheckStatus.time} sur d'autres dates)`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {timeCheckStatus.blockingAppt ? (
                        <button
                          type="button"
                          onClick={() => {
                            const appt = timeCheckStatus.blockingAppt!;
                            setEditingAppointment({
                              id: appt.id,
                              reference: appt.reference,
                              serviceId: appt.service_id,
                              date: appt.appointment_date,
                              startTime: appt.start_time,
                              firstName: appt.first_name,
                              lastName: appt.last_name,
                              phone: appt.phone,
                              status: appt.status,
                              notes: appt.notes || '',
                            });
                          }}
                          className="px-3.5 py-1.5 text-xs font-semibold bg-[#FFFFFF] text-[#000000] rounded cursor-pointer hover:bg-[#CFCFD3]"
                        >
                          Modifier ce RDV
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            openManualModal(timeCheckStatus.date, timeCheckStatus.time)
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#FFFFFF] text-[#000000] rounded cursor-pointer hover:bg-[#CFCFD3]"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Réserver {timeCheckStatus.time}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {appointmentsView === 'calendar' ? (
                  <AppointmentsCalendarView
                    appointments={calendarAppointments}
                    daysOff={daysOff}
                    hours={hours}
                    selectedDate={selectedCalendarDate}
                    onSelectDate={(d) => {
                      setSelectedCalendarDate(d);
                      if (dateFilter) setDateFilter(d);
                    }}
                    timeCheckQuery={timeFilter}
                    onAddAtDateTime={(d, t) => openManualModal(d, t)}
                    onEdit={(appt) =>
                      setEditingAppointment({
                        id: appt.id,
                        reference: appt.reference,
                        serviceId: appt.service_id,
                        date: appt.appointment_date,
                        startTime: appt.start_time,
                        firstName: appt.first_name,
                        lastName: appt.last_name,
                        phone: appt.phone,
                        status: appt.status,
                        notes: appt.notes || '',
                      })
                    }
                    onStatusChange={handleStatusChange}
                    onDelete={handleDeleteAppointment}
                    confirmDeleteId={confirmDeleteApptId}
                    setConfirmDeleteId={setConfirmDeleteApptId}
                  />
                ) : (
                  <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg overflow-x-auto">
                    {filteredAppointments.length === 0 ? (
                      <div className="p-10 text-center text-sm text-[#8C8889]">
                        Aucun rendez-vous ne correspond à votre recherche.
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse min-w-[780px]">
                        <thead>
                          <tr className="border-b border-[#8C8889]/20 text-xs text-[#8C8889] bg-[#08080A]">
                            <th className="py-3.5 px-4 font-medium">Référence</th>
                            <th className="py-3.5 px-4 font-medium">Client</th>
                            <th className="py-3.5 px-4 font-medium">Prestation</th>
                            <th className="py-3.5 px-4 font-medium">Date & Heure</th>
                            <th className="py-3.5 px-4 font-medium text-right">Tarif</th>
                            <th className="py-3.5 px-4 font-medium">Statut</th>
                            <th className="py-3.5 px-4 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#8C8889]/15 text-sm">
                          {filteredAppointments.map((appt) => (
                            <tr key={appt.id} className="hover:bg-white/[0.02] transition-colors">
                              <td className="py-3.5 px-4 font-[family-name:var(--font-mono)] text-xs text-[#CFCFD3] tabular-nums">
                                {appt.reference}
                              </td>
                              <td className="py-3.5 px-4">
                                <p className="font-medium text-[#FFFFFF]">
                                  {appt.first_name} {appt.last_name}
                                </p>
                                <p className="font-[family-name:var(--font-mono)] text-xs text-[#8C8889] tabular-nums">
                                  {appt.phone}
                                </p>
                              </td>
                              <td className="py-3.5 px-4 text-[#CFCFD3]">
                                {appt.service_name}
                                <span className="block text-xs text-[#8C8889] tabular-nums">
                                  {appt.duration_minutes} min
                                </span>
                              </td>
                              <td className="py-3.5 px-4 tabular-nums">
                                <span className="block text-[#FFFFFF]">
                                  {formatShortDateFr(appt.appointment_date)}
                                </span>
                                <span className="font-[family-name:var(--font-mono)] text-xs text-[#8C8889]">
                                  {appt.start_time} – {appt.end_time}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-[family-name:var(--font-mono)] text-[#FFFFFF] tabular-nums">
                                {formatPriceFr(appt.price)}
                              </td>
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-1 text-xs font-medium border rounded whitespace-nowrap ${
                                    STATUS_STYLES[appt.status]
                                  }`}
                                >
                                  {STATUS_LABELS[appt.status]}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditingAppointment({
                                        id: appt.id,
                                        reference: appt.reference,
                                        serviceId: appt.service_id,
                                        date: appt.appointment_date,
                                        startTime: appt.start_time,
                                        firstName: appt.first_name,
                                        lastName: appt.last_name,
                                        phone: appt.phone,
                                        status: appt.status,
                                        notes: appt.notes || '',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#161619] hover:border-[#FFFFFF] text-[#FFFFFF] border border-[#8C8889]/30 rounded cursor-pointer transition-colors"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Modifier</span>
                                  </button>
                                  {appt.status !== 'confirmed' && (
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(appt.id, 'confirmed')}
                                      className="px-2.5 py-1 text-xs bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-500/30 rounded cursor-pointer"
                                    >
                                      Confirmer
                                    </button>
                                  )}
                                  {appt.status !== 'completed' && (
                                    <button
                                      type="button"
                                      onClick={() => handleStatusChange(appt.id, 'completed')}
                                      className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20 text-[#FFFFFF] border border-[#CFCFD3]/30 rounded cursor-pointer"
                                    >
                                      Terminer
                                    </button>
                                  )}
                                  {confirmDeleteApptId === appt.id ? (
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteAppointment(appt.id)}
                                        className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer font-semibold"
                                      >
                                        Confirmer
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteApptId(null)}
                                        className="px-2 py-1 text-xs text-[#8C8889] hover:text-[#FFFFFF] border border-[#8C8889]/25 rounded cursor-pointer"
                                      >
                                        Non
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteApptId(appt.id)}
                                      aria-label={`Supprimer ${appt.reference}`}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-red-950/60 hover:bg-red-900/70 text-red-200 border border-red-500/30 rounded cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Supprimer</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* Edit Appointment Form Modal */}
                <AnimatePresence>
                  {editingAppointment && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4"
                      onClick={() => setEditingAppointment(null)}
                    >
                      <motion.form
                        initial={{ opacity: 0, scale: 0.96, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 10 }}
                        transition={{ duration: 0.2, ease: EASE_LUXE }}
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleSaveAppointmentEdit}
                        className="w-full max-w-lg bg-[#0D0D0F] border border-[#8C8889]/35 rounded-xl p-6 space-y-4"
                      >
                        <div className="flex items-center justify-between border-b border-[#8C8889]/20 pb-3">
                          <div>
                            <p className="text-xs font-mono text-[#8C8889]">{editingAppointment.reference}</p>
                            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                              Modifier le rendez-vous
                            </h2>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingAppointment(null)}
                            className="p-1.5 text-[#8C8889] hover:text-[#FFFFFF] cursor-pointer"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Prénom</label>
                            <input
                              type="text"
                              required
                              value={editingAppointment.firstName}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, firstName: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Nom</label>
                            <input
                              type="text"
                              required
                              value={editingAppointment.lastName}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, lastName: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Téléphone</label>
                            <input
                              type="tel"
                              required
                              value={editingAppointment.phone}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, phone: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm font-mono text-[#FFFFFF]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Statut</label>
                            <select
                              value={editingAppointment.status}
                              onChange={(e) =>
                                setEditingAppointment({
                                  ...editingAppointment,
                                  status: e.target.value as AppointmentStatus,
                                })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            >
                              <option value="confirmed">Confirmé</option>
                              <option value="pending">En attente</option>
                              <option value="completed">Terminé</option>
                              <option value="cancelled">Annulé</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-[#8C8889] mb-1">Prestation</label>
                            <select
                              value={editingAppointment.serviceId}
                              onChange={(e) =>
                                setEditingAppointment({
                                  ...editingAppointment,
                                  serviceId: Number(e.target.value),
                                })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            >
                              {services.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({formatPriceFr(s.price)} · {s.duration_minutes} min)
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Date</label>
                            <input
                              type="date"
                              required
                              value={editingAppointment.date}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, date: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-[#8C8889] mb-1">Heure de début</label>
                            <input
                              type="time"
                              required
                              value={editingAppointment.startTime}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, startTime: e.target.value })
                              }
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm font-mono text-[#FFFFFF]"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-[#8C8889] mb-1">Notes</label>
                            <textarea
                              rows={2}
                              value={editingAppointment.notes}
                              onChange={(e) =>
                                setEditingAppointment({ ...editingAppointment, notes: e.target.value })
                              }
                              placeholder="Note éventuelle..."
                              className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-[#8C8889]/20">
                          <button
                            type="button"
                            onClick={() => setEditingAppointment(null)}
                            className="px-4 py-2 text-xs text-[#8C8889] border border-[#8C8889]/25 rounded cursor-pointer"
                          >
                            Annuler
                          </button>
                          <button
                            type="submit"
                            className="px-5 py-2 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded cursor-pointer"
                          >
                            Enregistrer les modifications
                          </button>
                        </div>
                      </motion.form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* TAB 3: SERVICES MANAGEMENT */}
            {activeTab === 'services' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                      Prestations & Tarifs
                    </h1>
                    <p className="text-sm text-[#8C8889] mt-1">
                      Modifiez les prix, durées et descriptions affichés sur la page d’accueil et la réservation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewServiceForm((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Ajouter une prestation</span>
                  </button>
                </div>

                {showNewServiceForm && (
                  <form
                    onSubmit={handleCreateService}
                    className="p-6 bg-[#0D0D0F] border border-[#CFCFD3]/40 rounded-lg space-y-4"
                  >
                    <h2 className="text-base font-semibold text-[#FFFFFF]">Nouvelle prestation</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <input
                        type="text"
                        required
                        placeholder="Nom (ex. Soin visage)"
                        value={newService.name}
                        onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                        className="px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                      <input
                        type="number"
                        required
                        min={5}
                        placeholder="Prix (DT)"
                        value={newService.price}
                        onChange={(e) => setNewService({ ...newService, price: Number(e.target.value) })}
                        className="px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                      <input
                        type="number"
                        required
                        min={10}
                        step={5}
                        placeholder="Durée (min)"
                        value={newService.duration_minutes}
                        onChange={(e) =>
                          setNewService({ ...newService, duration_minutes: Number(e.target.value) })
                        }
                        className="px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <textarea
                      required
                      rows={2}
                      placeholder="Description de la prestation..."
                      value={newService.description}
                      onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/35 rounded cursor-pointer transition-colors">
                          <Upload className="w-3.5 h-3.5" />
                          <span>
                            {uploadingKey === 'new-service'
                              ? 'Importation...'
                              : 'Choisir une photo (fichier)'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) =>
                              handleFileUpload('new-service', e.target.files?.[0], (url) => {
                                setNewService((prev) => ({ ...prev, image_url: url }));
                                showToast('success', 'Photo importée pour la nouvelle prestation.');
                              })
                            }
                          />
                        </label>
                        <div className="w-12 h-9 rounded overflow-hidden border border-[#8C8889]/30 bg-[#000000]">
                          <BarberImage
                            src={newService.image_url}
                            alt="Aperçu prestation"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewServiceForm(false)}
                          className="px-4 py-2 text-xs text-[#8C8889] border border-[#8C8889]/25 rounded cursor-pointer"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 text-xs font-semibold text-[#000000] bg-[#FFFFFF] rounded cursor-pointer"
                        >
                          Créer
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {services.map((svc) => (
                    <div
                      key={svc.id}
                      className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg flex flex-col justify-between gap-4"
                    >
                      {editingService?.id === svc.id ? (
                        <form onSubmit={handleSaveServiceEdit} className="space-y-3">
                          <input
                            type="text"
                            required
                            value={editingService.name}
                            onChange={(e) =>
                              setEditingService({ ...editingService, name: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] text-[#8C8889]">Tarif (DT)</label>
                              <input
                                type="number"
                                required
                                value={editingService.price}
                                onChange={(e) =>
                                  setEditingService({
                                    ...editingService,
                                    price: Number(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-[#8C8889]">Durée (min)</label>
                              <input
                                type="number"
                                required
                                step={5}
                                value={editingService.duration_minutes}
                                onChange={(e) =>
                                  setEditingService({
                                    ...editingService,
                                    duration_minutes: Number(e.target.value),
                                  })
                                }
                                className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                              />
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            value={editingService.description}
                            onChange={(e) =>
                              setEditingService({ ...editingService, description: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-9 rounded overflow-hidden border border-[#8C8889]/30 bg-[#000000]">
                                <BarberImage
                                  src={editingService.image_url}
                                  alt={editingService.name}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/30 rounded cursor-pointer transition-colors">
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {uploadingKey === `svc-${svc.id}`
                                    ? 'Importation...'
                                    : 'Changer la photo'}
                                </span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) =>
                                    handleFileUpload(`svc-${svc.id}`, e.target.files?.[0], (url) => {
                                      setEditingService((prev) =>
                                        prev ? { ...prev, image_url: url } : null
                                      );
                                      showToast('success', 'Nouvelle photo prête à être enregistrée.');
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs text-[#FFFFFF]">
                              <input
                                type="checkbox"
                                checked={editingService.is_active === 1}
                                onChange={(e) =>
                                  setEditingService({
                                    ...editingService,
                                    is_active: e.target.checked ? 1 : 0,
                                  })
                                }
                              />
                              <span>Visible en ligne</span>
                            </label>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setEditingService(null)}
                              className="px-3.5 py-1.5 text-xs text-[#8C8889] border border-[#8C8889]/25 rounded cursor-pointer"
                            >
                              Annuler
                            </button>
                            <button
                              type="submit"
                              className="px-4 py-1.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] rounded cursor-pointer"
                            >
                              Enregistrer
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-start gap-4">
                            <div className="w-20 h-16 rounded overflow-hidden shrink-0 bg-[#000000]">
                              <BarberImage
                                src={svc.image_url}
                                alt={svc.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline justify-between gap-2">
                                <h3 className="font-semibold text-[#FFFFFF] truncate">
                                  {svc.name}
                                  {svc.is_active === 0 && (
                                    <span className="ml-2 text-xs text-red-300">(Masquée)</span>
                                  )}
                                </h3>
                                <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#FFFFFF] tabular-nums">
                                  {formatPriceFr(svc.price)}
                                </span>
                              </div>
                              <p className="text-xs text-[#8C8889] tabular-nums mt-0.5">
                                {svc.duration_minutes} minutes
                              </p>
                              <p className="text-xs text-[#CFCFD3]/75 mt-2 line-clamp-2">
                                {svc.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#8C8889]/20">
                            <button
                              type="button"
                              onClick={() => setEditingService(svc)}
                              className="px-3 py-1.5 text-xs font-medium text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/25 rounded transition-colors cursor-pointer"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteService(svc.id)}
                              aria-label={`Supprimer ${svc.name}`}
                              className="p-1.5 text-red-300 hover:bg-red-950/50 border border-[#8C8889]/25 rounded cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: SCHEDULE */}
            {activeTab === 'schedule' && (
              <div className="space-y-8">
                <div>
                  <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                    Horaires, Fermetures & Créneaux
                  </h1>
                  <p className="text-sm text-[#8C8889] mt-1">
                    Configurez vos jours d’ouverture, vos congés et les créneaux disponibles à la réservation.
                  </p>
                </div>

                <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <h2 className="text-base font-semibold text-[#FFFFFF]">Horaires hebdomadaires</h2>
                    <div className="flex items-center gap-3">
                      <label htmlFor="slot-interval" className="text-xs text-[#8C8889]">
                        Intervalle des créneaux :
                      </label>
                      <select
                        id="slot-interval"
                        value={slotInterval}
                        onChange={(e) => setSlotInterval(Number(e.target.value))}
                        className="px-3 py-1.5 bg-[#000000] border border-[#8C8889]/30 rounded text-xs text-[#FFFFFF]"
                      >
                        <option value={15}>15 min</option>
                        <option value={20}>20 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {hours.map((h, idx) => (
                      <div
                        key={h.day_of_week}
                        className="flex flex-wrap items-center justify-between gap-4 py-2.5 border-b border-[#8C8889]/15 last:border-0"
                      >
                        <label className="inline-flex items-center gap-3 min-w-[140px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={h.is_open === 1}
                            onChange={(e) => {
                              const next = [...hours];
                              next[idx] = { ...h, is_open: e.target.checked ? 1 : 0 };
                              setHours(next);
                            }}
                            className="accent-[#FFFFFF] w-4 h-4"
                          />
                          <span className="text-sm font-medium text-[#FFFFFF]">{h.day_name}</span>
                        </label>

                        {h.is_open === 1 ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={h.open_time}
                              onChange={(e) => {
                                const next = [...hours];
                                next[idx] = { ...h, open_time: e.target.value };
                                setHours(next);
                              }}
                              className="px-2.5 py-1.5 bg-[#000000] border border-[#8C8889]/30 rounded text-xs font-mono text-[#FFFFFF]"
                            />
                            <span className="text-xs text-[#8C8889]">à</span>
                            <input
                              type="time"
                              value={h.close_time}
                              onChange={(e) => {
                                const next = [...hours];
                                next[idx] = { ...h, close_time: e.target.value };
                                setHours(next);
                              }}
                              className="px-2.5 py-1.5 bg-[#000000] border border-[#8C8889]/30 rounded text-xs font-mono text-[#FFFFFF]"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-[#8C8889]">Salon fermé</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveHours}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Enregistrer les horaires</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6">
                    <h2 className="text-base font-semibold text-[#FFFFFF] mb-4">
                      Jours de fermeture exceptionnelle / Congés
                    </h2>

                    <form onSubmit={handleAddDayOff} className="space-y-3 mb-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="date"
                          required
                          value={newDayOffDate}
                          onChange={(e) => setNewDayOffDate(e.target.value)}
                          className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Motif (ex. Congés)"
                          value={newDayOffReason}
                          onChange={(e) => setNewDayOffReason(e.target.value)}
                          className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                      >
                        Bloquer cette journée
                      </button>
                    </form>

                    {daysOff.length === 0 ? (
                      <p className="text-xs text-[#8C8889]">Aucun jour de fermeture planifié.</p>
                    ) : (
                      <ul className="divide-y divide-[#8C8889]/20">
                        {daysOff.map((d) => (
                          <li key={d.id} className="py-2.5 flex items-center justify-between text-sm">
                            <div>
                              <span className="font-[family-name:var(--font-mono)] text-[#FFFFFF] tabular-nums">
                                {formatShortDateFr(d.date)}
                              </span>
                              <span className="text-xs text-[#8C8889] ml-2">· {d.reason}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveDayOff(d.id)}
                              aria-label="Supprimer jour de fermeture"
                              className="p-1.5 text-red-300 hover:bg-red-950/40 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6">
                    <h2 className="text-base font-semibold text-[#FFFFFF] mb-4">
                      Ajouter ou bloquer des créneaux horaires
                    </h2>

                    <form onSubmit={handleAddSlotRule} className="space-y-3 mb-5">
                      <div className="grid grid-cols-2 gap-3">
                        <select
                          value={newRuleType}
                          onChange={(e) => setNewRuleType(e.target.value as 'add' | 'block')}
                          className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        >
                          <option value="block">Supprimer / Bloquer créneau</option>
                          <option value="add">Ajouter créneau libre</option>
                        </select>
                        <select
                          value={newRuleScope}
                          onChange={(e) => setNewRuleScope(e.target.value as 'global' | 'date')}
                          className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        >
                          <option value="global">Tous les jours ouverts</option>
                          <option value="date">Date précise</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input
                          type="time"
                          required
                          value={newRuleTime}
                          onChange={(e) => setNewRuleTime(e.target.value)}
                          className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm font-mono text-[#FFFFFF]"
                        />
                        {newRuleScope === 'date' && (
                          <input
                            type="date"
                            required
                            value={newRuleDate}
                            onChange={(e) => setNewRuleDate(e.target.value)}
                            className="px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                          />
                        )}
                        <input
                          type="text"
                          placeholder="Libellé (ex. Pause)"
                          value={newRuleLabel}
                          onChange={(e) => setNewRuleLabel(e.target.value)}
                          className={`px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF] ${
                            newRuleScope === 'global' ? 'sm:col-span-2' : ''
                          }`}
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                      >
                        Appliquer la règle de créneau
                      </button>
                    </form>

                    {slotRules.length === 0 ? (
                      <p className="text-xs text-[#8C8889]">Aucune exception de créneau configurée.</p>
                    ) : (
                      <ul className="divide-y divide-[#8C8889]/20">
                        {slotRules.map((r) => (
                          <li key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                            <div>
                              <span
                                className={`text-xs font-medium mr-2 ${
                                  r.rule_type === 'add' ? 'text-emerald-300' : 'text-amber-300'
                                }`}
                              >
                                {r.rule_type === 'add' ? '+ Ajouté' : '× Bloqué'}
                              </span>
                              <span className="font-[family-name:var(--font-mono)] text-[#FFFFFF] tabular-nums">
                                {r.slot_time}
                              </span>
                              <span className="text-xs text-[#8C8889] ml-2">
                                {r.scope === 'date' && r.target_date
                                  ? `(${formatShortDateFr(r.target_date)})`
                                  : '(Tous les jours)'}
                                {r.label ? ` · ${r.label}` : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSlotRule(r.id)}
                              aria-label="Supprimer règle"
                              className="p-1.5 text-red-300 hover:bg-red-950/40 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: GALLERY & WEBSITE PHOTOS MANAGEMENT */}
            {activeTab === 'gallery' && (
              <div className="space-y-10">
                <div>
                  <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                    Photos du site & Galerie
                  </h1>
                  <p className="text-sm text-[#8C8889] mt-1">
                    Importez de nouvelles photos depuis votre appareil pour modifier l’accueil, la section À propos, le logo ou la galerie.
                  </p>
                </div>

                {/* Main Website Photos */}
                <div className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6 space-y-5">
                  <h2 className="text-base font-semibold text-[#FFFFFF]">
                    Photos principales du site
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {[
                      {
                        key: 'hero_image' as const,
                        label: 'Photo d’accueil (Hero)',
                        subtitle: 'Derrière « Votre style. Notre passion. »',
                        value: settingsForm.hero_image,
                      },
                      {
                        key: 'about_image' as const,
                        label: 'Photo « À propos »',
                        subtitle: 'Portrait du barbier et du salon',
                        value: settingsForm.about_image,
                      },
                      {
                        key: 'logo_image' as const,
                        label: 'Logo & Icône du navigateur',
                        subtitle: 'Affiché en haut à gauche et dans l’onglet',
                        value: settingsForm.logo_image,
                      },
                    ].map((slot) => (
                      <div
                        key={slot.key}
                        className="bg-[#000000] border border-[#8C8889]/25 rounded-lg overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/3] bg-[#08080A] overflow-hidden">
                          <BarberImage
                            src={slot.value}
                            alt={slot.label}
                            className={`w-full h-full ${
                              slot.key === 'logo_image' ? 'object-contain p-4' : 'object-cover'
                            }`}
                          />
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-[#FFFFFF]">{slot.label}</p>
                            <p className="text-xs text-[#8C8889] mt-0.5">{slot.subtitle}</p>
                          </div>
                          <label className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-3 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>
                              {uploadingKey === slot.key ? 'Importation...' : 'Choisir un fichier'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                handleFileUpload(slot.key, e.target.files?.[0], async (url) => {
                                  if (!token) return;
                                  const nextSettings = { ...settingsForm, [slot.key]: url };
                                  setSettingsForm(nextSettings);
                                  await updateShopSettings(token, { [slot.key]: url });
                                  showToast('success', `${slot.label} mise à jour.`);
                                  onDataMutated();
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gallery Photos */}
                <div className="space-y-5">
                  <h2 className="text-lg font-semibold text-[#FFFFFF]">Photos de la galerie</h2>
                  <form
                    onSubmit={handleAddGallery}
                    className="p-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
                  >
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1">Titre</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex. Dégradé américain"
                        value={newGalleryTitle}
                        onChange={(e) => setNewGalleryTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1">Catégorie</label>
                      <select
                        value={newGalleryCat}
                        onChange={(e) => setNewGalleryCat(e.target.value)}
                        className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      >
                        <option value="Coupes">Coupes</option>
                        <option value="Dégradés">Dégradés</option>
                        <option value="Barbe & Rasage">Barbe & Rasage</option>
                        <option value="Salon">Salon</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1">Fichier photo</label>
                      <label className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 hover:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] cursor-pointer transition-colors">
                        <Upload className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          {uploadingKey === 'new-gallery'
                            ? 'Importation...'
                            : 'Choisir une image'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            handleFileUpload('new-gallery', e.target.files?.[0], (url) => {
                              setNewGalleryUrl(url);
                              showToast('success', 'Photo importée, prête à être ajoutée.');
                            })
                          }
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="py-2.5 px-4 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                    >
                      Ajouter à la galerie
                    </button>
                  </form>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {gallery.map((img) => (
                      <div
                        key={img.id}
                        className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg overflow-hidden flex flex-col"
                      >
                        <div className="aspect-[4/5] bg-[#000000]">
                          <BarberImage
                            src={img.image_url}
                            alt={img.title}
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-[#8C8889]">{img.category}</p>
                            <p className="text-sm font-medium text-[#FFFFFF] truncate">{img.title}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-medium text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/25 rounded cursor-pointer transition-colors">
                              <Upload className="w-3.5 h-3.5" />
                              <span>
                                {uploadingKey === `gal-${img.id}` ? '...' : 'Changer'}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  handleFileUpload(`gal-${img.id}`, e.target.files?.[0], async (url) => {
                                    if (!token) return;
                                    await updateGalleryImage(token, img.id, {
                                      title: img.title,
                                      category: img.category,
                                      image_url: url,
                                    });
                                    showToast('success', 'Photo de galerie remplacée.');
                                    await loadAllAdminData();
                                    onDataMutated();
                                  })
                                }
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleDeleteGallery(img.id)}
                              aria-label={`Supprimer ${img.title}`}
                              className="p-2 text-red-300 hover:bg-red-950/40 border border-[#8C8889]/25 rounded cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div>
                  <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF]">
                    Coordonnées & Identité du salon
                  </h1>
                  <p className="text-sm text-[#8C8889] mt-1">
                    Mettez à jour l’adresse, le téléphone, les réseaux sociaux et la présentation du barbier.
                  </p>
                </div>

                <form
                  onSubmit={handleSaveSettings}
                  className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6 space-y-5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Nom du salon</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.shop_name}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, shop_name: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Sous-titre</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.tagline}
                        onChange={(e) => setSettingsForm({ ...settingsForm, tagline: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Adresse</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.address}
                        onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Ville / Quartier</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.city}
                        onChange={(e) => setSettingsForm({ ...settingsForm, city: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Téléphone</label>
                      <input
                        type="text"
                        required
                        value={settingsForm.phone}
                        onChange={(e) => setSettingsForm({ ...settingsForm, phone: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm font-mono text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">E-mail</label>
                      <input
                        type="email"
                        required
                        value={settingsForm.email}
                        onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Lien Instagram</label>
                      <input
                        type="url"
                        value={settingsForm.instagram_url}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, instagram_url: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Lien Facebook</label>
                      <input
                        type="url"
                        value={settingsForm.facebook_url}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, facebook_url: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#8C8889]/20 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-[#8C8889] mb-1.5">Nom du barbier</label>
                        <input
                          type="text"
                          value={settingsForm.barber_name}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, barber_name: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#8C8889] mb-1.5">Titre / Expérience</label>
                        <input
                          type="text"
                          value={settingsForm.barber_role}
                          onChange={(e) =>
                            setSettingsForm({ ...settingsForm, barber_role: e.target.value })
                          }
                          className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Titre À propos</label>
                      <input
                        type="text"
                        value={settingsForm.about_title}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, about_title: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">Présentation (À propos)</label>
                      <textarea
                        rows={3}
                        value={settingsForm.about_bio}
                        onChange={(e) =>
                          setSettingsForm({ ...settingsForm, about_bio: e.target.value })
                        }
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="px-6 py-3 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors cursor-pointer"
                    >
                      Enregistrer les paramètres
                    </button>
                  </div>
                </form>

                {/* Account Security: Password Update */}
                <form
                  onSubmit={handleChangePassword}
                  className="bg-[#0D0D0F] border border-[#8C8889]/25 rounded-lg p-6 space-y-4"
                >
                  <div>
                    <h2 className="text-base font-semibold text-[#FFFFFF]">
                      Sécurité du compte administrateur
                    </h2>
                    <p className="text-xs text-[#8C8889] mt-0.5">
                      Modifiez votre mot de passe (minimum 6 caractères). Le mot de passe est chiffré en base de données.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">
                        Mot de passe actuel
                      </label>
                      <input
                        type="password"
                        required
                        autoComplete="current-password"
                        value={currentPwd}
                        onChange={(e) => setCurrentPwd(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#8C8889] mb-1.5">
                        Nouveau mot de passe
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={newPwd}
                        onChange={(e) => setNewPwd(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#000000] border border-[#8C8889]/30 rounded text-sm text-[#FFFFFF]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={savingPwd}
                      className="px-5 py-2.5 text-xs font-semibold text-[#FFFFFF] bg-[#161619] hover:bg-[#FFFFFF] hover:text-[#000000] border border-[#8C8889]/35 rounded transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {savingPwd ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <ManualAppointmentModal
        isOpen={manualModalOpen}
        token={token}
        services={services}
        initialDate={manualPrefill.date}
        initialTime={manualPrefill.time}
        onClose={() => setManualModalOpen(false)}
        onCreated={async (created) => {
          setSelectedCalendarDate(created.appointment_date);
          showToast(
            'success',
            `Rendez-vous ajouté pour ${created.first_name} ${created.last_name} à ${created.start_time}.`
          );
          await loadAllAdminData();
          onDataMutated();
        }}
      />
    </div>
  );
}
