
import React from 'react';
import { Client, User } from '../types';
import { ChevronLeft, ChevronRight, Lock, Crown } from 'lucide-react';

interface Props {
  user: User;
  clients: Client[];
}

const PaymentCalendar: React.FC<Props> = ({ user, clients }) => {
  const isPro = user?.subscription?.type === 'pro' && user?.subscription?.isActive;
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay(); // 0 = Sunday
  
  // Ajuste para que Lunes sea el primer día (0 = Lunes, 6 = Domingo)
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanksArray = Array.from({ length: startDay }, (_, i) => i);

  // Helper para ver pagos en un día
  const getPaymentsForDay = (day: number) => {
      if (!isPro) return [];
      
      return clients.filter(c => {
          if (!c.paymentInfo.nextPaymentAt) return false;
          const date = new Date(c.paymentInfo.nextPaymentAt);
          return date.getDate() === day && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      });
  };

  const getStatusColor = (status: string) => {
      switch(status) {
          case 'al_dia': return 'bg-green-500';
          case 'atrasado': return 'bg-red-500';
          case 'pendiente': return 'bg-mvp-gold';
          default: return 'bg-zinc-600';
      }
  };

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto pb-20 relative">
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">Calendario de Pagos</h2>
            <div className="flex gap-2">
                <button className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"><ChevronLeft size={20}/></button>
                <span className="font-bold text-white px-4 py-2 bg-zinc-900 rounded-lg capitalize">
                    {today.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </span>
                <button className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"><ChevronRight size={20}/></button>
            </div>
        </div>

        <div className={`grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-zinc-500 uppercase tracking-wider ${!isPro ? 'filter blur-sm select-none' : ''}`}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d}>{d}</div>)}
        </div>

        <div className={`grid grid-cols-7 gap-2 ${!isPro ? 'filter blur-sm select-none opacity-50' : ''}`}>
            {blanksArray.map(b => <div key={`blank-${b}`} className="h-24 bg-transparent"></div>)}
            
            {daysArray.map(day => {
                const payments = getPaymentsForDay(day);
                const isToday = day === today.getDate();

                return (
                    <div key={day} className={`h-24 bg-zinc-900 rounded-xl border p-2 flex flex-col ${isToday ? 'border-mvp-gold bg-mvp-gold/5' : 'border-zinc-800'}`}>
                        <span className={`text-sm font-bold mb-1 ${isToday ? 'text-mvp-gold' : 'text-zinc-400'}`}>{day}</span>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                            {payments.map(c => (
                                <div key={c.id} className="text-[10px] bg-black/40 rounded px-1.5 py-1 flex items-center gap-1 truncate border border-zinc-800">
                                    <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(c.paymentInfo.status)}`}></div>
                                    <span className="truncate text-zinc-300">{c.name}</span>
                                </div>
                            ))}
                            {/* Fake data for preview */}
                            {!isPro && (day % 3 === 0) && (
                                <div className="text-[10px] bg-black/40 rounded px-1.5 py-1 flex items-center gap-1 truncate border border-zinc-800">
                                     <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                     <span className="truncate text-zinc-300">Cliente Ejemplo</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>

        {!isPro && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="bg-black/80 backdrop-blur-md p-8 rounded-3xl border border-mvp-gold/30 shadow-2xl text-center max-w-sm">
                    <div className="bg-mvp-gold text-black w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(245,158,11,0.5)]">
                        <Lock size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Calendario PRO</h3>
                    <p className="text-zinc-400 text-sm mb-6">
                        Visualiza los vencimientos de pagos, estados de deuda y planifica tus ingresos mensuales en una vista cómoda.
                    </p>
                    <button className="w-full bg-gradient-to-r from-mvp-gold to-orange-500 text-white font-bold py-3 px-6 rounded-xl shadow-lg">
                        Desbloquear Calendario
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default PaymentCalendar;
