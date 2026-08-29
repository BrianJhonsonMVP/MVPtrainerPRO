import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  TimerReset,
  UserRound
} from 'lucide-react';
import { Client, User } from '../types';
import { hasFullAccess } from '../services/subscriptionLogic';
import {
  AppLanguage,
  DaySchedule,
  TrainerSession,
  buildWorkoutReminderMessage,
  formatDuration,
  formatSessionCountdown,
  formatSessionTime,
  getDaySchedule,
  getNextSession,
  getWeekSchedule
} from '../services/scheduleService';
import PremiumLockOverlay from './PremiumLockOverlay';
import { IconButton, SecondaryButton, WhatsAppButton } from './ui/Buttons';

interface DailyScheduleProps {
  user: User;
  clients: Client[];
  onOpenClient: (client: Client) => void;
  onShowPaywall: () => void;
  onShowToast?: (toast: { title: string; message: string; type: 'success' | 'warning' | 'error' }) => void;
  language?: AppLanguage;
}

const COPY = {
  es: {
    title: 'Mi Itinerario',
    subtitle: 'Organiza tus entrenamientos y contacta rapidamente a tus clientes.',
    today: 'Hoy',
    week: 'Semana',
    sessions: 'Entrenamientos',
    scheduled: 'Horas programadas',
    next: 'Proximo cliente',
    completedCount: 'Finalizados',
    sessionSingular: 'entrenamiento',
    nextTraining: 'Proximo entrenamiento',
    dailyRoute: 'Agenda del dia',
    noSchedule: 'Hoy no tienes entrenamientos programados.',
    noScheduleHint: 'Aprovecha este espacio para organizar clientes o preparar planes.',
    reminder: 'Enviar recordatorio',
    openChat: 'Abrir WhatsApp',
    profile: 'Ver perfil',
    upcoming: 'Proximo',
    live: 'En curso',
    completed: 'Finalizado',
    start: 'Inicio',
    end: 'Fin',
    weeklyTitle: 'Resumen semanal',
    noSessions: 'Sin entrenamientos',
    hour: 'hora',
    hours: 'horas',
    lockedTitle: 'Agenda Inteligente Bloqueada',
    lockedDescription: 'Organiza tu dia, revisa tus proximas sesiones y contacta a cada cliente desde un solo lugar.',
    lockedCta: 'Desbloquear Agenda PRO',
    noPhoneTitle: 'Telefono no registrado',
    noPhoneMessage: 'Agrega el WhatsApp del cliente para enviar recordatorios.',
    reminderReady: 'Recordatorio preparado',
    syncing: 'Sincronizando tu cuenta...'
  },
  en: {
    title: 'My Schedule',
    subtitle: 'Organize your training sessions and contact clients quickly.',
    today: 'Today',
    week: 'Week',
    sessions: 'Sessions',
    scheduled: 'Scheduled hours',
    next: 'Next client',
    completedCount: 'Completed',
    sessionSingular: 'session',
    nextTraining: 'Next training session',
    dailyRoute: 'Daily schedule',
    noSchedule: 'You have no training sessions scheduled today.',
    noScheduleHint: 'Use this time to organize clients or prepare their plans.',
    reminder: 'Send reminder',
    openChat: 'Open WhatsApp',
    profile: 'View profile',
    upcoming: 'Upcoming',
    live: 'In progress',
    completed: 'Completed',
    start: 'Start',
    end: 'End',
    weeklyTitle: 'Weekly overview',
    noSessions: 'No sessions',
    hour: 'hour',
    hours: 'hours',
    lockedTitle: 'Smart Schedule Locked',
    lockedDescription: 'Organize your day, review upcoming sessions, and contact every client from one place.',
    lockedCta: 'Unlock Schedule PRO',
    noPhoneTitle: 'No phone number',
    noPhoneMessage: 'Add the client WhatsApp number to send reminders.',
    reminderReady: 'Reminder ready',
    syncing: 'Syncing your account...'
  }
};

