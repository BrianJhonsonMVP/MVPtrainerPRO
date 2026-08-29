import { Client, ScheduleException } from '../types';

export type AppLanguage = 'es' | 'en';
export type SessionStatus = 'upcoming' | 'live' | 'completed';

export interface TrainerSession {
  id: string;
  client: Client;
  date: Date;
  start: Date;
  end: Date;
  durationMinutes: number;
  minutesUntilStart: number;
  status: SessionStatus;
  exception?: ScheduleException;
}

export interface DaySchedule {
  date: Date;
  sessions: TrainerSession[];
  scheduledMinutes: number;
  freeSlots: number;
}

const DAY_ALIASES: Record<string, number> = {
  domingo: 0,
  sunday: 0,
  dom: 0,
  sun: 0,
  lunes: 1,
  monday: 1,
  lun: 1,
  mon: 1,
  martes: 2,
  tuesday: 2,
  mar: 2,
  tue: 2,
  miercoles: 3,
  wednesday: 3,
  mie: 3,
  wed: 3,
  jueves: 4,
  thursday: 4,
  jue: 4,
  thu: 4,
  viernes: 5,
  friday: 5,
  vie: 5,
  fri: 5,
  sabado: 6,
  saturday: 6,
  sab: 6,
  sat: 6
};

const MINUTE_MS = 60_000;
const DEFAULT_DURATION_MINUTES = 60;
const WORKDAY_START_MINUTES = 6 * 60;
const WORKDAY_END_MINUTES = 22 * 60;

export const normalizeDayName = (value = '') =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const isActiveClient = (client: Client) => client.status === 'active';

export const toScheduleDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getScheduleException = (client: Client, date: Date) =>
  client.scheduleExceptions?.find(item => item.date === toScheduleDateKey(date)) || null;

export const trainsOnDate = (client: Client, date = new Date()) =>
  isActiveClient(client) && (() => {
    const exception = getScheduleException(client, date);
    if (exception?.type === 'cancelled') return false;
    if (exception?.type === 'rescheduled') return true;
    return Array.isArray(client.trainingDays)
      && client.trainingDays.some(day => DAY_ALIASES[normalizeDayName(day)] === date.getDay());
  })();

const parseClockMinutes = (value = '') => {
  const normalized = value.trim().toUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const modifier = match[3];
  if (minutes > 59 || hours > 23) return null;

  if (modifier) {
    if (hours < 1 || hours > 12) return null;
    if (hours === 12) hours = 0;
    if (modifier === 'PM') hours += 12;
  }

  return hours * 60 + minutes;
};

export const parseTrainingRange = (value?: string | null) => {
  if (!value) return null;
  const parts = value.split(/\s*-\s*/);
  const startMinutes = parseClockMinutes(parts[0]);
  if (startMinutes === null) return null;

  const endMinutes = parts[1] ? parseClockMinutes(parts[1]) : null;
  const safeEnd = endMinutes !== null && endMinutes > startMinutes
    ? endMinutes
    : startMinutes + DEFAULT_DURATION_MINUTES;

  return { startMinutes, endMinutes: safeEnd };
};

const atMinutes = (date: Date, minutes: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);

const resolveSessionStatus = (start: Date, end: Date, now: Date): SessionStatus => {
  if (now.getTime() >= end.getTime()) return 'completed';
  if (now.getTime() >= start.getTime()) return 'live';
  return 'upcoming';
};

export const getClientSessionForDate = (
  client: Client,
  date = new Date(),
  now = new Date()
): TrainerSession | null => {
  if (!trainsOnDate(client, date)) return null;
  const exception = getScheduleException(client, date);
  const exceptionRange = exception?.type === 'rescheduled' && exception.startTime
    ? `${exception.startTime}${exception.endTime ? ` - ${exception.endTime}` : ''}`
    : null;
  const range = parseTrainingRange(exceptionRange || client.trainingTime);
  if (!range) return null;

  const start = atMinutes(date, range.startMinutes);
  const end = atMinutes(date, range.endMinutes);
  return {
    id: `${client.id}-${toScheduleDateKey(date)}`,
    client,
    date,
    start,
    end,
    durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / MINUTE_MS)),
    minutesUntilStart: Math.ceil((start.getTime() - now.getTime()) / MINUTE_MS),
    status: resolveSessionStatus(start, end, now),
    exception: exception || undefined
  };
};

