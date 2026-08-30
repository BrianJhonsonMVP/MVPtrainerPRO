import React, { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Laptop,
  Loader2,
  MapPin,
  MessageCircle,
  Target,
  UserRound
} from 'lucide-react';
import { dbProvider } from '../data';
import { getContrastTextColor } from '../services/brandingService';
import { User } from '../types';

interface Props {
  trainerId: string;
  language?: 'es' | 'en';
}

const PUBLIC_PAGE_COPY = {
  es: {
    loading: 'Cargando perfil profesional',
    unavailableTitle: 'Perfil no disponible',
    unavailableBody: 'Este entrenador todavia esta preparando su pagina publica.',
    eyebrow: 'Entrenamiento personalizado',
    defaultDescription: 'Acompanamiento profesional para alcanzar tus objetivos.',
    contactWhatsApp: 'Hablar por WhatsApp',
    services: 'Como puedo ayudarte',
    goals: 'Objetivos que trabajamos',
    whatsappMessage: 'Hola, vi tu perfil en MVP Trainer Pro y quiero conocer tus servicios.',
    poweredBy: 'Perfil profesional creado con MVP Trainer Pro'
    ,inPerson: 'Entrenamiento presencial', online: 'Asesoría online', both: 'Presencial y online'
  },
  en: {
    loading: 'Loading professional profile',
    unavailableTitle: 'Profile unavailable',
    unavailableBody: 'This trainer is still preparing their public page.',
    eyebrow: 'Personal coaching',
    defaultDescription: 'Professional coaching designed around your goals.',
    contactWhatsApp: 'Chat on WhatsApp',
    services: 'How I can help',
    goals: 'Goals we can work on',
    whatsappMessage: 'Hi, I found your profile on MVP Trainer Pro and would like to learn about your services.',
    poweredBy: 'Professional profile created with MVP Trainer Pro'
    ,inPerson: 'In-person training', online: 'Online coaching', both: 'In person and online'
  }
};

const normalizeWhatsAppPhone = (value?: string) => (value || '').replace(/\D/g, '');

const initialsFrom = (value?: string) => {
  const words = (value || 'MVP Trainer').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'MVP';
};

