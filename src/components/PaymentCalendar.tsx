import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  TriangleAlert,
  UserRound
} from 'lucide-react';
import { BillingRecord, Client, ClientPaymentInfo, User } from '../types';
import { hasFullAccess } from '../services/subscriptionLogic';
import {
  PaymentEvent,
  PaymentState,
  buildPaymentEventsForMonth,
  buildPaymentEventReminderText,
  formatMoney,
  getMonthlyPaymentSummary,
} from '../services/paymentService';
import { AppLanguage } from '../services/scheduleService';
import PremiumLockOverlay from './PremiumLockOverlay';
import QuickPaymentDialog from './QuickPaymentDialog';
import { IconButton, PrimaryButton, SecondaryButton, WhatsAppButton } from './ui/Buttons';

interface Props {
  user: User;
  clients: Client[];
  billingRecords?: BillingRecord[];
  onShowPaywall: () => void;
  onOpenClient: (client: Client, tab?: 'profile' | 'payments') => void;
  onUpdatePayment: (client: Client, payment: ClientPaymentInfo) => Promise<void>;
  onShowToast?: (toast: { title: string; message: string; type: 'success' | 'warning' | 'error' }) => void;
  language?: AppLanguage;
}

type PaymentFilter = 'all' | 'pending' | 'overdue' | 'paid';

const COPY = {
  es: {
    title: 'Calendario de Pagos',
    subtitle: 'Controla cobros, vencimientos y acciones pendientes desde un solo lugar.',
    collected: 'Cobrado este mes',
    pending: 'Pendiente',
    overdue: 'Vencido',
    upcoming: 'Proximos cobros',
    clientsPending: 'clientes pendientes',
    all: 'Todos',
    paid: 'Pagados',
    dayDetail: 'Pagos del',
    noPayments: 'No hay pagos para esta fecha.',
    noMonth: 'No hay movimientos registrados este mes.',
    reminder: 'Recordar',
    markPaid: 'Marcar pagado',
    viewClient: 'Ver cliente',
    edit: 'Editar',
    due: 'Vencimiento',
    payment: 'Pago',
    lockedTitle: 'Calendario de Pagos PRO',
    lockedDescription: 'Visualiza vencimientos, controla deuda y registra cobros desde un panel financiero.',
    lockedCta: 'Desbloquear Calendario',
    syncing: 'Sincronizando tu cuenta...',
    noPhoneTitle: 'Telefono no registrado',
    noPhoneMessage: 'Agrega el WhatsApp del cliente para enviar recordatorios.',
    paymentSaved: 'Pago registrado',
    paymentSavedMessage: 'El calendario y el perfil ya reflejan el nuevo ciclo.',
    errorTitle: 'No se pudo guardar',
    previousMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente'
  },
  en: {
    title: 'Payment Calendar',
    subtitle: 'Manage collections, due dates, and pending actions from one place.',
    collected: 'Collected this month',
    pending: 'Pending',
    overdue: 'Overdue',
    upcoming: 'Upcoming payments',
    clientsPending: 'clients pending',
    all: 'All',
    paid: 'Paid',
    dayDetail: 'Payments for',
    noPayments: 'There are no payments for this date.',
    noMonth: 'There are no payment records this month.',
    reminder: 'Remind',
    markPaid: 'Mark paid',
    viewClient: 'View client',
    edit: 'Edit',
    due: 'Due',
    payment: 'Payment',
    lockedTitle: 'PRO Payment Calendar',
    lockedDescription: 'View due dates, manage debt, and record collections from one financial panel.',
    lockedCta: 'Unlock Calendar',
    syncing: 'Syncing your account...',
    noPhoneTitle: 'No phone number',
    noPhoneMessage: 'Add the client WhatsApp number to send reminders.',
    paymentSaved: 'Payment recorded',
    paymentSavedMessage: 'The calendar and client profile now show the new cycle.',
    errorTitle: 'Could not save',
    previousMonth: 'Previous month',
    nextMonth: 'Next month'
  }
};

const normalizePhone = (phone?: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 9 ? `51${digits}` : digits;
};

const openWhatsApp = (client: Client, text: string) => {
  const params = new URLSearchParams({ phone: normalizePhone(client.phone), text });
  window.open(`https://api.whatsapp.com/send?${params.toString()}`, '_blank', 'noopener,noreferrer');
};

