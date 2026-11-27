import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Phone,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  AppointmentRecord,
  AppointmentStatus,
  BusinessHour,
  DayOff,
} from '../../types/barbershop';
import { formatDateFr, formatPriceFr } from '../../lib/api';

interface AppointmentsCalendarViewProps {
  appointments: AppointmentRecord[];
  daysOff: DayOff[];
  hours: BusinessHour[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  timeCheckQuery: string;
  onAddAtDateTime: (date: string, time?: string) => void;
  onEdit: (appt: AppointmentRecord) => void;
  onStatusChange: (id: number, status: AppointmentStatus) => void;
  onDelete: (id: number) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
}

const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

const STATUS_BADGE: Record<AppointmentStatus, string> = {
  pending: 'text-amber-200 border-amber-500/35 bg-amber-950/40',
  confirmed: 'text-emerald-200 border-emerald-500/35 bg-emerald-950/40',
  completed: 'text-[#CFCFD3] border-[#CFCFD3]/35 bg-white/5',
  cancelled: 'text-red-200 border-red-500/35 bg-red-950/40',
};

const CHIP_STYLES: Record<AppointmentStatus, string> = {
  pending: 'bg-amber-950/70 text-amber-200 border-amber-500/30',
  confirmed: 'bg-emerald-950/70 text-emerald-200 border-emerald-500/30',
  completed: 'bg-white/10 text-[#CFCFD3] border-[#CFCFD3]/25',
  cancelled: 'bg-red-950/40 text-red-300/70 border-red-500/20 line-through',
};

function getLocalToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

function doesAppointmentMatchTime(appt: AppointmentRecord, timeQuery: string): boolean {
  if (!timeQuery) return false;
  const qMin = toMinutes(timeQuery);
  const sMin = toMinutes(appt.start_time);
  const eMin = toMinutes(appt.end_time);
  if (qMin < 0 || sMin < 0 || eMin < 0) {
    return appt.start_time.startsWith(timeQuery);
  }
  return qMin >= sMin && qMin < eMin;
}

export function AppointmentsCalendarView({
  appointments,
  daysOff,
  hours,
  selectedDate,
  onSelectDate,
  timeCheckQuery,
  onAddAtDateTime,
  onEdit,
  onStatusChange,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}: AppointmentsCalendarViewProps) {
  const todayStr = getLocalToday();

  const [viewCursor, setViewCursor] = useState<{ year: number; month: number }>(() => {
    const base = selectedDate || todayStr;
    const [y, m] = base.split('-').map(Number);
    return { year: y, month: m };
  });

  const monthLabel = useMemo(() => {
    const dt = new Date(viewCursor.year, viewCursor.month - 1, 1);
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(dt);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }, [viewCursor]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, AppointmentRecord[]>();
    for (const appt of appointments) {
      const list = map.get(appt.appointment_date) || [];
      list.push(appt);
      map.set(appt.appointment_date, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => a.start_time.localeCompare(b.start_time));
      map.set(k, list);
    }
    return map;
  }, [appointments]);