const normalizePhone = (phone?: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 9) return `51${digits}`;
  return digits;
};

const openWhatsApp = (client: Client, text?: string) => {
  const phone = normalizePhone(client.phone);
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (text) params.set('text', text);
  window.open(`https://api.whatsapp.com/send?${params.toString()}`, '_blank', 'noopener,noreferrer');
};

const sessionTone = (status: TrainerSession['status']) => {
  if (status === 'live') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (status === 'completed') return 'border-zinc-700 bg-zinc-800/70 text-zinc-400';
  return 'border-violet-500/30 bg-violet-500/10 text-violet-200';
};

const avatarInitials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'CL';

const SessionAvatar = ({ client, className = 'h-11 w-11' }: { client: Client; className?: string }) =>
  client.avatarUrl ? (
    <img src={client.avatarUrl} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <div className={`${className} shrink-0 rounded-full border border-violet-400/25 bg-violet-500/12 grid place-items-center text-xs font-black text-violet-100`}>
      {avatarInitials(client.name)}
    </div>
  );

const DailySchedule: React.FC<DailyScheduleProps> = ({
  user,
  clients,
  onOpenClient,
  onShowPaywall,
  onShowToast,
  language = 'es'
}) => {
  const activeLanguage: AppLanguage = language === 'en' ? 'en' : 'es';
  const copy = COPY[activeLanguage];
  const isPro = hasFullAccess(user);
  const isSyncing = Boolean(user.subscription?.isSyncing);
  const canRenderPremium = isPro;
  const [mode, setMode] = useState<'today' | 'week'>('today');
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todaySchedule = useMemo(() => getDaySchedule(clients, now, now), [clients, now]);
  const weekSchedule = useMemo(() => getWeekSchedule(clients, now, now), [clients, now]);
  const nextSession = getNextSession(todaySchedule.sessions);
  const locale = activeLanguage === 'en' ? 'en-US' : 'es-PE';

  const sendReminder = (session: TrainerSession) => {
    if (!normalizePhone(session.client.phone)) {
      onShowToast?.({ title: copy.noPhoneTitle, message: copy.noPhoneMessage, type: 'warning' });
      return;
    }
    openWhatsApp(session.client, buildWorkoutReminderMessage(session, activeLanguage));
    onShowToast?.({ title: copy.reminderReady, message: session.client.name, type: 'success' });
  };

  return (
    <div className="module-page schedule-page mx-auto w-full max-w-5xl px-1 pb-24 sm:px-3">
      <header className="module-page-header mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="module-title-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
            <CalendarDays size={21} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{copy.title}</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">{copy.subtitle}</p>
            <p className="mt-2 text-xs font-bold capitalize text-zinc-300">
              {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>
        <div className="module-segmented inline-grid grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          {(['today', 'week'] as const).map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              aria-pressed={mode === option}
              className={`min-h-10 rounded-lg px-5 text-xs font-black transition-colors ${
                mode === option ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:text-white'
              }`}
            >
              {copy[option]}
            </button>
          ))}
        </div>
      </header>

      {!canRenderPremium ? (
        <section className="relative min-h-[430px] overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c1018]">
          <div className="pro-locked-content grid gap-3 p-5 sm:grid-cols-2 sm:p-7" aria-hidden="true">
            {[0, 1, 2, 3].map(index => <div key={index} className="h-24 rounded-xl border border-zinc-800 bg-zinc-900" />)}
          </div>
          <PremiumLockOverlay
            title={copy.lockedTitle}
            description={copy.lockedDescription}
            cta={copy.lockedCta}
            onUnlock={onShowPaywall}
          />
        </section>
      ) : mode === 'week' ? (
        <WeekView schedule={weekSchedule} language={activeLanguage} onOpenClient={onOpenClient} />
      ) : (
        <div className="space-y-5">
          {isSyncing && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs font-bold text-amber-300">
              {copy.syncing}
            </div>
          )}

          <ScheduleMetrics schedule={todaySchedule} nextSession={nextSession} language={activeLanguage} />

          {nextSession && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <TimerReset size={16} className="text-violet-300" />
                <h2 className="text-sm font-black uppercase tracking-[0.06em] text-zinc-300">{copy.nextTraining}</h2>
              </div>
              <div className="overflow-hidden rounded-2xl border border-violet-500/30 bg-[linear-gradient(115deg,rgba(139,92,246,0.12),rgba(17,22,32,0.96)_45%)] shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
                <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <SessionAvatar client={nextSession.client} className="h-14 w-14" />
                    <div className="min-w-0">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase ${sessionTone(nextSession.status)}`}>
                        {copy[nextSession.status === 'upcoming' ? 'upcoming' : nextSession.status]}
                      </span>
                      <h3 className="mt-2 truncate text-lg font-black text-white">{nextSession.client.name}</h3>
                      <p className="truncate text-xs text-zinc-500">{nextSession.client.mainGoal}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:min-w-[270px]">
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <span className="text-[9px] font-black uppercase text-zinc-500">{copy.start}</span>
                      <p className="mt-1 font-black text-white">{formatSessionTime(nextSession.start, activeLanguage)}</p>
                    </div>
                    <div className="rounded-xl border border-white/8 bg-black/20 p-3">
                      <span className="text-[9px] font-black uppercase text-zinc-500">{copy.end}</span>
                      <p className="mt-1 font-black text-white">{formatSessionTime(nextSession.end, activeLanguage)}</p>
                    </div>
                    <div className="col-span-2 flex items-center justify-between rounded-xl border border-violet-500/20 bg-violet-500/8 px-3 py-2">
                      <span className="text-xs font-black text-violet-200">{formatSessionCountdown(nextSession, activeLanguage)}</span>
                      <span className="text-[10px] font-bold text-zinc-500">{formatDuration(nextSession.durationMinutes, activeLanguage)}</span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-2 border-t border-white/8 p-3 sm:grid-cols-[1fr_auto_auto]">
                  <WhatsAppButton type="button" onClick={() => sendReminder(nextSession)} className="w-full">
                    {copy.reminder}
                  </WhatsAppButton>
                  <SecondaryButton type="button" onClick={() => openWhatsApp(nextSession.client)} icon={<ArrowUpRight size={16} />}>
                    {copy.openChat}
                  </SecondaryButton>
                  <SecondaryButton type="button" onClick={() => onOpenClient(nextSession.client)} icon={<UserRound size={16} />}>
                    {copy.profile}
                  </SecondaryButton>
                </div>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-black uppercase tracking-[0.06em] text-zinc-300">{copy.dailyRoute}</h2>
            {todaySchedule.sessions.length === 0 ? (
              <div className="guided-empty-state rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/35 p-8 text-center">
                <span className="guided-empty-icon"><CalendarDays size={26} /></span>
                <p className="mt-4 text-sm font-black text-zinc-300">{copy.noSchedule}</p>
                <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-zinc-600">{copy.noScheduleHint}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySchedule.sessions.map(session => (
                  <React.Fragment key={session.id}>
                    <SessionRow
                      session={session}
                      language={activeLanguage}
                      onOpen={() => onOpenClient(session.client)}
                      onWhatsApp={() => sendReminder(session)}
                    />
                  </React.Fragment>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

const ScheduleMetrics = ({
  schedule,
  nextSession,
  language
}: {
  schedule: DaySchedule;
  nextSession: TrainerSession | null;
  language: AppLanguage;
}) => {
  const copy = COPY[language];
  const completedSessions = schedule.sessions.filter(session => session.status === 'completed').length;
  const metrics = [
    { icon: CalendarDays, label: copy.sessions, value: schedule.sessions.length },
    { icon: Clock3, label: copy.scheduled, value: formatDuration(schedule.scheduledMinutes, language) },
    { icon: UserRound, label: copy.next, value: nextSession?.client.name || '-' },
    { icon: CheckCircle2, label: copy.completedCount, value: completedSessions }
  ];

  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0f141e] sm:grid-cols-4">
      {metrics.map(({ icon: Icon, label, value }, index) => (
        <div key={label} className={`min-w-0 p-4 ${index % 2 === 0 ? 'border-r border-zinc-800' : ''} ${index < 2 ? 'border-b border-zinc-800 sm:border-b-0' : ''} sm:border-r sm:last:border-r-0`}>
          <Icon size={15} className="text-violet-300" />
          <p className="mt-3 truncate text-base font-black text-white">{value}</p>
          <p className="mt-1 text-[10px] font-bold text-zinc-500">{label}</p>
        </div>
      ))}
    </section>
  );
};

const SessionRow = ({
  session,
  language,
  onOpen,
  onWhatsApp
}: {
  session: TrainerSession;
  language: AppLanguage;
  onOpen: () => void;
  onWhatsApp: () => void;
}) => {
  const copy = COPY[language];
  const statusKey = session.status === 'upcoming' ? 'upcoming' : session.status;
  return (
    <div className="grid gap-3 rounded-xl border border-zinc-800 bg-[#111620] p-3 sm:grid-cols-[92px_1fr_auto] sm:items-center">
      <div className="rounded-lg border border-zinc-800 bg-black/25 px-3 py-2 text-center">
        <p className="text-sm font-black text-white">{formatSessionTime(session.start, language)}</p>
        <p className="mt-1 text-[9px] font-bold text-zinc-600">{formatDuration(session.durationMinutes, language)}</p>
      </div>
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
        <SessionAvatar client={session.client} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-white">{session.client.name}</span>
          <span className="mt-1 block truncate text-xs text-zinc-500">{session.client.mainGoal}</span>
        </span>
      </button>
      <div className="flex items-center justify-between gap-2 sm:justify-end">
        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${sessionTone(session.status)}`}>{copy[statusKey]}</span>
        <WhatsAppButton type="button" onClick={onWhatsApp} title="WhatsApp" aria-label="WhatsApp" iconOnly />
        <IconButton type="button" onClick={onOpen} title={copy.profile} aria-label={copy.profile}>
          <ChevronRight size={17} />
        </IconButton>
      </div>
    </div>
  );
};

