import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  Scissors,
  User,
  X,
  AlertCircle,
} from 'lucide-react';
import type {
  AppointmentRecord,
  DayAvailabilitySummary,
  ServiceItem,
  TimeSlotOption,
} from '../types/barbershop';
import {
  fetchDaySlots,
  fetchMonthAvailability,
  formatDateFr,
  formatPriceFr,
  isValidFrenchPhone,
  submitBooking,
} from '../lib/api';

interface BookingModalProps {
  isOpen: boolean;
  services: ServiceItem[];
  initialService: ServiceItem | null;
  onClose: () => void;
  onBookingCompleted?: () => void;
}

const EASE_LUXE = [0.22, 1, 0.36, 1] as const;

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

const STEPS = [
  { id: 1, label: 'Prestation' },
  { id: 2, label: 'Date' },
  { id: 3, label: 'Horaire' },
  { id: 4, label: 'Coordonnées' },
  { id: 5, label: 'Confirmation' },
];

export function BookingModal({
  isOpen,
  services,
  initialService,
  onClose,
  onBookingCompleted,
}: BookingModalProps) {
  const now = new Date();
  const [step, setStep] = useState<number>(1);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);

  const [calYear, setCalYear] = useState<number>(now.getFullYear());
  const [calMonth, setCalMonth] = useState<number>(now.getMonth() + 1);
  const [monthDays, setMonthDays] = useState<DayAvailabilitySummary[]>([]);
  const [loadingMonth, setLoadingMonth] = useState(false);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlotOption[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotOption | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [formErrors, setFormErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string;
  }>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] =
    useState<AppointmentRecord | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const today = new Date();
    setCalYear(today.getFullYear());
    setCalMonth(today.getMonth() + 1);
    setSelectedDate('');
    setSelectedSlot(null);
    setSlots([]);
    setSubmitError(null);
    setFormErrors({});
    setConfirmedAppointment(null);
    setConfirmationMessage('');

    if (initialService) {
      setSelectedService(initialService);
      setStep(2);
    } else {
      setSelectedService(null);
      setStep(1);
    }
  }, [isOpen, initialService]);

  useEffect(() => {
    if (!isOpen || !selectedService) return;
    let cancelled = false;
    setLoadingMonth(true);
    fetchMonthAvailability(calYear, calMonth, selectedService.id)
      .then((res) => {
        if (!cancelled) setMonthDays(res.days);
      })
      .catch(() => {
        if (!cancelled) setMonthDays([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMonth(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedService, calYear, calMonth]);

  const loadSlotsForSelectedDate = async (dateStr: string, serviceId: number) => {
    setLoadingSlots(true);
    setSubmitError(null);
    try {
      const res = await fetchDaySlots(dateStr, serviceId);
      setSlots(res.slots);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !selectedService) return;
    const handleSync = () => {
      fetchMonthAvailability(calYear, calMonth, selectedService.id)
        .then((res) => setMonthDays(res.days))
        .catch(() => {});
      if (selectedDate) {
        fetchDaySlots(selectedDate, selectedService.id)
          .then((res) => setSlots(res.slots))
          .catch(() => {});
      }
    };
    window.addEventListener('hazem:sync', handleSync);
    return () => window.removeEventListener('hazem:sync', handleSync);
  }, [isOpen, selectedService, calYear, calMonth, selectedDate]);

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const canGoPrevMonth =
    calYear > currentYear || (calYear === currentYear && calMonth > currentMonth);

  const handlePrevMonth = () => {
    if (!canGoPrevMonth) return;
    if (calMonth === 1) {
      setCalMonth(12);
      setCalYear((y) => y - 1);
    } else {
      setCalMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 12) {
      setCalMonth(1);
      setCalYear((y) => y + 1);
    } else {
      setCalMonth((m) => m + 1);
    }
  };

  const firstDayOfMonth = new Date(calYear, calMonth - 1, 1).getDay();
  const leadingBlanks = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const handleSelectService = (svc: ServiceItem) => {
    setSelectedService(svc);
    setSelectedDate('');
    setSelectedSlot(null);
    setStep(2);
  };

  const handleSelectDate = (day: DayAvailabilitySummary) => {
    if (day.is_past || !day.is_open_day || day.is_day_off || day.available_count === 0) {
      return;
    }
    setSelectedDate(day.date);
    setSelectedSlot(null);
    if (selectedService) {
      loadSlotsForSelectedDate(day.date, selectedService.id);
    }
    setStep(3);
  };

  const handleSelectSlot = (slot: TimeSlotOption) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    setSubmitError(null);
    setStep(4);
  };

  const validateCustomerForm = (): boolean => {
    const errors: { firstName?: string; lastName?: string; phone?: string } = {};
    if (firstName.trim().length < 2) {
      errors.firstName = 'Veuillez saisir votre prénom (minimum 2 caractères).';
    }
    if (lastName.trim().length < 2) {
      errors.lastName = 'Veuillez saisir votre nom (minimum 2 caractères).';
    }
    if (!isValidFrenchPhone(phone.trim())) {
      errors.phone = 'Numéro invalide (ex. 25 180 013).';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleContinueToSummary = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateCustomerForm()) {
      setSubmitError(null);
      setStep(5);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedService || !selectedDate || !selectedSlot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await submitBooking({
        serviceId: selectedService.id,
        date: selectedDate,
        startTime: selectedSlot.time,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });
      setConfirmedAppointment(res.appointment);
      setConfirmationMessage(res.message);
      if (onBookingCompleted) onBookingCompleted();
    } catch (err: unknown) {
      const errorObj = err as Error & { status?: number };
      setSubmitError(
        errorObj.message || 'Impossible de finaliser le rendez-vous. Veuillez réessayer.'
      );
      if (errorObj.status === 409 && selectedService && selectedDate) {
        loadSlotsForSelectedDate(selectedDate, selectedService.id);
      }
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
          transition={{ duration: 0.24, ease: EASE_LUXE }}
          className="fixed inset-0 z-50 bg-[#000000]/88 backdrop-blur-md flex items-center justify-center p-0 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Prise de rendez-vous"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 14 }}
            transition={{ duration: 0.3, ease: EASE_LUXE }}
            className="relative w-full max-w-3xl min-h-screen sm:min-h-0 sm:max-h-[92vh] bg-[#0B0B0D] border-0 sm:border sm:border-[#8C8889]/30 sm:rounded-xl shadow-2xl flex flex-col overflow-hidden my-auto"
          >
            {/* Modal Header */}
            <div className="px-5 sm:px-8 py-5 border-b border-[#8C8889]/20 bg-[#000000] flex items-center justify-between gap-4 shrink-0">
              <div>
                <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#8C8889]">
                  Réservation en ligne
                </p>
                <h2 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl font-semibold text-[#FFFFFF] mt-0.5">
                  {confirmedAppointment ? 'Rendez-vous confirmé' : 'Prendre rendez-vous'}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer la réservation"
                className="w-10 h-10 flex items-center justify-center rounded-lg border border-[#8C8889]/25 text-[#8C8889] hover:text-[#FFFFFF] hover:border-[#CFCFD3] transition-colors duration-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Bar */}
            {!confirmedAppointment && (
              <div className="px-5 sm:px-8 py-3.5 bg-[#0D0D0F] border-b border-[#8C8889]/20 shrink-0 overflow-x-auto">
                <ol className="flex items-center justify-between min-w-[480px] gap-2">
                  {STEPS.map((s) => {
                    const isDone = step > s.id;
                    const isCurrent = step === s.id;
                    const canJumpBack = s.id < step;
                    return (
                      <li key={s.id} className="flex items-center gap-2 flex-1 last:flex-none">
                        <button
                          type="button"
                          disabled={!canJumpBack}
                          onClick={() => canJumpBack && setStep(s.id)}
                          className={`inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap transition-colors duration-200 ${
                            canJumpBack ? 'cursor-pointer hover:text-[#FFFFFF]' : 'cursor-default'
                          } ${
                            isCurrent
                              ? 'text-[#FFFFFF] font-semibold'
                              : isDone
                              ? 'text-[#CFCFD3]'
                              : 'text-[#8C8889]/55'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-mono tabular-nums border transition-all duration-200 ${
                              isCurrent
                                ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF] font-bold'
                                : isDone
                                ? 'bg-[#CFCFD3]/15 text-[#FFFFFF] border-[#CFCFD3]/60'
                                : 'border-[#8C8889]/30 text-[#8C8889]/60'
                            }`}
                          >
                            {isDone ? <Check className="w-3.5 h-3.5" /> : s.id}
                          </span>
                          <span>{s.label}</span>
                        </button>
                        {s.id < 5 && (
                          <div className="flex-1 h-px bg-[#8C8889]/20 mx-1" aria-hidden="true" />
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {/* Modal Body with smooth AnimatePresence step transitions */}
            <div className="p-5 sm:p-8 overflow-y-auto flex-1">
              <AnimatePresence mode="wait">
                {confirmedAppointment ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3, ease: EASE_LUXE }}
                    className="py-4 text-center max-w-lg mx-auto"
                  >
                    <div className="w-16 h-16 rounded-full bg-[#FFFFFF]/10 border border-[#CFCFD3]/40 text-[#FFFFFF] flex items-center justify-center mx-auto mb-5">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>

                    <h3 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl font-semibold text-[#FFFFFF] mb-3">
                      Merci {confirmedAppointment.first_name} !
                    </h3>
                    <p className="text-sm sm:text-base text-[#CFCFD3] mb-6 leading-relaxed">
                      {confirmationMessage}
                    </p>

                    <div className="bg-[#121215] border border-[#CFCFD3]/35 rounded-lg p-5 mb-6 text-left">
                      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#8C8889]/20">
                        <span className="text-xs text-[#8C8889]">Référence de réservation</span>
                        <span className="font-[family-name:var(--font-mono)] text-sm font-semibold text-[#FFFFFF] tabular-nums">
                          {confirmedAppointment.reference}
                        </span>
                      </div>

                      <dl className="space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-[#8C8889]">Prestation</dt>
                          <dd className="font-medium text-[#FFFFFF] text-right">
                            {confirmedAppointment.service_name}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-[#8C8889]">Date</dt>
                          <dd className="font-medium text-[#FFFFFF] text-right">
                            {formatDateFr(confirmedAppointment.appointment_date)}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-[#8C8889]">Horaire</dt>
                          <dd className="font-[family-name:var(--font-mono)] font-medium text-[#FFFFFF] tabular-nums">
                            {confirmedAppointment.start_time} – {confirmedAppointment.end_time}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-[#8C8889]">Client</dt>
                          <dd className="font-medium text-[#FFFFFF]">
                            {confirmedAppointment.first_name} {confirmedAppointment.last_name}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <dt className="text-[#8C8889]">Téléphone</dt>
                          <dd className="font-[family-name:var(--font-mono)] text-[#CFCFD3] tabular-nums">
                            {confirmedAppointment.phone}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-4 pt-3 border-t border-[#8C8889]/20">
                          <dt className="font-semibold text-[#FFFFFF]">Tarif total (au salon)</dt>
                          <dd className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[#FFFFFF] tabular-nums">
                            {formatPriceFr(confirmedAppointment.price)}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-7 py-3.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors duration-200 cursor-pointer"
                      >
                        Retour au site
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmedAppointment(null);
                          setSelectedService(null);
                          setSelectedDate('');
                          setSelectedSlot(null);
                          setStep(1);
                        }}
                        className="w-full sm:w-auto px-6 py-3.5 text-sm font-medium text-[#FFFFFF] bg-[#161619] hover:bg-[#222227] border border-[#8C8889]/30 rounded transition-colors duration-200 cursor-pointer"
                      >
                        Prendre un autre rendez-vous
                      </button>
                    </div>
                  </motion.div>
                ) : step === 1 ? (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.24, ease: EASE_LUXE }}
                  >
                    <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF] mb-1">
                      1. Choisissez votre prestation
                    </h3>
                    <p className="text-sm text-[#8C8889] mb-6">
                      Sélectionnez le soin souhaité pour afficher les disponibilités en temps réel.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {services.map((svc) => {
                        const isSelected = selectedService?.id === svc.id;
                        return (
                          <motion.button
                            key={svc.id}
                            type="button"
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.99 }}
                            transition={{ duration: 0.16, ease: EASE_LUXE }}
                            onClick={() => handleSelectService(svc)}
                            className={`text-left p-5 rounded-lg border transition-colors duration-200 cursor-pointer flex flex-col justify-between ${
                              isSelected
                                ? 'bg-[#161619] border-[#FFFFFF]'
                                : 'bg-[#111114] border-[#8C8889]/25 hover:border-[#CFCFD3]'
                            }`}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-3 mb-2">
                                <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#FFFFFF]">
                                  {svc.name}
                                </span>
                                <span className="font-[family-name:var(--font-mono)] text-base font-semibold text-[#FFFFFF] tabular-nums whitespace-nowrap shrink-0">
                                  {formatPriceFr(svc.price)}
                                </span>
                              </div>
                              <p className="text-xs text-[#8C8889] leading-relaxed mb-4 line-clamp-2">
                                {svc.description}
                              </p>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-[#8C8889]/20 text-xs text-[#8C8889] tabular-nums">
                              <span className="inline-flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-[#CFCFD3]" />
                                {svc.duration_minutes} min
                              </span>
                              <span className="text-[#FFFFFF] font-medium">Sélectionner →</span>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                ) : step === 2 && selectedService ? (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.24, ease: EASE_LUXE }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                          2. Choisissez une date
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8C8889] mt-0.5">
                          Prestation : <span className="text-[#FFFFFF] font-medium">{selectedService.name}</span>{' '}
                          <span className="tabular-nums">({selectedService.duration_minutes} min · {formatPriceFr(selectedService.price)})</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Changer</span>
                      </button>
                    </div>

                    <div className="bg-[#111114] border border-[#8C8889]/25 rounded-lg p-4 sm:p-6">
                      <div className="flex items-center justify-between mb-5">
                        <button
                          type="button"
                          onClick={handlePrevMonth}
                          disabled={!canGoPrevMonth}
                          aria-label="Mois précédent"
                          className="w-10 h-10 flex items-center justify-center rounded border border-[#8C8889]/25 text-[#FFFFFF] hover:border-[#FFFFFF] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>

                        <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-[#FFFFFF]">
                          {MONTHS_FR[calMonth - 1]} {calYear}
                        </p>

                        <button
                          type="button"
                          onClick={handleNextMonth}
                          aria-label="Mois suivant"
                          className="w-10 h-10 flex items-center justify-center rounded border border-[#8C8889]/25 text-[#FFFFFF] hover:border-[#FFFFFF] transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-7 gap-1.5 mb-2">
                        {WEEKDAYS_FR.map((wd) => (
                          <div
                            key={wd}
                            className="text-center text-xs font-medium text-[#8C8889] py-1.5"
                          >
                            {wd}
                          </div>
                        ))}
                      </div>

                      {loadingMonth ? (
                        <div className="grid grid-cols-7 gap-1.5 py-2">
                          {Array.from({ length: 35 }).map((_, i) => (
                            <div
                              key={i}
                              className="h-12 rounded bg-white/[0.04] animate-pulse"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="grid grid-cols-7 gap-1.5">
                          {Array.from({ length: leadingBlanks }).map((_, i) => (
                            <div key={`blank-${i}`} className="h-12" />
                          ))}
                          {monthDays.map((day) => {
                            const dayNumber = Number(day.date.split('-')[2]);
                            const isClosed = !day.is_open_day || day.is_day_off;
                            const isFull = !day.is_past && !isClosed && day.available_count === 0;
                            const isDisabled = day.is_past || isClosed || isFull;
                            const isSelected = selectedDate === day.date;

                            return (
                              <motion.button
                                key={day.date}
                                type="button"
                                disabled={isDisabled}
                                whileHover={isDisabled ? undefined : { scale: 1.03 }}
                                whileTap={isDisabled ? undefined : { scale: 0.97 }}
                                transition={{ duration: 0.14 }}
                                onClick={() => handleSelectDate(day)}
                                title={
                                  day.is_past
                                    ? 'Date passée'
                                    : day.is_day_off
                                    ? day.day_off_reason || 'Salon fermé'
                                    : !day.is_open_day
                                    ? 'Jour de fermeture'
                                    : isFull
                                    ? 'Complet'
                                    : `${day.available_count} créneau(x) disponible(s)`
                                }
                                className={`h-12 sm:h-14 rounded-md flex flex-col items-center justify-center transition-colors duration-150 border text-sm tabular-nums ${
                                  isSelected
                                    ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF] font-bold cursor-pointer'
                                    : isDisabled
                                    ? 'bg-[#08080A] border-transparent text-[#8C8889]/35 cursor-not-allowed'
                                    : 'bg-[#17171B] border-[#8C8889]/25 text-[#FFFFFF] hover:border-[#FFFFFF] hover:bg-[#222227] cursor-pointer font-medium'
                                }`}
                              >
                                <span className={day.is_past ? 'line-through' : ''}>{dayNumber}</span>
                                {!day.is_past && isClosed && (
                                  <span className="text-[9px] leading-none text-[#8C8889]/55 mt-0.5">
                                    Fermé
                                  </span>
                                )}
                                {!day.is_past && !isClosed && isFull && (
                                  <span className="text-[9px] leading-none text-[#8C8889] mt-0.5">
                                    Complet
                                  </span>
                                )}
                                {!isDisabled && !isSelected && (
                                  <span className="text-[9px] leading-none text-[#CFCFD3] mt-0.5">
                                    {day.available_count} disp.
                                  </span>
                                )}
                              </motion.button>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-5 pt-4 border-t border-[#8C8889]/20 flex flex-wrap items-center gap-5 text-xs text-[#8C8889]">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded bg-[#17171B] border border-[#8C8889]/40" />
                          Disponible
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded bg-[#FFFFFF]" />
                          Sélectionné
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded bg-[#08080A] border border-white/5" />
                          Fermé / Indisponible
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ) : step === 3 && selectedService && selectedDate ? (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.24, ease: EASE_LUXE }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                          3. Choisissez un horaire
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8C8889] mt-0.5">
                          {formatDateFr(selectedDate)} · {selectedService.name} ({selectedService.duration_minutes} min)
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        className="inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Changer de date</span>
                      </button>
                    </div>

                    {loadingSlots ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                        {Array.from({ length: 12 }).map((_, i) => (
                          <div key={i} className="h-14 rounded-lg bg-white/[0.04] animate-pulse" />
                        ))}
                      </div>
                    ) : slots.length === 0 ? (
                      <div className="p-8 bg-[#111114] border border-[#8C8889]/25 rounded-lg text-center">
                        <p className="text-base font-medium text-[#FFFFFF] mb-2">
                          Aucun créneau disponible ce jour-là
                        </p>
                        <p className="text-sm text-[#8C8889] mb-5">
                          Tous les horaires compatibles avec cette prestation sont déjà pris ou le salon est fermé.
                        </p>
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="px-5 py-2.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded cursor-pointer"
                        >
                          Choisir une autre date
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                        {slots.map((slot) => {
                          const isSelected = selectedSlot?.time === slot.time;
                          return (
                            <motion.button
                              key={slot.time}
                              type="button"
                              disabled={!slot.available}
                              whileHover={slot.available ? { y: -2 } : undefined}
                              whileTap={slot.available ? { scale: 0.97 } : undefined}
                              transition={{ duration: 0.14 }}
                              onClick={() => handleSelectSlot(slot)}
                              className={`py-3.5 px-2 rounded-lg border text-center transition-colors duration-150 tabular-nums ${
                                isSelected
                                  ? 'bg-[#FFFFFF] text-[#000000] border-[#FFFFFF] font-bold cursor-pointer'
                                  : !slot.available
                                  ? 'bg-[#08080A] border-white/5 text-[#8C8889]/40 cursor-not-allowed'
                                  : 'bg-[#111114] border-[#8C8889]/25 text-[#FFFFFF] hover:border-[#FFFFFF] hover:bg-[#1B1B1F] cursor-pointer font-medium'
                              }`}
                            >
                              <span
                                className={`block font-[family-name:var(--font-mono)] text-sm ${
                                  !slot.available ? 'line-through' : ''
                                }`}
                              >
                                {slot.time}
                              </span>
                              {!slot.available && (
                                <span className="block text-[10px] text-[#8C8889]/55 mt-0.5">
                                  {slot.reason || 'Réservé'}
                                </span>
                              )}
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ) : step === 4 && selectedService && selectedDate && selectedSlot ? (
                  <motion.form
                    key="step-4"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.24, ease: EASE_LUXE }}
                    onSubmit={handleContinueToSummary}
                    noValidate
                  >
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                          4. Vos coordonnées
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8C8889] mt-0.5">
                          Pour confirmer votre venue sans création de compte.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Changer d’horaire</span>
                      </button>
                    </div>

                    <div className="mb-6 p-4 bg-[#111114] border border-[#8C8889]/25 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                      <span className="text-[#FFFFFF] font-medium">
                        {selectedService.name} · {formatDateFr(selectedDate)} à{' '}
                        <span className="font-[family-name:var(--font-mono)] text-[#CFCFD3]">
                          {selectedSlot.time}
                        </span>
                      </span>
                      <span className="font-[family-name:var(--font-mono)] font-semibold text-[#FFFFFF] tabular-nums">
                        {formatPriceFr(selectedService.price)}
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            htmlFor="booking-first-name"
                            className="block text-xs font-medium text-[#CFCFD3] mb-1.5"
                          >
                            Prénom *
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-[#8C8889] absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              id="booking-first-name"
                              type="text"
                              required
                              value={firstName}
                              onChange={(e) => {
                                setFirstName(e.target.value);
                                if (formErrors.firstName) {
                                  setFormErrors((prev) => ({ ...prev, firstName: undefined }));
                                }
                              }}
                              placeholder="Ex. Alexandre"
                              className="w-full pl-10 pr-4 py-3 bg-[#111114] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded-lg text-sm text-[#FFFFFF] placeholder:text-[#8C8889]/60 focus:outline-none transition-colors"
                            />
                          </div>
                          {formErrors.firstName && (
                            <p className="text-xs text-red-400 mt-1.5">{formErrors.firstName}</p>
                          )}
                        </div>

                        <div>
                          <label
                            htmlFor="booking-last-name"
                            className="block text-xs font-medium text-[#CFCFD3] mb-1.5"
                          >
                            Nom *
                          </label>
                          <div className="relative">
                            <User className="w-4 h-4 text-[#8C8889] absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              id="booking-last-name"
                              type="text"
                              required
                              value={lastName}
                              onChange={(e) => {
                                setLastName(e.target.value);
                                if (formErrors.lastName) {
                                  setFormErrors((prev) => ({ ...prev, lastName: undefined }));
                                }
                              }}
                              placeholder="Ex. Moreau"
                              className="w-full pl-10 pr-4 py-3 bg-[#111114] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded-lg text-sm text-[#FFFFFF] placeholder:text-[#8C8889]/60 focus:outline-none transition-colors"
                            />
                          </div>
                          {formErrors.lastName && (
                            <p className="text-xs text-red-400 mt-1.5">{formErrors.lastName}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="booking-phone"
                          className="block text-xs font-medium text-[#CFCFD3] mb-1.5"
                        >
                          Numéro de téléphone *
                        </label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-[#8C8889] absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="booking-phone"
                            type="tel"
                            required
                            value={phone}
                            onChange={(e) => {
                              setPhone(e.target.value);
                              if (formErrors.phone) {
                                setFormErrors((prev) => ({ ...prev, phone: undefined }));
                              }
                            }}
                            placeholder="25 180 013"
                            className="w-full pl-10 pr-4 py-3 bg-[#111114] border border-[#8C8889]/30 focus:border-[#FFFFFF] rounded-lg text-sm text-[#FFFFFF] font-[family-name:var(--font-mono)] placeholder:text-[#8C8889]/60 focus:outline-none transition-colors"
                          />
                        </div>
                        {formErrors.phone && (
                          <p className="text-xs text-red-400 mt-1.5">{formErrors.phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-7 flex items-center justify-end gap-3">
                      <button
                        type="submit"
                        className="w-full sm:w-auto px-7 py-3.5 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded transition-colors duration-200 cursor-pointer"
                      >
                        Vérifier le récapitulatif →
                      </button>
                    </div>
                  </motion.form>
                ) : step === 5 && selectedService && selectedDate && selectedSlot ? (
                  <motion.div
                    key="step-5"
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -14 }}
                    transition={{ duration: 0.24, ease: EASE_LUXE }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-5">
                      <div>
                        <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
                          5. Récapitulatif de votre rendez-vous
                        </h3>
                        <p className="text-xs sm:text-sm text-[#8C8889] mt-0.5">
                          Vérifiez les informations ci-dessous avant de confirmer.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep(4)}
                        className="inline-flex items-center gap-1.5 text-xs text-[#8C8889] hover:text-[#FFFFFF] transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Modifier</span>
                      </button>
                    </div>

                    {submitError && (
                      <div className="mb-5 p-4 bg-red-950/50 border border-red-500/40 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5 text-sm text-red-200">
                          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          <span>{submitError}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitError(null);
                            setStep(3);
                          }}
                          className="px-3.5 py-2 text-xs font-semibold bg-red-500/20 hover:bg-red-500/30 text-red-100 rounded cursor-pointer whitespace-nowrap shrink-0"
                        >
                          Choisir un autre créneau
                        </button>
                      </div>
                    )}

                    <div className="bg-[#111114] border border-[#8C8889]/25 rounded-lg p-6 mb-6 space-y-4">
                      <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#8C8889]/20">
                        <div className="flex items-start gap-3">
                          <Scissors className="w-4 h-4 text-[#CFCFD3] mt-1 shrink-0" />
                          <div>
                            <p className="text-xs text-[#8C8889]">Prestation sélectionnée</p>
                            <p className="text-base font-semibold text-[#FFFFFF]">
                              {selectedService.name}
                            </p>
                            <p className="text-xs text-[#8C8889] mt-0.5 tabular-nums">
                              Durée estimée : {selectedService.duration_minutes} minutes
                            </p>
                          </div>
                        </div>
                        <span className="font-[family-name:var(--font-mono)] text-lg font-semibold text-[#FFFFFF] tabular-nums">
                          {formatPriceFr(selectedService.price)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-[#8C8889]/20">
                        <div className="flex items-start gap-3">
                          <CalendarIcon className="w-4 h-4 text-[#CFCFD3] mt-1 shrink-0" />
                          <div>
                            <p className="text-xs text-[#8C8889]">Date</p>
                            <p className="text-sm font-medium text-[#FFFFFF]">
                              {formatDateFr(selectedDate)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Clock className="w-4 h-4 text-[#CFCFD3] mt-1 shrink-0" />
                          <div>
                            <p className="text-xs text-[#8C8889]">Heure</p>
                            <p className="font-[family-name:var(--font-mono)] text-sm font-medium text-[#FFFFFF] tabular-nums">
                              {selectedSlot.time} – {selectedSlot.end_time}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-[#8C8889]">Client</p>
                          <p className="text-sm font-medium text-[#FFFFFF]">
                            {firstName.trim()} {lastName.trim()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-[#8C8889]">Téléphone</p>
                          <p className="font-[family-name:var(--font-mono)] text-sm font-medium text-[#CFCFD3] tabular-nums">
                            {phone.trim()}
                          </p>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-[#8C8889]/20 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#FFFFFF]">
                          Prix total (règlement au salon)
                        </span>
                        <span className="font-[family-name:var(--font-mono)] text-2xl font-bold text-[#FFFFFF] tabular-nums">
                          {formatPriceFr(selectedService.price)}
                        </span>
                      </div>
                    </div>

                    <motion.button
                      type="button"
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.99 }}
                      disabled={submitting}
                      onClick={handleConfirmBooking}
                      className="w-full py-4 px-6 text-sm font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] disabled:opacity-60 rounded-lg transition-colors duration-200 cursor-pointer"
                    >
                      {submitting
                        ? 'Enregistrement en cours...'
                        : 'Confirmer mon rendez-vous'}
                    </motion.button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
