import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, ChevronRight, ExternalLink, MessageCircle } from 'lucide-react';

type PriorityKind = 'training' | 'payment';
type Language = 'es' | 'en';

interface PrioritySessionCardProps {
    kind: PriorityKind;
    clientName: string;
    avatarUrl?: string | null;
    initials: string;
    schedule?: string | null;
    detail: string;
    language: Language;
    hasPhone: boolean;
    onOpenClient: () => void;
    onWhatsApp: () => void;
    onOpenChat: () => void;
}

interface ParsedSchedule {
    start: Date;
    end: Date;
    startLabel: string;
    endLabel: string;
}

const parseClockTime = (value: string, base: Date) => {
    const normalized = value.trim().toUpperCase();
    const match12 = normalized.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
    const match24 = normalized.match(/^(\d{1,2}):(\d{2})$/);
    const match = match12 || match24;
    if (!match) return null;

    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (minutes > 59 || hours > 23) return null;

    if (match12) {
        if (hours > 12) return null;
        if (hours === 12) hours = 0;
        if (match12[3] === 'PM') hours += 12;
    }

    const date = new Date(base);
    date.setHours(hours, minutes, 0, 0);
    return date;
};

const parseSchedule = (schedule?: string | null): ParsedSchedule | null => {
    if (!schedule) return null;
    const parts = schedule.split(/\s+-\s+/);
    if (parts.length !== 2) return null;

    const today = new Date();
    const start = parseClockTime(parts[0], today);
    const end = parseClockTime(parts[1], today);
    if (!start || !end) return null;
    if (end <= start) end.setDate(end.getDate() + 1);

    return {
        start,
        end,
        startLabel: parts[0].trim(),
        endLabel: parts[1].trim()
    };
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

const formatDuration = (milliseconds: number) => {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
};

const SessionDial = ({
    schedule,
    language
}: {
    schedule: ParsedSchedule | null;
    language: Language;
}) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const intervalId = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(intervalId);
    }, []);

    const state = useMemo(() => {
        if (!schedule) {
            return {
                progress: 0,
                value: '--:--:--',
                label: language === 'es' ? 'Horario pendiente' : 'Schedule pending',
                active: false
            };
        }

        const nowTime = now.getTime();
        const startTime = schedule.start.getTime();
        const endTime = schedule.end.getTime();
        const midnight = new Date(schedule.start);
        midnight.setHours(0, 0, 0, 0);

        if (nowTime < startTime) {
            const dayProgress = clamp((nowTime - midnight.getTime()) / Math.max(1, startTime - midnight.getTime()));
            return {
                progress: dayProgress,
                value: formatDuration(startTime - nowTime),
                label: language === 'es' ? 'para iniciar' : 'until start',
                active: false
            };
        }

        if (nowTime <= endTime) {
            return {
                progress: clamp((nowTime - startTime) / Math.max(1, endTime - startTime)),
                value: formatDuration(endTime - nowTime),
                label: language === 'es' ? 'en curso' : 'in progress',
                active: true
            };
        }

        return {
            progress: 1,
            value: '00:00:00',
            label: language === 'es' ? 'completado' : 'completed',
            active: false
        };
    }, [language, now, schedule]);

    const radius = 39;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - state.progress);

    return (
        <div className="relative flex h-[108px] w-[108px] shrink-0 items-center justify-center" aria-label={`${state.value} ${state.label}`}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(139,92,246,0.14)" strokeWidth="4" />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke={state.active ? '#a78bfa' : '#8b5cf6'}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
                {Array.from({ length: 24 }).map((_, index) => {
                    const angle = index * 15;
                    return (
                        <line
                            key={angle}
                            x1="50"
                            y1="7"
                            x2="50"
                            y2={index % 6 === 0 ? '12' : '10'}
                            stroke={index / 24 <= state.progress ? '#c4b5fd' : 'rgba(161,161,170,0.22)'}
                            strokeWidth={index % 6 === 0 ? '1.8' : '1'}
                            transform={`rotate(${angle} 50 50)`}
                        />
                    );
                })}
            </svg>
            <span className={`absolute right-[10px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${state.active ? 'bg-emerald-400 animate-pulse' : 'bg-violet-400'}`} />
            <div className="relative text-center">
                <span className="block font-mono text-[15px] font-black tabular-nums text-white">{state.value}</span>
                <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.08em] text-zinc-500">{state.label}</span>
            </div>
        </div>
    );
};