export const getSessionsForDate = (clients: Client[], date = new Date(), now = new Date()) =>
  clients
    .map(client => getClientSessionForDate(client, date, now))
    .filter((session): session is TrainerSession => Boolean(session))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

const countFreeSlots = (sessions: TrainerSession[]) => {
  if (sessions.length === 0) return 1;
  let cursor = WORKDAY_START_MINUTES;
  let freeSlots = 0;

  sessions.forEach(session => {
    const start = session.start.getHours() * 60 + session.start.getMinutes();
    const end = session.end.getHours() * 60 + session.end.getMinutes();
    if (start - cursor >= DEFAULT_DURATION_MINUTES) freeSlots += 1;
    cursor = Math.max(cursor, end);
  });

  if (WORKDAY_END_MINUTES - cursor >= DEFAULT_DURATION_MINUTES) freeSlots += 1;
  return freeSlots;
};

export const getDaySchedule = (clients: Client[], date = new Date(), now = new Date()): DaySchedule => {
  const sessions = getSessionsForDate(clients, date, now);
  return {
    date,
    sessions,
    scheduledMinutes: sessions.reduce((total, session) => total + session.durationMinutes, 0),
    freeSlots: countFreeSlots(sessions)
  };
};

export const getWeekStart = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
};

export const getWeekSchedule = (clients: Client[], reference = new Date(), now = new Date()) => {
  const start = getWeekStart(reference);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return getDaySchedule(clients, date, now);
  });
};

export const getNextSession = (sessions: TrainerSession[]) =>
  sessions.find(session => session.status === 'live') ||
  sessions.find(session => session.status === 'upcoming') ||
  null;

export const formatSessionTime = (date: Date, language: AppLanguage = 'es') =>
  date.toLocaleTimeString(language === 'en' ? 'en-US' : 'es-PE', {
    hour: '2-digit',
    minute: '2-digit'
  });

export const formatDuration = (minutes: number, language: AppLanguage = 'es') => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${minutes} min`;
  if (!remainder) return `${hours} h`;
  return language === 'en' ? `${hours}h ${remainder}m` : `${hours} h ${remainder} min`;
};

export const formatSessionCountdown = (session: TrainerSession, language: AppLanguage = 'es') => {
  if (session.status === 'live') return language === 'en' ? 'In progress' : 'En curso';
  if (session.status === 'completed') return language === 'en' ? 'Completed' : 'Finalizado';
  if (session.minutesUntilStart <= 1) return language === 'en' ? 'Starts now' : 'Empieza ahora';

  const hours = Math.floor(session.minutesUntilStart / 60);
  const minutes = session.minutesUntilStart % 60;
  if (hours === 0) return language === 'en' ? `Starts in ${minutes} min` : `Comienza en ${minutes} min`;
  if (minutes === 0) return language === 'en' ? `Starts in ${hours} h` : `Comienza en ${hours} h`;
  return language === 'en'
    ? `Starts in ${hours} h ${minutes} min`
    : `Comienza en ${hours} h ${minutes} min`;
};

export const buildWorkoutReminderMessage = (
  session: TrainerSession,
  language: AppLanguage = 'es'
) => {
  const start = formatSessionTime(session.start, language);
  const end = formatSessionTime(session.end, language);
  return language === 'en'
    ? `Hi ${session.client.name} \u{1F44B} this is a reminder that we have training today from ${start} to ${end}. See you on time \u{1F4AA}`
    : `Hola ${session.client.name} \u{1F44B} te recuerdo que hoy tenemos entrenamiento de ${start} a ${end}. Nos vemos puntual \u{1F4AA}`;
};
