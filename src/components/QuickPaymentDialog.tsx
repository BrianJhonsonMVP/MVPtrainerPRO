import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, Minus, Plus, X } from 'lucide-react';
import { ClientPaymentInfo } from '../types';
import { AppLanguage } from '../services/scheduleService';
import { formatMoney, markPaymentPaid, parsePaymentDate } from '../services/paymentService';
import { AppButton, IconButton, PrimaryButton } from './ui/Buttons';

interface Props {
  clientName: string;
  country?: string;
  payment: ClientPaymentInfo;
  language?: AppLanguage;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payment: ClientPaymentInfo) => Promise<void> | void;
}

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const QuickPaymentDialog: React.FC<Props> = ({
  clientName,
  country,
  payment,
  language = 'es',
  saving = false,
  onClose,
  onConfirm
}) => {
  const activeLanguage: AppLanguage = language === 'en' ? 'en' : 'es';
  const [months, setMonths] = useState(1);
  const [monthlyRate, setMonthlyRate] = useState(() => Number(payment.monthlyFee) || 0);
  const [paidDate, setPaidDate] = useState(() => toInputDate(new Date()));
  const locale = language === 'en' ? 'en-US' : 'es-PE';

  useEffect(() => {
    setMonths(1);
    setMonthlyRate(Number(payment.monthlyFee) || 0);
    setPaidDate(toInputDate(new Date()));
  }, [clientName, payment.monthlyFee]);

  const paidAt = useMemo(() => new Date(`${paidDate}T12:00:00`), [paidDate]);
  const updatedPayment = useMemo(
    () => markPaymentPaid({ ...payment, monthlyFee: monthlyRate }, paidAt, months),
    [payment, monthlyRate, paidAt, months]
  );
  const coveredUntil = parsePaymentDate(updatedPayment.nextPaymentAt);
  const amount = monthlyRate * months;
  const changeMonths = (next: number) => setMonths(Math.max(1, Math.min(12, next)));

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center" role="presentation">
      <section className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-[#0d1119] shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="quick-payment-title">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <p className="text-[10px] font-black uppercase text-violet-300">{language === 'en' ? 'Quick payment' : 'Pago rápido'}</p>
            <h2 id="quick-payment-title" className="mt-1 text-xl font-black text-white">{language === 'en' ? `Payment from ${clientName}` : `Pago de ${clientName}`}</h2>
          </div>
          <IconButton type="button" onClick={onClose} className="shrink-0" aria-label={language === 'en' ? 'Close' : 'Cerrar'}><X size={17} /></IconButton>
        </header>

        <div className="space-y-5 p-5">
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-zinc-400">
              {language === 'en' ? 'Monthly rate from this payment' : 'Mensualidad desde este pago'}
            </span>
            <input
              type="number"
              min="0"
              step="10"
              value={monthlyRate || ''}
              onChange={event => setMonthlyRate(Math.max(0, Number(event.target.value) || 0))}
              className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-lg font-black text-white outline-none focus:border-violet-400"
              inputMode="decimal"
            />
            <span className="mt-2 block text-[11px] leading-relaxed text-zinc-500">
              {language === 'en'
                ? 'This becomes the new regular rate. Previous payments keep their original amount.'
                : 'Será la nueva tarifa regular. Los pagos anteriores conservarán su importe original.'}
            </span>
          </label>

          <div>
            <p className="mb-2 text-xs font-bold text-zinc-400">{language === 'en' ? 'How long does this payment cover?' : '¿Cuánto tiempo cubre este pago?'}</p>
            <div className="grid grid-cols-4 gap-2" role="group" aria-label={language === 'en' ? 'Coverage months' : 'Meses de cobertura'}>
              {[1, 3, 6, 12].map(option => (
                <AppButton
                  key={option}
                  type="button"
                  onClick={() => setMonths(option)}
                  variant={months === option ? 'primary' : 'secondary'}
                  className="min-h-12 w-full"
                >
                  {option} {language === 'en' ? (option === 1 ? 'mo.' : 'mos.') : (option === 1 ? 'mes' : 'meses')}
                </AppButton>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-[44px_1fr_44px] items-center overflow-hidden rounded-xl border border-zinc-700 bg-black">
              <IconButton type="button" onClick={() => changeMonths(months - 1)} disabled={months <= 1} className="rounded-none border-0" aria-label={language === 'en' ? 'One month less' : 'Quitar un mes'}><Minus size={17} /></IconButton>
              <div className="text-center">
                <span className="text-lg font-black text-white">{months}</span>
                <span className="ml-2 text-xs font-bold text-zinc-500">{language === 'en' ? (months === 1 ? 'month' : 'months') : (months === 1 ? 'mes' : 'meses')}</span>
              </div>
              <IconButton type="button" onClick={() => changeMonths(months + 1)} disabled={months >= 12} className="rounded-none border-0" aria-label={language === 'en' ? 'One month more' : 'Agregar un mes'}><Plus size={17} /></IconButton>
            </div>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-400"><Calendar size={14} /> {language === 'en' ? 'Payment date' : 'Fecha del pago'}</span>
            <input type="date" value={paidDate} onChange={event => setPaidDate(event.target.value)} className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400" />
          </label>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-zinc-400">{language === 'en' ? 'Payment total' : 'Total recibido'}</p>
              <p className="text-lg font-black text-emerald-300">{formatMoney(amount, country, activeLanguage)}</p>
            </div>
            <p className="mt-1 text-base font-black text-white">
              {language === 'en' ? 'Covered until ' : 'Cubierto hasta '}
              {coveredUntil?.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <PrimaryButton
            type="button"
            disabled={saving || monthlyRate <= 0 || amount <= 0 || !paidDate}
            isLoading={saving}
            onClick={() => onConfirm(updatedPayment)}
            icon={<Check size={17} />}
            className="min-h-12 w-full"
          >
            {saving
              ? (language === 'en' ? 'Saving...' : 'Guardando...')
              : `${language === 'en' ? 'Register' : 'Registrar'} ${formatMoney(amount, country, activeLanguage)}`}
          </PrimaryButton>
        </div>
      </section>
    </div>,
    document.body
  );
};

export default QuickPaymentDialog;
