import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Calendar, Clock, UserPlus, X } from 'lucide-react';
import type {
  AppointmentRecord,
  AppointmentStatus,
  ServiceItem,
  TimeSlotOption,
} from '../../types/barbershop';
import { createAdminAppointment, fetchDaySlots, formatPriceFr } from '../../lib/api';

interface ManualAppointmentModalProps {
  isOpen: boolean;
  token: string;
  services: ServiceItem[];
  initialDate?: string;
  initialTime?: string;
  onClose: () => void;
  onCreated: (appointment: AppointmentRecord) => void;
}

const EASE_LUXE = [0.22, 1, 0.36, 1] as const;

function getLocalToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ManualAppointmentModal({
  isOpen,
  token,
  services,
  initialDate,
  initialTime,
  onClose,
  onCreated,
}: ManualAppointmentModalProps) {
  const activeServices = services.filter((s) => s.is_active === 1);
  const serviceOptions = activeServices.length > 0 ? activeServices : services;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceId, setServiceId] = useState<number>(serviceOptions[0]?.id || 0);
  const [date, setDate] = useState(initialDate || getLocalToday());
  const [startTime, setStartTime] = useState(initialTime || '14:00');
  const [status, setStatus] = useState<AppointmentStatus>('confirmed');
  const [notes, setNotes] = useState('');

  const [slots, setSlots] = useState<TimeSlotOption[]>([]);
  const [slotsNote, setSlotsNote] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setDate(initialDate || getLocalToday());
    setStartTime(initialTime || '14:00');
    setFirstName('');
    setLastName('');
    setPhone('');
    setStatus('confirmed');
    setNotes('');
    if (serviceOptions.length > 0 && !serviceOptions.some((s) => s.id === serviceId)) {
      setServiceId(serviceOptions[0].id);
    }
  }, [isOpen, initialDate, initialTime]);

  useEffect(() => {
    if (!isOpen || !date || !serviceId) return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlotsNote(null);

    fetchDaySlots(date, serviceId)
      .then((res) => {
        if (cancelled) return;
        setSlots(res.slots || []);
        if (res.is_past) {
          setSlotsNote('Date passée (ajout manuel autorisé).');
        } else if (res.is_day_off) {
          setSlotsNote(`Jour de fermeture : ${res.day_off_reason || 'Congé'}.`);
        } else if (!res.is_open_day) {
          setSlotsNote('Salon habituellement fermé ce jour-là (ajout manuel possible).');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlots([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, date, serviceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceId) {
      setError('Veuillez choisir une prestation.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createAdminAppointment(token, {
        serviceId,
        date,
        startTime,
        firstName,
        lastName,
        phone,
        status,
        notes,
      });
      onCreated(res.appointment);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Impossible de créer le rendez-vous.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-[#000000]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={onClose}
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: EASE_LUXE }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="w-full max-w-xl bg-[#0D0D0F] border border-[#8C8889]/35 rounded-xl p-6 space-y-4 my-8"
          >
            <div className="flex items-center justify-between border-b border-[#8C8889]/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#FFFFFF]/10 border border-[#CFCFD3]/25 flex items-center justify-center text-[#FFFFFF]">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[#8C8889]">
                    Ajout manuel
                  </p>
                  <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                    Nouveau client & rendez-vous
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="p-1.5 text-[#8C8889] hover:text-[#FFFFFF] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#CFCFD3] mb-1">Prénom *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex. Karim"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#CFCFD3] mb-1">Nom *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex. Ben Ali"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#CFCFD3] mb-1">Téléphone *</label>
                <input
                  type="tel"
                  required
                  placeholder="Ex. 25 180 013"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm font-mono text-[#FFFFFF] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-[#CFCFD3] mb-1">Statut</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                >
                  <option value="confirmed">Confirmé</option>
                  <option value="pending">En attente</option>
                  <option value="completed">Terminé</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-[#CFCFD3] mb-1">Prestation *</label>
                <select
                  value={serviceId}
                  onChange={(e) => setServiceId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                >
                  {serviceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({formatPriceFr(s.price)} · {s.duration_minutes} min)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-[#CFCFD3] mb-1">
                  <Calendar className="w-3.5 h-3.5 text-[#8C8889]" />
                  <span>Date *</span>
                </label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-[#CFCFD3] mb-1">
                  <Clock className="w-3.5 h-3.5 text-[#8C8889]" />
                  <span>Heure choisie *</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm font-mono text-[#FFFFFF] focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Slot Selector */}
            <div className="bg-[#08080A] border border-[#8C8889]/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#CFCFD3] font-medium">
                  Créneaux du {date}
                </span>
                {loadingSlots && <span className="text-[#8C8889]">Vérification...</span>}
              </div>

              {slotsNote && (
                <p className="text-[11px] text-amber-300/90">{slotsNote}</p>
              )}

              {slots.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {slots.map((slot) => {
                    const selected = startTime === slot.time;
                    const isBooked = slot.reason === 'Déjà réservé';
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        disabled={isBooked}
                        onClick={() => setStartTime(slot.time)}
                        title={slot.available ? 'Disponible' : slot.reason}
                        className={`px-2 py-1.5 rounded text-xs font-mono tabular-nums border transition-colors ${
                          selected
                            ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF] font-semibold cursor-pointer'
                            : isBooked
                              ? 'bg-red-950/30 text-red-300/60 border-red-500/20 line-through cursor-not-allowed'
                              : slot.available
                                ? 'bg-[#0D0D0F] text-[#FFFFFF] border-[#8C8889]/30 hover:border-[#FFFFFF] cursor-pointer'
                                : 'bg-[#0D0D0F] text-[#8C8889] border-[#8C8889]/20 hover:border-[#8C8889]/50 cursor-pointer'
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              ) : (
                !loadingSlots && (
                  <p className="text-[11px] text-[#8C8889]">
                    Saisissez directement l’heure souhaitée ci-dessus.
                  </p>
                )
              )}
            </div>

            <div>
              <label className="block text-xs text-[#CFCFD3] mb-1">Notes (optionnel)</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Client de passage, préférence de coupe..."
                className="w-full px-3 py-2 bg-[#000000] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded text-sm text-[#FFFFFF] focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#8C8889]/20">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-[#8C8889] hover:text-[#FFFFFF] border border-[#8C8889]/25 rounded cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] disabled:opacity-60 rounded cursor-pointer transition-colors"
              >
                {submitting ? 'Enregistrement...' : 'Ajouter le rendez-vous'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