const TrainerPublicPage: React.FC<Props> = ({ trainerId, language = 'es' }) => {
  const [trainer, setTrainer] = useState<Partial<User> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const copy = PUBLIC_PAGE_COPY[language] || PUBLIC_PAGE_COPY.es;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setLoadFailed(false);
      try {
        const data = await dbProvider.getProfile(trainerId);
        if (active) setTrainer(data);
      } catch {
        if (active) setLoadFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [trainerId]);

  const profile = trainer?.publicProfile;
  const phone = normalizeWhatsAppPhone(profile?.whatsAppNumber);
  const isReady = Boolean(
    trainer &&
    profile?.description?.trim().length &&
    phone.length >= 7 &&
    profile?.isPublished
  );
  const primary = trainer?.branding?.primaryColor || '#8B5CF6';
  const secondary = trainer?.branding?.secondaryColor || '#050505';
  const trainerName = profile?.trainerName?.trim() || trainer?.displayName || 'Personal Trainer';
  const brandName = trainer?.branding?.brandName?.trim() || trainerName;
  const portrait = profile?.presentationMode === 'logo'
    ? trainer?.branding?.logoUrl || ''
    : profile?.profileImageUrl || trainer?.photoURL || trainer?.branding?.logoUrl || '';
  const portraitIsLogo = profile?.presentationMode === 'logo' || (!profile?.profileImageUrl && !trainer?.photoURL && Boolean(trainer?.branding?.logoUrl));
  const ctaTextColor = getContrastTextColor(primary);
  const whatsAppUrl = useMemo(
    () => `https://wa.me/${phone}?text=${encodeURIComponent(copy.whatsappMessage)}`,
    [copy.whatsappMessage, phone]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#07080d] text-white flex items-center justify-center px-6">
        <div className="flex items-center gap-3 text-sm text-zinc-400" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" aria-hidden="true" />
          {copy.loading}
        </div>
      </main>
    );
  }

  if (loadFailed || !isReady) {
    return (
      <main className="min-h-screen bg-[#07080d] text-white flex items-center justify-center px-6">
        <section className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400">
            <UserRound className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-black">{copy.unavailableTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">{copy.unavailableBody}</p>
        </section>
      </main>
    );
  }

  const services = profile?.services?.filter(Boolean) || [];
  const targets = profile?.targets?.filter(Boolean) || [];

  return (
    <main
      className="min-h-screen text-white selection:bg-violet-500/30"
      style={{ backgroundColor: secondary }}
    >
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {trainer?.branding?.logoUrl ? (
              <img
                src={trainer.branding.logoUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-lg border border-white/15 bg-black/30 object-contain p-1"
              />
            ) : (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                style={{ backgroundColor: primary, color: ctaTextColor }}
              >
                {initialsFrom(brandName)}
              </span>
            )}
            <span className="truncate text-sm font-extrabold">{brandName}</span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-zinc-400">
            <BadgeCheck className="h-4 w-4" style={{ color: primary }} aria-hidden="true" />
            MVP Trainer Pro
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-16">
        <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_280px] md:gap-14">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: primary }}>
              {profile?.professionalTitle || copy.eyebrow}
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
              {trainerName}
            </h1>
            {profile?.headline && <p className="mt-4 max-w-2xl text-xl font-extrabold leading-8 text-white sm:text-2xl">{profile.headline}</p>}
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-lg">
              {profile?.description || copy.defaultDescription}
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-xs font-bold text-zinc-400">
              <span className="inline-flex items-center gap-2"><Laptop size={15} style={{ color: primary }} />{profile?.modality === 'presencial' ? copy.inPerson : profile?.modality === 'online' ? copy.online : copy.both}</span>
              {profile?.location && <span className="inline-flex items-center gap-2"><MapPin size={15} style={{ color: primary }} />{profile.location}</span>}
            </div>
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-black shadow-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-white/60"
              style={{ backgroundColor: primary, color: ctaTextColor }}
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
              {profile?.callToAction || copy.contactWhatsApp}
            </a>
          </div>

          <div className="relative mx-auto aspect-[4/5] w-full max-w-[280px] overflow-hidden rounded-lg border border-white/15 bg-[#11141d]">
            {portrait ? (
              <img src={portrait} alt={trainerName} className={`h-full w-full ${portraitIsLogo ? 'object-contain p-10' : 'object-cover'}`} style={portraitIsLogo ? undefined : { objectPosition: `center ${profile?.photoPositionY ?? 50}%` }} />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-6xl font-black text-white/80">
                {initialsFrom(trainerName)}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: primary }} />
          </div>
        </div>
      </section>

      {(services.length > 0 || targets.length > 0) && (
        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-2 md:py-16">
            {services.length > 0 && (
              <div>
                <h2 className="text-xl font-black">{copy.services}</h2>
                <ul className="mt-6 space-y-3">
                  {services.map(service => (
                    <li key={service} className="flex items-start gap-3 border-b border-white/10 pb-3 text-sm text-zinc-200">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: primary }} aria-hidden="true" />
                      <span>{service}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {targets.length > 0 && (
              <div>
                <h2 className="text-xl font-black">{copy.goals}</h2>
                <div className="mt-6 flex flex-wrap gap-2">
                  {targets.map(target => (
                    <span key={target} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-200">
                      <Target className="h-4 w-4" style={{ color: primary }} aria-hidden="true" />
                      {target}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-5xl px-5 py-14 text-center sm:px-8 sm:py-20">
        <h2 className="text-2xl font-black sm:text-3xl">{profile?.callToAction || copy.contactWhatsApp}</h2>
        <a
          href={whatsAppUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`${copy.contactWhatsApp}: ${trainerName}`}
          className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.05] px-5 py-3 text-sm font-black transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/60"
        >
          <MessageCircle className="h-5 w-5" style={{ color: primary }} aria-hidden="true" />
          {phone}
        </a>
      </section>

      <footer className="border-t border-white/10 px-5 py-7 text-center text-xs text-zinc-500">
        {copy.poweredBy}
      </footer>
    </main>
  );
};

export default TrainerPublicPage;
