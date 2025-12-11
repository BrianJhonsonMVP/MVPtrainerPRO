
import React, { useMemo } from 'react';
import { Client, User } from '../types';
import { Calendar, Clock, ChevronRight, Lock, MapPin, Dumbbell, Crown } from 'lucide-react';

interface DailyScheduleProps {
  user: User;
  clients: Client[];
  onOpenClient: (client: Client) => void;
  onShowPaywall: () => void;
}

const DailySchedule: React.FC<DailyScheduleProps> = ({ user, clients, onOpenClient, onShowPaywall }) => {
  const isPro = user.subscription.type === 'pro' && user.subscription.isActive;

  // --- DATE LOGIC ---
  const today = new Date();
  const dayIndex = today.getDay(); // 0 = Domingo, 1 = Lunes...
  const DAYS_MAP = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const currentDayName = DAYS_MAP[dayIndex];
  
  const formattedDate = today.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });

  // --- SCHEDULE BUILDER ---
  const scheduleItems = useMemo(() => {
    // Si no es PRO, generamos datos falsos para el "Preview" borroso
    if (!isPro) {
        return [
            { time: '07:00 AM', name: 'Ana García', goal: 'Pérdida de peso', avatar: '' },
            { time: '08:30 AM', name: 'Carlos Ruiz', goal: 'Hipertrofia', avatar: '' },
            { time: '10:00 AM', name: 'María López', goal: 'Tonificación', avatar: '' },
            { time: '05:00 PM', name: 'Jorge Diaz', goal: 'Fuerza', avatar: '' },
        ];
    }

    // Filtrar clientes que entrenan hoy
    const todayClients = clients.filter(client => {
        // Chequeamos el array trainingDays (ej: ["Lunes", "Miércoles"])
        return client.trainingDays && client.trainingDays.includes(currentDayName);
    });

    // Mapear a estructura de agenda
    const items = todayClients.map(client => ({
        clientRef: client,
        time: client.trainingTime || client.trainingHour || 'Sin hora',
        name: client.name,
        goal: client.mainGoal,
        avatar: client.avatarUrl
    }));

    // Ordenar por hora
    return items.sort((a, b) => {
        const timeA = convertTo24(a.time);
        const timeB = convertTo24(b.time);
        return timeA.localeCompare(timeB);
    });
  }, [clients, currentDayName, isPro]);

  // Helper para ordenar
  function convertTo24(time12: string) {
      if (!time12 || time12 === 'Sin hora') return '99:99';
      try {
        const [time, modifier] = time12.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
        return `${hours.padStart(2, '0')}:${minutes}`;
      } catch (e) { return '99:99'; }
  }

  return (
    <div className="animate-fadeIn pb-20 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-mvp-gold/10 p-3 rounded-2xl text-mvp-gold border border-mvp-gold/20">
            <Calendar size={28} />
        </div>
        <div>
            <h2 className="text-2xl font-bold text-white capitalize">Mi Itinerario</h2>
            <p className="text-zinc-400 text-sm capitalize">{formattedDate}</p>
        </div>
      </div>

      <div className="relative">
          {/* Timeline Connector Line */}
          <div className="absolute left-[27px] top-4 bottom-0 w-0.5 bg-zinc-800 z-0"></div>

          <div className="space-y-6 relative z-10">
            {scheduleItems.length === 0 ? (
                <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl p-8 text-center ml-10">
                    <p className="text-zinc-500">No tienes clientes agendados para este {currentDayName}.</p>
                </div>
            ) : (
                scheduleItems.map((item: any, idx) => (
                    <div 
                        key={idx} 
                        className={`flex gap-4 group ${!isPro ? 'filter blur-sm select-none opacity-50' : ''}`}
                    >
                        {/* Time Bubble */}
                        <div className="flex flex-col items-center gap-1 min-w-[56px]">
                             <div className={`w-14 py-2 rounded-lg text-xs font-bold text-center border ${
                                 idx === 0 ? 'bg-mvp-gold text-black border-mvp-gold shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                             }`}>
                                 {item.time.split(' ')[0]}<br/>
                                 <span className="text-[10px] opacity-80">{item.time.split(' ')[1]}</span>
                             </div>
                        </div>

                        {/* Card */}
                        <div 
                            onClick={() => isPro && item.clientRef && onOpenClient(item.clientRef)}
                            className="flex-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-4 rounded-2xl transition-all cursor-pointer shadow-sm relative overflow-hidden"
                        >
                            {idx === 0 && <div className="absolute top-0 left-0 w-1 h-full bg-mvp-gold"></div>}
                            
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <img src={item.avatar || `https://ui-avatars.com/api/?name=${item.name}`} className="w-10 h-10 rounded-full bg-zinc-800 object-cover" />
                                    <div>
                                        <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">{item.goal}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-zinc-800 p-2 rounded-full text-zinc-500 group-hover:text-white group-hover:bg-zinc-700 transition-colors">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            )}
          </div>

          {/* LOCK OVERLAY FOR FREE/TRIAL USERS */}
          {!isPro && (
             <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6 -mt-10">
                <div className="bg-black/70 backdrop-blur-md p-8 rounded-3xl border border-mvp-gold/30 shadow-2xl max-w-sm w-full">
                    <div className="bg-mvp-gold text-black w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 shadow-[0_0_20px_rgba(245,158,11,0.5)]">
                        <Lock size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Agenda Inteligente Bloqueada</h3>
                    <p className="text-zinc-400 text-sm mb-6">
                        Organiza tu día automáticamente. Visualiza qué clientes te tocan hoy y accede a sus perfiles en un clic.
                    </p>
                    <button 
                        onClick={onShowPaywall}
                        className="w-full bg-gradient-to-r from-mvp-gold to-orange-500 hover:to-orange-400 text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                    >
                        <Crown size={18} className="text-black" /> Desbloquear Agenda PRO
                    </button>
                </div>
             </div>
          )}
      </div>
    </div>
  );
};

export default DailySchedule;