const PrioritySessionCard: React.FC<PrioritySessionCardProps> = ({
    kind,
    clientName,
    avatarUrl,
    initials,
    schedule,
    detail,
    language,
    hasPhone,
    onOpenClient,
    onWhatsApp,
    onOpenChat
}) => {
    const parsedSchedule = useMemo(() => parseSchedule(schedule), [schedule]);
    const actionUnavailable = language === 'es' ? 'Agrega un teléfono para usar WhatsApp' : 'Add a phone number to use WhatsApp';

    return (
        <article className="relative overflow-hidden rounded-lg border border-zinc-800 bg-[#11141d] px-4 py-4 shadow-[0_16px_40px_rgba(0,0,0,0.2)] transition-colors hover:border-violet-500/30">
            <div className="grid items-center gap-4 md:grid-cols-[minmax(180px,1fr)_116px_150px_auto]">
                <button onClick={onOpenClient} className="group flex min-w-0 items-center gap-3 text-left">
                    <span className="relative shrink-0">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt="" className="h-11 w-11 rounded-full border border-violet-400/30 object-cover" />
                        ) : (
                            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-violet-400/30 bg-violet-500/12 text-sm font-black text-violet-100">
                                {initials}
                            </span>
                        )}
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#11141d] ${kind === 'training' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-white transition-colors group-hover:text-violet-200">{clientName}</span>
                        <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            {detail}
                        </span>
                    </span>
                    <ChevronRight size={15} className="ml-auto shrink-0 text-zinc-600 md:hidden" />
                </button>

                <div className="flex justify-center">
                    {kind === 'training' ? (
                        <SessionDial schedule={parsedSchedule} language={language} />
                    ) : (
                        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/5 text-amber-300">
                            <Banknote size={24} />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 border-y border-zinc-800 py-3 md:grid-cols-1 md:border-x md:border-y-0 md:px-5 md:py-0">
                    {kind === 'training' && parsedSchedule ? (
                        <>
                            <div>
                                <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">{language === 'es' ? 'Inicio' : 'Start'}</span>
                                <span className="mt-1 block font-mono text-sm font-bold tabular-nums text-zinc-200">{parsedSchedule.startLabel}</span>
                            </div>
                            <div>
                                <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">{language === 'es' ? 'Fin' : 'End'}</span>
                                <span className="mt-1 block font-mono text-sm font-bold tabular-nums text-zinc-200">{parsedSchedule.endLabel}</span>
                            </div>
                        </>
                    ) : (
                        <div className="col-span-2 md:col-span-1">
                            <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-600">{language === 'es' ? 'Estado' : 'Status'}</span>
                            <span className="mt-1 block text-sm font-bold text-amber-300">{detail}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onWhatsApp}
                        disabled={!hasPhone}
                        title={hasPhone ? 'WhatsApp' : actionUnavailable}
                        aria-label={hasPhone ? 'WhatsApp' : actionUnavailable}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-500/35 bg-emerald-500/10 text-emerald-400 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/15 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <MessageCircle size={19} />
                    </button>
                    <button
                        type="button"
                        onClick={onOpenChat}
                        disabled={!hasPhone}
                        title={hasPhone ? (language === 'es' ? 'Abrir chat' : 'Open chat') : actionUnavailable}
                        aria-label={hasPhone ? (language === 'es' ? 'Abrir chat' : 'Open chat') : actionUnavailable}
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900/70 text-zinc-300 transition-all hover:border-violet-400/40 hover:text-violet-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                        <ExternalLink size={18} />
                    </button>
                </div>
            </div>
        </article>
    );
};

export default PrioritySessionCard;
