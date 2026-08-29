import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, X } from 'lucide-react';
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
  const [paidDate, setPaidDate] = useState(() => toInputDate(new Date()));
  const locale = language === 'en' ? 'en-US' : 'es-PE';

  useEffect(() => {
    setMonths(1);
    setPaidDate(toInputDate(new Date()));
  }, [clientName]);

  const paidAt = useMemo(() => new Date(`${paidDate}T12:00:00`), [paidDate]);
  const updatedPayment = useMemo(
    () => markPaymentPaid(payment, paidAt, months),
    [payment, paidAt, months]
  );
  const coveredUntil = parsePaymentDate(updatedPayment.nextPaymentAt);
  const amount = (Number(payment.monthlyFee) || 0) * months;

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
          <div>
            <p className="mb-2 text-xs font-bold text-zinc-400">{language === 'en' ? 'How long does this payment cover?' : '¿Cuánto tiempo cubre este pago?'}</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={language === 'en' ? 'Coverage months' : 'Meses de cobertura'}>
              {[1, 2, 3].map(option => (
                <AppButton
                  key={option}
                  type="button"
                  onClick={() => setMonths(option)}
                  variant={months === option ? 'primary' : 'secondary'}
                  className="min-h-12 w-full"
                >
                  {option} {language === 'en' ? (option === 1 ? 'month' : 'months') : (option === 1 ? 'mes' : 'meses')}
                </AppButton>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold text-zinc-400"><Calendar size={14} /> {language === 'en' ? 'Payment date' : 'Fecha del pago'}</span>
            <input type="date" value={paidDate} onChange={event => setPaidDate(event.target.value)} className="w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 text-sm font-bold text-white outline-none focus:border-violet-400" />
          </label>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-4">
            <p className="text-xs text-zinc-400">{language === 'en' ? 'After confirming' : 'Después de confirmar'}</p>
            <p className="mt-1 text-base font-black text-white">
              {language === 'en' ? 'Covered until ' : 'Cubierto hasta '}
              {coveredUntil?.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <PrimaryButton
            type="button"
            disabled={saving || amount <= 0}
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
