import { BillingRecord, Client, ClientPaymentInfo } from '../types';
import { AppLanguage, isActiveClient } from './scheduleService';

export type PaymentState = 'paid' | 'pending' | 'overdue' | 'upcoming' | 'scheduled' | 'unregistered';

export interface ResolvedPayment {
  client: Client;
  amount: number;
  date: Date | null;
  lastPaidDate: Date | null;
  diffDays: number | null;
  state: PaymentState;
}

export interface PaymentEvent {
  id: string;
  recordId?: string;
  client: Client;
  amount: number;
  date: Date;
  state: Exclude<PaymentState, 'unregistered'>;
  kind: 'paid' | 'due';
}

const DAY_MS = 86_400_000;

export const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const parsePaymentDate = (value?: string | null) => {
  if (!value) return null;
  // Billing dates represent calendar days. Preserve that day even when an old
  // record contains a UTC timestamp, otherwise Lima can render it one day back.
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    const localDate = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isFinite(localDate.getTime()) ? localDate : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const getPaymentDiffDays = (client: Client, today = new Date()) => {
  const dueDate = parsePaymentDate(client.paymentInfo?.nextPaymentAt);
  if (!dueDate) return null;
  return Math.round((startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / DAY_MS);
};

export const resolveClientPayment = (client: Client, today = new Date()): ResolvedPayment => {
  const payment = client.paymentInfo;
  const amount = Number(payment?.monthlyFee) || 0;
  const date = parsePaymentDate(payment?.nextPaymentAt);
  const lastPaidDate = parsePaymentDate(payment?.lastPaidAt);
  const diffDays = getPaymentDiffDays(client, today);

  let state: PaymentState = 'unregistered';
  if (payment?.status === 'atrasado' || (payment?.status !== 'al_dia' && diffDays !== null && diffDays < 0)) {
    state = 'overdue';
  } else if (payment?.status === 'pendiente') {
    state = 'pending';
  } else if (payment?.status === 'al_dia') {
    state = diffDays !== null && diffDays <= 7 ? 'upcoming' : 'paid';
  } else if (date) {
    state = diffDays !== null && diffDays < 0 ? 'overdue' : 'scheduled';
  }

  return { client, amount, date, lastPaidDate, diffDays, state };
};

export const needsPaymentAttention = (client: Client, today = new Date()) => {
  const resolved = resolveClientPayment(client, today);
  return resolved.state === 'overdue' || resolved.state === 'pending' || resolved.state === 'upcoming';
};

export const getPaymentLabel = (client: Client, language: AppLanguage = 'es', today = new Date()) => {
  const payment = resolveClientPayment(client, today);
  if (payment.state === 'overdue') {
    const days = payment.diffDays !== null ? Math.abs(payment.diffDays) : 0;
    if (!days) return language === 'en' ? 'Overdue' : 'Vencido';
    return language === 'en' ? `${days}d overdue` : `Vencido ${days}d`;
  }
  if (payment.state === 'pending') return language === 'en' ? 'Pending' : 'Pendiente';
  if (payment.state === 'upcoming') {
    if (payment.diffDays === 0) return language === 'en' ? 'Due today' : 'Vence hoy';
    return language === 'en' ? `Due in ${payment.diffDays}d` : `Vence ${payment.diffDays}d`;
  }
  if (payment.state === 'paid') return language === 'en' ? 'Paid up' : 'Al dia';
  if (payment.state === 'scheduled') return language === 'en' ? 'Scheduled' : 'Programado';
  return language === 'en' ? 'No payment' : 'Sin pago';
};

export const getPaymentBadgeClass = (client: Client, today = new Date()) => {
  const { state } = resolveClientPayment(client, today);
  if (state === 'overdue') return 'bg-red-500/10 text-red-300 border-red-500/20';
  if (state === 'pending' || state === 'upcoming') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
  if (state === 'paid') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (state === 'scheduled') return 'bg-violet-500/10 text-violet-300 border-violet-500/20';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700';
};

export const formatPaymentTimeline = (client: Client, language: AppLanguage = 'es', today = new Date()) => {
  const payment = resolveClientPayment(client, today);
  const diff = payment.diffDays;

  if (payment.state === 'overdue') {
    const days = diff !== null ? Math.abs(diff) : 0;
    if (!days) return language === 'en' ? 'Payment overdue' : 'Pago vencido';
    return language === 'en'
      ? `Payment overdue by ${days} day${days === 1 ? '' : 's'}`
      : `Pago vencido hace ${days} dia${days === 1 ? '' : 's'}`;
  }
  if (payment.state === 'pending') {
    if (diff === 0) return language === 'en' ? 'Payment pending today' : 'Pago pendiente hoy';
    if (diff === 1) return language === 'en' ? 'Payment pending tomorrow' : 'Pago pendiente para manana';
    return language === 'en' ? 'Payment pending' : 'Pago pendiente';
  }
  if (payment.state === 'upcoming' || payment.state === 'scheduled') {
    if (diff === 0) return language === 'en' ? 'Payment due today' : 'Pago vence hoy';
    if (diff === 1) return language === 'en' ? 'Payment due tomorrow' : 'Pago vence manana';
    if (diff !== null) return language === 'en' ? `Payment due in ${diff} days` : `Pago vence en ${diff} dias`;
  }
  if (payment.state === 'paid') return language === 'en' ? 'Payment up to date' : 'Pago al dia';
  return language === 'en' ? 'No payment registered' : 'Sin pago registrado';
};

export const buildPaymentReminderText = (client: Client, language: AppLanguage = 'es', today = new Date()) => {
  const payment = resolveClientPayment(client, today);
  const amount = formatMoney(payment.amount, client.country, language);
  const amountText = payment.amount > 0 ? (language === 'en' ? ` of ${amount}` : ` de ${amount}`) : '';
  const timeline = formatPaymentTimeline(client, language, today).toLowerCase();
  return language === 'en'
    ? `Hi ${client.name} \u{1F44B} this is a reminder about your training payment${amountText}: ${timeline}. Let me know so we can coordinate it.`
    : `Hola ${client.name} \u{1F44B} te recuerdo tu pago de entrenamiento${amountText}: ${timeline}. Avisame para coordinarlo.`;
};

export const buildPaymentEventReminderText = (
  event: PaymentEvent,
  language: AppLanguage = 'es',
  today = new Date()
) => {
  const amount = formatMoney(event.amount, event.client.country, language);
  const amountText = event.amount > 0 ? (language === 'en' ? ` of ${amount}` : ` de ${amount}`) : '';
  const dueDiff = Math.round((startOfDay(event.date).getTime() - startOfDay(today).getTime()) / DAY_MS);
  const dateText = event.date.toLocaleDateString(language === 'en' ? 'en-US' : 'es-PE', {
    day: 'numeric',
    month: 'long'
  });

  let timeline = language === 'en' ? `due on ${dateText}` : `con vencimiento el ${dateText}`;
  if (dueDiff < 0) {
    const days = Math.abs(dueDiff);
    timeline = language === 'en'
      ? `${days} day${days === 1 ? '' : 's'} overdue`
      : `vencido hace ${days} dia${days === 1 ? '' : 's'}`;
  } else if (dueDiff === 0) {
    timeline = language === 'en' ? 'due today' : 'con vencimiento hoy';
  } else if (dueDiff === 1) {
    timeline = language === 'en' ? 'due tomorrow' : 'con vencimiento manana';
  }

  return language === 'en'
    ? `Hi ${event.client.name} \u{1F44B} this is a reminder about your training payment${amountText}, ${timeline}. Let me know so we can coordinate it.`
    : `Hola ${event.client.name} \u{1F44B} te recuerdo tu pago de entrenamiento${amountText}, ${timeline}. Avisame para coordinarlo.`;
};

const sameCalendarDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

const resolveBillingRecordState = (
  record: BillingRecord,
  client: Client,
  dueDate: Date,
  today = new Date()
): Exclude<PaymentState, 'unregistered' | 'paid'> => {
  const diffDays = Math.round((startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / DAY_MS);
  const currentDueDate = parsePaymentDate(client.paymentInfo?.nextPaymentAt);
  const isCurrentDue = Boolean(currentDueDate && sameCalendarDate(currentDueDate, dueDate));

  if (record.status === 'late' || diffDays < 0) return 'overdue';
  if (client.paymentInfo?.status === 'atrasado' && isCurrentDue) return 'overdue';
  if (client.paymentInfo?.status === 'pendiente' && isCurrentDue) return 'pending';
  if (diffDays <= 7) return 'upcoming';
  return 'scheduled';
};

export const buildPaymentEventsForMonth = (
  clients: Client[],
  month: Date,
  billingRecords: BillingRecord[] = [],
  today = new Date()
): PaymentEvent[] => {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const events: PaymentEvent[] = [];
  const activeClients = clients.filter(isActiveClient);
  const clientsById = new Map(activeClients.map(client => [client.id, client]));
  const ledgerClientIds = new Set(
    billingRecords
      .filter(record => clientsById.has(record.clientId))
      .map(record => record.clientId)
  );

  billingRecords.forEach(record => {
    const client = clientsById.get(record.clientId);
    if (!client) return;
    const dueDate = parsePaymentDate(record.dueDate);
    const paidDate = parsePaymentDate(record.paidAt);
    const eventDate = record.status === 'paid' ? (paidDate || dueDate) : dueDate;
    if (!eventDate || eventDate.getFullYear() !== year || eventDate.getMonth() !== monthIndex) return;

    events.push({
      id: `billing-${record.id}`,
      recordId: record.id,
      client,
      amount: Number(record.amount) || 0,
      date: eventDate,
      state: record.status === 'paid' ? 'paid' : resolveBillingRecordState(record, client, eventDate, today),
      kind: record.status === 'paid' ? 'paid' : 'due'
    });
  });

  activeClients.forEach(client => {
    // Once the ledger has records for a client it is the single source of
    // payment truth. Legacy profile fields remain only as backwards fallback.
    if (ledgerClientIds.has(client.id)) return;
    const resolved = resolveClientPayment(client, today);
    const hasPaidRecord = resolved.lastPaidDate
      ? events.some(event =>
          event.client.id === client.id
          && event.kind === 'paid'
          && sameCalendarDate(event.date, resolved.lastPaidDate!)
        )
      : false;
    if (
      resolved.lastPaidDate
      && !hasPaidRecord
      && resolved.lastPaidDate.getFullYear() === year
      && resolved.lastPaidDate.getMonth() === monthIndex
    ) {
      events.push({
        id: `${client.id}-paid-${resolved.lastPaidDate.toISOString()}`,
        client,
        amount: resolved.amount,
        date: resolved.lastPaidDate,
        state: 'paid',
        kind: 'paid'
      });
    }
    const hasDueRecord = resolved.date
      ? events.some(event =>
          event.client.id === client.id
          && event.kind === 'due'
          && sameCalendarDate(event.date, resolved.date!)
        )
      : false;
    if (
      resolved.date
      && !hasDueRecord
      && resolved.date.getFullYear() === year
      && resolved.date.getMonth() === monthIndex
    ) {
      const state = resolved.state === 'paid' ? 'scheduled' : resolved.state;
      events.push({
        id: `${client.id}-due-${resolved.date.toISOString()}`,
        client,
        amount: resolved.amount,
        date: resolved.date,
        state: state === 'unregistered' ? 'scheduled' : state,
        kind: 'due'
      });
    }
  });

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
};

export const getMonthlyPaymentSummary = (
  clients: Client[],
  month: Date,
  billingRecords: BillingRecord[] = [],
  today = new Date()
) => {
  const events = buildPaymentEventsForMonth(clients, month, billingRecords, today);
  const dueEvents = events.filter(event => event.kind === 'due');
  return {
    collected: events.filter(event => event.kind === 'paid').reduce((sum, event) => sum + event.amount, 0),
    pending: dueEvents.filter(event => event.state === 'pending').reduce((sum, event) => sum + event.amount, 0),
    overdue: dueEvents.filter(event => event.state === 'overdue').reduce((sum, event) => sum + event.amount, 0),
    upcoming: dueEvents.filter(event => event.state === 'upcoming' || event.state === 'scheduled').length,
    pendingClients: new Set(dueEvents.filter(event => event.state === 'pending' || event.state === 'overdue').map(event => event.client.id)).size
  };
};

const addCalendarMonthsClamped = (date: Date, months: number) => {
  const result = new Date(date);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
};

export const markPaymentPaid = (
  payment: ClientPaymentInfo,
  paidAt = new Date(),
  coverageMonths = 1
): ClientPaymentInfo => {
  const months = Math.max(1, Math.min(12, Math.round(coverageMonths)));
  const currentDue = parsePaymentDate(payment.nextPaymentAt);
  const coverageStart = currentDue && startOfDay(currentDue).getTime() > startOfDay(paidAt).getTime()
    ? currentDue
    : paidAt;
  const nextPayment = addCalendarMonthsClamped(coverageStart, months);

  return {
    ...payment,
    status: 'al_dia',
    lastPaidAt: paidAt.toISOString(),
    nextPaymentAt: nextPayment.toISOString(),
    lastPaymentAmount: (Number(payment.monthlyFee) || 0) * months,
    lastPaymentMonths: months
  };
};

export const markPaymentOverdue = (payment: ClientPaymentInfo, today = new Date()): ClientPaymentInfo => ({
  ...payment,
  status: 'atrasado',
  nextPaymentAt: payment.nextPaymentAt || today.toISOString()
});

export const markPaymentPending = (payment: ClientPaymentInfo, today = new Date(), days = 1): ClientPaymentInfo => {
  const dueDate = startOfDay(today);
  dueDate.setDate(dueDate.getDate() + Math.max(0, Math.round(days)));
  return {
    ...payment,
    status: 'pendiente',
    nextPaymentAt: dueDate.toISOString()
  };
};

export const formatMoney = (amount: number, country?: string, language: AppLanguage = 'es') => {
  const isPeru = !country || country.toLowerCase().includes('per');
  const currency = isPeru ? 'PEN' : 'USD';
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'es-PE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(amount || 0);
};