  const daysOffSet = useMemo(() => new Set(daysOff.map((d) => d.date)), [daysOff]);
  const closedWeekdays = useMemo(
    () => new Set(hours.filter((h) => h.is_open === 0).map((h) => h.day_of_week)),
    [hours]
  );

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewCursor.year, viewCursor.month - 1, 1);
    // Monday-first offset: Sun(0) -> 6, Mon(1) -> 0, ...
    const leadingBlanks = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(viewCursor.year, viewCursor.month, 0).getDate();
    const cells: Array<{ dateStr: string; dayNum: number; weekday: number } | null> = [];

    for (let i = 0; i < leadingBlanks; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewCursor.year}-${String(viewCursor.month).padStart(2, '0')}-${String(
        d
      ).padStart(2, '0')}`;
      const weekday = new Date(viewCursor.year, viewCursor.month - 1, d).getDay();
      cells.push({ dateStr, dayNum: d, weekday });
    }
    return cells;
  }, [viewCursor]);

  const shiftMonth = (delta: number) => {
    const dt = new Date(viewCursor.year, viewCursor.month - 1 + delta, 1);
    setViewCursor({ year: dt.getFullYear(), month: dt.getMonth() + 1 });
  };

  const jumpToToday = () => {
    const [y, m] = todayStr.split('-').map(Number);
    setViewCursor({ year: y, month: m });
    onSelectDate(todayStr);
  };

  const selectedDayAppointments = useMemo(() => {
    return appointmentsByDate.get(selectedDate) || [];
  }, [appointmentsByDate, selectedDate]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Monthly Calendar Grid */}
      <div className="xl:col-span-7 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#FFFFFF]">
            {monthLabel}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Mois précédent"
              className="p-2 bg-[#141416] hover:bg-[#1E1E22] border border-[#8C8889]/25 rounded-lg text-[#FFFFFF] cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-1.5 text-xs font-medium bg-[#141416] hover:bg-[#1E1E22] border border-[#8C8889]/25 rounded-lg text-[#CFCFD3] hover:text-[#FFFFFF] cursor-pointer transition-colors"
            >
              Aujourd’hui
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Mois suivant"
              className="p-2 bg-[#141416] hover:bg-[#1E1E22] border border-[#8C8889]/25 rounded-lg text-[#FFFFFF] cursor-pointer transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 mb-1.5">
          {WEEKDAYS_FR.map((wd) => (
            <div
              key={wd}
              className="text-center text-[11px] font-medium uppercase tracking-wider text-[#8C8889] py-1"
            >
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {calendarCells.map((cell, idx) => {
            if (!cell) {
              return <div key={`blank-${idx}`} className="min-h-[82px] sm:min-h-[96px] rounded-lg bg-[#08080A]/40" />;
            }

            const dayAppts = appointmentsByDate.get(cell.dateStr) || [];
            const activeAppts = dayAppts.filter((a) => a.status !== 'cancelled');
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayStr;
            const isClosed =
              daysOffSet.has(cell.dateStr) || closedWeekdays.has(cell.weekday);
            const hasTimeMatch =
              Boolean(timeCheckQuery) &&
              activeAppts.some((a) => doesAppointmentMatchTime(a, timeCheckQuery));

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onSelectDate(cell.dateStr)}
                className={`min-h-[82px] sm:min-h-[96px] p-1.5 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#19191D] border-[#FFFFFF] ring-1 ring-[#FFFFFF]/40'
                    : hasTimeMatch
                      ? 'bg-amber-950/20 border-amber-400/50 hover:border-amber-300'
                      : isClosed
                        ? 'bg-[#08080A] border-[#8C8889]/15 opacity-70 hover:opacity-100'
                        : 'bg-[#08080A] border-[#8C8889]/20 hover:border-[#8C8889]/60'
                }`}
              >
                <div className="flex items-center justify-between w-full gap-1">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono tabular-nums ${
                      isToday
                        ? 'bg-[#FFFFFF] text-[#000000] font-bold'
                        : 'text-[#FFFFFF] font-medium'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {activeAppts.length > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-white/10 text-[#FFFFFF] tabular-nums">
                      {activeAppts.length}
                    </span>
                  )}
                </div>

                <div className="space-y-1 w-full mt-1 overflow-hidden">
                  {dayAppts.slice(0, 2).map((a) => (
                    <div
                      key={a.id}
                      className={`px-1.5 py-0.5 rounded border text-[10px] truncate font-medium ${
                        CHIP_STYLES[a.status]
                      }`}
                    >
                      <span className="font-mono">{a.start_time}</span> {a.first_name}
                    </div>
                  ))}
                  {dayAppts.length > 2 && (
                    <p className="text-[10px] text-[#8C8889] pl-1 font-medium">
                      +{dayAppts.length - 2} autres
                    </p>
                  )}
                  {dayAppts.length === 0 && isClosed && (
                    <p className="text-[10px] text-[#8C8889]/70 pl-0.5">Fermé</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Agenda Panel */}
      <div className="xl:col-span-5 bg-[#0D0D0F] border border-[#8C8889]/25 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#8C8889]/20 flex flex-wrap items-center justify-between gap-3 bg-[#09090B]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#8C8889]">
              Agenda du jour
            </p>
            <h3 className="text-base font-semibold text-[#FFFFFF] mt-0.5">
              {formatDateFr(selectedDate)}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onAddAtDateTime(selectedDate, timeCheckQuery || undefined)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#000000] bg-[#FFFFFF] hover:bg-[#CFCFD3] rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter client</span>
          </button>
        </div>

        {selectedDayAppointments.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <p className="text-sm text-[#8C8889]">
              Aucun rendez-vous enregistré pour cette date.
            </p>
            <button
              type="button"
              onClick={() => onAddAtDateTime(selectedDate, timeCheckQuery || undefined)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#FFFFFF] bg-[#161619] hover:border-[#FFFFFF] border border-[#8C8889]/30 rounded-lg cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter manuellement un client</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#8C8889]/15 max-h-[620px] overflow-y-auto">
            {selectedDayAppointments.map((appt) => {
              const matchesTime = doesAppointmentMatchTime(appt, timeCheckQuery);
              return (
                <div
                  key={appt.id}
                  className={`p-4 space-y-3 transition-colors ${
                    matchesTime ? 'bg-amber-950/20 border-l-2 border-l-amber-400' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 text-xs font-mono font-semibold text-[#FFFFFF] tabular-nums">
                          <Clock className="w-3 h-3 text-[#CFCFD3]" />
                          {appt.start_time} – {appt.end_time}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[11px] font-medium border rounded ${
                            STATUS_BADGE[appt.status]
                          }`}
                        >
                          {STATUS_LABELS[appt.status]}
                        </span>
                        {matchesTime && (
                          <span className="text-[10px] font-medium text-amber-300">
                            ● Heure recherchée
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-[#FFFFFF]">
                        {appt.first_name} {appt.last_name}
                      </p>
                      <p className="text-xs text-[#CFCFD3]">
                        {appt.service_name} · {appt.duration_minutes} min ·{' '}
                        <span className="font-mono font-semibold text-[#FFFFFF]">
                          {formatPriceFr(appt.price)}
                        </span>
                      </p>
                      <div className="flex items-center gap-3 text-xs text-[#8C8889]">
                        <a
                          href={`tel:${appt.phone}`}
                          className="inline-flex items-center gap-1 font-mono hover:text-[#FFFFFF] transition-colors"
                        >
                          <Phone className="w-3 h-3" />
                          {appt.phone}
                        </a>
                        <span className="font-mono text-[11px]">{appt.reference}</span>
                      </div>
                      {appt.notes && (
                        <p className="text-xs text-[#8C8889] italic">Note : {appt.notes}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <button
                      type="button"
                      onClick={() => onEdit(appt)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-[#161619] hover:border-[#FFFFFF] text-[#FFFFFF] border border-[#8C8889]/30 rounded cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Modifier</span>
                    </button>
                    {appt.status !== 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(appt.id, 'confirmed')}
                        className="px-2.5 py-1 text-xs bg-emerald-950/60 hover:bg-emerald-900/70 text-emerald-200 border border-emerald-500/30 rounded cursor-pointer"
                      >
                        Confirmer
                      </button>
                    )}
                    {appt.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => onStatusChange(appt.id, 'completed')}
                        className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/20 text-[#FFFFFF] border border-[#CFCFD3]/30 rounded cursor-pointer"
                      >
                        Terminer
                      </button>
                    )}
                    {confirmDeleteId === appt.id ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDelete(appt.id)}
                          className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded cursor-pointer font-semibold"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 text-xs text-[#8C8889] hover:text-[#FFFFFF] border border-[#8C8889]/25 rounded cursor-pointer"
                        >
                          Non
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(appt.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-red-950/60 hover:bg-red-900/70 text-red-200 border border-red-500/30 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Supprimer</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