const WeekView = ({
  schedule,
  language,
  onOpenClient
}: {
  schedule: DaySchedule[];
  language: AppLanguage;
  onOpenClient: (client: Client) => void;
}) => {
  const copy = COPY[language];
  const locale = language === 'en' ? 'en-US' : 'es-PE';
  return (
    <section>
      <h2 className="mb-3 text-sm font-black uppercase tracking-[0.06em] text-zinc-300">{copy.weeklyTitle}</h2>
      <div className="space-y-2">
        {schedule.map(day => (
          <div key={day.date.toISOString()} className="grid gap-3 rounded-xl border border-zinc-800 bg-[#111620] p-4 sm:grid-cols-[120px_130px_1fr] sm:items-center">
            <div>
              <p className="text-sm font-black capitalize text-white">{day.date.toLocaleDateString(locale, { weekday: 'long' })}</p>
              <p className="mt-1 text-[10px] text-zinc-600">{day.date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</p>
            </div>
            <div>
              <p className="text-xs font-black text-violet-200">
                {day.sessions.length} {day.sessions.length === 1 ? copy.sessionSingular : copy.sessions.toLowerCase()}
              </p>
              <p className="mt-1 text-[10px] text-zinc-600">{formatDuration(day.scheduledMinutes, language)}</p>
            </div>
            {day.sessions.length ? (
              <div className="flex flex-wrap gap-2">
                {day.sessions.map(session => (
                  <button key={session.id} type="button" onClick={() => onOpenClient(session.client)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/50 px-3 text-[11px] font-bold text-zinc-300 hover:border-violet-500/30">
                    <span className="text-violet-300">{formatSessionTime(session.start, language)}</span>
                    <span>{session.client.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-600">{copy.noSessions}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default DailySchedule;