const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const stateTone: Record<PaymentEvent['state'], string> = {
  paid: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  overdue: 'border-red-500/30 bg-red-500/10 text-red-300',
  upcoming: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  scheduled: 'border-violet-500/30 bg-violet-500/10 text-violet-300'
};

const PaymentCalendar: React.FC<Props> = ({
  user,
  clients,
  billingRecords = [],
  onShowPaywall,
  onOpenClient,
  onUpdatePayment,
  onShowToast,
  language = 'es'
}) => {
  const activeLanguage: AppLanguage = language === 'en' ? 'en' : 'es';
  const copy = COPY[activeLanguage];
  const locale = activeLanguage === 'en' ? 'en-US' : 'es-PE';
  const isPro = hasFullAccess(user);
  const isSyncing = Boolean(user.subscription?.isSyncing);
  const canRenderPremium = isPro;
  const [today, setToday] = useState(() => new Date());
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [savingClientId, setSavingClientId] = useState<string | null>(null);
  const [paymentEvent, setPaymentEvent] = useState<PaymentEvent | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const events = useMemo(
    () => buildPaymentEventsForMonth(clients, month, billingRecords, today),
    [clients, month, billingRecords, today]
  );
  const summary = useMemo(
    () => getMonthlyPaymentSummary(clients, month, billingRecords, today),
    [clients, month, billingRecords, today]
  );
  const filteredEvents = useMemo(() => events.filter(event => {
    if (filter === 'all') return true;
    if (filter === 'paid') return event.state === 'paid';
    return event.state === filter;
  }), [events, filter]);
  const selectedEvents = filteredEvents.filter(event => dateKey(event.date) === dateKey(selectedDate));

  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const calendarStart = new Date(firstDay);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  calendarStart.setDate(firstDay.getDate() - mondayOffset);
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    return date;
  });

  const changeMonth = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next);
    setSelectedDate(next);
  };

  const sendReminder = (event: PaymentEvent) => {
    if (!normalizePhone(event.client.phone)) {
      onShowToast?.({ title: copy.noPhoneTitle, message: copy.noPhoneMessage, type: 'warning' });
      return;
    }
    openWhatsApp(event.client, buildPaymentEventReminderText(event, activeLanguage));
  };

  const handleMarkPaid = async (payment: ClientPaymentInfo) => {
    if (!paymentEvent) return;
    setSavingClientId(paymentEvent.client.id);
    try {
      await onUpdatePayment(paymentEvent.client, payment);
      onShowToast?.({ title: copy.paymentSaved, message: copy.paymentSavedMessage, type: 'success' });
      setPaymentEvent(null);
    } catch (error) {
      onShowToast?.({
        title: copy.errorTitle,
        message: error instanceof Error ? error.message : copy.errorTitle,
        type: 'error'
      });
    } finally {
      setSavingClientId(null);
    }
  };

  if (!canRenderPremium) {
    return (
      <div className="relative mx-auto min-h-[540px] w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c1018]">
        <div className="pro-locked-content grid grid-cols-4 gap-3 p-6" aria-hidden="true">
          {[0, 1, 2, 3].map(index => <div key={index} className="h-24 rounded-xl bg-zinc-900" />)}
        </div>
        <PremiumLockOverlay title={copy.lockedTitle} description={copy.lockedDescription} cta={copy.lockedCta} onUnlock={onShowPaywall} />
      </div>
    );
  }

  return (
    <div className="module-page payment-page mx-auto w-full max-w-5xl px-1 pb-24 sm:px-3">
      {paymentEvent && (
        <QuickPaymentDialog
          clientName={paymentEvent.client.name}
          country={paymentEvent.client.country}
          payment={paymentEvent.client.paymentInfo}
          language={activeLanguage}
          saving={savingClientId === paymentEvent.client.id}
          onClose={() => setPaymentEvent(null)}
          onConfirm={handleMarkPaid}
        />
      )}
      <header className="module-page-header mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="module-title-icon payment-title-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
            <CircleDollarSign size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">{copy.title}</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">{copy.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton type="button" onClick={() => changeMonth(-1)} aria-label={copy.previousMonth} title={copy.previousMonth}><ChevronLeft size={18} /></IconButton>
          <span className="min-w-[150px] rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-center text-xs font-black capitalize text-white">
            {month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
          </span>
          <IconButton type="button" onClick={() => changeMonth(1)} aria-label={copy.nextMonth} title={copy.nextMonth}><ChevronRight size={18} /></IconButton>
        </div>
      </header>

      {isSyncing && (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-xs font-bold text-amber-300">{copy.syncing}</div>
      )}

      <PaymentSummary summary={summary} clients={clients} language={activeLanguage} />

      <div className="module-filter-bar my-5 flex gap-2 overflow-x-auto pb-1">
        {(['all', 'pending', 'overdue', 'paid'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            className={`min-h-9 shrink-0 rounded-lg border px-4 text-[11px] font-black ${
              filter === option ? 'border-violet-500 bg-violet-500 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white'
            }`}
          >
            {copy[option]}
          </button>
        ))}
      </div>

      <div className="hidden lg:grid lg:grid-cols-[1fr_330px] lg:gap-4">
        <section className="rounded-2xl border border-zinc-800 bg-[#0f141e] p-3">
          <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-black uppercase text-zinc-600">
            {(language === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']).map(day => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {calendarDays.map(date => {
              const dayEvents = filteredEvents.filter(event => dateKey(event.date) === dateKey(date));
              const selected = dateKey(date) === dateKey(selectedDate);
              const current = dateKey(date) === dateKey(today);
              return (
                <button
                  type="button"
                  key={date.toISOString()}
                  onClick={() => setSelectedDate(date)}
                  className={`min-h-[92px] rounded-xl border p-2 text-left transition-colors ${
                    selected ? 'border-violet-500 bg-violet-500/8' : 'border-zinc-800 bg-zinc-950/30 hover:border-zinc-700'
                  } ${!sameMonth(date, month) ? 'opacity-35' : ''}`}
                >
                  <span className={`text-xs font-black ${current ? 'text-violet-300' : 'text-zinc-400'}`}>{date.getDate()}</span>
                  <div className="mt-2 space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <span key={event.id} className={`block truncate rounded-md border px-1.5 py-1 text-[9px] font-bold ${stateTone[event.state]}`}>
                        {event.client.name} - {formatMoney(event.amount, event.client.country, activeLanguage)}
                      </span>
                    ))}
                    {dayEvents.length > 2 && <span className="text-[9px] font-bold text-zinc-500">+{dayEvents.length - 2}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        <DayDetail
          date={selectedDate}
          events={selectedEvents}
          language={activeLanguage}
          savingClientId={savingClientId}
          onReminder={sendReminder}
          onPaid={setPaymentEvent}
          onOpenClient={onOpenClient}
        />
      </div>

      <section className="space-y-3 lg:hidden">
        {filteredEvents.length === 0 ? (
          <div className="guided-empty-state rounded-2xl border border-dashed border-zinc-800 p-8 text-center">
            <span className="guided-empty-icon"><Banknote size={26} /></span>
            <p className="mt-3 text-sm font-bold text-zinc-500">{copy.noMonth}</p>
          </div>
        ) : (
          Array.from(new Set(filteredEvents.map(event => dateKey(event.date)))).map(key => {
            const dayEvents = filteredEvents.filter(event => dateKey(event.date) === key);
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#0f141e]">
                <div className="border-b border-zinc-800 px-4 py-3">
                  <p className="text-xs font-black capitalize text-zinc-300">{dayEvents[0].date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                </div>
                <div className="space-y-2 p-3">
                  {dayEvents.map(event => (
                    <React.Fragment key={event.id}>
                      <PaymentEventRow
                        event={event}
                        language={activeLanguage}
                        saving={savingClientId === event.client.id}
                        onReminder={() => sendReminder(event)}
                        onPaid={() => setPaymentEvent(event)}
                        onOpenClient={() => onOpenClient(event.client, 'payments')}
                      />
                    </React.Fragment>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
};

const PaymentSummary = ({
  summary,
  clients,
  language
}: {
  summary: ReturnType<typeof getMonthlyPaymentSummary>;
  clients: Client[];
  language: AppLanguage;
}) => {
  const copy = COPY[language];
  const country = clients[0]?.country;
  const metrics = [
    { label: copy.collected, value: formatMoney(summary.collected, country, language), icon: Check, tone: 'text-emerald-300' },
    { label: copy.pending, value: formatMoney(summary.pending, country, language), icon: Banknote, tone: 'text-amber-300' },
    { label: copy.overdue, value: formatMoney(summary.overdue, country, language), icon: TriangleAlert, tone: 'text-red-300' },
    { label: copy.upcoming, value: summary.upcoming, icon: CalendarDays, tone: 'text-violet-300' }
  ];
  return (
    <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-zinc-800 bg-[#0f141e] lg:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, tone }, index) => (
        <div key={label} className={`p-4 ${index % 2 === 0 ? 'border-r border-zinc-800' : ''} ${index < 2 ? 'border-b border-zinc-800 lg:border-b-0' : ''} lg:border-r lg:last:border-r-0`}>
          <Icon size={16} className={tone} />
          <p className="mt-3 text-lg font-black text-white">{value}</p>
          <p className="mt-1 text-[10px] font-bold text-zinc-500">{label}</p>
          {label === copy.pending && summary.pendingClients > 0 && <p className="mt-1 text-[9px] text-amber-400">{summary.pendingClients} {copy.clientsPending}</p>}
        </div>
      ))}
    </section>
  );
};

const stateLabel = (state: PaymentState, language: AppLanguage) => {
  const labels = {
    es: { paid: 'Pagado', pending: 'Pendiente', overdue: 'Vencido', upcoming: 'Proximo', scheduled: 'Programado', unregistered: 'Sin registro' },
    en: { paid: 'Paid', pending: 'Pending', overdue: 'Overdue', upcoming: 'Upcoming', scheduled: 'Scheduled', unregistered: 'Unregistered' }
  };
  return labels[language][state];
};

const PaymentEventRow = ({
  event,
  language,
  saving,
  onReminder,
  onPaid,
  onOpenClient
}: {
  event: PaymentEvent;
  language: AppLanguage;
  saving: boolean;
  onReminder: () => void;
  onPaid: () => void;
  onOpenClient: () => void;
}) => {
  const copy = COPY[language];
  const isPaid = event.state === 'paid' || event.kind === 'paid';
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenClient} className="min-w-0 text-left">
          <p className="truncate text-sm font-black text-white">{event.client.name}</p>
          <p className="mt-1 text-xs font-bold text-zinc-500">{formatMoney(event.amount, event.client.country, language)}</p>
        </button>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase ${stateTone[event.state]}`}>{stateLabel(event.state, language)}</span>
      </div>
      <div className={`mt-3 grid gap-2 ${isPaid ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {!isPaid && (
          <WhatsAppButton type="button" onClick={onReminder} compact>{copy.reminder}</WhatsAppButton>
        )}
        {!isPaid && event.kind === 'due' ? (
          <PrimaryButton type="button" disabled={saving} onClick={onPaid} compact icon={<Check size={14} />}>{copy.markPaid}</PrimaryButton>
        ) : null}
        <SecondaryButton type="button" onClick={onOpenClient} compact icon={<UserRound size={14} />}>{isPaid ? copy.viewClient : copy.edit}</SecondaryButton>
      </div>
    </div>
  );
};

const DayDetail = ({
  date,
  events,
  language,
  savingClientId,
  onReminder,
  onPaid,
  onOpenClient
}: {
  date: Date;
  events: PaymentEvent[];
  language: AppLanguage;
  savingClientId: string | null;
  onReminder: (event: PaymentEvent) => void;
  onPaid: (event: PaymentEvent) => void;
  onOpenClient: (client: Client, tab?: 'profile' | 'payments') => void;
}) => {
  const copy = COPY[language];
  const locale = language === 'en' ? 'en-US' : 'es-PE';
  return (
    <aside className="self-start rounded-2xl border border-zinc-800 bg-[#0f141e]">
      <div className="border-b border-zinc-800 p-4">
        <p className="text-[10px] font-black uppercase text-violet-300">{copy.dayDetail}</p>
        <h2 className="mt-1 text-base font-black capitalize text-white">{date.toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</h2>
      </div>
      <div className="space-y-2 p-3">
        {events.length === 0 ? (
          <p className="p-5 text-center text-xs leading-relaxed text-zinc-600">{copy.noPayments}</p>
        ) : events.map(event => (
          <React.Fragment key={event.id}>
            <PaymentEventRow
              event={event}
              language={language}
              saving={savingClientId === event.client.id}
              onReminder={() => onReminder(event)}
              onPaid={() => onPaid(event)}
              onOpenClient={() => onOpenClient(event.client, 'payments')}
            />
          </React.Fragment>
        ))}
      </div>
    </aside>
  );
};

export default PaymentCalendar;
