
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { 
  Users, Activity, Dumbbell, Crown, ChevronRight, Menu, X, 
  Sparkles, Loader2, AlertCircle, DollarSign, 
  Edit2, Save, User as UserIcon, Clock, Trash2, Banknote, 
  AlertTriangle, ChevronDown, LogOut, Plus, ChevronUp, Flame, Zap, Utensils, Check, MessageSquare, Lock, Calendar, Copy, Timer, MapPin, Languages, Monitor, Smartphone, Tablet, ExternalLink, Mic, Square, Pause, Play, UserX, PlayCircle
} from 'lucide-react';
import { BillingRecord, Client, Routine, User as AppUser, DietPlan, ClientPaymentInfo, PlanInterval, UserSubscription } from './types';
import { generateWorkoutRoutine, generateDietPlan, getLastGeminiErrorMessage } from './services/geminiService';
import { supabase, isSupabaseEnabled } from './services/supabaseClient';
import { dbProvider } from './data';
import { checkLimit, checkAndResetUsage, getPlanStatusLabel, LIMITS, clearStaleUserCache } from './services/subscriptionUtils';
import {
  canUseFeature,
  getTrialDaysRemaining,
  hasFullAccess,
  isSubscriptionLocked,
  registerUsage,
  normalizeSubscription,
  resetWeeklyUsageIfNeeded
} from './services/subscriptionLogic';
import {
  markSubscriptionSyncing,
  markSubscriptionSyncFailed,
  mergeUserWithLastConfirmedPlan
} from './services/subscriptionEntitlements';
import { applyBrandingToTheme } from './services/brandingService';
import BrandingSettings from './components/BrandingSettings';
import DailySchedule from './components/DailySchedule';
import { checkReminders, requestNotificationPermission } from './utils/reminderEngine';
import PaymentCalendar from './components/PaymentCalendar';
import TrainerLandingEditor from './components/TrainerLandingEditor';
import TrainerPublicPage from './components/TrainerPublicPage';
import PrioritySessionCard from './components/PrioritySessionCard';
import QuickPaymentDialog from './components/QuickPaymentDialog';
import {
  AiButton,
  AppButton,
  ButtonGroup,
  ContactButton,
  CopyButton,
  DestructiveButton,
  IconButton
} from './components/ui/Buttons';
import { COUNTRIES } from './data/countries';
import {
  formatSessionCountdown,
  getDaySchedule,
  isActiveClient,
  normalizeDayName
} from './services/scheduleService';
import {
  buildPaymentReminderText,
  formatPaymentTimeline,
  getPaymentBadgeClass,
  getPaymentDiffDays,
  getPaymentLabel,
  formatMoney,
  markPaymentOverdue,
  markPaymentPending,
  needsPaymentAttention
} from './services/paymentService';
import { finishClientService, pauseClientService, reactivateClientService } from './services/clientService';

// --- HELPERS ---
const VERBOSE_APP_LOGS = false;
const appLog = (...args: any[]) => {
    if (VERBOSE_APP_LOGS && (import.meta as any).env?.DEV) {
        console.log(...args);
    }
};

const BRAND_LOGO_SRC = '/brand/mvp-trainer-pro-logo.png';

const MVPBrandLogo = ({ className = '' }: { className?: string }) => (
    <img
        src={BRAND_LOGO_SRC}
        alt="MVP Trainer Pro"
        className={`mvp-brand-logo object-contain select-none ${className}`}
        draggable={false}
    />
);

const GoogleMark = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
    <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
    <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.62A10 10 0 0 0 12 22Z" />
    <path fill="#FBBC05" d="M6.4 13.94A6 6 0 0 1 6.08 12c0-.67.11-1.32.32-1.94V7.44H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.56l3.35-2.62Z" />
    <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.95 5.44l3.35 2.62c.8-2.36 3-4.12 5.6-4.12Z" />
  </svg>
);

const FacebookMark = () => (
  <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-full bg-[#1877F2] text-[16px] font-black leading-none text-white">f</span>
);

type AppLanguage = 'es' | 'en';

const getStoredLanguage = (): AppLanguage => {
    if (typeof window === 'undefined') return 'es';
    try {
        return window.localStorage.getItem('mvptrainer_language') === 'en' ? 'en' : 'es';
    } catch {
        return 'es';
    }
};

const getClientsCacheKey = (trainerId: string) => `mvptrainer_cached_clients_${trainerId}`;

const parseCachedClients = (raw: string | null): Client[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.data)) return parsed.data;
    } catch (e) {
        if ((import.meta as any).env?.DEV) {
            console.warn("Invalid clients cache ignored", e);
        }
    }
    return [];
};

const shouldRestoreClientsCache = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    return navigator.onLine === false;
};

type DevViewportId = 'desktop' | 'android' | 'iphone' | 'ipad';

const DEV_VIEWPORTS: Array<{
    id: DevViewportId;
    label: string;
    size: string;
    width?: number;
    height?: number;
    icon: React.ReactNode;
}> = [
    { id: 'desktop', label: 'Desktop', size: 'Real', icon: <Monitor size={14} /> },
    { id: 'android', label: 'Android', size: '390 x 844', width: 390, height: 844, icon: <Smartphone size={14} /> },
    { id: 'iphone', label: 'iPhone', size: '414 x 896', width: 414, height: 896, icon: <Smartphone size={14} /> },
    { id: 'ipad', label: 'iPad', size: '820 x 1180', width: 820, height: 1180, icon: <Tablet size={14} /> }
];

const isLocalDevPreview = () => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    const params = new URLSearchParams(window.location.search);
    return Boolean((import.meta as any).env?.DEV)
        && (host === 'localhost' || host === '127.0.0.1')
        && params.get('dev_preview') !== '1';
};

const DevViewportSwitcher = () => {
    const [active, setActive] = useState<DevViewportId>(() => {
        if (typeof window === 'undefined') return 'desktop';
        const stored = localStorage.getItem('mvptrainer_dev_viewport') as DevViewportId | null;
        return DEV_VIEWPORTS.some(viewport => viewport.id === stored) ? stored! : 'desktop';
    });

    const selectedViewport = DEV_VIEWPORTS.find(viewport => viewport.id === active) || DEV_VIEWPORTS[0];
    const previewUrl = (() => {
        if (typeof window === 'undefined') return '';
        const url = new URL(window.location.href);
        url.searchParams.set('dev_preview', '1');
        url.searchParams.set('dev_device', active);
        return url.toString();
    })();

    useEffect(() => {
        if (!isLocalDevPreview()) return;
        localStorage.setItem('mvptrainer_dev_viewport', active);
        document.documentElement.setAttribute('data-dev-preview-mode', active);
    }, [active]);

    useEffect(() => {
        if (!isLocalDevPreview()) return;
        return () => {
            document.documentElement.removeAttribute('data-dev-preview-mode');
        };
    }, []);

    if (!isLocalDevPreview() || typeof document === 'undefined') return null;

    return createPortal(
        <>
            {selectedViewport.id !== 'desktop' && selectedViewport.width && selectedViewport.height && (
                <div className="dev-device-stage" aria-label={`Vista previa local ${selectedViewport.label}`}>
                    <div
                        className="dev-device-shell"
                        style={{
                            width: selectedViewport.width,
                            height: selectedViewport.height
                        }}
                    >
                        <div className="dev-device-topbar">
                            <span>{selectedViewport.label}</span>
                            <small>{selectedViewport.size}</small>
                        </div>
                        <iframe
                            key={selectedViewport.id}
                            title={`Vista local ${selectedViewport.label}`}
                            src={previewUrl}
                            className="dev-device-frame"
                        />
                    </div>
                </div>
            )}
            <div className="dev-viewport-toolbar" aria-label="Selector visual local de dispositivo">
                <div className="dev-viewport-title">Vista local</div>
                <div className="dev-viewport-options">
                    {DEV_VIEWPORTS.map(viewport => (
                        <button
                            key={viewport.id}
                            type="button"
                            onClick={() => setActive(viewport.id)}
                            className={active === viewport.id ? 'is-active' : ''}
                            title={`${viewport.label} ${viewport.size}`}
                        >
                            {viewport.icon}
                            <span>{viewport.label}</span>
                            <small>{viewport.size}</small>
                        </button>
                    ))}
                </div>
            </div>
        </>,
        document.body
    );
};

const MOTION_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
const MOTION_TAP = { scale: 0.98 };
const MOTION_BUTTON_TRANSITION = { duration: 0.12, ease: MOTION_EASE };

const PageTransition = ({ children, className = '' }: { children: React.ReactNode; className?: string; key?: React.Key }) => {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: MOTION_EASE }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

const TabPanel = ({ children, className = '' }: { children: React.ReactNode; className?: string; key?: React.Key }) => {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -3 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.18, ease: MOTION_EASE }}
            className={className}
        >
            {children}
        </motion.div>
    );
};

const AccordionPanel = ({ children, className = '', isOpen }: { children: React.ReactNode; className?: string; isOpen: boolean }) => {
    const reduceMotion = useReducedMotion();

    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: MOTION_EASE }}
                    className="overflow-hidden"
                >
                    <div className={className}>{children}</div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const MotionChevron = ({ open, size = 18, className = '' }: { open: boolean; size?: number; className?: string }) => {
    const reduceMotion = useReducedMotion();

    return (
        <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.18, ease: MOTION_EASE }}
            className={`inline-flex ${className}`}
        >
            <ChevronDown size={size} />
        </motion.span>
    );
};

const AUTH_COPY = {
    es: {
        login: 'Iniciar sesión',
        register: 'Crear cuenta',
        resetRequest: 'Recuperar contraseña',
        resetPassword: 'Restablecer contraseña',
        brandSubtitle: 'Gestión profesional para entrenadores',
        value: 'Gestiona clientes, rutinas, dietas, pagos y agenda desde un solo lugar.',
        support: 'Organiza tu negocio como entrenador personal y entrega planes profesionales a tus clientes.',
        welcome: 'Bienvenido de nuevo.',
        createIntro: 'Crea tu cuenta y empieza a organizar tus clientes.',
        resetIntro: 'Te enviaremos un enlace seguro para restablecer tu contraseña.',
        newPasswordIntro: 'Define una nueva contraseña para tu cuenta.',
        google: 'Continuar con Google',
        facebook: 'Continuar con Facebook',
        divider: 'o continúa con correo',
        name: 'Nombre del entrenador',
        email: 'Email',
        password: 'Contraseña',
        confirmPassword: 'Confirmar contraseña',
        enter: 'Entrar',
        entering: 'Ingresando...',
        createFree: 'Crear cuenta gratis',
        creating: 'Creando cuenta...',
        sendRecovery: 'Enviar enlace de recuperación',
        sending: 'Enviando...',
        savePassword: 'Guardar nueva contraseña',
        saving: 'Guardando...',
        forgot: '¿Olvidaste tu contraseña?',
        newHere: '¿Nuevo en MVP Trainer? Crear cuenta gratis',
        already: '¿Ya tienes cuenta? Iniciar sesión',
        backLogin: 'Volver al inicio de sesión',
        freeCopy: 'Empieza gratis con funciones limitadas. PRO desbloquea uso ilimitado.',
        confirmEmail: 'Cuenta creada. Revisa tu correo para confirmar tu acceso.',
        recoverySent: 'Si el correo está registrado, recibirás un enlace de recuperación.',
        passwordUpdated: 'Contraseña actualizada. Ya puedes iniciar sesión.',
        invalidEmail: 'Ingresa un correo válido.',
        requiredEmail: 'El email es obligatorio.',
        requiredPassword: 'La contraseña es obligatoria.',
        requiredName: 'El nombre es obligatorio.',
        passwordLength: 'La contraseña debe tener al menos 8 caracteres.',
        passwordMatch: 'Las contraseñas deben coincidir.',
        wrongLogin: 'Correo o contraseña incorrectos.',
        checkEmail: 'Revisa tu correo antes de iniciar sesión.',
        generic: 'No pudimos completar la acción. Intenta nuevamente.',
        googleMissing: 'Google aún no está configurado para este entorno.',
        facebookMissing: 'Facebook aún no está configurado para este entorno.'
    },
    en: {
        login: 'Sign in',
        register: 'Create account',
        resetRequest: 'Recover password',
        resetPassword: 'Reset password',
        brandSubtitle: 'Professional management for trainers',
        value: 'Manage clients, workouts, diets, payments and schedule in one place.',
        support: 'Run your personal training business and deliver professional plans to your clients.',
        welcome: 'Welcome back.',
        createIntro: 'Create your account and start organizing your clients.',
        resetIntro: 'We will send you a secure link to reset your password.',
        newPasswordIntro: 'Set a new password for your account.',
        google: 'Continue with Google',
        facebook: 'Continue with Facebook',
        divider: 'or continue with email',
        name: 'Trainer name',
        email: 'Email',
        password: 'Password',
        confirmPassword: 'Confirm password',
        enter: 'Sign in',
        entering: 'Signing in...',
        createFree: 'Create free account',
        creating: 'Creating account...',
        sendRecovery: 'Send recovery link',
        sending: 'Sending...',
        savePassword: 'Save new password',
        saving: 'Saving...',
        forgot: 'Forgot your password?',
        newHere: 'New to MVP Trainer? Create a free account',
        already: 'Already have an account? Sign in',
        backLogin: 'Back to sign in',
        freeCopy: 'Start free with limited features. PRO unlocks unlimited use.',
        confirmEmail: 'Account created. Check your email to confirm access.',
        recoverySent: 'If the email is registered, you will receive a recovery link.',
        passwordUpdated: 'Password updated. You can sign in now.',
        invalidEmail: 'Enter a valid email.',
        requiredEmail: 'Email is required.',
        requiredPassword: 'Password is required.',
        requiredName: 'Name is required.',
        passwordLength: 'Password must be at least 8 characters.',
        passwordMatch: 'Passwords must match.',
        wrongLogin: 'Incorrect email or password.',
        checkEmail: 'Check your email before signing in.',
        generic: 'We could not complete the action. Try again.',
        googleMissing: 'Google is not configured for this environment yet.',
        facebookMissing: 'Facebook is not configured for this environment yet.'
    }
};

const APP_COPY = {
    es: {
        authFeatures: ['Clientes', 'Rutinas IA', 'Dietas', 'Pagos'],
        accountTitle: 'Mi Cuenta',
        languageTitle: 'Idioma',
        languageDescription: 'Elige el idioma principal de la app.',
        migrationTitle: 'Migración de Datos',
        migrationDescription: 'Importa tus clientes locales de la versión demo a tu cuenta en la nube.',
        migrationButton: 'Importar Datos Demo',
        migrationConfirmTitle: '¿Importar datos locales?',
        migrationConfirmMessage: 'Esto importará tus clientes locales de la versión demo a tu cuenta en la nube. ¿Deseas continuar?',
        migrationEmptyTitle: 'Sin datos',
        migrationEmptyMessage: 'No hay datos locales.',
        migrationSuccessTitle: 'Migración exitosa',
        migrationSuccessMessage: (count: number) => `${count} clientes importados.`,
        currentPlan: 'Plan Actual',
        basic: 'Básico',
        upgradePro: 'Mejorar a PRO',
        usageLimits: 'Uso y Límites',
        usagePrefix: 'Uso',
        historicalClients: 'Clientes Históricos',
        historicalRoutines: 'Rutinas IA Históricas',
        historicalDiets: 'Dietas IA Históricas',
        activeClients: 'Clientes Activos',
        weeklyRoutines: 'Rutinas IA (Semanal)',
        weeklyDiets: 'Dietas IA (Semanal)',
        limitReached: 'Límite alcanzado. Desbloquear PRO',
        nearLimit: 'Cerca del límite. Mejorar a PRO',
        sync: 'Sincronizando datos...',
        reconnecting: 'Reconectando con el servidor...',
        myDay: 'Mi Día',
        payments: 'Pagos',
        logout: 'Cerrar sesión',
        proAccess: 'Acceso PRO',
        unlockBanner: <>Desbloquea <strong>clientes ilimitados</strong> y generación IA sin restricciones.</>,
        close: 'Cerrar',
        seePlans: 'Ver Planes',
        hello: 'Hola',
        dayStarts: 'Tu día empieza aquí.',
        freePlan: 'Plan Free',
        publicPage: 'Mi Página Pública',
        publicPageDescription: 'Configura tu landing page para clientes.',
        active: 'ACTIVO',
        paywallTitle: 'Desbloquea MVP Trainer PRO',
        paywallSubtitle: 'Gestiona más clientes y crea planes ilimitados con IA.',
        paywallBenefits: [
            'Clientes ilimitados',
            'Rutinas IA ilimitadas',
            'Dietas IA ilimitadas',
            'Historial completo de planes',
            'Mejor control de pagos y agenda',
            'Herramientas profesionales para atender mejor'
        ],
        paywallFreeNote: 'Tu plan Free incluye funciones limitadas para probar la app.',
        paywallClientsTitle: 'Clientes Ilimitados',
        paywallClientsDescription: 'Gestiona toda tu cartera sin restricciones.',
        paywallAiTitle: 'IA Ilimitada',
        paywallAiDescription: 'Rutinas y dietas infinitas.',
        paywallBrandingTitle: 'Branding PRO',
        paywallBrandingDescription: 'Tu marca, tu landing page.',
        monthly: 'Mensual',
        semiannual: '6 Meses',
        yearly: 'Anual',
        yearlySavings: 'Ahorras 35%',
        paymentNotConfiguredTitle: 'Pago no configurado',
        paymentLocalMessage: 'Stripe se probará fuera del entorno local.',
        paymentSupabaseMessage: 'Debes conectar Supabase para realizar pagos reales.',
        paymentCheckoutMissing: 'No se recibió URL de checkout',
        paymentLocalPending: 'Pago aún no configurado en entorno local.',
        newClient: 'Nuevo Cliente',
        editClient: 'Editar Cliente',
        optionalData: 'Datos opcionales',
        optionalDataHint: 'Información secundaria. No es necesaria para trabajar por WhatsApp.',
        clientEmailOptional: 'Correo del cliente (opcional)',
        clientEmailPlaceholder: 'Ej: cliente@email.com',
        clientPhonePlaceholder: 'Teléfono / WhatsApp (mín. 7 dígitos) *',
        phonePrimaryHint: 'Se usará para recordatorios, cobros y envío de rutinas o dietas por WhatsApp.',
        todaySummary: 'Resumen de hoy',
        quickActions: 'Acciones rápidas',
        pendingAi: 'Pendientes de IA',
        generateRoutine: 'Generar rutina',
        generateDiet: 'Generar dieta',
        registerPayment: 'Registrar pago',
        createPlan: 'Crear plan',
        needsRoutine: 'Falta rutina',
        needsDiet: 'Falta dieta',
        trainsToday: 'Entrena hoy',
        todayAgenda: 'Agenda de hoy',
        viewAgenda: 'Ver agenda',
        training: 'Entrenamiento',
        noTrainingToday: 'Hoy no tienes entrenamientos programados.',
        upcomingPayments: 'Cobros próximos',
        noPendingPayments: 'Sin cobros pendientes.',
        usageAndLimits: 'Uso y límites',
        aiPlan: 'Plan IA',
        todayPriority: 'Prioridad de hoy',
        allReadyToday: 'Todo al día',
        allReadyTodayHint: 'No tienes entrenamientos ni cobros que requieran atención ahora.',
        openWhatsApp: 'Abrir WhatsApp',
        openChat: 'Abrir chat',
        myClients: 'Mis Clientes',
        firstClientPrompt: 'Aún no tienes clientes',
        firstClientDescription: 'Agrega tu primer cliente para crear rutinas, dietas y controlar sus pagos.',
        loadingClients: 'Cargando tus clientes...',
        createFirstClient: 'Crear primer cliente',
        undefinedGoal: 'Objetivo sin definir',
        noPhoneTitle: 'Sin teléfono',
        noPhoneSend: 'Agrega un teléfono al cliente para enviar WhatsApp.',
        noPhoneOpen: 'Agrega un teléfono al cliente para abrir WhatsApp.',
        limitReachedTitle: 'Límite Alcanzado',
        clientLimitReached: 'Límite de clientes alcanzado.',
        aiLimitReached: 'Límite de IA alcanzado.',
        createErrorTitle: 'Error',
        createNoSession: 'No hay sesión activa',
        updateSuccessTitle: 'Éxito',
        updateSuccessMessage: 'Perfil actualizado',
        createSuccessMessage: 'Cliente creado correctamente',
        updateErrorMessage: 'No se pudo actualizar',
        createErrorMessage: 'No se pudo crear el cliente. Intenta de nuevo.',
        plan: {
            noSessionLabel: 'Sin sesión',
            noSessionDetail: 'Inicia sesión para ver tu plan',
            proLabel: 'Plan PRO',
            proExpiredLabel: 'Plan PRO (Expirado)',
            proDetail: 'Acceso total ilimitado',
            proExpiredDetail: 'Tu suscripción ha vencido',
            trialLabel: 'Prueba Gratuita',
            trialDetail: 'Acceso completo durante 21 días',
            freeLabel: 'Acceso vencido',
            freeDetail: 'Tus datos están protegidos hasta activar tu plan'
        }
    },
    en: {
        authFeatures: ['Clients', 'AI workouts', 'Diets', 'Payments'],
        accountTitle: 'My Account',
        languageTitle: 'Language',
        languageDescription: 'Choose the main language for the app.',
        migrationTitle: 'Data Migration',
        migrationDescription: 'Import local clients from the demo version into your cloud account.',
        migrationButton: 'Import Demo Data',
        migrationConfirmTitle: 'Import local data?',
        migrationConfirmMessage: 'This will import your local demo clients into your cloud account. Do you want to continue?',
        migrationEmptyTitle: 'No data',
        migrationEmptyMessage: 'There is no local data.',
        migrationSuccessTitle: 'Migration complete',
        migrationSuccessMessage: (count: number) => `${count} clients imported.`,
        currentPlan: 'Current Plan',
        basic: 'Basic',
        upgradePro: 'Upgrade to PRO',
        usageLimits: 'Usage and Limits',
        usagePrefix: 'Usage',
        historicalClients: 'Historical Clients',
        historicalRoutines: 'Historical AI Workouts',
        historicalDiets: 'Historical AI Diets',
        activeClients: 'Active Clients',
        weeklyRoutines: 'AI Workouts (Weekly)',
        weeklyDiets: 'AI Diets (Weekly)',
        limitReached: 'Limit reached. Unlock PRO',
        nearLimit: 'Near the limit. Upgrade to PRO',
        sync: 'Syncing data...',
        reconnecting: 'Reconnecting to the server...',
        myDay: 'My Day',
        payments: 'Payments',
        logout: 'Sign out',
        proAccess: 'PRO Access',
        unlockBanner: <>Unlock <strong>unlimited clients</strong> and unrestricted AI generation.</>,
        close: 'Close',
        seePlans: 'See Plans',
        hello: 'Hi',
        dayStarts: 'Your training day starts here.',
        freePlan: 'Free Plan',
        publicPage: 'My Public Page',
        publicPageDescription: 'Set up your client landing page.',
        active: 'ACTIVE',
        paywallTitle: 'Unlock MVP Trainer PRO',
        paywallSubtitle: 'Manage more clients and create unlimited AI plans.',
        paywallBenefits: [
            'Unlimited clients',
            'Unlimited AI workouts',
            'Unlimited AI diets',
            'Complete plan history',
            'Better payment and schedule control',
            'Professional tools to deliver better service'
        ],
        paywallFreeNote: 'Your Free plan includes limited features so you can try the app.',
        paywallClientsTitle: 'Unlimited Clients',
        paywallClientsDescription: 'Manage your full roster without restrictions.',
        paywallAiTitle: 'Unlimited AI',
        paywallAiDescription: 'Unlimited workout and nutrition plans.',
        paywallBrandingTitle: 'PRO Branding',
        paywallBrandingDescription: 'Your brand, your landing page.',
        monthly: 'Monthly',
        semiannual: '6 Months',
        yearly: 'Yearly',
        yearlySavings: 'Save 35%',
        paymentNotConfiguredTitle: 'Payment not configured',
        paymentLocalMessage: 'Stripe will be tested outside the local environment.',
        paymentSupabaseMessage: 'Connect Supabase to process real payments.',
        paymentCheckoutMissing: 'Checkout URL was not received',
        paymentLocalPending: 'Payment is not configured in the local environment yet.',
        newClient: 'New Client',
        editClient: 'Edit Client',
        optionalData: 'Optional data',
        optionalDataHint: 'Secondary information. Not required when working through WhatsApp.',
        clientEmailOptional: 'Client email (optional)',
        clientEmailPlaceholder: 'Example: client@email.com',
        clientPhonePlaceholder: 'Phone / WhatsApp (min. 7 digits) *',
        phonePrimaryHint: 'Used for reminders, payments, and sending workouts or diets through WhatsApp.',
        todaySummary: "Today's summary",
        quickActions: 'Quick actions',
        pendingAi: 'AI plans needed',
        generateRoutine: 'Generate workout',
        generateDiet: 'Generate diet',
        registerPayment: 'Register payment',
        createPlan: 'Create plan',
        needsRoutine: 'Workout needed',
        needsDiet: 'Diet needed',
        trainsToday: 'Trains today',
        todayAgenda: "Today's Schedule",
        viewAgenda: 'View schedule',
        training: 'Training',
        noTrainingToday: 'You have no training sessions scheduled today.',
        upcomingPayments: 'Upcoming payments',
        noPendingPayments: 'No pending payments.',
        usageAndLimits: 'Usage and limits',
        aiPlan: 'AI Plan',
        todayPriority: "Today's priority",
        allReadyToday: 'Everything is up to date',
        allReadyTodayHint: 'No workouts or payments need your attention right now.',
        openWhatsApp: 'Open WhatsApp',
        openChat: 'Open chat',
        myClients: 'My Clients',
        firstClientPrompt: 'You do not have clients yet',
        firstClientDescription: 'Add your first client to create workouts, diets and track payments.',
        loadingClients: 'Loading your clients...',
        createFirstClient: 'Create first client',
        undefinedGoal: 'Goal not defined',
        noPhoneTitle: 'No phone',
        noPhoneSend: 'Add a phone number to this client to send WhatsApp.',
        noPhoneOpen: 'Add a phone number to this client to open WhatsApp.',
        limitReachedTitle: 'Limit reached',
        clientLimitReached: 'Client limit reached.',
        aiLimitReached: 'AI limit reached.',
        createErrorTitle: 'Error',
        createNoSession: 'No active session',
        updateSuccessTitle: 'Success',
        updateSuccessMessage: 'Profile updated',
        createSuccessMessage: 'Client created successfully',
        updateErrorMessage: 'Could not update',
        createErrorMessage: 'Could not create the client. Try again.',
        plan: {
            noSessionLabel: 'No session',
            noSessionDetail: 'Sign in to see your plan',
            proLabel: 'PRO Plan',
            proExpiredLabel: 'PRO Plan (Expired)',
            proDetail: 'Unlimited full access',
            proExpiredDetail: 'Your subscription has expired',
            trialLabel: 'Free Trial',
            trialDetail: 'Full access for 21 days',
            freeLabel: 'Access expired',
            freeDetail: 'Your data is protected until you activate your plan'
        }
    }
};

const getTranslatedPlanStatus = (user: AppUser | null, language: AppLanguage, fallback: ReturnType<typeof getPlanStatusLabel>) => {
    const copy = APP_COPY[language].plan;
    if (!user) return { ...fallback, label: copy.noSessionLabel, detail: copy.noSessionDetail };
    if (user.subscription?.isSyncing) {
        return {
            ...fallback,
            label: user.subscription.type === 'pro' && user.subscription.isActive
                ? copy.proLabel
                : (language === 'es' ? 'Sincronizando tu plan…' : 'Syncing your plan…'),
            detail: language === 'es' ? 'Sincronizando tu cuenta…' : 'Syncing your account…'
        };
    }
    const type = user?.subscription?.type || 'free';
    const isActive = user?.subscription?.isActive;
    if (type === 'pro') {
        return {
            ...fallback,
            label: isActive ? copy.proLabel : copy.proExpiredLabel,
            detail: isActive ? copy.proDetail : copy.proExpiredDetail
        };
    }
    if (type === 'trial') {
        const daysRemaining = getTrialDaysRemaining(user);
        return {
            ...fallback,
            label: isActive ? copy.trialLabel : copy.freeLabel,
            detail: isActive && daysRemaining !== null
                ? (language === 'es' ? `${daysRemaining} días de acceso completo restantes` : `${daysRemaining} full-access days remaining`)
                : copy.freeDetail
        };
    }
    return { ...fallback, label: copy.freeLabel, detail: copy.freeDetail };
};

const FORM_COPY = {
    es: {
        personalData: 'Datos personales',
        fullName: 'Nombre Completo *',
        country: 'País (para dieta local) *',
        selectCountry: 'Seleccione un País',
        physicalProfile: 'Perfil físico',
        gender: 'Sexo',
        male: 'Hombre',
        female: 'Mujer',
        other: 'Otro',
        age: 'Edad (12-90) *',
        years: 'Años',
        weight: 'Peso (30-250 kg) *',
        height: 'Altura (100-230 cm) *',
        experience: 'Nivel de Experiencia *',
        beginner: 'Principiante',
        intermediate: 'Intermedio',
        advanced: 'Avanzado',
        medical: 'Condición médica, lesión o limitación a considerar',
        medicalPlaceholder: 'Ej: dolor de rodilla, diabetes, alergias, presión alta, ninguna.',
        goals: 'Objetivos *',
        dictate: 'Rellenar cliente por voz',
        recording: 'Escuchando sin límite',
        processingVoice: 'Procesando voz...',
        voiceHint: 'Habla de forma natural: nombre, edad, peso, objetivo, agenda, pago y restricciones. Lo que falte puedes completarlo manualmente.',
        primaryGoal: 'Objetivo principal *',
        secondaryGoals: 'Enfoques secundarios',
        clientGoalSummary: 'Meta específica del cliente',
        clientGoalPlaceholder: 'Ej: quiere bajar barriga, aumentar glúteos y verse mejor para diciembre.',
        routineFocus: 'Enfoque para rutina',
        routineFocusPlaceholder: 'Ej: glúteos, piernas, core y cardio.',
        dietFocus: 'Enfoque para dieta',
        dietFocusPlaceholder: 'Ej: proteína suficiente y alimentos económicos.',
        schedule: 'Agenda',
        trainingDays: 'Días de Entrenamiento *',
        trainingTime: 'Horario de Entrenamiento (Inicio / Fin) *',
        start: 'Inicio',
        end: 'Fin',
        paymentPlan: 'Plan de Pago *',
        monthlyFee: 'Mensualidad *',
        voiceTitle: 'Rellenar cliente por voz',
        voiceDescription: 'Describe al cliente con naturalidad. El audio no se guarda y podrás revisar el texto antes de aplicarlo.',
        voiceActive: 'Escuchando. Puedes hablar con calma; continuará hasta que pulses Detener dictado.',
        voiceOrganizing: 'Transcribiendo y ordenando datos...',
        voiceReview: 'Revisa y aplica los datos',
        voiceLive: 'En vivo',
        transcriptPlaceholder: 'La transcripción aparecerá aquí. Puedes editarla antes de aplicar.',
        apply: 'Aplicar',
        stop: 'Detener dictado',
        recordAgain: 'Volver a dictar',
        cancel: 'Cancelar',
        saveChanges: 'Guardar Cambios',
        createClient: 'Crear Cliente',
        emptyTranscript: 'Primero graba o escribe una transcripción.'
    },
    en: {
        personalData: 'Personal data',
        fullName: 'Full name *',
        country: 'Country (for local diet) *',
        selectCountry: 'Select a country',
        physicalProfile: 'Physical profile',
        gender: 'Gender',
        male: 'Male',
        female: 'Female',
        other: 'Other',
        age: 'Age (12-90) *',
        years: 'Years',
        weight: 'Weight (30-250 kg) *',
        height: 'Height (100-230 cm) *',
        experience: 'Experience level *',
        beginner: 'Beginner',
        intermediate: 'Intermediate',
        advanced: 'Advanced',
        medical: 'Medical condition, injury or limitation to consider',
        medicalPlaceholder: 'Example: knee pain, diabetes, allergies, high blood pressure, none.',
        goals: 'Goals *',
        dictate: 'Fill client by voice',
        recording: 'Listening without a time limit',
        processingVoice: 'Processing voice...',
        voiceHint: 'Speak naturally: name, age, weight, goal, schedule, payment and restrictions. Anything missing can be completed manually.',
        primaryGoal: 'Main goal *',
        secondaryGoals: 'Secondary focus',
        clientGoalSummary: 'Client goal details',
        clientGoalPlaceholder: 'Example: wants to lose belly fat, grow glutes and look better by December.',
        routineFocus: 'Workout focus',
        routineFocusPlaceholder: 'Example: glutes, legs, core and cardio.',
        dietFocus: 'Diet focus',
        dietFocusPlaceholder: 'Example: enough protein and affordable foods.',
        schedule: 'Schedule',
        trainingDays: 'Training days *',
        trainingTime: 'Training time (Start / End) *',
        start: 'Start',
        end: 'End',
        paymentPlan: 'Payment plan *',
        monthlyFee: 'Monthly fee *',
        voiceTitle: 'Fill client by voice',
        voiceDescription: 'Describe the client naturally. Audio is not saved, and you can review the text before applying it.',
        voiceActive: 'Listening. Take your time; dictation continues until you press Stop dictation.',
        voiceOrganizing: 'Transcribing and organizing data...',
        voiceReview: 'Review and apply the data',
        voiceLive: 'Live',
        transcriptPlaceholder: 'The transcript will appear here. You can edit it before applying.',
        apply: 'Apply',
        stop: 'Stop dictation',
        recordAgain: 'Dictate again',
        cancel: 'Cancel',
        saveChanges: 'Save Changes',
        createClient: 'Create Client',
        emptyTranscript: 'Record or write a transcript first.'
    }
};

const GOAL_LABELS: Record<AppLanguage, Record<string, string>> = {
    es: {},
    en: {
        'Bajar grasa': 'Lose fat',
        'Ganar masa muscular': 'Build muscle',
        'Recomposicion corporal': 'Body recomposition',
        'Definir / tonificar': 'Define / tone',
        'Gluteos y piernas': 'Glutes and legs',
        'Abdomen y core': 'Abs and core',
        'Aumentar fuerza': 'Increase strength',
        'Mejorar resistencia fisica': 'Improve endurance',
        'Mejorar salud general': 'Improve general health',
        'Movilidad / flexibilidad': 'Mobility / flexibility',
        'Rendimiento deportivo': 'Sports performance',
        'Mantenerse activo': 'Stay active',
        'Bajar abdomen': 'Lose belly fat',
        'Aumentar gluteos': 'Grow glutes',
        'Aumentar piernas': 'Grow legs',
        'Definir brazos': 'Define arms',
        'Mejorar postura': 'Improve posture',
        'Mejorar cardio': 'Improve cardio',
        'Ganar fuerza': 'Build strength',
        'Mejorar flexibilidad': 'Improve flexibility',
        'Reducir cintura': 'Reduce waist',
        'Crear habito de entrenamiento': 'Build training habit'
    }
};

const DAY_DISPLAY: Record<AppLanguage, Record<string, { short: string; full: string }>> = {
    es: {
        Lunes: { short: 'L', full: 'Lunes' },
        Martes: { short: 'M', full: 'Martes' },
        Miércoles: { short: 'M', full: 'Miércoles' },
        Jueves: { short: 'J', full: 'Jueves' },
        Viernes: { short: 'V', full: 'Viernes' },
        Sábado: { short: 'S', full: 'Sábado' },
        Domingo: { short: 'D', full: 'Domingo' }
    },
    en: {
        Lunes: { short: 'M', full: 'Monday' },
        Martes: { short: 'T', full: 'Tuesday' },
        Miércoles: { short: 'W', full: 'Wednesday' },
        Jueves: { short: 'T', full: 'Thursday' },
        Viernes: { short: 'F', full: 'Friday' },
        Sábado: { short: 'S', full: 'Saturday' },
        Domingo: { short: 'S', full: 'Sunday' }
    }
};

const goalLabel = (goal: string, language: AppLanguage) => GOAL_LABELS[language][goal] || goal;
const dayShortLabel = (day: string, language: AppLanguage) => DAY_DISPLAY[language][day]?.short || day.charAt(0);
const dayFullLabel = (day: string, language: AppLanguage) => DAY_DISPLAY[language][day]?.full || day;
const formatPaymentStatus = (status: string, language: AppLanguage) => {
    const labels: Record<AppLanguage, Record<string, string>> = {
        es: { sin_registro: 'Sin registro', al_dia: 'Al dia', pendiente: 'Pendiente', atrasado: 'Atrasado' },
        en: { sin_registro: 'No record', al_dia: 'Paid up', pendiente: 'Pending', atrasado: 'Late' }
    };
    return labels[language]?.[status] || status.replace('_', ' ');
};
const localizeLimitReason = (reason: string, language: AppLanguage) => {
    if (language !== 'en') return reason;
    if (/exclusiva|PRO/i.test(reason)) return 'This feature is exclusive to PRO users.';
    if (/limite|límite/i.test(reason)) return 'Free limit reached. Upgrade to PRO.';
    return reason;
};

const CLIENT_DETAIL_COPY = {
    es: {
        limitReachedTitle: 'Limite alcanzado',
        routineFallbackTitle: 'Rutina Semanal IA',
        routineSavedTitle: 'Exito',
        routineSavedMessage: 'Rutina generada y guardada',
        dietSavedTitle: 'Exito',
        dietSavedMessage: 'Dieta generada y guardada',
        saveErrorTitle: 'Error',
        routineSaveError: 'No se pudo guardar la rutina.',
        dietSaveError: 'No se pudo guardar la dieta.',
        geminiNoResponseTitle: 'Gemini no respondio',
        geminiNoResponseMessage: 'No se pudo generar con Gemini. Intenta nuevamente.',
        noPhoneTitle: 'Sin telefono',
        noPhoneWhatsappMessage: 'Agrega un telefono al cliente para abrir WhatsApp.',
        noPhonePaymentMessage: 'Agrega un telefono al cliente para enviar WhatsApp.',
        whatsappOpenedTitle: 'WhatsApp abierto',
        whatsappOpenedMessage: 'Envia el plan ahora.',
        paymentNumberError: 'El monto debe ser numerico.',
        paymentSavedTitle: 'Guardado',
        paymentSavedMessage: 'Informacion de pago actualizada.',
        reminderReadyTitle: 'Recordatorio listo',
        reminderReadyMessage: 'WhatsApp se abrira en breve.',
        agendaDayError: 'Debes seleccionar al menos un dia.',
        agendaTimeError: 'La hora de fin debe ser posterior a la de inicio.',
        agendaSavedTitle: 'Exito',
        agendaSavedMessage: 'Agenda actualizada.',
        tabs: { profile: 'Perfil', agenda: 'Agenda', routines: 'Rutinas', nutrition: 'Dieta', payments: 'Pagos' },
        weight: 'Peso',
        height: 'Altura',
        age: 'Edad',
        years: 'anos',
        level: 'Nivel',
        goals: 'Objetivos',
        noGoals: 'Sin objetivos definidos',
        location: 'Ubicacion',
        notSpecified: 'No especificado',
        contact: 'Contacto',
        phone: 'Telefono / WhatsApp',
        optionalEmail: 'Correo opcional',
        editProfile: 'Editar perfil',
        undefinedTime: 'Hora no definida',
        noTrainingDays: 'Dias de entrenamiento no asignados',
        editSchedule: 'Editar agenda',
        editTime: 'Editar horario',
        trainingTime: 'Horario de entrenamiento',
        trainingDays: 'Dias de entrenamiento',
        start: 'Inicio',
        end: 'Fin',
        cancel: 'Cancelar',
        save: 'Guardar',
        workouts: 'Entrenamientos',
        historical: 'historico',
        generatingGemini: 'Generando con Gemini...',
        generatingWorkout: 'Creando rutina personalizada...',
        generatingDiet: 'Generando plan nutricional...',
        generateWorkout: 'Generar Plan de Entrenamiento',
        noWorkouts: 'Aún no hay rutinas',
        noWorkoutsHint: 'Genera una rutina semanal personalizada para este cliente.',
        generatedWithAi: 'Generado con IA',
        proBase: 'Pro Base',
        createdOn: 'Creada el',
        routineEmpty: 'Esta rutina aun no tiene ejercicios generados. Intenta regenerarla.',
        warnings: 'Advertencias',
        recommendations: 'Recomendaciones',
        copy: 'Copiar',
        delete: 'Eliminar',
        nutritionPlan: 'Plan nutricional',
        generateDiet: 'Generar Plan Nutricional',
        noDiets: 'Aún no hay dietas',
        dietEmptyCta: 'Crea un plan nutricional semanal adaptado al objetivo del cliente.',
        generalPlan: 'Plan general',
        meal: 'Comida',
        copiedRoutineTitle: 'Rutina copiada',
        copiedDietTitle: 'Dieta semanal copiada',
        readyToPaste: 'Lista para pegar.',
        deleteRoutineTitle: 'Eliminar rutina?',
        deleteRoutineMessage: 'Seguro que deseas eliminar esta rutina?',
        deletingTitle: 'Eliminando...',
        deletingRoutine: 'Archivando rutina',
        routineDeletedTitle: 'Rutina eliminada',
        routineDeletedMessage: 'Se ha archivado correctamente',
        deleteDietTitle: 'Eliminar dieta?',
        deleteDietMessage: 'Eliminar este plan nutricional?',
        deletingDiet: 'Archivando plan nutricional',
        dietDeletedTitle: 'Plan eliminado',
        dietDeletedMessage: 'Dieta borrada correctamente',
        invalidDietId: 'ID de dieta no valido o no guardado aun.',
        deleteError: 'No se pudo eliminar',
        deleteDietError: 'No se pudo borrar el plan nutricional',
        currentStatus: 'Estado actual',
        monthlyFee: 'Mensualidad',
        status: 'Estado',
        payment: 'Pago',
        next: 'Cubierto hasta',
        lastPayment: 'Ultimo pago',
        nextCharge: 'Cubierto hasta',
        pending: 'Pendiente',
        noRecord: 'Sin registro',
        paidUp: 'Al dia',
        late: 'Atrasado',
        markPaidToday: 'Registrar pago',
        paymentRegisteredTitle: 'Pago registrado',
        paymentRegisteredMessage: 'El nuevo periodo ya quedó registrado.',
        manualSettings: 'Ajustes avanzados',
        paymentAmount: 'Monto de mensualidad',
        method: 'Metodo',
        cash: 'Efectivo',
        transfer: 'Transferencia',
        card: 'Tarjeta',
        other: 'Otro',
        applySettings: 'Aplicar ajustes'
    },
    en: {
        limitReachedTitle: 'Limit reached',
        routineFallbackTitle: 'AI Weekly Routine',
        routineSavedTitle: 'Success',
        routineSavedMessage: 'Workout generated and saved',
        dietSavedTitle: 'Success',
        dietSavedMessage: 'Diet generated and saved',
        saveErrorTitle: 'Error',
        routineSaveError: 'The workout could not be saved.',
        dietSaveError: 'The diet could not be saved.',
        geminiNoResponseTitle: 'Gemini did not respond',
        geminiNoResponseMessage: 'Gemini could not generate this. Try again.',
        noPhoneTitle: 'No phone',
        noPhoneWhatsappMessage: 'Add a client phone number to open WhatsApp.',
        noPhonePaymentMessage: 'Add a client phone number to send WhatsApp.',
        whatsappOpenedTitle: 'WhatsApp opened',
        whatsappOpenedMessage: 'Send the plan now.',
        paymentNumberError: 'The amount must be numeric.',
        paymentSavedTitle: 'Saved',
        paymentSavedMessage: 'Payment information updated.',
        reminderReadyTitle: 'Reminder ready',
        reminderReadyMessage: 'WhatsApp will open shortly.',
        agendaDayError: 'Select at least one day.',
        agendaTimeError: 'End time must be after start time.',
        agendaSavedTitle: 'Success',
        agendaSavedMessage: 'Schedule updated.',
        tabs: { profile: 'Profile', agenda: 'Schedule', routines: 'Workouts', nutrition: 'Diet', payments: 'Payments' },
        weight: 'Weight',
        height: 'Height',
        age: 'Age',
        years: 'years',
        level: 'Level',
        goals: 'Goals',
        noGoals: 'No goals defined',
        location: 'Location',
        notSpecified: 'Not specified',
        contact: 'Contact',
        phone: 'Phone / WhatsApp',
        optionalEmail: 'Optional email',
        editProfile: 'Edit profile',
        undefinedTime: 'Time not set',
        noTrainingDays: 'Training days not assigned',
        editSchedule: 'Edit schedule',
        editTime: 'Edit time',
        trainingTime: 'Training time',
        trainingDays: 'Training days',
        start: 'Start',
        end: 'End',
        cancel: 'Cancel',
        save: 'Save',
        workouts: 'Workouts',
        historical: 'historical',
        generatingGemini: 'Generating with Gemini...',
        generatingWorkout: 'Creating a personalized workout...',
        generatingDiet: 'Generating nutrition plan...',
        generateWorkout: 'Generate Workout Plan',
        noWorkouts: 'No workouts yet',
        noWorkoutsHint: 'Generate a personalized weekly workout for this client.',
        generatedWithAi: 'Generated with AI',
        proBase: 'Pro Base',
        createdOn: 'Created on',
        routineEmpty: 'This workout does not have exercises yet. Try regenerating it.',
        warnings: 'Warnings',
        recommendations: 'Recommendations',
        copy: 'Copy',
        delete: 'Delete',
        nutritionPlan: 'Nutrition plan',
        generateDiet: 'Generate Nutrition Plan',
        noDiets: 'No diets yet',
        dietEmptyCta: 'Create a weekly nutrition plan adapted to the client goal.',
        generalPlan: 'General plan',
        meal: 'Meal',
        copiedRoutineTitle: 'Workout copied',
        copiedDietTitle: 'Weekly diet copied',
        readyToPaste: 'Ready to paste.',
        deleteRoutineTitle: 'Delete workout?',
        deleteRoutineMessage: 'Are you sure you want to delete this workout?',
        deletingTitle: 'Deleting...',
        deletingRoutine: 'Archiving workout',
        routineDeletedTitle: 'Workout deleted',
        routineDeletedMessage: 'It was archived successfully',
        deleteDietTitle: 'Delete diet?',
        deleteDietMessage: 'Delete this nutrition plan?',
        deletingDiet: 'Archiving nutrition plan',
        dietDeletedTitle: 'Plan deleted',
        dietDeletedMessage: 'Diet deleted correctly',
        invalidDietId: 'Invalid diet ID or not saved yet.',
        deleteError: 'Could not delete',
        deleteDietError: 'Could not delete the nutrition plan',
        currentStatus: 'Current status',
        monthlyFee: 'Monthly fee',
        status: 'Status',
        payment: 'Payment',
        next: 'Covered until',
        lastPayment: 'Last payment',
        nextCharge: 'Covered until',
        pending: 'Pending',
        noRecord: 'No record',
        paidUp: 'Paid up',
        late: 'Late',
        markPaidToday: 'Register payment',
        paymentRegisteredTitle: 'Payment registered',
        paymentRegisteredMessage: 'The new coverage period is now registered.',
        manualSettings: 'Advanced settings',
        paymentAmount: 'Monthly fee amount',
        method: 'Method',
        cash: 'Cash',
        transfer: 'Transfer',
        card: 'Card',
        other: 'Other',
        applySettings: 'Apply settings'
    }
};

const LanguageSwitcher = ({ language, onChange, compact = false }: { language: AppLanguage, onChange: (language: AppLanguage) => void, compact?: boolean }) => (
    <div className={`inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/80 p-1 ${compact ? '' : 'shadow-lg shadow-black/20'}`}>
        <span className="pl-2 text-zinc-500"><Languages size={compact ? 13 : 15} /></span>
        {(['es', 'en'] as AppLanguage[]).map(option => (
            <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                className={`min-h-11 min-w-11 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-colors ${
                    language === option ? 'bg-mvp-gold text-black' : 'text-zinc-400 hover:text-white'
                }`}
            >
                {option}
            </button>
        ))}
    </div>
);

const convertTo12Hour = (time24: string) => {
    if (!time24) return null;
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    const strTime = (h < 10 ? '0' + h : h) + ':' + minutes + ' ' + ampm;
    return strTime;
};

const convertTo24Hour = (time12: string | null) => {
    if (!time12) return '';
    try {
        const [time, modifier] = time12.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
        return `${hours.padStart(2, '0')}:${minutes}`;
    } catch (e) {
        return '';
    }
};

const ExerciseItem = ({ ex }: { ex: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#141824] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_8px_24px_rgba(0,0,0,0.16)] transition-[background-color,border-color,box-shadow] hover:border-violet-400/20 hover:bg-[#1A2033]">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h5 className="font-bold text-zinc-100 text-sm">{ex.name}</h5>
            {ex.muscleFocus && (
              <span className="text-[9px] bg-mvp-gold/10 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/20 font-bold uppercase tracking-tight">
                {ex.muscleFocus}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {ex.rest && (
              <span className="flex items-center gap-1">
                <Timer size={12} className="text-zinc-500" /> Descanso: {ex.rest}
              </span>
            )}
            {ex.notes && (
              <span className="flex items-center gap-1 italic text-zinc-500">
                <MessageSquare size={12} className="text-zinc-600" /> {ex.notes}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 font-mono text-xs text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <span className="font-extrabold text-white">{ex.sets}</span>
            <span className="text-zinc-600">x</span>
            <span className="text-mvp-gold font-bold">{ex.reps}</span>
          </div>
          {(ex.howTo || ex.commonMistake) && (
            <motion.button
              onClick={() => setIsOpen(!isOpen)} 
              whileTap={{ scale: 0.96 }}
              aria-expanded={isOpen}
              className="mt-1 inline-flex min-h-8 select-none items-center gap-1.5 whitespace-nowrap rounded-lg border border-violet-300/25 bg-[linear-gradient(180deg,rgba(124,58,237,0.18),rgba(76,29,149,0.13))] px-2.5 text-[10px] font-bold text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_3px_9px_rgba(0,0,0,0.2)] transition-[border-color,filter] hover:border-violet-300/40 hover:brightness-110"
            >
              <PlayCircle size={13} />
              {isOpen ? "Ocultar guía" : "Cómo hacerlo"} {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </motion.button>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
        <div className="mt-3 space-y-2.5 border-t border-zinc-800/80 pt-3 text-xs text-zinc-300">
          {ex.howTo && (
            <div>
              <p className="text-mvp-gold font-bold uppercase tracking-wider text-[9px] mb-1">Guía Paso a Paso:</p>
              <p className="leading-relaxed pl-2 border-l border-mvp-gold/30 text-zinc-400 text-xs">{ex.howTo}</p>
            </div>
          )}
          {ex.commonMistake && (
            <div>
              <p className="text-red-400 font-bold uppercase tracking-wider text-[9px] mb-1">Error Común a Evitar:</p>
              <p className="leading-relaxed pl-2 border-l border-red-500/30 text-zinc-400 text-xs">{ex.commonMistake}</p>
            </div>
          )}
        </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
};

const groupExercisesByDay = (exercises: any[], days?: any[]) => {
    const grouped: Record<string, any[]> = {};
    
    // Si viene en formato días estructurado (nuevo estándar AI)
    if (Array.isArray(days) && days.length > 0) {
        days.forEach(d => {
            const dayName = d.day || d.name || 'Otros';
            if (!grouped[dayName]) grouped[dayName] = [];
            if (Array.isArray(d.exercises)) {
                grouped[dayName].push(...d.exercises);
            } else if (Array.isArray(d.workouts)) {
                grouped[dayName].push(...d.workouts);
            }
        });
        return grouped;
    }

    // Formato antiguo: lista plana con propiedad .day
    (Array.isArray(exercises) ? exercises : []).forEach(ex => {
        const day = ex.day || 'Otros';
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(ex);
    });
    return grouped;
};

const handleShare = async (title: string, text: string) => {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
        } catch (e) {
            // Fallback to clipboard
            navigator.clipboard.writeText(text);
        }
    } else {
        navigator.clipboard.writeText(text);
    }
};

const handleWhatsAppShare = (text: string) => {
    const url = buildWhatsAppUrl('', text);
    window.open(url, '_blank');
};

const EMOJI = {
    wave: String.fromCodePoint(0x1F44B),
    muscle: String.fromCodePoint(0x1F4AA),
    check: String.fromCodePoint(0x2705),
    calendar: String.fromCodePoint(0x1F4C5),
    diet: String.fromCodePoint(0x1F957),
    routine: `${String.fromCodePoint(0x1F3CB)}${String.fromCodePoint(0xFE0F)}`,
    warning: `${String.fromCodePoint(0x26A0)}${String.fromCodePoint(0xFE0F)}`,
    target: String.fromCodePoint(0x1F3AF),
    water: String.fromCodePoint(0x1F4A7),
    timer: `${String.fromCodePoint(0x23F1)}${String.fromCodePoint(0xFE0F)}`
};

const getPlanSafetyNote = (language: AppLanguage = 'es') => language === 'es'
    ? 'Recuerda: sigue este plan a tu ritmo. Si tienes alguna molestia o condición médica, consulta con tu entrenador o un profesional de salud.'
    : 'Remember: follow this plan at your own pace. If you have pain or a medical condition, consult your trainer or a healthcare professional.';

const formatPlanDate = (value?: string | null, language: AppLanguage = 'es') => {
    const unavailable = language === 'es' ? 'Fecha no disponible' : 'Date unavailable';
    if (!value) return unavailable;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return unavailable;
    return date.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
};

const sortPlansNewest = <T extends { createdAt?: string | null }>(plans: T[]) =>
    [...plans].sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
    });

const normalizeWhatsAppPhone = (phone?: string | null) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 9) return `51${digits}`;
    return digits;
};

const buildWhatsAppUrl = (phone?: string | null, text?: string) => {
    const params = new URLSearchParams();
    const cleanPhone = normalizeWhatsAppPhone(phone);
    if (cleanPhone) params.set('phone', cleanPhone);
    if (text) params.set('text', text);
    const query = params.toString();
    return query ? `https://api.whatsapp.com/send?${query}` : 'https://api.whatsapp.com/send';
};

const hasClientRoutine = (client: Client) => Array.isArray(client.routines) && client.routines.length > 0;
const hasClientDiet = (client: Client) => Boolean(client.dietPlan);
const needsAIPlan = (client: Client) => !hasClientRoutine(client) || !hasClientDiet(client);

const getClientInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
    return initials || 'CL';
};

const getExerciseGuideText = (ex: any) =>
    ex.howTo || ex.execution || ex.instructions || ex.description || ex.notes || "Realiza el movimiento con técnica controlada y sin dolor.";

const buildRoutineShareMessage = (routine: Routine, language: AppLanguage = 'es') => {
    const labels = language === 'es'
        ? { title: 'Rutina semanal', sets: 'Series', reps: 'Reps', rest: 'Descanso', how: 'Cómo hacerlo', avoid: 'Evita', recommendations: 'Recomendaciones' }
        : { title: 'Weekly workout', sets: 'Sets', reps: 'Reps', rest: 'Rest', how: 'How to do it', avoid: 'Avoid', recommendations: 'Recommendations' };
    const exercises = routine.exercises || (routine as any).workouts || [];
    const grouped = groupExercisesByDay(exercises, routine.days);
    let text = `${EMOJI.routine} ${labels.title}: ${routine.title || routine.name}\n${routine.summary || routine.description || ""}\n\n`;

    Object.keys(grouped).forEach(day => {
        text += `${EMOJI.calendar} ${day.toUpperCase()}\n`;
        (Array.isArray(grouped[day]) ? grouped[day] : []).forEach((ex, index) => {
            text += `${index + 1}. ${ex.name}\n`;
            text += `${labels.sets}: ${ex.sets || "-"}\n`;
            text += `${labels.reps}: ${ex.reps || "-"}\n`;
            if (ex.rest) text += `${EMOJI.timer} ${labels.rest}: ${ex.rest}\n`;
            text += `${labels.how}: ${getExerciseGuideText(ex)}\n`;
            if (ex.commonMistake) text += `${EMOJI.warning} ${labels.avoid}: ${ex.commonMistake}\n`;
            text += `\n`;
        });
        text += `\n`;
    });

    if (Array.isArray(routine.recommendations) && routine.recommendations.length > 0) {
        text += `${EMOJI.check} ${labels.recommendations}\n${routine.recommendations.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    return `${text}${EMOJI.check} ${getPlanSafetyNote(language)}`;
};

const buildDietShareMessage = (diet: DietPlan, language: AppLanguage = 'es') => {
    const labels = language === 'es'
        ? { title: 'Plan nutricional', daily: 'Objetivo diario', note: 'Nota', recommendations: 'Recomendaciones' }
        : { title: 'Nutrition plan', daily: 'Daily target', note: 'Note', recommendations: 'Recommendations' };
    let text = `${EMOJI.diet} ${labels.title}: ${diet.title}\n`;
    text += `${EMOJI.target} ${labels.daily}: ${diet.totalKcal || (diet as any).daily_calories} kcal | P:${diet.totalProtein}g | C:${diet.totalCarbs}g | F:${diet.totalFats}g\n`;
    if (diet.summary || diet.notes) text += `${labels.note}: ${diet.summary || diet.notes}\n\n`;

    (Array.isArray(diet.days) ? diet.days : []).forEach(d => {
        text += `${EMOJI.calendar} ${d.day.toUpperCase()}\n`;
        (Array.isArray(d.meals) ? d.meals : []).forEach(m => {
            text += `- ${m.timeOfDay}: ${m.name} (${m.description})\n`;
        });
        text += `\n`;
    });

    if (Array.isArray(diet.recommendations) && diet.recommendations.length > 0) {
        text += `${EMOJI.check} ${labels.recommendations}\n${diet.recommendations.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    return `${text}${EMOJI.check} ${getPlanSafetyNote(language)}`;
};

// --- COMPONENTS ---

const UsageProgress = ({ current, max, label, onUpgrade, language }: { current: number, max: number, label: string, onUpgrade: () => void, language: AppLanguage }) => {
  const isUnlimited = max === Infinity;
  const percentage = isUnlimited ? 100 : Math.min((current / max) * 100, 100);
  const isFull = !isUnlimited && current >= max;
  const isNear = !isUnlimited && current >= max - 1;
  const copy = APP_COPY[language];

  return (
    <div className="w-full mb-3">
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">{copy.usagePrefix} {label}</span>
        <div className="flex items-center text-xs">
           {isFull && <Lock size={10} className="text-red-500 mr-1" />}
           <span className={isFull ? "text-red-500 font-bold" : isNear ? "text-amber-500" : "text-zinc-400"}>
             {isUnlimited ? (language === 'es' ? 'Ilimitado' : 'Unlimited') : `${current}/${max}`}
           </span>
        </div>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full">
        <div 
          className={`h-full transition-all duration-500 ${isUnlimited ? 'bg-emerald-500' : isFull ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-mvp-gold'}`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      {(isNear || isFull) && max !== Infinity && (
        <button 
          onClick={onUpgrade} 
          className={`text-[10px] mt-1 w-full text-left flex items-center hover:underline ${isFull ? 'text-red-400' : 'text-amber-400'}`}
        >
          {isFull ? copy.limitReached : copy.nearLimit}
        </button>
      )}
    </div>
  );
};

const AppSplashScreen = ({ isReconnecting = false, language = 'es' }: { isReconnecting?: boolean; language?: AppLanguage }) => (
  <div className="h-screen bg-black flex items-center justify-center text-white flex-col gap-6 relative overflow-hidden">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(139,92,246,0.18),transparent_34%),linear-gradient(180deg,rgba(29,35,50,0.4),transparent_55%)]" />
    <div className="absolute inset-x-0 top-1/2 h-32 -translate-y-1/2 mvp-splash-speed-lines" />
    <PageTransition className="flex flex-col items-center gap-2 text-center px-6 relative z-10">
      <MVPBrandLogo className="w-32 h-32 rounded-3xl bg-black/30 border border-mvp-gold/20 p-3 shadow-primary mb-1 animate-logoFloat" />
      <p className="text-white font-black tracking-tight text-xl">MVP<span className="text-mvp-gold">TRAINER</span></p>
      <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-600 font-black">by MVP Ventures</p>
      <div className="mt-4 h-1 w-36 rounded-full bg-zinc-900 overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-mvp-gold app-loading-bar" />
      </div>
      <p className="text-zinc-400 text-sm font-medium mt-2">
        {isReconnecting
          ? (language === 'es' ? 'Reconectando con tu espacio...' : 'Reconnecting to your workspace...')
          : (language === 'es' ? 'Preparando tu espacio de trabajo...' : 'Preparing your workspace...')}
      </p>
      {isReconnecting && (
        <p className="text-zinc-600 text-[11px] max-w-[220px]">
          {language === 'es'
            ? 'Estamos restaurando tu sesión local para cargar más rápido.'
            : 'We are restoring your local session for a faster start.'}
        </p>
      )}
      <button
        onClick={() => window.location.reload()}
        className="mt-6 text-[10px] text-zinc-500 hover:text-mvp-gold transition-colors uppercase tracking-widest font-bold"
      >
        {language === 'es' ? 'Reiniciar app' : 'Restart app'}
      </button>
    </PageTransition>
  </div>
);

const SkeletonCard = ({ className = '' }: { className?: string; key?: React.Key }) => (
  <div className={`skeleton-shimmer bg-zinc-900 border border-zinc-800 rounded-2xl ${className}`} />
);

const SkeletonList = ({ count = 3 }: { count?: number }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, item) => (
      <div key={item} className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex items-center gap-3">
        <SkeletonCard className="w-11 h-11 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <SkeletonCard className="h-4 w-1/2" />
          <SkeletonCard className="h-3 w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

const SkeletonProfile = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      {[0, 1, 2, 3].map(item => <SkeletonCard key={item} className="h-20" />)}
    </div>
    <SkeletonCard className="h-28" />
    <SkeletonCard className="h-20" />
  </div>
);

const SkeletonRoutine = () => (
  <div className="space-y-3">
    <SkeletonCard className="h-16" />
    <SkeletonCard className="h-28" />
    <SkeletonCard className="h-28" />
  </div>
);

const SkeletonPayment = () => (
  <div className="space-y-4">
    <SkeletonCard className="h-28" />
    <div className="grid grid-cols-2 gap-4">
      <SkeletonCard className="h-20" />
      <SkeletonCard className="h-20" />
    </div>
    <SkeletonCard className="h-12" />
  </div>
);

const Toast = ({ title, message, type, onClose }: { title: string, message: string, type: 'success' | 'warning' | 'error' | 'info', onClose: () => void }) => {
  const duration = type === 'error' ? 5500 : type === 'warning' ? 4500 : 3200;
  useEffect(() => { const t = setTimeout(onClose, duration); return () => clearTimeout(t); }, [onClose, duration]);
  const colors = type === 'error' ? 'bg-red-950/95 border-red-500/40 text-white' : type === 'warning' ? 'bg-amber-950/95 border-amber-500/40 text-white' : type === 'info' ? 'bg-zinc-950/95 border-mvp-gold/30 text-white' : 'bg-zinc-950/95 border-green-500/30 text-white';
  const iconWrap = type === 'error' ? 'bg-red-500/15 text-red-300' : type === 'warning' ? 'bg-amber-500/15 text-amber-300' : type === 'info' ? 'bg-mvp-gold/15 text-mvp-gold' : 'bg-green-500/15 text-green-300';
  const icon = type === 'error' ? <AlertCircle size={18} /> : type === 'warning' ? <AlertTriangle size={18} /> : type === 'info' ? <Sparkles size={18} /> : <Check size={18} />;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`fixed bottom-4 right-4 left-4 sm:left-auto z-[60] max-w-sm sm:w-full p-3.5 rounded-2xl border flex items-center gap-3 shadow-2xl backdrop-blur-xl ${colors}`}
    >
       <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrap}`}>{icon}</span>
       <div className="flex-1">
         <h4 className="font-bold text-sm">{title}</h4>
         <p className="text-xs opacity-80">{message}</p>
       </div>
       <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/5"><X size={14}/></button>
    </motion.div>
  );
};

// --- REDESIGNED PAYWALL COMPONENT ---
const PaywallPro = ({ onClose, user, onShowToast, language }: { onClose: () => void, user: AppUser, onShowToast: (t: any) => void, language: AppLanguage }) => {
    const [loading, setLoading] = useState(false);
    const copy = APP_COPY[language];
    const isLocalEnvironment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const trialExpired = isSubscriptionLocked(user) && user.subscription?.type === 'trial';
    const paywallNote = trialExpired
      ? (language === 'es' ? 'Tu información está protegida y no se eliminará.' : 'Your information is protected and will not be deleted.')
      : copy.paywallFreeNote;
    const paywallTitle = trialExpired
      ? (language === 'es' ? 'Tu prueba de 21 días terminó' : 'Your 21-day trial has ended')
      : copy.paywallTitle;
    const paywallSubtitle = trialExpired
      ? (language === 'es'
        ? 'Activa tu plan para volver a abrir fichas, planes, agenda, pagos y envíos a clientes.'
        : 'Activate your plan to reopen client records, plans, schedule, payments, and sharing tools.')
      : copy.paywallSubtitle;

    const handleUpgrade = async (interval: PlanInterval) => {
        setLoading(true);
        try {
            if (isLocalEnvironment) {
                onShowToast({ title: copy.paymentNotConfiguredTitle, message: copy.paymentLocalMessage, type: 'warning' });
                return;
            }

            if (!isSupabaseEnabled()) {
                onShowToast({ title: copy.createErrorTitle, message: copy.paymentSupabaseMessage, type: 'error' });
                return;
            }

            const { data, error } = await supabase!.functions.invoke('create-checkout-session', {
                body: { 
                    interval,
                    successUrl: window.location.origin + '?session_id={CHECKOUT_SESSION_ID}',
                    cancelUrl: window.location.origin
                }
            });

            if (error) throw error;
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error(copy.paymentCheckoutMissing);
            }
        } catch (e) {
            console.error("Stripe Error:", e);
            onShowToast({ title: copy.paymentNotConfiguredTitle, message: copy.paymentLocalPending, type: 'warning' });
        } finally {
            setLoading(false);
        }
    };

    return (
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: MOTION_EASE }}
      >
        <motion.div
          className="w-full max-w-4xl max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar bg-[#0b0e14] rounded-2xl border border-zinc-800 shadow-2xl relative my-auto"
          initial={{ opacity: 0, y: 5, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.985 }}
          transition={{ duration: 0.2, ease: MOTION_EASE }}
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-300 hover:text-white z-20 bg-black/65 border border-white/10 p-2 rounded-xl backdrop-blur-md" aria-label={copy.close}><X size={18} /></button>

          <section className="relative min-h-[190px] sm:min-h-[220px] overflow-hidden border-b border-zinc-800">
            <img
              src="/brand/mvp-paywall-fitness.jpg"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,8,13,0.94)_0%,rgba(6,8,13,0.72)_58%,rgba(6,8,13,0.46)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,8,13,0.18),rgba(6,8,13,0.92))]" />

            <div className="relative z-10 min-h-[190px] sm:min-h-[220px] flex flex-col justify-end p-6 sm:p-8 pr-16">
             <div className="flex items-center gap-2 md:gap-3">
                <MVPBrandLogo className="w-11 h-11 rounded-xl border border-mvp-primary/40 bg-black/80 p-1 shadow-[0_12px_30px_rgba(0,0,0,0.36)]" />
                <div>
                  <div className="inline-flex items-center gap-2 text-[#d8b4fe]">
                    <Crown size={15} />
                    <span className="text-[11px] font-black uppercase tracking-[0.12em]">MVP Trainer PRO</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-300/80">{paywallNote}</p>
                </div>
              </div>
              <h2 className="mt-4 max-w-xl text-2xl sm:text-3xl font-black leading-tight text-white">{paywallTitle}</h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-zinc-300">{paywallSubtitle}</p>
            </div>
          </section>

          <div className="grid md:grid-cols-[1.05fr_0.95fr]">
            <section className="p-6 sm:p-8 border-b md:border-b-0 md:border-r border-zinc-800">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">
                {language === 'es' ? 'Todo lo que desbloqueas' : 'Everything you unlock'}
              </p>
              <div className="mt-4 grid sm:grid-cols-2 gap-x-5 gap-y-3">
                {copy.paywallBenefits.map(benefit => (
                  <div key={benefit} className="flex items-start gap-2.5 text-sm text-zinc-200">
                    <span className="mt-0.5 w-5 h-5 rounded-md bg-mvp-primary/12 text-[#c084fc] flex items-center justify-center shrink-0">
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="leading-snug">{benefit}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="p-6 sm:p-8 bg-zinc-950/45">
              <p className="text-xs font-black uppercase tracking-[0.1em] text-zinc-500">{language === 'es' ? 'Elige tu plan' : 'Choose your plan'}</p>
              <div className="mt-4 space-y-3">
                <button onClick={() => handleUpgrade('monthly')} disabled={loading} className="w-full min-h-[64px] flex items-center justify-between gap-4 px-4 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:border-mvp-primary/40 hover:bg-zinc-900 transition-all disabled:opacity-60">
                  <span className="text-left">
                    <span className="block text-sm font-bold text-white">{copy.monthly}</span>
                    <span className="block mt-0.5 text-[11px] text-zinc-500">{language === 'es' ? 'Flexibilidad mes a mes' : 'Month-to-month flexibility'}</span>
                  </span>
                  <strong className="text-lg text-white">$14.99</strong>
                </button>
                <button onClick={() => handleUpgrade('semiannual')} disabled={loading} className="w-full min-h-[64px] flex items-center justify-between gap-4 px-4 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:border-mvp-primary/40 hover:bg-zinc-900 transition-all disabled:opacity-60">
                  <span className="text-left">
                    <span className="block text-sm font-bold text-white">{copy.semiannual}</span>
                    <span className="block mt-0.5 text-[11px] text-zinc-500">{language === 'es' ? 'Para trabajar sin interrupciones' : 'Keep working without interruptions'}</span>
                  </span>
                  <strong className="text-lg text-white">$79.99</strong>
                </button>
                <button onClick={() => handleUpgrade('yearly')} disabled={loading} className="w-full min-h-[68px] flex items-center justify-between gap-4 px-4 rounded-xl border border-amber-100/30 bg-mvp-action text-[#171309] hover:bg-mvp-action-hover transition-all shadow-[0_10px_24px_rgba(245,196,81,0.14)] disabled:opacity-60">
                  <span className="text-left">
                    <span className="block text-sm font-black">{copy.yearly}</span>
                    <span className="block mt-0.5 text-[11px] font-bold opacity-70">{copy.yearlySavings}</span>
                  </span>
                  <strong className="text-xl">$149.99</strong>
                </button>
              </div>
              {loading && (
                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 size={14} className="animate-spin" />
                  {language === 'es' ? 'Preparando pago...' : 'Preparing payment...'}
                </div>
              )}
              {isLocalEnvironment && (
                <p className="mt-5 text-center text-[11px] leading-relaxed text-zinc-600">
                  {copy.paymentLocalMessage}
                </p>
              )}
            </section>
          </div>
        </motion.div>
      </motion.div>
    );
};

const PlanAIModal = ({
    clients,
    onClose,
    onCreateClient,
    onGenerate,
    initialType = 'routine',
    language = 'es'
}: {
    clients: Client[];
    onClose: () => void;
    onCreateClient: () => void;
    onGenerate: (client: Client, type: 'routine' | 'diet') => void;
    initialType?: 'routine' | 'diet';
    language?: AppLanguage;
}) => {
    const [selectedClientId, setSelectedClientId] = useState(clients[0]?.id || '');
    const [selectedType, setSelectedType] = useState<'routine' | 'diet'>(initialType);
    const selectedClient = clients.find(client => client.id === selectedClientId) || clients[0];
    const modalCopy = language === 'en'
      ? {
          title: 'Create an AI plan',
          subtitle: 'Choose the client and plan type.',
          noClients: 'Create a client before generating an AI plan.',
          createClient: 'Create client',
          activeClient: 'Active client',
          routine: 'Workout plan',
          diet: 'Nutrition plan',
          routineHint: 'Training, strength and progression',
          dietHint: 'Nutrition, portions and macros',
          generateRoutine: 'Generate workout',
          generateDiet: 'Generate nutrition plan'
        }
      : {
          title: 'Crear plan con IA',
          subtitle: 'Elige el cliente y el tipo de plan.',
          noClients: 'Primero crea un cliente para generar un plan con IA.',
          createClient: 'Crear cliente',
          activeClient: 'Cliente activo',
          routine: 'Rutina',
          diet: 'Dieta',
          routineHint: 'Entrenamiento, fuerza y progresion',
          dietHint: 'Nutricion, porciones y macros',
          generateRoutine: 'Generar rutina',
          generateDiet: 'Generar dieta'
        };

    return (
        <motion.div
            className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
        >
            <motion.div
                className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden"
                initial={{ opacity: 0, y: 5, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.985 }}
                transition={{ duration: 0.2, ease: MOTION_EASE }}
            >
                <div className="p-5 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white">{modalCopy.title}</h2>
                        <p className="text-sm text-zinc-500">{modalCopy.subtitle}</p>
                    </div>
                    <IconButton onClick={onClose} aria-label={language === 'en' ? 'Close' : 'Cerrar'} className="!min-h-9 !min-w-9 !w-9 !h-9">
                        <X size={18} />
                    </IconButton>
                </div>

                {clients.length === 0 ? (
                    <div className="p-6 text-center">
                        <div className="w-12 h-12 rounded-2xl bg-mvp-gold text-black flex items-center justify-center mx-auto mb-4">
                            <Plus size={24} />
                        </div>
                        <p className="text-zinc-300 font-semibold mb-5">{modalCopy.noClients}</p>
                        <AppButton
                            onClick={() => {
                                onClose();
                                onCreateClient();
                            }}
                            variant="primary"
                            icon={<Plus size={17} />}
                            className="w-full"
                        >
                            {modalCopy.createClient}
                        </AppButton>
                    </div>
                ) : (
                    <div className="p-5 space-y-5">
                        <div>
                            <label className="text-[10px] uppercase tracking-widest font-black text-zinc-500 mb-2 block">{modalCopy.activeClient}</label>
                            <select
                                value={selectedClientId}
                                onChange={(event) => setSelectedClientId(event.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-white outline-none focus:border-mvp-gold"
                            >
                                {clients.map(client => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <motion.button
                                type="button"
                                onClick={() => setSelectedType('routine')}
                                aria-pressed={selectedType === 'routine'}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                                className={`rounded-xl p-3.5 min-h-[112px] flex flex-col justify-between text-left border transition-[background,border-color,box-shadow] ${
                                  selectedType === 'routine'
                                    ? 'bg-[#1B1730] border-violet-400 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(138,43,226,0.26)]'
                                    : 'bg-[linear-gradient(180deg,#191e2b,#121620)] border-white/10 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.24)] hover:border-violet-300/25'
                                }`}
                            >
                                <span className={`grid h-10 w-10 place-items-center rounded-xl ${selectedType === 'routine' ? 'bg-[linear-gradient(180deg,#9b63f6,#6d28d9)] text-white shadow-[0_5px_16px_rgba(138,43,226,0.38)]' : 'bg-black/25 text-zinc-500'}`}><Dumbbell size={20} /></span>
                                <span>
                                    <span className="block font-extrabold text-sm">{modalCopy.routine}</span>
                                    <span className="mt-1 block text-[10px] font-medium leading-snug text-zinc-500">{modalCopy.routineHint}</span>
                                </span>
                            </motion.button>
                            <motion.button
                                type="button"
                                onClick={() => setSelectedType('diet')}
                                aria-pressed={selectedType === 'diet'}
                                whileHover={{ y: -2 }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                                className={`rounded-xl p-3.5 min-h-[112px] flex flex-col justify-between text-left border transition-[background,border-color,box-shadow] ${
                                  selectedType === 'diet'
                                    ? 'bg-[#1B1730] border-violet-400 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(138,43,226,0.26)]'
                                    : 'bg-[linear-gradient(180deg,#191e2b,#121620)] border-white/10 text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.24)] hover:border-violet-300/25'
                                }`}
                            >
                                <span className={`grid h-10 w-10 place-items-center rounded-xl ${selectedType === 'diet' ? 'bg-[linear-gradient(180deg,#9b63f6,#6d28d9)] text-white shadow-[0_5px_16px_rgba(138,43,226,0.38)]' : 'bg-black/25 text-zinc-500'}`}><Utensils size={20} /></span>
                                <span>
                                    <span className="block font-extrabold text-sm">{modalCopy.diet}</span>
                                    <span className="mt-1 block text-[10px] font-medium leading-snug text-zinc-500">{modalCopy.dietHint}</span>
                                </span>
                            </motion.button>
                        </div>

                        <AiButton
                            type="button"
                            onClick={() => selectedClient && onGenerate(selectedClient, selectedType)}
                            disabled={!selectedClient}
                            icon={selectedType === 'routine' ? <Dumbbell size={17} /> : <Utensils size={17} />}
                            className="w-full min-h-12"
                        >
                            {selectedType === 'routine' ? modalCopy.generateRoutine : modalCopy.generateDiet}
                        </AiButton>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

const ConfirmModal = ({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = "Eliminar", 
    cancelText = "Cancelar",
    type = 'danger'
}: { 
    isOpen: boolean, 
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel: () => void,
    confirmText?: string,
    cancelText?: string,
    type?: 'danger' | 'warning'
}) => {
    if (!isOpen) return null;
    
    return (
        <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
        >
            <motion.div
                className="bg-zinc-900 w-full max-w-sm rounded-3xl border border-zinc-800 p-6 shadow-2xl"
                initial={{ opacity: 0, y: 5, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.985 }}
                transition={{ duration: 0.2, ease: MOTION_EASE }}
            >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {type === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{message}</p>
                <div className="grid grid-cols-2 gap-3">
                    <AppButton
                        onClick={onCancel} 
                        variant="secondary"
                        className="w-full"
                    >
                        {cancelText}
                    </AppButton>
                    <AppButton
                        onClick={() => {
                            onConfirm();
                            onCancel();
                        }}
                        variant={type === 'danger' ? 'danger' : 'primary'}
                        className="w-full"
                    >
                        {confirmText}
                    </AppButton>
                </div>
            </motion.div>
        </motion.div>
    );
};

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const AuthView = ({
  onLoginSuccess,
  language,
  onLanguageChange,
  initialMode = 'login'
}: {
  onLoginSuccess: (user: AppUser) => void,
  language: AppLanguage,
  onLanguageChange: (language: AppLanguage) => void,
  initialMode?: AuthMode
}) => {
  const copy = AUTH_COPY[language];
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [trainerName, setTrainerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const isEmailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const normalizeAuthError = (err: any) => {
    const msg = String(err?.message || err?.error_description || '').toLowerCase();
    if (msg.includes('invalid login') || msg.includes('invalid credentials')) return copy.wrongLogin;
    if (msg.includes('email not confirmed') || msg.includes('confirm')) return copy.checkEmail;
    if (msg.includes('provider') || msg.includes('oauth') || msg.includes('unsupported')) return copy.generic;
    return copy.generic;
  };

  const clearMessages = () => {
    setError('');
    setConfirmMsg('');
  };

  const switchMode = (nextMode: AuthMode) => {
    clearMessages();
    setMode(nextMode);
    setPassword('');
    setConfirmPassword('');
  };

  const resolveSignedInUser = async () => {
    const freshUser = await dbProvider.getCurrentUser(true);
    if (!freshUser?.uid) {
      throw new Error(copy.generic);
    }
    clearStaleUserCache(freshUser.uid);
    localStorage.setItem('mvptrainer_cached_user', JSON.stringify(freshUser));
    onLoginSuccess(freshUser);
  };

  const validateEmail = () => {
    if (!email.trim()) {
      setError(copy.requiredEmail);
      return false;
    }
    if (!isEmailValid(email)) {
      setError(copy.invalidEmail);
      return false;
    }
    return true;
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (mode === 'forgot') {
      if (!validateEmail()) return;
      setLoading(true);
      try {
        if (!supabase) throw new Error(copy.generic);
        await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        setConfirmMsg(copy.recoverySent);
      } catch {
        setConfirmMsg(copy.recoverySent);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'reset') {
      if (!password) {
        setError(copy.requiredPassword);
        return;
      }
      if (password.length < 8) {
        setError(copy.passwordLength);
        return;
      }
      if (password !== confirmPassword) {
        setError(copy.passwordMatch);
        return;
      }
      setLoading(true);
      try {
        if (!supabase) throw new Error(copy.generic);
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setConfirmMsg(copy.passwordUpdated);
        setPassword('');
        setConfirmPassword('');
        window.history.replaceState({}, '', window.location.origin);
        setTimeout(() => switchMode('login'), 900);
      } catch (err) {
        setError(normalizeAuthError(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!validateEmail()) return;
    if (!password) {
      setError(copy.requiredPassword);
      return;
    }
    if (mode === 'register') {
      if (!trainerName.trim()) {
        setError(copy.requiredName);
        return;
      }
      if (password.length < 8) {
        setError(copy.passwordLength);
        return;
      }
      if (password !== confirmPassword) {
        setError(copy.passwordMatch);
        return;
      }
    }

    setLoading(true);
    appLog("Auth attempt:", { email, mode });
    try {
      const res = mode === 'register'
        ? await dbProvider.signUp(email.trim(), password, { displayName: trainerName.trim() })
        : await dbProvider.signIn(email.trim(), password);

      if (res.message === 'CONFIRM_EMAIL') {
          setConfirmMsg(copy.confirmEmail);
      } else if (res.user || res.session) {
          await resolveSignedInUser();
      }
    } catch (err: any) {
      if ((import.meta as any).env?.DEV) console.error("Auth error details:", err?.message || err);
      setError(normalizeAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    clearMessages();
    if (!supabase) {
      setError(provider === 'google' ? copy.googleMissing : copy.facebookMissing);
      return;
    }

    setSocialLoading(provider);
    try {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
          skipBrowserRedirect: true,
          queryParams: provider === 'google'
            ? { access_type: 'offline', prompt: 'consent' }
            : undefined
        } as any
      });
      if (oauthError) throw oauthError;
      if (!data?.url) throw new Error(`${provider} OAuth URL was not returned`);
      window.location.assign(data.url);
    } catch (err) {
      if ((import.meta as any).env?.DEV) console.error("OAuth error:", err instanceof Error ? err.message : err);
      setError(provider === 'google' ? copy.googleMissing : copy.facebookMissing);
      setSocialLoading(null);
    }
  };

  const title = mode === 'register'
    ? copy.register
    : mode === 'forgot'
      ? copy.resetRequest
      : mode === 'reset'
        ? copy.resetPassword
        : copy.login;
  const intro = mode === 'register'
    ? copy.createIntro
    : mode === 'forgot'
      ? copy.resetIntro
      : mode === 'reset'
        ? copy.newPasswordIntro
        : copy.welcome;
  const submitLabel = loading
    ? (mode === 'register' ? copy.creating : mode === 'forgot' ? copy.sending : mode === 'reset' ? copy.saving : copy.entering)
    : (mode === 'register' ? copy.createFree : mode === 'forgot' ? copy.sendRecovery : mode === 'reset' ? copy.savePassword : copy.enter);
  const forceCompactAuthPreview = (() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const device = params.get('dev_device') || localStorage.getItem('mvptrainer_dev_viewport') || '';
    return params.get('dev_preview') === '1' && ['android', 'iphone'].includes(device);
  })();

  return (
    <PageTransition className={`auth-portal min-h-screen bg-black text-white flex justify-center relative ${forceCompactAuthPreview ? 'items-start p-3 pt-6 overflow-y-auto custom-scrollbar' : 'items-center p-4 overflow-hidden'}`}>
      <div className="auth-portal-atmosphere absolute inset-0" />
      <div className="absolute top-4 right-4 z-30">
        <LanguageSwitcher language={language} onChange={onLanguageChange} compact />
      </div>

      <div className={`auth-layout relative z-10 w-full grid items-stretch min-w-0 ${forceCompactAuthPreview ? 'max-w-md' : 'max-w-[1180px] lg:grid-cols-[1.08fr_0.92fr]'}`}>
        <section className={`${forceCompactAuthPreview ? 'hidden' : 'hidden lg:flex'} auth-hero`}>
          <img src="/brand/mvp-paywall-fitness.jpg" alt="" className="auth-hero-image" />
          <div className="auth-hero-shade" />
          <div className="auth-hero-speed-lines" aria-hidden="true" />
          <div className="auth-hero-content">
            <div className="inline-flex items-center gap-3">
              <MVPBrandLogo className="h-14 w-14 rounded-xl border border-violet-300/30 bg-black/55 p-1 shadow-primary" />
              <div>
                <p className="brand-wordmark text-2xl font-extrabold">MVP<span>TRAINER</span></p>
                <p className="text-xs font-semibold text-slate-300">{copy.brandSubtitle}</p>
              </div>
            </div>
            <div className="mt-auto max-w-xl pb-2">
              <span className="auth-hero-kicker"><Activity size={15} /> Precision Velocity</span>
              <h1 className="mt-4 text-[42px] font-extrabold leading-[1.08] text-white">{copy.value}</h1>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-slate-300">{copy.support}</p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {APP_COPY[language].authFeatures.map((item, index) => (
                  <div key={item} className="auth-feature">
                    <span>{index + 1 < 10 ? `0${index + 1}` : index + 1}</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="w-full max-w-md mx-auto min-w-0">
          <div className={`${forceCompactAuthPreview ? 'block' : 'lg:hidden'} text-center mb-6`}>
            <MVPBrandLogo className="w-16 h-16 mx-auto rounded-2xl bg-black/40 border border-violet-300/25 p-1 shadow-primary mb-3" />
            <h1 className="brand-wordmark text-3xl font-extrabold">MVP<span>TRAINER</span></h1>
            <p className="text-zinc-500 text-sm">{copy.brandSubtitle}</p>
          </div>

          <div className="auth-card">
            {(mode === 'login' || mode === 'register') && (
              <div className="grid grid-cols-2 gap-2 bg-black border border-zinc-800 rounded-2xl p-1 mb-5 relative">
                <motion.button type="button" onClick={() => switchMode('login')} whileTap={MOTION_TAP} transition={MOTION_BUTTON_TRANSITION} className={`relative z-10 min-h-11 py-2.5 rounded-xl text-sm font-black transition-colors ${mode === 'login' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {mode === 'login' && <motion.span layoutId="auth-tab-indicator" className="auth-tab-indicator absolute inset-0 rounded-xl -z-10" transition={{ duration: 0.18, ease: MOTION_EASE }} />}
                  {copy.login}
                </motion.button>
                <motion.button type="button" onClick={() => switchMode('register')} whileTap={MOTION_TAP} transition={MOTION_BUTTON_TRANSITION} className={`relative z-10 min-h-11 py-2.5 rounded-xl text-sm font-black transition-colors ${mode === 'register' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
                  {mode === 'register' && <motion.span layoutId="auth-tab-indicator" className="auth-tab-indicator absolute inset-0 rounded-xl -z-10" transition={{ duration: 0.18, ease: MOTION_EASE }} />}
                  {copy.register}
                </motion.button>
              </div>
            )}

            <AnimatePresence mode="wait" initial={false}>
              <PageTransition key={mode} className="contents">
                <div className="mb-5">
                  <h2 className="text-2xl font-black">{title}</h2>
                  <p className="text-sm text-zinc-400 mt-1">{intro}</p>
                </div>

            {(mode === 'login' || mode === 'register') && (
              <div className="space-y-3 mb-5">
                <motion.button type="button" onClick={() => handleOAuth('google')} disabled={Boolean(socialLoading || loading)} whileTap={socialLoading || loading ? undefined : MOTION_TAP} transition={MOTION_BUTTON_TRANSITION} className="auth-social-button">
                  {socialLoading === 'google' ? <Loader2 size={16} className="animate-spin" /> : <span className="auth-social-mark"><GoogleMark /></span>}
                  {copy.google}
                </motion.button>
                <motion.button type="button" onClick={() => handleOAuth('facebook')} disabled={Boolean(socialLoading || loading)} whileTap={socialLoading || loading ? undefined : MOTION_TAP} transition={MOTION_BUTTON_TRANSITION} className="auth-social-button">
                  {socialLoading === 'facebook' ? <Loader2 size={16} className="animate-spin" /> : <span className="auth-social-mark"><FacebookMark /></span>}
                  {copy.facebook}
                </motion.button>
                <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider font-bold text-zinc-600">
                  <div className="h-px bg-zinc-800 flex-1" />
                  {copy.divider}
                  <div className="h-px bg-zinc-800 flex-1" />
                </div>
              </div>
            )}

            {error && <div className="text-red-300 text-sm bg-red-500/10 border border-red-500/20 p-3 rounded-xl mb-4">{error}</div>}
            {confirmMsg && <div className="text-amber-200 text-sm bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl mb-4">{confirmMsg}</div>}

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {mode === 'register' && (
                <label className="auth-field">
                  <span>{copy.name}</span>
                  <input type="text" value={trainerName} onChange={e=>setTrainerName(e.target.value)} placeholder={copy.name} autoComplete="name" />
                </label>
              )}
              {mode !== 'reset' && (
                <label className="auth-field">
                  <span>{copy.email}</span>
                  <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={copy.email} autoComplete="email" />
                </label>
              )}
              {mode !== 'forgot' && (
                <label className="auth-field">
                  <span>{mode === 'reset' ? copy.resetPassword : copy.password}</span>
                  <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode === 'reset' ? copy.resetPassword : copy.password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                </label>
              )}
              {(mode === 'register' || mode === 'reset') && (
                <label className="auth-field">
                  <span>{copy.confirmPassword}</span>
                  <input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder={copy.confirmPassword} autoComplete="new-password" />
                </label>
              )}

              <motion.button type="submit" disabled={loading || Boolean(socialLoading)} whileTap={loading || socialLoading ? undefined : MOTION_TAP} transition={MOTION_BUTTON_TRANSITION} className="auth-primary-action w-full font-black flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-wait">
                {loading && <Loader2 size={18} className="animate-spin"/>}
                {submitLabel}
              </motion.button>
            </form>

                <div className="mt-5 space-y-3 text-center">
              {mode === 'login' && (
                <>
                  <button type="button" onClick={() => switchMode('forgot')} className="auth-link-button text-sm text-mvp-gold hover:text-purple-300 font-semibold">{copy.forgot}</button>
                  <button type="button" onClick={() => switchMode('register')} className="auth-link-button w-full text-sm text-zinc-400 hover:text-white">{copy.newHere}</button>
                </>
              )}
              {mode === 'register' && (
                <button type="button" onClick={() => switchMode('login')} className="auth-link-button text-sm text-zinc-400 hover:text-white">{copy.already}</button>
              )}
              {(mode === 'forgot' || mode === 'reset') && (
                <button type="button" onClick={() => switchMode('login')} className="auth-link-button text-sm text-zinc-400 hover:text-white">{copy.backLogin}</button>
              )}
                </div>
              </PageTransition>
            </AnimatePresence>
          </div>
        </section>
      </div>
    </PageTransition>
  );
};

// --- ACCOUNT VIEW ---

const AccountView = ({ user, clients, onShowPaywall, onBack, onUpdateUser, requestConfirm, onShowToast, onLogout, language, onLanguageChange }: { user: AppUser, clients: Client[], onShowPaywall: () => void, onBack: () => void, onUpdateUser: (u: AppUser) => void, requestConfirm: (config: any) => void, onShowToast: (t: any) => void, onLogout?: () => void, language: AppLanguage, onLanguageChange: (language: AppLanguage) => void }) => {
  const copy = APP_COPY[language];
  const planStatus = user ? getTranslatedPlanStatus(user, language, getPlanStatusLabel(user)) : null;
  const isPro = hasFullAccess(user);
  const publicProfileReady = Boolean(
    user.publicProfile?.description?.trim() &&
    normalizeWhatsAppPhone(user.publicProfile?.whatsAppNumber).length >= 7
  );

  // Limits
  const clientLimit = isPro ? Infinity : LIMITS.FREE_CLIENTS;
  const routineLimit = isPro ? Infinity : LIMITS.FREE_ROUTINES_WEEKLY;
  const dietLimit = isPro ? Infinity : LIMITS.FREE_DIETS_WEEKLY;

  const safeLogout = async () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('mvptrainer_cached_user');
      await dbProvider.signOut();
      window.location.reload();
    }
  };

  return (
    <div className="animate-fadeIn max-w-6xl mx-auto w-full pb-20 dev-preview-safe-bottom">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><ChevronRight className="rotate-180"/></button>
        <h2 className="text-2xl font-bold text-white">{copy.accountTitle}</h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] items-start">
        <div className="space-y-6">
        <div className="bg-zinc-900/90 p-5 rounded-2xl border border-zinc-800 flex items-center justify-between gap-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div>
            <h3 className="font-bold text-white">{copy.languageTitle}</h3>
            <p className="text-zinc-500 text-sm">{copy.languageDescription}</p>
          </div>
          <LanguageSwitcher language={language} onChange={onLanguageChange} compact />
        </div>

        {/* Profile Card */}
        <div className="bg-zinc-900/90 p-6 rounded-2xl border border-zinc-800 flex items-center gap-4 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
          <div className="w-16 h-16 bg-gradient-to-br from-zinc-800 to-black rounded-full flex items-center justify-center border border-zinc-700">
             <UserIcon size={32} className="text-zinc-500" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">{user.displayName}</h3>
            <p className="text-zinc-500 text-sm">{user.email}</p>
          </div>
        </div>

        {/* Migration Card */}
        {dbProvider.name === 'Supabase Cloud' && (
            <div className="bg-zinc-900/90 p-6 rounded-2xl border border-zinc-800 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Sparkles size={18} className="text-mvp-gold"/> {copy.migrationTitle}
                </h4>
                <p className="text-sm text-zinc-500 mb-4">
                    {copy.migrationDescription}
                </p>
                <AppButton
                    onClick={async () => {
                        requestConfirm({
                            title: copy.migrationConfirmTitle,
                            message: copy.migrationConfirmMessage,
                            type: 'warning',
                            onConfirm: async () => {
                                const localClients = JSON.parse(localStorage.getItem('mvp_v2_clients_collection') || '[]');
                                if (localClients.length === 0) return onShowToast({ title: copy.migrationEmptyTitle, message: copy.migrationEmptyMessage, type: 'warning' });
                                let count = 0;
                                for (const c of localClients) {
                                    const existing = clients.find(ec => ec.email === c.email);
                                    if (!existing) {
                                        await dbProvider.createClient(user.uid, c);
                                        count++;
                                    }
                                }
                                onShowToast({ title: copy.migrationSuccessTitle, message: copy.migrationSuccessMessage(count), type: 'success' });
                            }
                        });
                    }}
                    variant="secondary"
                    icon={<Copy size={16}/>}
                >
                    {copy.migrationButton}
                </AppButton>
            </div>
        )}
        </div>

        {/* Plan Status */}
        <div className="bg-zinc-900/90 p-6 rounded-2xl border border-zinc-800 relative overflow-hidden shadow-[0_22px_60px_rgba(0,0,0,0.28)] lg:sticky lg:top-6">
           {isPro && (
             <div className="absolute top-0 right-0 p-4 opacity-10">
               <Crown size={120} className="text-mvp-gold" />
             </div>
           )}
           
           <div className="relative z-10">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">{copy.currentPlan}</span>
                 <div className="flex items-center gap-2 mt-1">
                   <h2 className={`text-2xl font-black ${planStatus.color}`}>{planStatus.label}</h2>
                   {!isPro && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{copy.basic}</span>}
                 </div>
                 <p className="text-sm text-zinc-400 mt-2">{planStatus.detail}</p>
               </div>
               {isPro ? (
                  <div className="bg-mvp-gold/20 text-mvp-gold p-3 rounded-xl"><Crown size={24}/></div>
               ) : (
                  <AppButton onClick={onShowPaywall} variant="primary" className="shrink-0">
                    {copy.upgradePro}
                  </AppButton>
               )}
             </div>

             <div className="h-px bg-zinc-800 my-4" />

             <h4 className="font-bold text-white text-sm mb-4">{copy.usageLimits}</h4>
             <div className="space-y-4">
               {!isPro ? (
                 <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-4">
                   <div className="flex items-start gap-3">
                     <Lock size={18} className="mt-0.5 shrink-0 text-violet-300" />
                     <div>
                       <p className="text-sm font-bold text-white">{language === 'es' ? 'Tu trabajo sigue guardado' : 'Your work is still saved'}</p>
                       <p className="mt-1 text-xs leading-relaxed text-zinc-400">{language === 'es' ? 'Activa tu plan para recuperar inmediatamente fichas, rutinas, dietas, agenda, pagos y envíos.' : 'Activate your plan to immediately recover records, workouts, diets, schedule, payments, and sharing.'}</p>
                     </div>
                   </div>
                 </div>
               ) : (
                 <>
                   <UsageProgress 
                      current={clients.length} 
                      max={clientLimit} 
                      label={copy.activeClients}
                      onUpgrade={onShowPaywall}
                      language={language}
                   />
                   <UsageProgress 
                      current={user?.subscription?.usage?.routinesGenerated || 0} 
                      max={routineLimit} 
                      label={copy.weeklyRoutines}
                      onUpgrade={onShowPaywall}
                      language={language}
                   />
                   <UsageProgress 
                      current={user?.subscription?.usage?.dietsGenerated || 0} 
                      max={dietLimit} 
                      label={copy.weeklyDiets}
                      onUpgrade={onShowPaywall}
                      language={language}
                   />
                 </>
               )}
             </div>
           </div>
        </div>
      </div>
        
      <div className="mt-6 space-y-6">
        {/* BRANDING SECTION */}
        <BrandingSettings 
            user={user} 
            onUpdateUser={onUpdateUser} 
            onShowPaywall={onShowPaywall} 
            requestConfirm={requestConfirm}
            language={language}
        />
        
        {/* TRAINER LANDING EDITOR LINK */}
         <div className="bg-zinc-900/90 rounded-2xl border border-zinc-800 overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                     <div className="bg-violet-500/15 text-violet-300 p-2 rounded-lg border border-violet-400/10"><Calendar size={20}/></div>
                     <div>
                         <h4 className="font-bold text-white">{copy.publicPage}</h4>
                         <p className="text-xs text-zinc-500">{copy.publicPageDescription}</p>
                     </div>
                 </div>
                 {isPro ? (
                     <div className={`text-xs px-2 py-1 rounded border font-bold ${publicProfileReady ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                         {publicProfileReady ? copy.active : (language === 'es' ? 'BORRADOR' : 'DRAFT')}
                     </div>
                 ) : (
                     <div className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700"><Lock size={12} className="inline mr-1"/> PRO</div>
                 )}
             </div>
             <TrainerLandingEditor 
                user={user}
                onUpdateUser={onUpdateUser}
                onShowPaywall={onShowPaywall}
                language={language}
             />
         </div>

        <div className="text-center pt-4">
             <button onClick={safeLogout} className="text-red-500 hover:text-red-400 text-sm font-bold flex items-center justify-center gap-2 mx-auto py-2">
                <LogOut size={16}/> {copy.logout}
             </button>
        </div>
      </div>
    </div>
  );
};

// --- CLIENT DETAIL VIEW ---

type TabType = 'profile' | 'agenda' | 'routines' | 'nutrition' | 'payments';

const ClientDetail = ({ client, user, onBack, onUpdate, onDelete, onShowPaywall, onShowToast, onEdit, onUserUsageUpdate, requestConfirm, onRefreshCounts, initialTab = 'profile', autoGenerateRequest, language = 'es' }: any) => {
    const detailCopy = CLIENT_DETAIL_COPY[language as AppLanguage] || CLIENT_DETAIL_COPY.es;
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);
    const [expandedDiet, setExpandedDiet] = useState<string | null>(null);
    const [expandedDietDay, setExpandedDietDay] = useState<string | null>(null);
    const lastAutoGenerateRef = useRef<number | null>(null);
    
    // Local state for routines and diets (fetched separately)
    const [clientRoutines, setClientRoutines] = useState<Routine[]>([]);
    const [clientDiets, setClientDiets] = useState<DietPlan[]>([]);
    const [clientDiet, setClientDiet] = useState<DietPlan | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [client?.id, initialTab]);

    // Agenda State
    const [isEditingAgenda, setIsEditingAgenda] = useState(false);
    const [agendaForm, setAgendaForm] = useState<{ days: string[], startTime: string, endTime: string }>({ 
        days: client.trainingDays || [], 
        startTime: '07:00', 
        endTime: '08:00' 
    });

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState<ClientPaymentInfo>({
        monthlyFee: client.paymentInfo?.monthlyFee ?? 0,
        status: client.paymentInfo?.status || 'sin_registro',
        paymentMethod: client.paymentInfo?.paymentMethod || 'efectivo',
        lastPaidAt: client.paymentInfo?.lastPaidAt || '',
        nextPaymentAt: client.paymentInfo?.nextPaymentAt || '',
        lastPaymentAmount: client.paymentInfo?.lastPaymentAmount || null,
        lastPaymentMonths: client.paymentInfo?.lastPaymentMonths || null
    });
    const [isSavingPayment, setIsSavingPayment] = useState(false);
    const [isQuickPaymentOpen, setIsQuickPaymentOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoadingData(true);
            try {
                const routines = sortPlansNewest(await dbProvider.getRoutines(client.id));
                const diets = sortPlansNewest(await dbProvider.getDiets(client.id));
                setClientRoutines(routines);
                setClientDiets(diets);
                setExpandedRoutine(routines[0]?.id || null);
                setClientDiet(diets[0] || null);
                setExpandedDiet(diets[0]?.id || null);
            } catch (e) {
                console.error("Error loading client details:", e);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();

        setPaymentForm({
            monthlyFee: client.paymentInfo.monthlyFee || 0,
            status: client.paymentInfo.status || 'sin_registro',
            paymentMethod: client.paymentInfo.paymentMethod || 'efectivo',
            lastPaidAt: client.paymentInfo.lastPaidAt || '',
            nextPaymentAt: client.paymentInfo.nextPaymentAt || '',
            lastPaymentAmount: client.paymentInfo.lastPaymentAmount || null,
            lastPaymentMonths: client.paymentInfo.lastPaymentMonths || null
        });
        
        // Parse training time range: "07:00 AM - 08:30 AM"
        let startTime = '07:00';
        let endTime = '08:00';
        if (client.trainingTime && client.trainingTime.includes(' - ')) {
            const parts = client.trainingTime.split(' - ');
            startTime = convertTo24Hour(parts[0]);
            endTime = convertTo24Hour(parts[1]);
        } else if (client.trainingTime) {
            startTime = convertTo24Hour(client.trainingTime);
        }

        setAgendaForm({
            days: client.trainingDays || [],
            startTime,
            endTime
        });
        setIsEditingAgenda(false);
    }, [client]);
    
    const handleAction = async (feature: 'generateRoutine' | 'generateDiet', callback: () => Promise<void>) => {
        const check = canUseFeature(user, feature, { clientId: client.id });
        if (!check.allowed) {
            onShowPaywall();
            if (check.reason) {
                onShowToast({ title: detailCopy.limitReachedTitle, message: localizeLimitReason(check.reason, language), type: 'warning' });
            }
            return;
        }
        await callback();
    };

    const handleAddRoutine = () => handleAction('generateRoutine', async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const routineData = await generateWorkoutRoutine(client, language);
            if (routineData) {
                const newRoutine: any = {
                    name: routineData.name || detailCopy.routineFallbackTitle,
                    description: routineData.description || "",
                    exercises: routineData.exercises as any[] || [],
                    tags: routineData.tags || [],
                    source: routineData.source || "fallback"
                };
                
                try {
                    const updatedUsage = await dbProvider.saveRoutine(user.uid, client.id, newRoutine);
                    
                    // Refetch immediately to get the UUID assigned by Supabase
                    const routines = sortPlansNewest(await dbProvider.getRoutines(client.id));
                    setClientRoutines(routines);
                    onUpdate({ routines });
                    
                    if (onRefreshCounts) {
                        onRefreshCounts();
                    }
                    
                    const updatedUser = registerUsage(user, 'generateRoutine', { clientId: client.id });
                    if (updatedUsage) {
                        updatedUser.trainerUsage = updatedUsage;
                    }
                    onUserUsageUpdate(updatedUser);
                    
                    // Expand the most recent routine
                    if (routines.length > 0) {
                        setExpandedRoutine(routines[0].id);
                    }
                    
                    onShowToast({ title: detailCopy.routineSavedTitle, message: detailCopy.routineSavedMessage, type: 'success' });
                } catch (e) {
                    console.error("Error saving routine:", e);
                    onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.routineSaveError, type: 'error' });
                }
            } else {
                 onShowToast({ title: detailCopy.geminiNoResponseTitle, message: getLastGeminiErrorMessage() || detailCopy.geminiNoResponseMessage, type: 'error' });
            }
        } finally {
            setIsGenerating(false);
        }
    });

    const handleAddDiet = () => handleAction('generateDiet', async () => {
        if (isGenerating) return;
        setIsGenerating(true);
        try {
            const plan = await generateDietPlan(client, language);
            if (plan) {
                try {
                    const updatedUsage = await dbProvider.saveDiet(user.uid, client.id, plan);
                    const diets = sortPlansNewest(await dbProvider.getDiets(client.id));
                    const nextDiet = diets[0] || plan;
                    setClientDiets(diets);
                    setClientDiet(nextDiet);
                    setExpandedDiet(nextDiet?.id || null);
                    setExpandedDietDay(null);
                    onUpdate({ dietPlan: nextDiet, dietPlans: diets });
                    
                    if (onRefreshCounts) {
                        onRefreshCounts();
                    }
                    
                    const updatedUser = registerUsage(user, 'generateDiet', { clientId: client.id });
                    if (updatedUsage) {
                        updatedUser.trainerUsage = updatedUsage;
                    }
                    // No persistimos subscription en profiles porque la columna no existe
                    onUserUsageUpdate(updatedUser);
                    onShowToast({ title: detailCopy.dietSavedTitle, message: detailCopy.dietSavedMessage, type: 'success' });
                } catch (e) {
                    console.error("Error saving diet:", e);
                    onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.dietSaveError, type: 'error' });
                }
            } else {
                onShowToast({ title: detailCopy.geminiNoResponseTitle, message: getLastGeminiErrorMessage() || detailCopy.geminiNoResponseMessage, type: 'error' });
            }
        } finally {
            setIsGenerating(false);
        }
    });

    useEffect(() => {
        if (!autoGenerateRequest || isLoadingData || isGenerating) return;
        if (lastAutoGenerateRef.current === autoGenerateRequest.id) return;

        lastAutoGenerateRef.current = autoGenerateRequest.id;
        if (autoGenerateRequest.type === 'routine') {
            setActiveTab('routines');
            handleAddRoutine();
        } else {
            setActiveTab('nutrition');
            handleAddDiet();
        }
    }, [autoGenerateRequest?.id, autoGenerateRequest?.type, isLoadingData, isGenerating]);


    const handleWhatsAppShare = (type: 'routine' | 'diet', content: Routine | DietPlan) => {
        const shareText = type === 'routine'
            ? buildRoutineShareMessage(content as Routine, language)
            : buildDietShareMessage(content as DietPlan, language);
        const cleanPhone = normalizeWhatsAppPhone(client.phone);
        if (!cleanPhone) {
            onShowToast({ title: detailCopy.noPhoneTitle, message: detailCopy.noPhoneWhatsappMessage, type: 'warning' });
            return;
        }
        window.open(buildWhatsAppUrl(cleanPhone, shareText), '_blank');
        onShowToast({ title: detailCopy.whatsappOpenedTitle, message: detailCopy.whatsappOpenedMessage, type: 'success' });
    };

    const handleSavePayments = async () => {
        if (isNaN(paymentForm.monthlyFee)) {
            onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.paymentNumberError, type: 'error' });
            return;
        }
        setIsSavingPayment(true);
        try {
            await onUpdate({ paymentInfo: paymentForm });
            onShowToast({ title: detailCopy.paymentSavedTitle, message: detailCopy.paymentSavedMessage, type: 'success' });
        } finally {
            setIsSavingPayment(false);
        }
    };

    const saveQuickPayment = async (updated: ClientPaymentInfo) => {
        setIsSavingPayment(true);
        try {
            setPaymentForm(updated);
            await onUpdate({ paymentInfo: updated });
            setIsQuickPaymentOpen(false);
            onShowToast({ title: detailCopy.paymentRegisteredTitle, message: detailCopy.paymentRegisteredMessage, type: 'success' });
        } finally {
            setIsSavingPayment(false);
        }
    };

    const markAsUnpaid = async () => {
        const updated = markPaymentOverdue(paymentForm);
        setIsSavingPayment(true);
        try {
            setPaymentForm(updated);
            await onUpdate({ paymentInfo: updated });
            onShowToast({
                title: language === 'en' ? 'Payment needs attention' : 'Pago por atender',
                message: language === 'en' ? 'The client now appears as overdue.' : 'El cliente ahora aparece como vencido.',
                type: 'warning'
            });
        } finally {
            setIsSavingPayment(false);
        }
    };

    const markAsPendingTomorrow = async () => {
        const updated = markPaymentPending(paymentForm);
        setIsSavingPayment(true);
        try {
            setPaymentForm(updated);
            await onUpdate({ paymentInfo: updated });
            onShowToast({
                title: language === 'en' ? 'Payment scheduled' : 'Pago agendado',
                message: language === 'en' ? 'It will appear as pending for tomorrow.' : 'Aparecerá como pendiente para mañana.',
                type: 'success'
            });
        } finally {
            setIsSavingPayment(false);
        }
    };

    const pauseService = async () => {
        await onUpdate(pauseClientService(client));
        onShowToast({ title: language === 'en' ? 'Client paused' : 'Cliente pausado', message: language === 'en' ? 'Schedule and payment alerts were paused.' : 'Se pausaron la agenda y los avisos de pago.', type: 'success' });
    };

    const reactivateService = async () => {
        await onUpdate(reactivateClientService(client));
        onShowToast({ title: language === 'en' ? 'Client reactivated' : 'Cliente reactivado', message: language === 'en' ? 'The client is active again.' : 'El cliente vuelve a estar activo.', type: 'success' });
    };

    const finishService = () => requestConfirm({
        title: language === 'en' ? 'Finish client service?' : '¿Finalizar servicio del cliente?',
        message: language === 'en' ? 'The client will leave the active agenda, but their history will be kept.' : 'Saldrá de la agenda activa, pero su historial se conservará.',
        type: 'warning',
        onConfirm: async () => {
            await onUpdate(finishClientService(client));
            onShowToast({ title: language === 'en' ? 'Service finished' : 'Servicio finalizado', message: language === 'en' ? 'The history remains available.' : 'El historial permanece disponible.', type: 'success' });
        }
    });

    const handleGeneratePaymentMessage = () => {
        const cleanPhone = normalizeWhatsAppPhone(client.phone);
        if (!cleanPhone) {
            onShowToast({ title: detailCopy.noPhoneTitle, message: detailCopy.noPhonePaymentMessage, type: 'warning' });
            return;
        }
        const messageText = buildPaymentReminderText({ ...client, paymentInfo: paymentForm }, language);
        window.open(buildWhatsAppUrl(cleanPhone, messageText), '_blank');
        onShowToast({ title: detailCopy.reminderReadyTitle, message: detailCopy.reminderReadyMessage, type: 'success' });
    };

    const handleSaveAgenda = async () => {
        if (agendaForm.days.length === 0) {
            onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.agendaDayError, type: 'error' });
            return;
        }
        if (agendaForm.startTime >= agendaForm.endTime) {
            onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.agendaTimeError, type: 'error' });
            return;
        }
        await onUpdate({
            trainingDays: agendaForm.days,
            trainingTime: `${convertTo12Hour(agendaForm.startTime + ':00')} - ${convertTo12Hour(agendaForm.endTime + ':00')}`
        });
        setIsEditingAgenda(false);
        onShowToast({ title: detailCopy.agendaSavedTitle, message: detailCopy.agendaSavedMessage, type: 'success' });
    };

    const toggleAgendaDay = (day: string) => {
        setAgendaForm(prev => ({
            ...prev,
            days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
        }));
    };

    const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    return (
        <div className="client-detail-page flex flex-col h-full">
            {isQuickPaymentOpen && (
                <QuickPaymentDialog
                    clientName={client.name}
                    country={client.country}
                    payment={paymentForm}
                    language={language}
                    saving={isSavingPayment}
                    onClose={() => setIsQuickPaymentOpen(false)}
                    onConfirm={saveQuickPayment}
                />
            )}
            {/* Header Cliente */}
            <div className="client-detail-header mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><ChevronRight className="rotate-180"/></button>
                    <img src={client.avatarUrl} alt="" className="client-detail-avatar w-14 h-14 rounded-full border border-mvp-gold object-cover" />
                    <div className="min-w-0">
                        <h2 className="text-xl font-bold text-white">{client.name}</h2>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-mvp-gold bg-mvp-gold/10 px-2 py-0.5 rounded border border-mvp-gold/20">{goalLabel(client.mainGoal || '', language)}</span>
                          {client.status !== 'active' && <span className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase ${client.status === 'paused' ? 'border-amber-500/25 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>{client.status === 'paused' ? (language === 'en' ? 'Paused' : 'Pausado') : (language === 'en' ? 'Finished' : 'Finalizado')}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  {client.status === 'active' ? (
                    <button type="button" onClick={pauseService} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3 text-xs font-black text-amber-300" title={language === 'en' ? 'Pause client' : 'Pausar cliente'}><Pause size={16} /><span className="hidden sm:inline">{language === 'en' ? 'Pause' : 'Pausar'}</span></button>
                  ) : (
                    <button type="button" onClick={reactivateService} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3 text-xs font-black text-emerald-300" title={language === 'en' ? 'Reactivate client' : 'Reactivar cliente'}><Play size={16} /><span className="hidden sm:inline">{language === 'en' ? 'Reactivate' : 'Reactivar'}</span></button>
                  )}
                  {client.status !== 'inactive' && <button type="button" onClick={finishService} className="grid h-10 w-10 place-items-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-red-500/30 hover:text-red-300" title={language === 'en' ? 'Finish service' : 'Finalizar servicio'} aria-label={language === 'en' ? 'Finish service' : 'Finalizar servicio'}><UserX size={17} /></button>}
                </div>
            </div>

            {/* Tabs */}
            <div className="client-detail-tabs flex border-b border-zinc-800 mb-6 overflow-x-auto">
                {(['profile', 'agenda', 'routines', 'nutrition', 'payments'] as const).map(tab => (
                    <motion.button
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        whileTap={MOTION_TAP}
                        transition={MOTION_BUTTON_TRANSITION}
                        className={`relative px-4 py-3 text-sm font-bold capitalize transition-colors ${activeTab === tab ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        {detailCopy.tabs[tab]}
                        {activeTab === tab && (
                            <motion.span
                                layoutId="client-tab-indicator"
                                className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full bg-mvp-gold"
                                transition={{ duration: 0.18, ease: MOTION_EASE }}
                            />
                        )}
                    </motion.button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
                <AnimatePresence mode="wait" initial={false}>
                {activeTab === 'profile' && (
                    <TabPanel key="profile" className="space-y-4 motion-card-stagger">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">{detailCopy.weight}</span><p className="text-xl font-bold text-white">{client.weight || '-'} kg</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">{detailCopy.height}</span><p className="text-xl font-bold text-white">{client.height || '-'} cm</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">{detailCopy.age}</span><p className="text-xl font-bold text-white">{client.age || '-'} {detailCopy.years}</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">{detailCopy.level}</span><p className="text-xl font-bold text-white capitalize">{client.experienceLevel || '-'}</p></div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">{detailCopy.goals}</h3>
                            <div className="flex flex-wrap gap-2">
                                {(Array.isArray(client.goals) ? client.goals : []).length > 0 ? client.goals.map((g: string, i: number) => (
                                    <span key={i} className="bg-zinc-800 text-zinc-200 px-3 py-1 rounded-full text-xs border border-zinc-700">{goalLabel(g, language)}</span>
                                )) : <span className="text-zinc-500 text-sm">{detailCopy.noGoals}</span>}
                            </div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">{detailCopy.location}</h3>
                            <div className="flex items-center gap-2 text-white">
                                <MapPin size={16} className="text-mvp-gold" />
                                <span>{client.country || detailCopy.notSpecified}</span>
                            </div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">{detailCopy.contact}</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between gap-4"><span className="text-zinc-500">{detailCopy.phone}</span> <span className="text-white text-right">{client.phone || '-'}</span></div>
                                {client.email && (
                                    <div className="flex justify-between gap-4"><span className="text-zinc-500">{detailCopy.optionalEmail}</span> <span className="text-white text-right">{client.email}</span></div>
                                )}
                            </div>
                        </div>
                         <button onClick={onEdit} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-4"><Edit2 size={16}/> {detailCopy.editProfile}</button>
                    </TabPanel>
                )}
                {activeTab === 'agenda' && (
                    <TabPanel key="agenda" className="space-y-6">
                        <AnimatePresence mode="wait" initial={false}>
                        {!isEditingAgenda ? (
                            <motion.div
                                key="agenda-summary"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -3 }}
                                transition={{ duration: 0.18, ease: MOTION_EASE }}
                                className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 text-center flex flex-col items-center justify-center"
                            >
                                <div className="bg-mvp-gold/10 p-4 rounded-full mb-4"><Clock className="text-mvp-gold" size={32}/></div>
                                <h3 className="text-3xl font-bold text-white mb-2">{client.trainingTime || client.trainingHour || detailCopy.undefinedTime}</h3>
                                <p className="text-zinc-400 text-sm mb-8 leading-relaxed max-w-xs">{client.trainingDays && client.trainingDays.length > 0 ? client.trainingDays.map((day: string) => dayFullLabel(day, language)).join(', ') : detailCopy.noTrainingDays}</p>
                                <AppButton onClick={() => {
                                    const parsedStart = client.trainingTime?.includes(' - ') ? convertTo24Hour(client.trainingTime.split(' - ')[0]) : convertTo24Hour(client.trainingTime || client.trainingHour || '');
                                    const parsedEnd = client.trainingTime?.includes(' - ') ? convertTo24Hour(client.trainingTime.split(' - ')[1]) : agendaForm.endTime;
                                    setAgendaForm({
                                        days: client.trainingDays || [],
                                        startTime: parsedStart || agendaForm.startTime,
                                        endTime: parsedEnd || agendaForm.endTime
                                    });
                                    setIsEditingAgenda(true);
                                }} variant="secondary" icon={<Edit2 size={16}/>}>{detailCopy.editSchedule}</AppButton>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="agenda-edit"
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -3 }}
                                transition={{ duration: 0.18, ease: MOTION_EASE }}
                                className="bg-zinc-900 p-5 rounded-xl border border-zinc-800"
                            >
                                <div className="flex items-center gap-2 mb-4"><Calendar className="text-mvp-gold" size={20}/><h3 className="text-white font-bold">{detailCopy.editTime}</h3></div>
                                <div className="mb-6">
                                    <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">{detailCopy.trainingTime}</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-black border border-zinc-700 rounded-xl p-3">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">{detailCopy.start}</span>
                                            <input 
                                                type="time" 
                                                value={agendaForm.startTime} 
                                                onChange={e => setAgendaForm({...agendaForm, startTime: e.target.value})}
                                                className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                            />
                                        </div>
                                        <div className="bg-black border border-zinc-700 rounded-xl p-3">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">{detailCopy.end}</span>
                                            <input 
                                                type="time" 
                                                value={agendaForm.endTime} 
                                                onChange={e => setAgendaForm({...agendaForm, endTime: e.target.value})}
                                                className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mb-8"><label className="text-xs text-zinc-500 font-bold uppercase mb-3 block">{detailCopy.trainingDays}</label><div className="grid grid-cols-2 gap-2">{WEEKDAYS.map(day => { const isSelected = agendaForm.days.includes(day); return ( <button key={day} onClick={() => toggleAgendaDay(day)} className={`py-3 px-4 rounded-lg text-sm font-semibold flex justify-between items-center transition-all ${isSelected ? 'bg-mvp-gold text-black border border-mvp-gold' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'}`}>{dayFullLabel(day, language)}{isSelected && <Check size={16} className="stroke-[3px]" />}</button>);})}</div></div>
                                <div className="flex gap-3"><AppButton onClick={() => setIsEditingAgenda(false)} variant="secondary" className="flex-1">{detailCopy.cancel}</AppButton><AppButton onClick={handleSaveAgenda} variant="primary" icon={<Save size={18}/>} className="flex-1">{detailCopy.save}</AppButton></div>
                            </motion.div>
                        )}
                        </AnimatePresence>
                    </TabPanel>
                )}
                {activeTab === 'routines' && (
                    <TabPanel key="routines" className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="font-bold text-white">{detailCopy.workouts}</h3>
                            </div>
                            <AppButton
                                onClick={handleAddRoutine}
                                disabled={isGenerating}
                                isLoading={isGenerating}
                                variant="primary"
                                icon={<Sparkles size={16} />}
                                className="ai-magic-button w-full sm:w-auto"
                            >
                                {isGenerating ? detailCopy.generatingWorkout : detailCopy.generateWorkout}
                            </AppButton>
                        </div>
                        {isLoadingData ? (<SkeletonRoutine />) : (
                          <>
                            {(Array.isArray(clientRoutines) ? clientRoutines : []).length === 0 && !isGenerating && (
                                <div className="guided-empty-state text-center px-5 py-9 bg-zinc-900/40 rounded-xl border border-dashed border-zinc-800">
                                    <span className="guided-empty-icon mb-3"><Dumbbell size={24} /></span>
                                    <p className="text-sm font-bold text-zinc-300">{detailCopy.noWorkouts}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{detailCopy.noWorkoutsHint}</p>
                                </div>
                            )}
                            {(Array.isArray(clientRoutines) ? clientRoutines : []).map((r: Routine, rIdx: number) => {
                                const isExpanded = expandedRoutine === r.id;
                            const groupedExercises = isExpanded ? groupExercisesByDay(r.exercises || (r as any).workouts, r.days) : {};
                            return (
                                <div key={r.id || `routine-${rIdx}`} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden transition-all duration-300">
                                    <div onClick={() => setExpandedRoutine(isExpanded ? null : r.id)} className="p-4 cursor-pointer hover:bg-zinc-800/50 flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-white text-lg">{r.title || r.name}</h4>
                                                {(r as any).source === 'ai' && <span className="text-[9px] bg-mvp-gold/20 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/30 uppercase font-bold tracking-tighter">{detailCopy.generatedWithAi}</span>}
                                                {(r as any).source === 'fallback' && <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase">{detailCopy.proBase}</span>}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{r.summary || r.description}</p>
                                            <p className="text-[11px] text-zinc-500 mt-1">{detailCopy.createdOn} {formatPlanDate(r.createdAt, language)}</p>
                                            <div className="flex flex-wrap gap-2 mt-2">{(Array.isArray(r.tags) ? r.tags : []).map((tag, i) => (<span key={`${r.id}-tag-${i}`} className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700 uppercase tracking-wider">{tag}</span>))}</div>
                                        </div>
                                        <div className="text-zinc-500 ml-4 mt-1"><MotionChevron open={isExpanded} size={20}/></div>
                                    </div>
                                    <AccordionPanel isOpen={isExpanded} className="border-t border-zinc-800 bg-black/20 p-4">
                                            {(r.exercises?.length === 0 && !(r as any).workouts?.length) ? (<p className="text-zinc-500 text-sm italic py-2">{detailCopy.routineEmpty}</p>) : (
                                                <div className="space-y-6">
                                                    {Object.keys(groupedExercises).map((dayName, dayIdx) => (
                                                        <div key={`${r.id}-${dayName}-${dayIdx}`} className="space-y-2">
                                                            <div className="mb-2 flex items-center gap-2 border-b border-zinc-800 pb-2">
                                                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-400/25 bg-violet-950/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-normal text-violet-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"><Calendar size={12}/> {dayName}</span>
                                                            </div>
                                                            {(Array.isArray(groupedExercises[dayName]) ? groupedExercises[dayName] : []).map((ex, exIdx) => (
                                                                <div key={`${r.id}-${dayName}-${exIdx}`}>
                                                                    <ExerciseItem ex={ex} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}

                                                    {/* Warnings and Recommendations */}
                                                    {(Array.isArray(r.warnings) && r.warnings.length > 0) && (
                                                        <div className="mt-4 p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                                                            <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={10}/> {detailCopy.warnings}</h5>
                                                            <ul className="text-xs text-zinc-400 space-y-1">
                                                                {r.warnings.map((w, i) => <li key={`w-${i}`}>• {w}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {(Array.isArray(r.recommendations) && r.recommendations.length > 0) && (
                                                        <div className="mt-4 p-3 bg-mvp-gold/5 border border-mvp-gold/10 rounded-lg">
                                                            <h5 className="text-[10px] font-bold text-mvp-gold uppercase mb-2 flex items-center gap-1"><Sparkles size={10}/> {detailCopy.recommendations}</h5>
                                                            <ul className="text-xs text-zinc-400 space-y-1">
                                                                {r.recommendations.map((rec, i) => <li key={`rec-${i}`}>• {rec}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    <div className="mt-4 p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                                                        <p className="text-xs text-zinc-400 leading-relaxed">{getPlanSafetyNote(language)}</p>
                                                    </div>

                                                    <ButtonGroup className="mt-4 plan-action-group">
                                                        <ContactButton
                                                            onClick={(e) => { e.stopPropagation(); handleWhatsAppShare('routine', r); }} 
                                                            tone="whatsapp"
                                                            icon={<MessageSquare size={16} />}
                                                            className="sm:min-w-[148px]"
                                                        >
                                                            WhatsApp
                                                        </ContactButton>
                                                        <CopyButton
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigator.clipboard.writeText(buildRoutineShareMessage(r, language));
                                                                onShowToast({ title: detailCopy.copiedRoutineTitle, message: detailCopy.readyToPaste, type: 'success' });
                                                            }} 
                                                            copiedLabel={language === 'en' ? 'Copied!' : '¡Copiado!'}
                                                            className="sm:min-w-[132px]"
                                                        >
                                                            {detailCopy.copy}
                                                        </CopyButton>
                                                        <DestructiveButton
                                                            onClick={async (e) => { 
                                                                e.stopPropagation(); 
                                                                requestConfirm({
                                                                    title: detailCopy.deleteRoutineTitle,
                                                                    message: detailCopy.deleteRoutineMessage,
                                                                    type: 'danger',
                                                                    onConfirm: async () => {
                                                                        try {
                                                                            appLog("Archiving routine:", r.id);
                                                                            onShowToast({ title: detailCopy.deletingTitle, message: detailCopy.deletingRoutine, type: 'info' });
                                                                            await dbProvider.archiveRoutine(r.id);
                                                                            onRefreshCounts && onRefreshCounts();
                                                                            const nextRoutines = clientRoutines.filter(item => item.id !== r.id);
                                                                            setClientRoutines(nextRoutines);
                                                                            onUpdate({ routines: nextRoutines });
                                                                            onShowToast({ title: detailCopy.routineDeletedTitle, message: detailCopy.routineDeletedMessage, type: 'success' });
                                                                        } catch (err) {
                                                                            console.error("Routine delete error:", err);
                                                                            onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.deleteError, type: 'error' });
                                                                        }
                                                                    }
                                                                });
                                                            }} 
                                                            icon={<Trash2 size={16} />}
                                                            className="sm:min-w-[132px]"
                                                        >
                                                            {detailCopy.delete}
                                                        </DestructiveButton>
                                                    </ButtonGroup>
                                                </div>
                                            )}
                                    </AccordionPanel>
                                </div>
                                );
                            })}
                          </>
                        )}
                    </TabPanel>
                )}
                {activeTab === 'nutrition' && (
                    <TabPanel key="nutrition" className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="font-bold text-white">{detailCopy.nutritionPlan}</h3>
                            </div>
                            {!isLoadingData && clientDiet && (
                                <AppButton
                                    onClick={handleAddDiet}
                                    disabled={isGenerating}
                                    isLoading={isGenerating}
                                    variant="primary"
                                    icon={<Sparkles size={16} />}
                                    className="ai-magic-button w-full sm:w-auto"
                                >
                                    {isGenerating ? detailCopy.generatingDiet : detailCopy.generateDiet}
                                </AppButton>
                            )}
                        </div>

                        {isLoadingData ? (<SkeletonRoutine />) : (
                          <>
                            {!clientDiet ? (
                                <div className="guided-empty-state text-center py-10 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                                    <span className="guided-empty-icon mb-3"><Utensils size={28} /></span>
                                    <p className="text-sm font-bold text-zinc-300">{detailCopy.noDiets}</p>
                                    <p className="text-zinc-500 mt-1 mb-5 max-w-xs mx-auto text-xs leading-relaxed">{detailCopy.dietEmptyCta}</p>
                                    <AppButton
                                        onClick={handleAddDiet} 
                                        disabled={isGenerating} 
                                        variant="primary"
                                        icon={isGenerating ? undefined : <Sparkles size={16}/>}
                                        isLoading={isGenerating}
                                        className="ai-magic-button mx-auto"
                                    >
                                        {isGenerating ? detailCopy.generatingDiet : detailCopy.generateDiet}
                                    </AppButton>
                                </div>
                            ) : (
                                <div className="animate-fadeIn space-y-4">
                                    {clientDiets.length > 0 && (
                                        <div className="space-y-2">
                                            {clientDiets.map((dietItem, idx) => {
                                                const isSelected = dietItem.id === clientDiet?.id;
                                                const isExpanded = isSelected && expandedDiet === dietItem.id;
                                                return (
                                                    <button
                                                        key={dietItem.id || `diet-history-${idx}`}
                                                        onClick={() => {
                                                            setClientDiet(dietItem);
                                                            setExpandedDiet(isExpanded ? null : (dietItem.id || `diet-history-${idx}`));
                                                            setExpandedDietDay(null);
                                                        }}
                                                        className={`w-full p-4 rounded-xl border flex items-start justify-between gap-3 text-left transition-colors ${isSelected ? 'bg-zinc-900 border-mvp-primary/45' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/70'}`}
                                                    >
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <h4 className="font-bold text-white text-base leading-snug">{dietItem.title}</h4>
                                                                {(dietItem as any).source === 'ai' && <span className="text-[9px] bg-mvp-gold/20 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/30 uppercase font-bold tracking-tighter">{detailCopy.generatedWithAi}</span>}
                                                                {(dietItem as any).source === 'fallback' && <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase">{detailCopy.proBase}</span>}
                                                            </div>
                                                            {(dietItem.summary || dietItem.notes) && (
                                                                <p className="mt-1 text-xs text-zinc-500 line-clamp-1">{dietItem.summary || dietItem.notes}</p>
                                                            )}
                                                            <p className="text-[11px] text-zinc-500 mt-1">{detailCopy.createdOn} {dietItem.createdAt ? formatPlanDate(dietItem.createdAt, language) : `Plan ${idx + 1}`}</p>
                                                        </div>
                                                        <MotionChevron open={isExpanded} size={18} className={isExpanded ? "text-mvp-gold shrink-0" : "text-zinc-500 shrink-0"} />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <AccordionPanel isOpen={expandedDiet === clientDiet?.id} className="space-y-4">
                                    <div className="bg-zinc-950/35 p-4 rounded-xl border border-zinc-800">
                                         <div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Flame size={14} className="mx-auto text-orange-500 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalKcal || clientDiet.daily_calories}</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Kcal</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Utensils size={14} className="mx-auto text-red-400 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalProtein || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Prot</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Zap size={14} className="mx-auto text-amber-300 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalCarbs || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Carb</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <div className="w-3.5 h-3.5 mx-auto bg-blue-400 rounded-full mb-1 opacity-80"></div>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalFats || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Grasa</span>
                                                </div>
                                            </div>

                                            {/* Warnings and Recommendations (Diet) */}
                                            {(Array.isArray(clientDiet.warnings) && clientDiet.warnings.length > 0) && (
                                                <div className="mb-4 p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                                                    <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={10}/> {detailCopy.warnings}</h5>
                                                    <ul className="text-xs text-zinc-400 space-y-1">
                                                        {clientDiet.warnings.map((w, i) => <li key={`dw-${i}`}>• {w}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {(Array.isArray(clientDiet.recommendations) && clientDiet.recommendations.length > 0) && (
                                                <div className="mb-4 p-3 bg-mvp-gold/5 border border-mvp-gold/10 rounded-lg">
                                                    <h5 className="text-[10px] font-bold text-mvp-gold uppercase mb-2 flex items-center gap-1"><Sparkles size={10}/> {detailCopy.recommendations}</h5>
                                                    <ul className="text-xs text-zinc-400 space-y-1">
                                                        {clientDiet.recommendations.map((rec, i) => <li key={`drec-${i}`}>• {rec}</li>)}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="mb-4 p-3 bg-zinc-900/70 border border-zinc-800 rounded-lg">
                                                <p className="text-xs text-zinc-400 leading-relaxed">{getPlanSafetyNote(language)}</p>
                                            </div>

                                            <ButtonGroup className="mt-4 plan-action-group">
                                                <ContactButton
                                                    onClick={() => handleWhatsAppShare('diet', clientDiet!)} 
                                                    tone="whatsapp"
                                                    icon={<MessageSquare size={16} />}
                                                    className="sm:min-w-[148px]"
                                                >
                                                    WhatsApp
                                                </ContactButton>
                                                <CopyButton
                                                    onClick={() => {
                                                        const diet = clientDiet!;
                                                        const sharedMessage = buildDietShareMessage(diet, language);
                                                        navigator.clipboard.writeText(sharedMessage);
                                                        onShowToast({ title: detailCopy.copiedDietTitle, message: detailCopy.readyToPaste, type: 'success' });
                                                    }} 
                                                    copiedLabel={language === 'en' ? 'Copied!' : '¡Copiado!'}
                                                    className="sm:min-w-[132px]"
                                                >
                                                    {detailCopy.copy}
                                                </CopyButton>
                                                <DestructiveButton
                                                    onClick={() => {
                                                        requestConfirm({
                                                            title: detailCopy.deleteDietTitle,
                                                            message: detailCopy.deleteDietMessage,
                                                            type: 'danger',
                                                            onConfirm: async () => {
                                                                try {
                                                                    appLog("Archiving diet:", clientDiet.id);
                                                                    onShowToast({ title: detailCopy.deletingTitle, message: detailCopy.deletingDiet, type: 'info' });
                                                                    if (!clientDiet?.id) {
                                                                        onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.invalidDietId, type: 'error' });
                                                                        return;
                                                                    }
                                                                    await dbProvider.archiveDiet(clientDiet.id);
                                                                    onRefreshCounts && onRefreshCounts();
                                                                    const nextDiets = clientDiets.filter(d => d.id !== clientDiet.id);
                                                                    setClientDiets(nextDiets);
                                                                    setClientDiet(nextDiets[0] || null);
                                                                    setExpandedDiet(nextDiets[0]?.id || null);
                                                                    onUpdate({ dietPlan: nextDiets[0], dietPlans: nextDiets });
                                                                    onShowToast({ title: detailCopy.dietDeletedTitle, message: detailCopy.dietDeletedMessage, type: 'success' });
                                                                } catch (err) {
                                                                    console.error("Diet delete error:", err);
                                                                    onShowToast({ title: detailCopy.saveErrorTitle, message: detailCopy.deleteDietError, type: 'error' });
                                                                }
                                                            }
                                                        });
                                                    }}
                                                    icon={<Trash2 size={16} />}
                                                    className="sm:min-w-[132px]"
                                                >
                                                    {detailCopy.delete}
                                                </DestructiveButton>
                                            </ButtonGroup>
                                         </div>
                                    </div>

                                    {/* Weekly Days Accordion */}
                                    <div className="space-y-3">
                                        {(Array.isArray(clientDiet.days) ? clientDiet.days : []).length === 0 && (Array.isArray(clientDiet.meals) ? clientDiet.meals : []).length > 0 && (
                                            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                                                <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider mb-2">{detailCopy.generalPlan}</h4>
                                                {(Array.isArray(clientDiet.meals) ? clientDiet.meals : []).map((meal: any, idx: number) => (
                                                    <div key={`flat-meal-${idx}`} className="flex gap-4 text-sm border-l-2 border-zinc-700 pl-4 py-1">
                                                        <span className="font-bold text-zinc-400 min-w-[70px] text-xs uppercase pt-0.5">{meal.timeOfDay || `${detailCopy.meal} ${idx+1}`}</span>
                                                        <div>
                                                            <p className="font-bold text-zinc-200">{meal.name}</p>
                                                            <p className="text-zinc-400 text-xs mt-1">{meal.description}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(Array.isArray(clientDiet.days) ? clientDiet.days : []).map((dayPlan: any, i: number) => { 
                                            const isExpanded = expandedDietDay === dayPlan.day; 
                                            return ( 
                                                <div key={dayPlan.day || `day-${i}`} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                                                    <button 
                                                        onClick={() => setExpandedDietDay(isExpanded ? null : dayPlan.day)} 
                                                        className="w-full p-4 flex justify-between items-center hover:bg-zinc-800/50 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Calendar size={16} className="text-mvp-gold" />
                                                            <span className="font-bold text-white capitalize">{dayPlan.day}</span>
                                                        </div>
                                                        <MotionChevron open={isExpanded} size={18} className="text-zinc-500"/>
                                                    </button>
                                                    
                                                    <AccordionPanel isOpen={isExpanded} className="p-4 bg-black/20 border-t border-zinc-800 space-y-4">
                                                            {(Array.isArray(dayPlan.meals) ? dayPlan.meals : []).map((meal: any, idx: number) => (
                                                                <div key={`${dayPlan.day}-meal-${idx}`} className="flex gap-4 text-sm border-l-2 border-zinc-800 pl-4 py-1">
                                                                    <span className="font-bold text-mvp-gold min-w-[70px] text-xs uppercase tracking-wide pt-0.5">{meal.timeOfDay}</span>
                                                                    <div>
                                                                        <p className="font-bold text-zinc-200">{meal.name}</p>
                                                                        <p className="text-zinc-400 text-xs mt-1">{meal.description}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </AccordionPanel>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    </AccordionPanel>
                                </div>
                            )}
                          </>
                        )}
                    </TabPanel>
                )}
                {activeTab === 'payments' && (
                     <TabPanel key="payments" className="space-y-5 pb-10">
                        {/* Summary Status Card */}
                        <div className={`p-5 md:p-6 rounded-3xl border shadow-[0_22px_60px_rgba(0,0,0,0.28)] ${
                            paymentForm.status === 'al_dia' ? 'bg-green-600/10 border-green-500/50' : 
                            paymentForm.status === 'pendiente' ? 'bg-amber-600/10 border-amber-500/50' : 
                            'bg-red-600/10 border-red-500/50'
                        }`}>
                            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1 block">{detailCopy.currentStatus}</span>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-3 h-3 rounded-full ${
                                            paymentForm.status === 'al_dia' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                                            paymentForm.status === 'pendiente' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                                            'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                        }`}></div>
                                        <h3 className="text-2xl font-black text-white capitalize">{formatPaymentStatus(paymentForm.status, language)}</h3>
                                    </div>
                                    <p className="mt-2 text-sm text-zinc-400">{client.name} · {paymentForm.paymentMethod}</p>
                                </div>
                                <div className="md:text-right">
                                    <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1 block">{detailCopy.monthlyFee}</span>
                                    <p className="text-3xl font-black text-white">{formatMoney(paymentForm.monthlyFee, client.country, language)}</p>
                                </div>
                            </div>
                            <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-widest text-zinc-500 font-black">{detailCopy.status}</span>
                                    <span className="mt-1 block text-xs font-bold text-white capitalize">{formatPaymentStatus(paymentForm.status, language)}</span>
                                </div>
                                <div className="h-px bg-white/10" />
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-widest text-zinc-500 font-black">{detailCopy.payment}</span>
                                    <span className="mt-1 block text-xs font-bold text-white">{paymentForm.lastPaidAt ? new Date(paymentForm.lastPaidAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES') : detailCopy.pending}</span>
                                </div>
                                <div className="h-px bg-white/10" />
                                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                    <span className="block text-[9px] uppercase tracking-widest text-zinc-500 font-black">{detailCopy.next}</span>
                                    <span className="mt-1 block text-xs font-bold text-white">{paymentForm.nextPaymentAt ? new Date(paymentForm.nextPaymentAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES') : 'N/A'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Dates Info */}
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 block mb-2">{detailCopy.lastPayment}</span>
                                <div className="flex items-center gap-2 text-white font-bold">
                                    <Calendar size={14} className="text-zinc-500" />
                                    {paymentForm.lastPaidAt ? new Date(paymentForm.lastPaidAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES') : 'N/A'}
                                </div>
                            </div>
                            <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 block mb-2">{detailCopy.nextCharge}</span>
                                <div className="flex items-center gap-2 text-white font-bold">
                                    <Clock size={14} className="text-mvp-gold" />
                                    {paymentForm.nextPaymentAt ? new Date(paymentForm.nextPaymentAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES') : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <ButtonGroup className="items-stretch plan-action-group">
                            <AppButton
                                onClick={() => setIsQuickPaymentOpen(true)}
                                variant="success"
                                isLoading={isSavingPayment}
                                icon={<Check size={18} />}
                                className="sm:min-w-[190px]"
                            >
                                {detailCopy.markPaidToday}
                            </AppButton>
                            <AppButton onClick={markAsPendingTomorrow} variant="secondary" isLoading={isSavingPayment} icon={<Calendar size={17} />} className="sm:min-w-[140px]">
                                {language === 'en' ? 'Pays tomorrow' : 'Paga mañana'}
                            </AppButton>
                            <AppButton onClick={markAsUnpaid} variant="danger" isLoading={isSavingPayment} icon={<AlertTriangle size={17} />} className="sm:min-w-[130px]">
                                {language === 'en' ? 'Not paid' : 'No pagó'}
                            </AppButton>
                            {(paymentForm.status === 'pendiente' || paymentForm.status === 'atrasado') && <ContactButton
                                onClick={handleGeneratePaymentMessage}
                                tone="whatsapp"
                                icon={<MessageSquare size={16} />}
                                className="sm:min-w-[140px]"
                            >
                                WhatsApp
                            </ContactButton>}
                        </ButtonGroup>

                        {/* Edit Form (Hidden by default or accordion) */}
                        <details className="group pt-6 border-t border-zinc-800">
                            <summary className="mb-4 flex cursor-pointer list-none items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white">{detailCopy.manualSettings}<ChevronDown size={16} className="transition-transform group-open:rotate-180" /></summary>
                            <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-4">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] text-zinc-500 font-black uppercase mb-2 block tracking-widest">{detailCopy.paymentAmount}</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                                        <input 
                                            type="number" 
                                            value={paymentForm.monthlyFee} 
                                            onChange={(e) => setPaymentForm({...paymentForm, monthlyFee: Number(e.target.value)})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-8 pr-4 py-3 focus:border-mvp-gold outline-none font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">{detailCopy.status}</label>
                                        <select 
                                            value={paymentForm.status} 
                                            onChange={(e) => setPaymentForm({...paymentForm, status: e.target.value as any})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none capitalize text-sm"
                                        >
                                            <option value="sin_registro">{detailCopy.noRecord}</option>
                                            <option value="al_dia">{detailCopy.paidUp}</option>
                                            <option value="pendiente">{detailCopy.pending}</option>
                                            <option value="atrasado">{detailCopy.late}</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">{detailCopy.method}</label>
                                        <select 
                                            value={paymentForm.paymentMethod} 
                                            onChange={(e) => setPaymentForm({...paymentForm, paymentMethod: e.target.value as any})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none capitalize text-sm"
                                        >
                                            <option value="efectivo">{detailCopy.cash}</option>
                                            <option value="yape">Yape</option>
                                            <option value="plin">Plin</option>
                                            <option value="transferencia">{detailCopy.transfer}</option>
                                            <option value="tarjeta">{detailCopy.card}</option>
                                            <option value="otro">{detailCopy.other}</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">{detailCopy.lastPayment}</label>
                                        <input 
                                            type="date" 
                                            value={paymentForm.lastPaidAt ? paymentForm.lastPaidAt.split('T')[0] : ''} 
                                            onChange={(e) => setPaymentForm({...paymentForm, lastPaidAt: e.target.value ? new Date(e.target.value).toISOString() : ''})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">{detailCopy.nextCharge}</label>
                                        <input 
                                            type="date" 
                                            value={paymentForm.nextPaymentAt ? paymentForm.nextPaymentAt.split('T')[0] : ''} 
                                            onChange={(e) => setPaymentForm({...paymentForm, nextPaymentAt: e.target.value ? new Date(e.target.value).toISOString() : ''})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none text-xs"
                                        />
                                    </div>
                                </div>
                                <AppButton onClick={handleSavePayments} variant="secondary" isLoading={isSavingPayment} icon={<Save size={16} />} className="w-full">
                                    {detailCopy.applySettings}
                                </AppButton>
                            </div>
                        </details>
                     </TabPanel>
                )}
                </AnimatePresence>
            </div>
        </div>
    );
};

// --- CLIENT FORM MODAL (CREATE / EDIT) ---

const ClientFormModal = ({ onClose, onSubmit, initialData, onShowToast, existingClients = [], language = 'es' }: { onClose: () => void, onSubmit: (data: any) => void, initialData?: Client, onShowToast: (t: any) => void, existingClients?: Client[], language?: AppLanguage }) => {
    const copy = APP_COPY[language];
    const formCopy = FORM_COPY[language];
    // --- STATE FOR FORM ---
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', fee: '',
        gender: 'male',
        age: '', weight: '', height: '',
        experienceLevel: 'beginner',
        country: 'Perú',
        medicalNotes: '',
        mainGoal: '',
        goals: [] as string[],
        clientGoalSummary: '',
        routineFocus: '',
        dietFocus: '',
        trainingDays: [] as string[],
        trainingStartTime: '07:00',
        trainingEndTime: '08:00'
    });

    const [errors, setErrors] = useState<Record<string, string>>({});
    const [optionalDataOpen, setOptionalDataOpen] = useState(() => Boolean(initialData?.email));
    const [voiceModalOpen, setVoiceModalOpen] = useState(false);
    const [voiceTranscript, setVoiceTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [isOrganizingVoice, setIsOrganizingVoice] = useState(false);
    const [voiceElapsedSeconds, setVoiceElapsedSeconds] = useState(0);
    const [voiceError, setVoiceError] = useState('');
    const voiceRecorderRef = useRef<MediaRecorder | null>(null);
    const voiceRecognitionRef = useRef<any>(null);
    const voiceStreamRef = useRef<MediaStream | null>(null);
    const voiceChunksRef = useRef<Blob[]>([]);
    const voiceShouldListenRef = useRef(false);
    const voiceRecognitionRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const voiceFinalTranscriptRef = useRef('');

    useEffect(() => {
        if (initialData) {
            setOptionalDataOpen(Boolean(initialData.email));
            setFormData({
                name: initialData.name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                fee: initialData.paymentInfo?.monthlyFee !== undefined ? String(initialData.paymentInfo.monthlyFee) : '0',
                gender: initialData.gender || 'male',
                age: initialData.age !== undefined && initialData.age !== null ? String(initialData.age) : '',
                weight: initialData.weight !== undefined && initialData.weight !== null ? String(initialData.weight) : '',
                height: initialData.height !== undefined && initialData.height !== null ? String(initialData.height) : '',
                experienceLevel: initialData.experienceLevel || 'beginner',
                country: initialData.country || 'Perú',
                medicalNotes: initialData.medicalNotes || '',
                mainGoal: initialData.mainGoal || initialData.goals?.[0] || '',
                goals: initialData.goals || [],
                clientGoalSummary: initialData.clientGoalSummary || '',
                routineFocus: initialData.routineFocus || '',
                dietFocus: initialData.dietFocus || '',
                trainingDays: initialData.trainingDays || [],
                trainingStartTime: '07:00',
                trainingEndTime: '08:00'
            });
        }
    }, [initialData]);

    useEffect(() => {
        if (!isListening) return;
        const interval = setInterval(() => setVoiceElapsedSeconds(seconds => seconds + 1), 1000);
        return () => clearInterval(interval);
    }, [isListening]);

    const PRIMARY_GOALS = [
        "Bajar grasa", "Ganar masa muscular", "Recomposicion corporal",
        "Definir / tonificar", "Gluteos y piernas", "Abdomen y core",
        "Aumentar fuerza", "Mejorar resistencia fisica", "Mejorar salud general",
        "Movilidad / flexibilidad", "Rendimiento deportivo", "Mantenerse activo"
    ];

    const SECONDARY_GOALS = [
        "Bajar abdomen", "Aumentar gluteos", "Aumentar piernas",
        "Definir brazos", "Mejorar postura", "Mejorar cardio",
        "Ganar fuerza", "Mejorar flexibilidad", "Reducir cintura",
        "Crear habito de entrenamiento"
    ];

    const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    // --- HELPERS ---
    const toggleGoal = (goal: string) => {
        setFormData(prev => ({
            ...prev,
            goals: prev.goals.includes(goal) 
                ? prev.goals.filter(g => g !== goal) 
                : [...prev.goals, goal]
        }));
        if (errors.goals) setErrors(prev => ({ ...prev, goals: "" }));
    };

    const toggleDay = (day: string) => {
        setFormData(prev => ({
            ...prev,
            trainingDays: prev.trainingDays.includes(day)
                ? prev.trainingDays.filter(d => d !== day)
                : [...prev.trainingDays, day]
        }));
        if (errors.trainingDays) setErrors(prev => ({ ...prev, trainingDays: "" }));
    };

    const stopVoiceStream = () => {
        voiceStreamRef.current?.getTracks().forEach(track => track.stop());
        voiceStreamRef.current = null;
    };

    const clearVoiceRecognitionRestart = () => {
        if (voiceRecognitionRestartRef.current) {
            clearTimeout(voiceRecognitionRestartRef.current);
            voiceRecognitionRestartRef.current = null;
        }
    };

    const blobToBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = String(reader.result || "");
            resolve(result.includes(",") ? result.split(",")[1] : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    const transcribeVoiceBlob = async (blob: Blob) => {
        if (blob.size < 800) {
            throw new Error("La grabacion fue demasiado corta. Habla al menos unos segundos.");
        }

        setIsOrganizingVoice(true);
        try {
            const audioBase64 = await blobToBase64(blob);
            const response = await fetch('/api/transcribe-client-goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    audioBase64,
                    mimeType: blob.type || 'audio/webm',
                    language
                })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "No se pudo transcribir la grabacion.");
            }

            const transcript = String(data?.transcript || "").trim();
            if (!transcript) {
                throw new Error("La transcripcion llego vacia. Intenta hablar mas cerca del microfono.");
            }

            setVoiceTranscript(transcript);
            setVoiceError('');
            onShowToast({ title: "Voz transcrita", message: "Revisa el texto y aplica los objetivos.", type: 'success' });
        } catch (error) {
            const message = error instanceof Error ? error.message : "No se pudo transcribir la voz. Puedes escribir los objetivos manualmente.";
            setVoiceError(message);
            onShowToast({ title: language === 'en' ? "Voice error" : "Error de voz", message, type: 'warning' });
        } finally {
            setIsOrganizingVoice(false);
        }
    };

    const startBrowserSpeechRecognition = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            voiceShouldListenRef.current = false;
            const message = language === 'en' ? "Your browser does not support voice recording. You can type the client details manually." : "Tu navegador no permite grabacion por voz. Puedes escribir los objetivos manualmente.";
            setVoiceError(message);
            onShowToast({ title: language === 'en' ? "Voice unavailable" : "Voz no disponible", message, type: 'warning' });
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = language === 'en' ? 'en-US' : 'es-PE';
        recognition.interimResults = true;
        recognition.continuous = true;
        voiceRecognitionRef.current = recognition;
        voiceShouldListenRef.current = true;
        voiceFinalTranscriptRef.current = '';
        setVoiceError('');
        setIsListening(true);
        setVoiceModalOpen(true);

        recognition.onresult = (event: any) => {
            let interimTranscript = '';
            for (let index = event.resultIndex || 0; index < (event.results?.length || 0); index += 1) {
                const result = event.results[index];
                const text = String(result?.[0]?.transcript || '').trim();
                if (!text) continue;
                if (result.isFinal) {
                    voiceFinalTranscriptRef.current = `${voiceFinalTranscriptRef.current} ${text}`.trim();
                } else {
                    interimTranscript = `${interimTranscript} ${text}`.trim();
                }
            }
            setVoiceTranscript(`${voiceFinalTranscriptRef.current} ${interimTranscript}`.trim());
        };
        recognition.onerror = (event: any) => {
            const errorCode = String(event?.error || '');
            if (errorCode === 'aborted' || errorCode === 'no-speech') return;
            const fatalError = ['not-allowed', 'service-not-allowed', 'audio-capture'].includes(errorCode);
            if (fatalError) {
                voiceShouldListenRef.current = false;
                clearVoiceRecognitionRestart();
                setIsListening(false);
            }
            const reason = errorCode ? ` (${errorCode})` : "";
            const message = language === 'en' ? `Could not transcribe the voice${reason}. Try again or type the details manually.` : `No se pudo transcribir la voz${reason}. Intenta otra vez o escribe los objetivos manualmente.`;
            setVoiceError(message);
            onShowToast({ title: language === 'en' ? "Voice error" : "Error de voz", message, type: 'warning' });
        };
        recognition.onend = () => {
            if (voiceShouldListenRef.current) {
                clearVoiceRecognitionRestart();
                voiceRecognitionRestartRef.current = setTimeout(() => {
                    if (!voiceShouldListenRef.current || voiceRecognitionRef.current !== recognition) return;
                    try {
                        recognition.start();
                    } catch {
                        voiceShouldListenRef.current = false;
                        setIsListening(false);
                        voiceRecognitionRef.current = null;
                    }
                }, 250);
                return;
            }
            clearVoiceRecognitionRestart();
            setIsListening(false);
            voiceRecognitionRef.current = null;
        };
        try {
            recognition.start();
        } catch {
            voiceShouldListenRef.current = false;
            setIsListening(false);
            voiceRecognitionRef.current = null;
        }
    };

    const startVoiceCapture = async () => {
        if (isListening || isOrganizingVoice) return;

        setVoiceModalOpen(true);
        setVoiceTranscript('');
        setVoiceError('');
        setVoiceElapsedSeconds(0);
        voiceShouldListenRef.current = true;

        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            startBrowserSpeechRecognition();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            voiceStreamRef.current = stream;
            voiceChunksRef.current = [];

            const preferredTypes = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/mp4'
            ];
            const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            voiceRecorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data?.size) {
                    voiceChunksRef.current.push(event.data);
                }
            };

            recorder.onerror = () => {
                voiceShouldListenRef.current = false;
                const message = language === 'en' ? "Could not record audio. Check microphone permission or type it manually." : "No se pudo grabar el audio. Revisa el permiso del microfono o intenta escribirlo manualmente.";
                setVoiceError(message);
                onShowToast({ title: language === 'en' ? "Voice error" : "Error de voz", message, type: 'warning' });
            };

            recorder.onstop = async () => {
                const type = recorder.mimeType || mimeType || 'audio/webm';
                const audioBlob = new Blob(voiceChunksRef.current, { type });
                voiceShouldListenRef.current = false;
                voiceRecorderRef.current = null;
                stopVoiceStream();
                setIsListening(false);
                await transcribeVoiceBlob(audioBlob);
            };

            recorder.start(1000);
            setIsListening(true);
        } catch (error: any) {
            voiceShouldListenRef.current = false;
            stopVoiceStream();
            setIsListening(false);
            const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
            const message = denied
                ? (language === 'en' ? "Brave does not have permission to use the microphone. Allow the microphone in the address bar and try again." : "Brave no tiene permiso para usar el microfono. Permite el microfono en la barra de direccion y vuelve a intentar.")
                : (language === 'en' ? "Could not start the microphone. You can type the details manually." : "No se pudo iniciar el microfono. Puedes escribir los objetivos manualmente.");
            setVoiceError(message);
            onShowToast({ title: language === 'en' ? "Microphone unavailable" : "Microfono no disponible", message, type: 'warning' });
        }
    };

    const stopVoiceCapture = () => {
        voiceShouldListenRef.current = false;
        clearVoiceRecognitionRestart();
        if (voiceRecorderRef.current?.state === 'recording') {
            voiceRecorderRef.current.stop();
            return;
        }
        if (voiceRecognitionRef.current) {
            voiceRecognitionRef.current.stop();
        }
    };

    const voiceElapsedLabel = `${String(Math.floor(voiceElapsedSeconds / 60)).padStart(2, '0')}:${String(voiceElapsedSeconds % 60).padStart(2, '0')}`;

    const closeVoiceModal = () => {
        voiceShouldListenRef.current = false;
        clearVoiceRecognitionRestart();
        if (voiceRecorderRef.current?.state === 'recording') {
            voiceRecorderRef.current.onstop = null;
            voiceRecorderRef.current.stop();
        }
        if (voiceRecognitionRef.current) {
            voiceRecognitionRef.current.abort?.();
            voiceRecognitionRef.current = null;
        }
        stopVoiceStream();
        setIsListening(false);
        setVoiceModalOpen(false);
    };

    useEffect(() => () => {
        closeVoiceModal();
    }, []);

    const getVoiceText = (...values: any[]) => {
        const found = values.find(value => String(value || '').trim());
        return found !== undefined ? String(found).trim() : '';
    };

    const getVoiceNumber = (value: any) => {
        const match = String(value || '').replace(',', '.').match(/\d+(\.\d+)?/);
        return match?.[0] || '';
    };

    const getVoiceTime = (value: any) => {
        const raw = String(value || '').trim();
        return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : '';
    };

    const normalizeVoiceDay = (value: any) => {
        const normalized = String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        const aliases: Record<string, string> = {
            lunes: 'Lunes', monday: 'Lunes', mon: 'Lunes',
            martes: 'Martes', tuesday: 'Martes', tue: 'Martes', tues: 'Martes',
            miercoles: 'Miércoles', wednesday: 'Miércoles', wed: 'Miércoles',
            jueves: 'Jueves', thursday: 'Jueves', thu: 'Jueves', thurs: 'Jueves',
            viernes: 'Viernes', friday: 'Viernes', fri: 'Viernes',
            sabado: 'Sábado', saturday: 'Sábado', sat: 'Sábado',
            domingo: 'Domingo', sunday: 'Domingo', sun: 'Domingo'
        };
        if (aliases[normalized]) return aliases[normalized];
        return WEEKDAYS.find(day =>
            day.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === normalized
        ) || '';
    };

    const applyVoiceTranscript = async () => {
        const transcript = voiceTranscript.trim();
        if (!transcript) {
            setVoiceError(formCopy.emptyTranscript);
            return;
        }

        setIsOrganizingVoice(true);
        try {
            const response = await fetch('/api/organize-client-goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transcript, language })
            });
            if (!response.ok) throw new Error(language === 'en' ? 'Could not organize the transcript.' : 'No se pudo ordenar la transcripcion.');
            const data = await response.json();
            const normalizedPrimary = PRIMARY_GOALS.includes(data.primaryGoal) ? data.primaryGoal : formData.mainGoal;
            const normalizedSecondary = Array.isArray(data.secondaryGoals)
                ? data.secondaryGoals.filter((goal: string) => SECONDARY_GOALS.includes(goal))
                : [];
            const normalizedDays = Array.isArray(data.trainingDays)
                ? Array.from(new Set(data.trainingDays.map(normalizeVoiceDay).filter(Boolean)))
                : [];
            const normalizedCountry = COUNTRIES.includes(data.country) ? data.country : '';
            const normalizedGender = ['male', 'female', 'other'].includes(data.gender) ? data.gender : '';
            const normalizedExperience = ['beginner', 'intermediate', 'advanced'].includes(data.experienceLevel) ? data.experienceLevel : '';
            const nextStartTime = getVoiceTime(data.trainingStartTime);
            const nextEndTime = getVoiceTime(data.trainingEndTime);
            const appliedFields = [
                data.name && (language === 'en' ? 'name' : 'nombre'),
                data.phone && (language === 'en' ? 'phone' : 'telefono'),
                data.email && 'email',
                data.age && (language === 'en' ? 'age' : 'edad'),
                data.weight && (language === 'en' ? 'weight' : 'peso'),
                data.height && (language === 'en' ? 'height' : 'altura'),
                normalizedPrimary && (language === 'en' ? 'goal' : 'objetivo'),
                normalizedDays.length > 0 && (language === 'en' ? 'schedule' : 'agenda'),
                data.monthlyFee && (language === 'en' ? 'monthly fee' : 'mensualidad')
            ].filter(Boolean).length;

            setFormData(prev => ({
                ...prev,
                name: getVoiceText(data.name) || prev.name,
                email: getVoiceText(data.email) || prev.email,
                phone: getVoiceText(data.phone) || prev.phone,
                age: getVoiceNumber(data.age) || prev.age,
                weight: getVoiceNumber(data.weight) || prev.weight,
                height: getVoiceNumber(data.height) || prev.height,
                fee: getVoiceNumber(data.monthlyFee) || prev.fee,
                gender: normalizedGender || prev.gender,
                country: normalizedCountry || prev.country,
                experienceLevel: normalizedExperience || prev.experienceLevel,
                mainGoal: normalizedPrimary || prev.mainGoal,
                goals: normalizedSecondary.length > 0 ? Array.from(new Set([...prev.goals, ...normalizedSecondary])) : prev.goals,
                clientGoalSummary: data.clientGoalSummary || transcript,
                medicalNotes: data.medicalConsiderations || prev.medicalNotes,
                routineFocus: data.routineFocus || prev.routineFocus,
                dietFocus: data.dietFocus || prev.dietFocus,
                trainingDays: normalizedDays.length > 0 ? normalizedDays : prev.trainingDays,
                trainingStartTime: nextStartTime || prev.trainingStartTime,
                trainingEndTime: nextEndTime || prev.trainingEndTime
            }));
            setErrors(prev => ({
                ...prev,
                name: data.name ? "" : prev.name,
                email: data.email ? "" : prev.email,
                phone: data.phone ? "" : prev.phone,
                age: data.age ? "" : prev.age,
                weight: data.weight ? "" : prev.weight,
                height: data.height ? "" : prev.height,
                country: normalizedCountry ? "" : prev.country,
                experienceLevel: normalizedExperience ? "" : prev.experienceLevel,
                goals: normalizedPrimary ? "" : prev.goals,
                trainingDays: normalizedDays.length > 0 ? "" : prev.trainingDays,
                trainingTime: nextStartTime || nextEndTime ? "" : prev.trainingTime,
                fee: data.monthlyFee ? "" : prev.fee
            }));
            setVoiceModalOpen(false);
            onShowToast({ title: language === 'en' ? "Data applied" : "Datos aplicados", message: language === 'en' ? `${appliedFields || 'several'} fields were filled from voice.` : `Se rellenaron ${appliedFields || 'varios'} campos desde la voz.`, type: 'success' });
        } catch (error) {
            setFormData(prev => ({
                ...prev,
                clientGoalSummary: prev.clientGoalSummary ? `${prev.clientGoalSummary}\n${transcript}` : transcript
            }));
            setVoiceModalOpen(false);
            onShowToast({ title: language === 'en' ? "Text applied" : "Texto aplicado", message: language === 'en' ? "Gemini could not organize the voice, but the transcript was saved in the custom goal." : "Gemini no ordeno la voz, pero la transcripcion quedo en la meta personalizada.", type: 'warning' });
        } finally {
            setIsOrganizingVoice(false);
        }
    };

    const generateTimeSlots = () => {
        const slots = [];
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 15) {
                const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const time12 = convertTo12Hour(`${time24}:00`);
                slots.push({ value: time24, label: time12 });
            }
        }
        return slots;
    };
    const timeSlots = generateTimeSlots();

    const findScheduleConflict = () => {
        const newStart = formData.trainingStartTime;
        const newEnd = formData.trainingEndTime;
        if (!newStart || !newEnd || formData.trainingDays.length === 0) return null;

        for (const otherClient of existingClients.filter(isActiveClient)) {
            if (initialData?.id && otherClient.id === initialData.id) continue;
            if (!otherClient.trainingTime || !Array.isArray(otherClient.trainingDays)) continue;

            const sharedDay = formData.trainingDays.find(day =>
                otherClient.trainingDays.some(existingDay => normalizeDayName(existingDay) === normalizeDayName(day))
            );
            if (!sharedDay) continue;

            const [rawStart, rawEnd] = otherClient.trainingTime.split(' - ');
            const otherStart = convertTo24Hour(rawStart || '');
            const otherEnd = convertTo24Hour(rawEnd || '');
            if (!otherStart || !otherEnd) continue;

            const overlaps = newStart < otherEnd && newEnd > otherStart;
            if (overlaps) {
                return language === 'en'
                    ? `Schedule conflict: on ${dayFullLabel(sharedDay, language)} from ${rawStart} to ${rawEnd} you already have a training session with ${otherClient.name}.`
                    : `Horario ocupado: el ${dayFullLabel(sharedDay, language)} de ${rawStart} a ${rawEnd} ya tienes entrenamiento con ${otherClient.name}.`;
            }
        }

        return null;
    };

    const formErrors = {
        name: language === 'en' ? 'Name is required and must have at least 2 real characters.' : 'El nombre es obligatorio y debe tener al menos 2 caracteres reales.',
        email: language === 'en' ? 'Enter a valid email or leave this field empty.' : 'Ingresa un correo electrónico válido o deja este campo vacío.',
        phone: language === 'en' ? 'Phone is required and must have at least 7 digits.' : 'El teléfono es obligatorio y debe tener un mínimo de 7 dígitos.',
        age: language === 'en' ? 'Age is required and must be between 12 and 90.' : 'La edad es obligatoria (debe tener entre 12 y 90 años).',
        weight: language === 'en' ? 'Weight is required and must be between 30 and 250 kg.' : 'El peso es obligatorio (debe estar entre 30 y 250 kg).',
        height: language === 'en' ? 'Height is required and must be between 100 and 230 cm.' : 'La altura es obligatoria (debe estar entre 100 y 230 cm).',
        country: language === 'en' ? 'Country is required.' : 'El país es obligatorio.',
        experienceLevel: language === 'en' ? 'Experience level is required.' : 'El nivel de experiencia es obligatorio.',
        goals: language === 'en' ? 'Select a main goal.' : 'Debes seleccionar un objetivo principal.',
        trainingDays: language === 'en' ? 'Select at least 1 training day.' : 'Debes seleccionar al menos 1 día de entrenamiento.',
        trainingTimeRequired: language === 'en' ? 'Start and end times are required.' : 'Los horarios de inicio y fin son obligatorios.',
        trainingTimeOrder: language === 'en' ? 'End time must be later than start time.' : 'La hora de fin debe ser posterior a la hora de inicio.',
        fee: language === 'en' ? 'Monthly fee is required and must be greater than or equal to 0.' : 'La mensualidad es obligatoria y debe ser mayor o igual a 0.',
        incompleteTitle: language === 'en' ? 'Incomplete Data' : 'Datos Incompletos',
        incompleteMessage: language === 'en' ? 'Fix the fields highlighted in red to continue.' : 'Corrige los errores resaltados en rojo para continuar.',
        scheduleTitle: language === 'en' ? 'Schedule conflict' : 'Horario ocupado'
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        appLog("CLICK CREATE/SAVE CLIENT", formData);
        
        const newErrors: Record<string, string> = {};
        
        // 1. Name validation
        if (!formData.name || formData.name.trim().length < 2) {
            newErrors.name = formErrors.name;
        }
        
        // 2. Optional email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const optionalEmail = formData.email.trim();
        if (optionalEmail && !emailRegex.test(optionalEmail)) {
            newErrors.email = formErrors.email;
        }
        
        // 3. Phone validation
        const cleanPhone = formData.phone.replace(/\D/g, "");
        if (!formData.phone || cleanPhone.length < 7) {
            newErrors.phone = formErrors.phone;
        }
        
        // 4. Age validation
        const ageNum = Number(formData.age);
        if (formData.age === "" || isNaN(ageNum) || ageNum < 12 || ageNum > 90) {
            newErrors.age = formErrors.age;
        }
        
        // 5. Weight validation
        const weightNum = Number(formData.weight);
        if (formData.weight === "" || isNaN(weightNum) || weightNum < 30 || weightNum > 250) {
            newErrors.weight = formErrors.weight;
        }
        
        // 6. Height validation
        const heightNum = Number(formData.height);
        if (formData.height === "" || isNaN(heightNum) || heightNum < 100 || heightNum > 230) {
            newErrors.height = formErrors.height;
        }
        
        // 7. Country validation
        if (!formData.country) {
            newErrors.country = formErrors.country;
        }
        
        // 8. Experience validation
        if (!formData.experienceLevel) {
            newErrors.experienceLevel = formErrors.experienceLevel;
        }
        
        // 9. Goals validation
        if (!formData.mainGoal) {
            newErrors.goals = formErrors.goals;
        }
        
        // 10. Training Days validation
        if (formData.trainingDays.length === 0) {
            newErrors.trainingDays = formErrors.trainingDays;
        }
        
        // 11. Schedule times validation
        if (!formData.trainingStartTime || !formData.trainingEndTime) {
            newErrors.trainingTime = formErrors.trainingTimeRequired;
        } else if (formData.trainingStartTime >= formData.trainingEndTime) {
            newErrors.trainingTime = formErrors.trainingTimeOrder;
        }
        
        // 12. Fee validation
        if (!initialData) {
            const feeNum = Number(formData.fee);
            if (formData.fee === "" || isNaN(feeNum) || feeNum < 0) {
                newErrors.fee = formErrors.fee;
            }
        }
        
        if (Object.keys(newErrors).length > 0) {
            appLog("FORM VALIDATION FAILED:", newErrors);
            if (newErrors.email) setOptionalDataOpen(true);
            setErrors(newErrors);
            onShowToast({ title: formErrors.incompleteTitle, message: formErrors.incompleteMessage, type: 'warning' });
            
            // Focus and scroll first error
            setTimeout(() => {
                const firstErrorField = document.querySelector('.border-red-500, [id^="error-container-"]');
                if (firstErrorField) {
                    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const inputEl = firstErrorField.querySelector('input, select') || firstErrorField;
                    if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLSelectElement) {
                        inputEl.focus();
                    }
                }
            }, 100);
            return;
        }

        const scheduleConflict = findScheduleConflict();
        if (scheduleConflict) {
            setErrors(prev => ({ ...prev, trainingTime: scheduleConflict }));
            onShowToast({ title: formErrors.scheduleTitle, message: scheduleConflict, type: 'warning' });
            setTimeout(() => {
                const agendaEl = document.querySelector('#error-container-agenda');
                agendaEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            return;
        }

        appLog("FORM VALIDATION PASSED");

        const payload = {
            name: formData.name.trim(),
            email: optionalEmail || null,
            phone: formData.phone.trim(),
            gender: formData.gender,
            age: formData.age ? Number(formData.age) : null,
            weight: formData.weight ? Number(formData.weight) : null,
            height: formData.height ? Number(formData.height) : null,
            experienceLevel: formData.experienceLevel,
            country: formData.country,
            medicalNotes: formData.medicalNotes.trim(),
            mainGoal: formData.mainGoal,
            goals: formData.goals,
            clientGoalSummary: formData.clientGoalSummary.trim(),
            routineFocus: formData.routineFocus.trim(),
            dietFocus: formData.dietFocus.trim(),
            trainingDays: formData.trainingDays,
            trainingTime: `${convertTo12Hour(formData.trainingStartTime + ':00')} - ${convertTo12Hour(formData.trainingEndTime + ':00')}`,
            paymentInfo: { 
                monthlyFee: Number(formData.fee || 0), 
                status: initialData?.paymentInfo?.status || 'sin_registro' as const, 
                paymentMethod: initialData?.paymentInfo?.paymentMethod || 'efectivo' as const, 
                lastPaidAt: initialData?.paymentInfo?.lastPaidAt || null,
                nextPaymentAt: initialData?.paymentInfo?.nextPaymentAt || null 
            }
        };
        appLog("PAYLOAD READY", payload);

        onSubmit(payload);
    };

    return (
        <motion.div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: MOTION_EASE }}
        >
            <motion.div
                className="bg-zinc-900 w-full max-w-lg sm:rounded-2xl rounded-t-2xl border border-zinc-800 h-[100dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col"
                initial={{ opacity: 0, y: 5, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.985 }}
                transition={{ duration: 0.2, ease: MOTION_EASE }}
            >
                <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-zinc-800 flex justify-between items-center shrink-0">
                    <h3 className="text-xl font-bold text-white">{initialData ? copy.editClient : copy.newClient}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-full"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="px-4 py-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-7 flex-1 min-h-0">
                    {/* Section: Datos Básicos */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">{formCopy.personalData}</h4>
                         <div>
                             <input 
                                value={formData.name} 
                                onChange={e => {
                                    setFormData({...formData, name: e.target.value});
                                    if (errors.name) setErrors(prev => ({ ...prev, name: "" }));
                                }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                    errors.name ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                }`} 
                                placeholder={formCopy.fullName} 
                             />
                             {errors.name && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.name}</p>}
                         </div>
                         <div>
                                <input 
                                    value={formData.phone} 
                                    onChange={e => {
                                        setFormData({...formData, phone: e.target.value});
                                        if (errors.phone) setErrors(prev => ({ ...prev, phone: "" }));
                                    }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                        errors.phone ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                    }`} 
                                    placeholder={copy.clientPhonePlaceholder}
                                />
                                <p className="text-[11px] text-zinc-500 mt-1">{copy.phonePrimaryHint}</p>
                                {errors.phone && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.phone}</p>}
                         </div>
                         {/* Country Selector */}
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.country}</label>
                            <select 
                                value={formData.country} 
                                onChange={e => {
                                    setFormData({...formData, country: e.target.value});
                                    if (errors.country) setErrors(prev => ({ ...prev, country: "" }));
                                }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                    errors.country ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                }`}
                            >
                                <option value="">{formCopy.selectCountry}</option>
                                {COUNTRIES.map(c => <option key={c} value={c}>{language === 'en' && c === 'Perú' ? 'Peru' : c}</option>)}
                            </select>
                            {errors.country && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.country}</p>}
                         </div>
                    </div>

                    {/* Section: Perfil Físico */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">{formCopy.physicalProfile}</h4>
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.gender}</label>
                                <select 
                                    value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none"
                                >
                                    <option value="male">{formCopy.male}</option>
                                    <option value="female">{formCopy.female}</option>
                                    <option value="other">{formCopy.other}</option>
                                </select>
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.age}</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.age} onChange={e => { setFormData({...formData, age: e.target.value}); if (errors.age) setErrors(prev => ({ ...prev, age: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.age ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder={formCopy.years} 
                                />
                                {errors.age && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.age}</p>}
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.weight}</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.weight} onChange={e => { setFormData({...formData, weight: e.target.value}); if (errors.weight) setErrors(prev => ({ ...prev, weight: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.weight ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder="kg" 
                                />
                                {errors.weight && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.weight}</p>}
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.height}</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.height} onChange={e => { setFormData({...formData, height: e.target.value}); if (errors.height) setErrors(prev => ({ ...prev, height: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.height ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder="cm" 
                                />
                                {errors.height && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.height}</p>}
                             </div>
                         </div>
                         <div>
                             <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.experience}</label>
                             <select 
                                value={formData.experienceLevel} onChange={e => { setFormData({...formData, experienceLevel: e.target.value}); if (errors.experienceLevel) setErrors(prev => ({ ...prev, experienceLevel: "" })); }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors capitalize ${errors.experienceLevel ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`}
                             >
                                 <option value="beginner">{formCopy.beginner}</option>
                                 <option value="intermediate">{formCopy.intermediate}</option>
                                 <option value="advanced">{formCopy.advanced}</option>
                             </select>
                         </div>
                    </div>

                    {/* Section: Objetivos */}
                    <div className="space-y-4" id="error-container-goals">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">{formCopy.goals}</h4>
                         <div className={`voice-fill-card ${isListening ? 'is-listening' : ''} ${isOrganizingVoice ? 'is-processing' : ''}`}>
                            <div className="voice-fill-header">
                                <span className="voice-fill-icon" aria-hidden="true">
                                    {isOrganizingVoice ? <Loader2 className="animate-spin" size={20} /> : <Mic size={20} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h5>{formCopy.voiceTitle}</h5>
                                        {isListening && (
                                            <span className="voice-live-badge">
                                                <span />
                                                {formCopy.voiceLive}
                                                <time>{voiceElapsedLabel}</time>
                                            </span>
                                        )}
                                    </div>
                                    <p>{formCopy.voiceDescription}</p>
                                </div>
                            </div>

                            <AppButton
                                type="button"
                                onClick={isListening ? stopVoiceCapture : startVoiceCapture}
                                disabled={isOrganizingVoice}
                                variant={isListening ? 'danger' : 'secondary'}
                                className={`voice-capture-button w-full ${isListening ? 'is-active' : ''}`}
                                icon={isOrganizingVoice ? <Loader2 className="animate-spin" size={17} /> : isListening ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}
                            >
                                {isListening ? formCopy.stop : isOrganizingVoice ? formCopy.processingVoice : formCopy.dictate}
                            </AppButton>
                            <p className="voice-fill-hint">{formCopy.voiceHint}</p>

                            <AnimatePresence initial={false}>
                                {voiceModalOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0, y: -6 }}
                                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                                        exit={{ opacity: 0, height: 0, y: -6 }}
                                        transition={{ duration: 0.22, ease: MOTION_EASE }}
                                        className="voice-capture-panel"
                                    >
                                        <div className={`voice-status-row ${isListening ? 'is-live' : ''}`}>
                                            <span className="voice-status-dot" />
                                            <span>{isListening ? formCopy.voiceActive : isOrganizingVoice ? formCopy.voiceOrganizing : formCopy.voiceReview}</span>
                                            {!isListening && !isOrganizingVoice && (
                                                <button type="button" onClick={closeVoiceModal} className="voice-panel-close" aria-label={formCopy.cancel}>
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                        {voiceError && <p className="voice-error-message">{voiceError}</p>}
                                        <textarea
                                            value={voiceTranscript}
                                            onChange={e => setVoiceTranscript(e.target.value)}
                                            readOnly={isListening || isOrganizingVoice}
                                            className="voice-transcript"
                                            placeholder={isListening ? formCopy.recording : isOrganizingVoice ? formCopy.voiceOrganizing : formCopy.transcriptPlaceholder}
                                        />
                                        <div className="voice-panel-actions">
                                            <AppButton
                                                type="button"
                                                onClick={applyVoiceTranscript}
                                                disabled={isOrganizingVoice || isListening}
                                                variant="primary"
                                                className="w-full"
                                                icon={isOrganizingVoice ? <Loader2 className="animate-spin" size={14} /> : <Check size={15} />}
                                            >
                                                {formCopy.apply}
                                            </AppButton>
                                            <AppButton type="button" onClick={closeVoiceModal} disabled={isListening || isOrganizingVoice} variant="tertiary" className="w-full">
                                                {formCopy.cancel}
                                            </AppButton>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                         </div>
                         {errors.goals && <p className="text-red-500 text-xs font-semibold">{errors.goals}</p>}
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-2 block">{formCopy.primaryGoal}</label>
                            <div className={`flex flex-wrap gap-2 p-2 rounded-xl transition-all ${errors.goals ? 'border border-red-500 bg-red-950/10' : ''}`}>
                            {PRIMARY_GOALS.map(goal => {
                                const isSelected = formData.mainGoal === goal;
                                return (
                                    <button 
                                        type="button"
                                        key={goal}
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, mainGoal: goal }));
                                            if (errors.goals) setErrors(prev => ({ ...prev, goals: "" }));
                                        }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                            isSelected 
                                            ? 'bg-mvp-gold border-mvp-gold text-black' 
                                            : 'bg-black border-zinc-700 text-zinc-400 hover:border-zinc-500'
                                        }`}
                                    >
                                        {goalLabel(goal, language)}
                                    </button>
                                );
                            })}
                            </div>
                         </div>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-2 block">{formCopy.secondaryGoals}</label>
                            <div className="flex flex-wrap gap-2 p-2 rounded-xl">
                            {SECONDARY_GOALS.map(goal => {
                                const isSelected = formData.goals.includes(goal);
                                return (
                                    <button
                                        type="button"
                                        key={goal}
                                        onClick={() => toggleGoal(goal)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                            isSelected
                                            ? 'bg-zinc-100 border-zinc-100 text-black'
                                            : 'bg-black border-zinc-700 text-zinc-400 hover:border-zinc-500'
                                        }`}
                                    >
                                        {goalLabel(goal, language)}
                                    </button>
                                );
                            })}
                            </div>
                         </div>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.clientGoalSummary}</label>
                            <textarea
                                value={formData.clientGoalSummary}
                                onChange={e => setFormData({...formData, clientGoalSummary: e.target.value})}
                                className="w-full min-h-[86px] bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold resize-none text-sm"
                                placeholder={formCopy.clientGoalPlaceholder}
                            />
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.routineFocus}</label>
                                <input
                                    value={formData.routineFocus}
                                    onChange={e => setFormData({...formData, routineFocus: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold text-sm"
                                    placeholder={formCopy.routineFocusPlaceholder}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.dietFocus}</label>
                                <input
                                    value={formData.dietFocus}
                                    onChange={e => setFormData({...formData, dietFocus: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold text-sm"
                                    placeholder={formCopy.dietFocusPlaceholder}
                                />
                            </div>
                         </div>
                    </div>

                    {/* Section: Agenda */}
                    <div className="space-y-4" id="error-container-agenda">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">{formCopy.schedule}</h4>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-2 block">{formCopy.trainingDays}</label>
                            {errors.trainingDays && <p className="text-red-500 text-xs font-semibold mb-2">{errors.trainingDays}</p>}
                            <div className={`flex justify-between gap-1 p-2 rounded-xl transition-all ${errors.trainingDays ? 'border border-red-500 bg-red-950/10' : ''}`}>
                                {WEEKDAYS.map(day => {
                                    const isSelected = formData.trainingDays.includes(day);
                                    return (
                                        <button 
                                            type="button"
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all ${
                                                isSelected 
                                                ? 'bg-mvp-gold text-black scale-105' 
                                                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                                            }`}
                                        >
                                            {dayShortLabel(day, language)}
                                        </button>
                                    );
                                })}
                            </div>
                         </div>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.trainingTime}</label>
                            {errors.trainingTime && <p className="text-red-500 text-xs font-semibold mb-2">{errors.trainingTime}</p>}
                            <div className={`grid grid-cols-2 gap-3 p-1.5 rounded-xl transition-all ${errors.trainingTime ? 'border border-red-500 bg-red-950/10' : ''}`}>
                                <div className="bg-black border border-zinc-700 rounded-xl p-3 focus-within:border-mvp-gold transition-colors">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">{formCopy.start}</span>
                                    <input 
                                        type="time" 
                                        value={formData.trainingStartTime}
                                        onChange={e => {
                                            setFormData({...formData, trainingStartTime: e.target.value});
                                            if (errors.trainingTime) setErrors(prev => ({ ...prev, trainingTime: "" }));
                                        }}
                                        className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                    />
                                </div>
                                <div className="bg-black border border-zinc-700 rounded-xl p-3 focus-within:border-mvp-gold transition-colors">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">{formCopy.end}</span>
                                    <input 
                                        type="time" 
                                        value={formData.trainingEndTime}
                                        onChange={e => {
                                            setFormData({...formData, trainingEndTime: e.target.value});
                                            if (errors.trainingTime) setErrors(prev => ({ ...prev, trainingTime: "" }));
                                        }}
                                        className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                    />
                                </div>
                            </div>
                         </div>
                    </div>

                    {/* Section: Pago (Solo visible al crear, al editar se usa la tab de pagos) */}
                    {!initialData && (
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">{formCopy.paymentPlan}</h4>
                            <div>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                                    <input 
                                        type="number" 
                                        value={formData.fee} 
                                        onChange={e => {
                                            setFormData({...formData, fee: e.target.value});
                                            if (errors.fee) setErrors(prev => ({ ...prev, fee: "" }));
                                        }}
                                        className={`w-full bg-black border text-white rounded-xl pl-8 pr-4 py-3 outline-none transition-colors ${
                                            errors.fee ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                        }`} 
                                        placeholder={formCopy.monthlyFee} 
                                    />
                                </div>
                                {errors.fee && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.fee}</p>}
                            </div>
                        </div>
                    )}

                    {/* Section: Salud / notas opcionales */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">
                            {language === 'es' ? 'Salud y notas opcionales' : 'Health and optional notes'}
                         </h4>
                         <div>
                             <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{formCopy.medical}</label>
                             <textarea
                                value={formData.medicalNotes}
                                onChange={e => setFormData({...formData, medicalNotes: e.target.value})}
                                className="w-full min-h-[88px] bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold resize-none text-sm"
                                placeholder={formCopy.medicalPlaceholder}
                             />
                         </div>
                    </div>

                    {/* Section: Datos opcionales */}
                    <div className={`rounded-xl border ${errors.email ? 'border-red-500 bg-red-950/10' : 'border-zinc-800 bg-black/30'} overflow-hidden`}>
                        <button
                            type="button"
                            onClick={() => setOptionalDataOpen(prev => !prev)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                        >
                            <span>
                                <span className="block text-sm font-bold text-white">{copy.optionalData}</span>
                                <span className="block text-[11px] text-zinc-500 mt-0.5">{copy.optionalDataHint}</span>
                            </span>
                            <MotionChevron open={optionalDataOpen} size={18} className="text-zinc-500" />
                        </button>
                        <AccordionPanel isOpen={optionalDataOpen} className="px-4 pb-4">
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">{copy.clientEmailOptional}</label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={e => {
                                    setFormData({...formData, email: e.target.value});
                                    if (errors.email) setErrors(prev => ({ ...prev, email: "" }));
                                }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                    errors.email ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                }`}
                                placeholder={copy.clientEmailPlaceholder}
                            />
                            {errors.email && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.email}</p>}
                        </AccordionPanel>
                    </div>
                </form>

                <div className="px-4 py-4 sm:px-6 border-t border-zinc-800 grid grid-cols-2 gap-3 bg-zinc-900 sm:rounded-b-2xl shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    <AppButton type="button" onClick={onClose} variant="secondary" className="w-full">{formCopy.cancel}</AppButton>
                    <AppButton type="button" onClick={handleSubmit} disabled={isListening || isOrganizingVoice} variant="primary" className="w-full">
                        {initialData ? formCopy.saveChanges : formCopy.createClient}
                    </AppButton>
                </div>
            </motion.div>
        </motion.div>
    );
};

// --- MAIN APP COMPONENT ---

// --- CONSTANTS & HELPERS ---
const GLOBAL_AUTH_INIT = { startedAt: 0 };

const App = () => {
  const [language, setLanguageState] = useState<AppLanguage>(() => getStoredLanguage());
  const [entitlementNow, setEntitlementNow] = useState(() => new Date());
  const [clientListFilter, setClientListFilter] = useState<'active' | 'paused' | 'inactive'>('active');
  const isResetPasswordRoute = typeof window !== 'undefined' && window.location.pathname === '/reset-password';

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    try {
      document.documentElement.lang = nextLanguage;
      window.localStorage.setItem('mvptrainer_language', nextLanguage);
    } catch {
      // The active language still changes when browser persistence is unavailable.
    }
  };

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch {
      // Some embedded previews expose a read-only document language.
    }
  }, [language]);

  useEffect(() => {
    const timer = window.setInterval(() => setEntitlementNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  
  // Realtime subscription guards to prevent multiple concurrent channels
  const realtimeSubscribedRef = useRef<string | null>(null);
  const realtimeUnsubscribeRef = useRef<(() => void) | null>(null);
  const lastAuthEventLogRef = useRef<string>('');
  
  // 1. Auth Cache Persistence - Load from storage early
  const [user, _setUserRaw] = useState<AppUser | null>(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) {
        if ((import.meta as any).env?.DEV) {
          appLog("AUTH CACHE RESTORED");
        }
        return markSubscriptionSyncing(JSON.parse(cached));
      }
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
        console.warn("Failed to load cached user", e);
      }
    }
    return null;
  });

  const setUser = (newValue: any) => {
    _setUserRaw(prev => {
      const resolvedNewUser = typeof newValue === 'function' ? newValue(prev) : newValue;
      if (!prev && !resolvedNewUser) {
        return null;
      }
      if (prev && resolvedNewUser) {
        const stableUser = mergeUserWithLastConfirmedPlan(prev, resolvedNewUser);
        const isIdentical = JSON.stringify(prev) === JSON.stringify(stableUser);
        if (isIdentical) {

          return prev;
        }
        return stableUser;
      }
      return resolvedNewUser;
    });
  };

  const [clients, _setClientsRaw] = useState<Client[]>(() => {
    if (!shouldRestoreClientsCache()) return [];
    try {
      const cachedUserString = localStorage.getItem('mvptrainer_cached_user');
      if (cachedUserString) {
        const cachedUser = JSON.parse(cachedUserString);
        if (cachedUser?.uid) {
          const cachedClients = localStorage.getItem(getClientsCacheKey(cachedUser.uid));
          if (cachedClients) {
            if ((import.meta as any).env?.DEV) {
              appLog("CLIENTS CACHE RESTORED FOR OFFLINE MODE");
            }
            return parseCachedClients(cachedClients);
          }
        }
      }
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
        console.warn("Failed to load cached clients", e);
      }
    }
    return [];
  });
  const [billingRecords, setBillingRecords] = useState<BillingRecord[]>([]);

  const setClients = (newValue: any) => {
    _setClientsRaw(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      if (JSON.stringify(prev) === JSON.stringify(resolved)) {
        return prev;
      }
      try {
        const activeUser = latestUserRef.current;
        if (activeUser?.uid && Array.isArray(resolved)) {
          localStorage.setItem(getClientsCacheKey(activeUser.uid), JSON.stringify({
            data: resolved,
            cachedAt: new Date().toISOString()
          }));
        }
      } catch (e) {
        if ((import.meta as any).env?.DEV) {
          console.warn("Failed to write clients cache", e);
        }
      }
      return resolved;
    });
  };

  const [loading, _setLoadingRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return false; // Instantly load if user exists in cache
    } catch (e) {}
    return true;
  });
  const setLoading = (val: boolean) => {
    _setLoadingRaw(prev => prev === val ? prev : val);
  };

  const [isSyncingSession, _setIsSyncingSessionRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return true; // Start with syncing active if we are displaying cache
    } catch (e) {}
    return false;
  });
  const setIsSyncingSession = (val: boolean) => {
    _setIsSyncingSessionRaw(prev => prev === val ? prev : val);
  };

  const [authChecked, _setAuthCheckedRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return true; // Instantly mark checked if cache exists
    } catch (e) {}
    return false;
  });
  const setAuthChecked = (val: boolean) => {
    _setAuthCheckedRaw(prev => prev === val ? prev : val);
  };

  const hasInitializedAuth = useRef(false);
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isReconnecting, _setIsReconnectingRaw] = useState(false);
  const setIsReconnecting = (val: boolean) => {
    _setIsReconnectingRaw(prev => prev === val ? prev : val);
  };

  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  const lastValidUserRef = useRef<AppUser | null>(user);
  const stableTrainerIdRef = useRef<string | null>(user?.uid || null);

  const [clientsLoading, _setClientsLoadingRaw] = useState(() => {
    if (!shouldRestoreClientsCache()) return true;
    try {
      const cachedUser = localStorage.getItem('mvptrainer_cached_user');
      if (cachedUser) {
        const pars = JSON.parse(cachedUser);
        if (pars?.uid) {
          const cachedClients = localStorage.getItem(getClientsCacheKey(pars.uid));
          if (parseCachedClients(cachedClients).length > 0) {
            return false; // Offline fallback can show cached clients.
          }
        }
      }
    } catch (e) {}
    return true;
  });
  const setClientsLoading = (val: boolean) => {
    _setClientsLoadingRaw(prev => prev === val ? prev : val);
  };

  // Keep track of successful initial load of clients
  const clientsLoadedOnceRef = useRef(false);
  const fastClientsLoadRef = useRef<string | null>(null);

  const latestUserRef = useRef<AppUser | null>(user);
  const latestClientsRef = useRef<Client[]>(clients);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  useEffect(() => {
    latestClientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    if (clients && clients.length >= 0 && authChecked && user) {
      clientsLoadedOnceRef.current = true;
    }
  }, [clients, authChecked, user]);

  // Network connection listener (online/offline)
  useEffect(() => {
    const handleOnline = () => {
      appLog("App online network restored");
      setIsReconnecting(false);
    };
    const handleOffline = () => {
      appLog("App offline network lost");
      if (clientsLoadedOnceRef.current) {
        setIsReconnecting(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine && clientsLoadedOnceRef.current) {
      setIsReconnecting(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (user) {
      lastValidUserRef.current = user;
      stableTrainerIdRef.current = user.uid;
    }
  }, [user]);

  const [authStatus, _setAuthStatusRaw] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'degraded'>('loading');
  const setAuthStatus = (val: 'loading' | 'authenticated' | 'unauthenticated' | 'degraded') => {
    _setAuthStatusRaw(prev => prev === val ? prev : val);
  };
  const [view, setView] = useState<'dashboard' | 'client' | 'account' | 'day' | 'payments'>('dashboard');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientInitialTab, setClientInitialTab] = useState<TabType>('profile');
  const [isPlanAiModalOpen, setIsPlanAiModalOpen] = useState(false);
  const [planAiInitialType, setPlanAiInitialType] = useState<'routine' | 'diet'>('routine');
  const [clientAutoGenerateRequest, setClientAutoGenerateRequest] = useState<{ type: 'routine' | 'diet'; id: number } | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [toast, setToast] = useState<any>(null);

  const handleLogout = async () => {
    if ((import.meta as any).env?.DEV) {
      appLog("REAL SIGN OUT initiated manually.");
    }
    if (user?.uid) {
      try {
        localStorage.removeItem(`mvptrainer_cached_clients_${user.uid}`);
      } catch (e) {}
    }
    clearStaleUserCache(user?.uid);
    lastValidUserRef.current = null;
    stableTrainerIdRef.current = null;
    if (realtimeUnsubscribeRef.current) {
      realtimeUnsubscribeRef.current();
      realtimeUnsubscribeRef.current = null;
      realtimeSubscribedRef.current = null;
    }
    clientsLoadedOnceRef.current = false;
    fastClientsLoadRef.current = null;
    _setClientsRaw([]);
    setBillingRecords([]);
    setUser(null);
    setAuthStatus('unauthenticated');
    await dbProvider.signOut();
  };

  // Public Route Handling Check
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  const [publicTrainerId, setPublicTrainerId] = useState<string | null>(null);

  // Check URL on load for public profile or checkout redirections
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trainerId = urlParams.get('trainerId');
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
        appLog("Returned from payment success! Clearing stale user cache...");
        clearStaleUserCache();
        // Limpiar URL para no re-ejecutar en subsecuentes recargas
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    if (trainerId) {
        setIsPublicRoute(true);
        setPublicTrainerId(trainerId);
        setLoading(false); // Stop loading main app
    }
  }, []);

  // Auth & Data Subscription (Only if NOT public route)
  useEffect(() => {
    if (isPublicRoute) return;
    
    let mounted = true;

    const initAuth = async () => {
      GLOBAL_AUTH_INIT.startedAt = Date.now();
      if ((import.meta as any).env?.DEV) {
          appLog("AUTH INIT START");
      }
      
      const timeoutId = setTimeout(() => {
        if (mounted) {
          if ((import.meta as any).env?.DEV) {
              appLog("AUTH INIT TIMEOUT RECOVERED: using cache if available");
          }
          if (!navigator.onLine) {
            setIsReconnecting(true);
          }
          if (user) {
            setLoading(false);
            setAuthChecked(true);
          }
        }
      }, 3500);

      const safetyTimeout = new Promise(resolve => 
        setTimeout(() => resolve("timeout"), 12000)
      );

      try {
        if ((import.meta as any).env?.DEV) {
            appLog("App init: Starting race...");
        }
        const result = await Promise.race([
          dbProvider.getCurrentUser(true),
          safetyTimeout
        ]);

        if (!mounted) {
            if ((import.meta as any).env?.DEV) {
                appLog("AUTH INIT: Component unmounted during init, ignoring result");
            }
            return;
        }

        if ((import.meta as any).env?.DEV) {
            appLog("AUTH INIT RESULT:", result === "timeout" ? "TIMEOUT" : (result ? "User found" : "No user"));
        }

        if (result === "timeout") {
          if ((import.meta as any).env?.DEV) {
              appLog("AUTH INIT TIMEOUT: App survived. Keeping cache.");
          }
          if (!navigator.onLine) {
            setIsReconnecting(true);
          }
          setIsRecoveringSession(true);
          if (!user) {
            setAuthStatus('degraded');
          } else {
             setAuthStatus('authenticated');
          }
          setAuthChecked(true);
          setLoading(false);
          setUser((current: AppUser | null) => current ? markSubscriptionSyncFailed(current) : current);
          return;
        }

        clearTimeout(timeoutId);
        setIsReconnecting(false);

        if (result) {
          if ((import.meta as any).env?.DEV) {
              appLog("AUTH INIT: User found, setting authenticated");
          }
          const now = new Date();
          let normalizedUser = normalizeSubscription(result as any, now);
          normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
          
          setUser(normalizedUser);
          localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
          
          setAuthStatus('authenticated');
          applyBrandingToTheme(normalizedUser.branding);
          requestNotificationPermission();
        } else {
          // Si getSession/getCurrentUser falla pero ya hay un usuario en caché local, NO destruirlo
          const cached = localStorage.getItem('mvptrainer_cached_user');
          if (cached) {
            if ((import.meta as any).env?.DEV) {
              appLog("TEMP SESSION LOSS IGNORED: No user returned during init, but active cached session found. Keeping state.");
            }
            if (!navigator.onLine) {
              setIsReconnecting(true);
            }
            setIsRecoveringSession(true);
            setAuthStatus('authenticated');
            setUser((current: AppUser | null) => current ? markSubscriptionSyncFailed(current) : current);
          } else {
            if ((import.meta as any).env?.DEV) {
                appLog("AUTH INIT (REAL NULL): No user found and no local cache, setting unauthenticated");
            }
            setUser(null);
            localStorage.removeItem('mvptrainer_cached_user');
            setAuthStatus('unauthenticated');
          }
        }
      } catch (error) {
        if ((import.meta as any).env?.DEV) {
            console.error("AUTH INIT ERROR:", error);
        }
        setUser((current: AppUser | null) => current ? markSubscriptionSyncFailed(current) : current);
      } finally {
        if (mounted) {
          setAuthChecked(true);
          setLoading(false);
          setIsSyncingSession(false);
        }
      }
    };

    initAuth();

    // Suscripción permanente a cambios de auth
    const unsubAuth = dbProvider.onAuthStateChanged((u, event) => {
      if (!mounted) return;
      if ((import.meta as any).env?.DEV) {
          const authLogKey = `${event}:${u?.uid || 'none'}`;
          if (event !== 'SIGNED_IN' || lastAuthEventLogRef.current !== authLogKey) {
              appLog(`AUTH EVENT (Live): ${event}`, u ? "User found" : "No user");
              lastAuthEventLogRef.current = authLogKey;
          }
      }
      
      if (u) {

          // Si llega un usuario válido, cancelamos cualquier flag de reconexión/recuperación
          if (isRecoveringSession || isReconnecting) {
              if ((import.meta as any).env?.DEV) {
                  appLog("SESSION RECOVERED: Connection/session re-established successfully.");
              }
          }
          setIsReconnecting(false);
          setIsRecoveringSession(false);

          const now = new Date();
          let normalizedUser = normalizeSubscription(u, now);
          normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
          
          setUser(normalizedUser);
          localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
          setAuthStatus('authenticated');
          setAuthChecked(true);
          setLoading(false);
      } else {
          // Si u es null, evaluamos según la regla estricta:
          // SOLO ejecutar logout cuando event === "SIGNED_OUT" o "USER_DELETED"
          if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
              if ((import.meta as any).env?.DEV) {
                  appLog("REAL SIGN OUT: Auth system confirms exit event.");
              }
              const currentUserId = latestUserRef.current?.uid;
              if (currentUserId) {
                try {
                  localStorage.removeItem(`mvptrainer_cached_clients_${currentUserId}`);
                } catch(e) {}
              }
              if (realtimeUnsubscribeRef.current) {
                realtimeUnsubscribeRef.current();
                realtimeUnsubscribeRef.current = null;
                realtimeSubscribedRef.current = null;
              }
              setUser(null);
              _setClientsRaw([]);
              setBillingRecords([]);
              localStorage.removeItem('mvptrainer_cached_user');
              lastValidUserRef.current = null;
              stableTrainerIdRef.current = null;
              setAuthStatus('unauthenticated');
              setAuthChecked(true);
              setLoading(false);
              setIsReconnecting(false);
              setIsRecoveringSession(false);
          } else {
              // Cualquier otro tipo de evento (flickers, reconnect, timeout, token_refreshed, initial_session null, unknown)
              if ((import.meta as any).env?.DEV) {
                  appLog(`TEMP SESSION LOSS IGNORED: Event ${event} reported session status change, but SIGNED_OUT was not received. Keeping local state active.`);
              }
              // Solo activar reconnect ante pérdida REAL de red (offline)
              if (!navigator.onLine) {
                  setIsReconnecting(true);
              }
              setIsRecoveringSession(true);
              setAuthChecked(true);
              setLoading(false);
          }
      }
    });

    return () => {
        mounted = false;
        unsubAuth();
    };
  }, [isPublicRoute]);

  useEffect(() => {
    if (!user?.uid || isPublicRoute) return;

    const trainerId = user.uid;
    if (fastClientsLoadRef.current === trainerId && clientsLoadedOnceRef.current) return;

    let cancelled = false;
    const startedAt = performance.now();
    fastClientsLoadRef.current = trainerId;

    if (latestClientsRef.current.length === 0) {
      setClientsLoading(true);
    }

    dbProvider.getClients(trainerId)
      .then((freshClients) => {
        if (cancelled) return;
        setClients(freshClients);
        clientsLoadedOnceRef.current = true;
        setClientsLoading(false);
        setIsSyncingSession(false);
        setIsRecoveringSession(false);
        setIsReconnecting(false);
        if ((import.meta as any).env?.DEV) {
          appLog("CLIENTS FAST LOAD DONE", {
            count: freshClients.length,
            ms: Math.round(performance.now() - startedAt)
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        fastClientsLoadRef.current = null;
        setClientsLoading(false);
        if ((import.meta as any).env?.DEV) {
          console.error("CLIENTS FAST LOAD FAILED", error);
        }
        if (!navigator.onLine) {
          setIsReconnecting(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, isPublicRoute]);

  useEffect(() => {
    const trainerId = user?.uid;
    if (!trainerId || isPublicRoute) {
      setBillingRecords([]);
      return;
    }

    let cancelled = false;
    setBillingRecords(current =>
      current.some(record => record.trainerId !== trainerId) ? [] : current
    );

    dbProvider.getBillingRecords(trainerId)
      .then(records => {
        if (!cancelled) setBillingRecords(records);
      })
      .catch(error => {
        if (!cancelled && (import.meta as any).env?.DEV) {
          console.warn('BILLING RECORDS LOAD FAILED: keeping the last confirmed ledger', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, isPublicRoute]);

  useEffect(() => {
    const trainerId = user?.uid;
    if (!trainerId || isPublicRoute) {
      if (realtimeUnsubscribeRef.current) {
        if ((import.meta as any).env?.DEV) {
          appLog("REALTIME CLEANUP: no active trainer ID or public route");
        }
        realtimeUnsubscribeRef.current();
        realtimeUnsubscribeRef.current = null;
        realtimeSubscribedRef.current = null;
      }
      return;
    }

    if (realtimeSubscribedRef.current === trainerId) {
      if ((import.meta as any).env?.DEV) {
        appLog("REALTIME: already active for stable ID, skipping re-subscription:", trainerId);
      }
      return;
    }

    if (realtimeUnsubscribeRef.current) {
      if ((import.meta as any).env?.DEV) {
        appLog("REALTIME: trainer ID changed, cleaning up existing channel...");
      }
      realtimeUnsubscribeRef.current();
    }

    if ((import.meta as any).env?.DEV) {
      appLog("REALTIME KEPT ALIVE: Subscribing to clients for stable trainer ID:", trainerId);
    }
    
    if (!clientsLoadedOnceRef.current && latestClientsRef.current.length === 0) {
      setClientsLoading(true);
    }

    const unsubClients = dbProvider.subscribeToClients(
      trainerId, 
      (data) => {
        setClients(data);
        setClientsLoading(false);
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          setIsReconnecting(false);
          setClientsLoading(false);
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          if (clientsLoadedOnceRef.current) {
            setIsReconnecting(true);
          }
          setClientsLoading(false);
        }
      }
    );
    realtimeSubscribedRef.current = trainerId;
    realtimeUnsubscribeRef.current = unsubClients;

    return () => {
      // Intentionally bypassed to maintain live connection across React StrictMode & normal views re-rendering
      // Complete teardown of subscriptions ONLY happens on real LOGOUT (SIGNED_OUT/USER_DELETED) or real trainer ID changes.
    };
  }, [user?.uid, isPublicRoute]);

  // Auto-clear reconnecting banner if user is valid, clients are loaded, and app is operational
  useEffect(() => {
    if (user && clients && clients.length >= 0 && isReconnecting) {
      const timer = setTimeout(() => {
        setIsReconnecting(false);
        setIsRecoveringSession(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user, clients, isReconnecting]);

  // REMINDER ENGINE
  useEffect(() => {
    if (!user || clients.length === 0 || isPublicRoute) return;
    
    // Correr inmediatamente
    checkReminders(user, clients, setToast);

    // Correr cada minuto
    const interval = setInterval(() => {
        checkReminders(user, clients, setToast);
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [user, clients, isPublicRoute]);

  // RENDER PUBLIC PAGE
  if (isPublicRoute && publicTrainerId) {
      return <TrainerPublicPage trainerId={publicTrainerId} language={language} />;
  }

  const refreshBillingRecords = async (trainerId = user?.uid) => {
      if (!trainerId) {
          setBillingRecords([]);
          return;
      }
      try {
          const records = await dbProvider.getBillingRecords(trainerId);
          setBillingRecords(records);
      } catch (error) {
          if ((import.meta as any).env?.DEV) {
              console.warn('BILLING RECORDS REFRESH FAILED: keeping last confirmed ledger', error);
          }
      }
  };

  const handleSaveClient = async (formData: any) => {
      if (!user) {
          console.error("CREATE CLIENT ERROR: No user session");
          setToast({ title: APP_COPY[language].createErrorTitle, message: APP_COPY[language].createNoSession, type: 'error' });
          return;
      }

      if (editingClient) {
          // UPDATE MODE
          try {
              await dbProvider.updateClient(editingClient.id, formData);
              const updated = { ...editingClient, ...formData };
              
              // Actualizar estado local inmediatamente
              setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
              await refreshBillingRecords(user.uid);
              
              setSelectedClient(updated);
              setToast({ title: APP_COPY[language].updateSuccessTitle, message: APP_COPY[language].updateSuccessMessage, type: 'success' });
              setIsClientModalOpen(false);
              setEditingClient(null);
          } catch (e) {
              console.error("UPDATE CLIENT ERROR:", e);
              setToast({ title: APP_COPY[language].createErrorTitle, message: APP_COPY[language].updateErrorMessage, type: 'error' });
          }
      } else {
          // CREATE MODE with Limit Check
          const check = canUseFeature(user, 'createClient');
          if (!check.allowed) {
              appLog("CREATE CLIENT FAILED: Limit reached", check.reason);
              setShowPaywall(true);
              if (check.reason) setToast({ title: APP_COPY[language].limitReachedTitle, message: check.reason, type: 'warning' });
              return;
          }

          try {
              appLog("CALLING createClient", formData);
              const newClient = await dbProvider.createClient(user.uid, formData);
              const updatedUsage = (newClient as any).updatedUsage;
              const cleanClient = { ...newClient };
              delete (cleanClient as any).updatedUsage;
              appLog("CREATE CLIENT SUCCESS", cleanClient);
              
              // Actualizar estado local inmediatamente (Opción B)
              setClients(prev => [cleanClient, ...prev]);
              await refreshBillingRecords(user.uid);
              appLog("CLIENTS AFTER INSERT:", [cleanClient, ...clients]);

              // Incrementar contador local de clientes creados para reaccionar inmediatamente en la UI
              const updatedUser = {
                  ...user,
                  trainerUsage: updatedUsage || user.trainerUsage
              } as any;
              setUser(updatedUser);
              localStorage.setItem('mvptrainer_cached_user', JSON.stringify(updatedUser));

              setIsClientModalOpen(false);
              setToast({ title: APP_COPY[language].updateSuccessTitle, message: APP_COPY[language].createSuccessMessage, type: 'success' });
          } catch (e) {
              console.error("CREATE CLIENT ERROR:", e);
              setToast({ title: APP_COPY[language].createErrorTitle, message: APP_COPY[language].createErrorMessage, type: 'error' });
          }
      }
  };

  const handleDeleteClient = (clientId: string) => {
    setConfirmConfig({
        isOpen: true,
        title: "¿Eliminar cliente?",
        message: "¿Seguro que deseas eliminar este cliente? Se mantendrá en el historial pero no aparecerá en tu lista principal.",
        type: 'danger',
        onConfirm: () => executeDeleteClient(clientId)
    });
  };

  const executeDeleteClient = async (clientId: string) => {
    appLog("HANDLE DELETE CLIENT START:", clientId);
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));

    try {
        setToast({ title: "Eliminando...", message: "Procesando baja del cliente", type: 'info' });
        await dbProvider.deleteClient(clientId);
        appLog("HANDLE DELETE CLIENT SUCCESS:", clientId);
        
        // Actualizar estado local inmediatamente
        setClients(prev => prev.filter(c => c.id !== clientId));
        setView('dashboard');
        setSelectedClient(null);
        
        setToast({ title: "Cliente Eliminado", message: "El cliente ha sido archivado correctamente", type: 'success' });
        
        // Re-fetch explícito de clientes para asegurar sincronización
        if (user) {
            const refreshed = await dbProvider.getClients(user.uid);
            setClients(refreshed);
            
            // Forzar actualización del perfil de entrenador para sincronizar límites e historial sin caché obsoleta
            try {
                const freshUser = await dbProvider.getCurrentUser(true);
                if (freshUser) {
                    const now = new Date();
                    let normalizedUser = normalizeSubscription(freshUser, now);
                    normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
                    setUser(normalizedUser);
                    localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
                    appLog("USER PROFILE SYNC AFTER DELETE SUCCESSFUL");
                }
            } catch (err) {
                console.warn("Could not force refresh user profile after delete:", err);
            }
        }
    } catch (e) {
        console.error("HANDLE DELETE CLIENT ERROR:", e);
        setToast({ title: "Error", message: "No se pudo eliminar el cliente. Verifica tu conexión.", type: 'error' });
    }
  };

  const handleClientUpdate = async (data: Partial<Client>) => {
      if (selectedClient) {
          const localOnlyKeys = ['routines', 'dietPlan', 'dietPlans'];
          const shouldPersist = Object.keys(data).some(key => !localOnlyKeys.includes(key));
          if (shouldPersist) {
              await dbProvider.updateClient(selectedClient.id, data);
              if (data.paymentInfo) {
                  await refreshBillingRecords(user?.uid);
              }
          }
          const updated = { ...selectedClient, ...data };
          setSelectedClient(updated);
          setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
  };

  const handleCalendarPaymentUpdate = async (client: Client, paymentInfo: ClientPaymentInfo) => {
      await dbProvider.updateClient(client.id, { paymentInfo });
      await refreshBillingRecords(user?.uid);
      const updated = { ...client, paymentInfo };
      setClients(prev => prev.map(item => item.id === updated.id ? updated : item));
      setSelectedClient(current => current?.id === updated.id ? updated : current);
  };
  
  const handleUserUpdate = (updatedUser: AppUser) => {
      setUser(updatedUser);
      localStorage.setItem('mvptrainer_cached_user', JSON.stringify(updatedUser));
      // Actualizar tema inmediatamente si se actualiza el usuario (ej. branding)
      if (updatedUser.branding) {
          applyBrandingToTheme(updatedUser.branding);
      }
  };

  if (loading || !authChecked) {
    return (
      <>
        <DevViewportSwitcher />
        <AppSplashScreen isReconnecting={isReconnecting} language={language} />
      </>
    );
  }

  if (authStatus === 'degraded' && !user && !isPublicRoute) {
    return (
      <>
        <DevViewportSwitcher />
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="text-center max-w-sm animate-fadeIn">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
                    <AlertTriangle size={32} className="text-amber-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Error de Conexión</h2>
                <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                    Estamos teniendo problemas para verificar tu sesión. Esto puede deberse a una conexión inestable o restricciones de red.
                </p>
                <div className="space-y-3">
                    <button 
                        onClick={() => window.location.reload()} 
                        className="w-full bg-mvp-gold text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-mvp-gold/20"
                    >
                        <Zap size={18}/> Reintentar conexión
                    </button>
                    <button 
                        onClick={() => setAuthStatus('unauthenticated')} 
                        className="w-full bg-zinc-900 text-zinc-400 font-bold py-3 rounded-xl hover:text-white transition-colors"
                    >
                        Ir al login directamente
                    </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-8 uppercase tracking-widest">MVP Trainer Pro Safety System</p>
            </div>
        </div>
      </>
    );
  }

  // Overlay de Reconexión (si tenemos usuario pero la red falla)
  const ReconnectingOverlay = () => (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 border border-amber-500/30 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl shadow-black"
      >
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <p className="text-white text-sm font-medium">{APP_COPY[language].reconnecting}</p>
      </motion.div>
  );
  
  if (isResetPasswordRoute || !user) {
    return (
      <>
        <DevViewportSwitcher />
        <AuthView
          onLoginSuccess={setUser}
          language={language}
          onLanguageChange={setLanguage}
          initialMode={isResetPasswordRoute ? 'reset' : 'login'}
        />
      </>
    );
  }

  const showReconnecting = isReconnecting && (loading || !realtimeSubscribedRef.current);
  const appCopy = APP_COPY[language];
  const hasAccess = hasFullAccess(user, entitlementNow);
  const accessLocked = isSubscriptionLocked(user, entitlementNow);
  const trialDaysRemaining = getTrialDaysRemaining(user, entitlementNow);
  const activeClients = clients.filter(isActiveClient);
  const pausedClients = clients.filter(client => client.status === 'paused');
  const finishedClients = clients.filter(client => client.status === 'inactive');
  const visibleClients = clientListFilter === 'paused'
    ? pausedClients
    : clientListFilter === 'inactive'
      ? finishedClients
      : activeClients;
  const todaySchedule = getDaySchedule(activeClients);
  const todayTrainingClients = todaySchedule.sessions.map(session => session.client);
  const actionableTodaySessions = todaySchedule.sessions.filter(session => session.status !== 'completed');
  const paymentAttentionClients = activeClients
    .filter(client => needsPaymentAttention(client))
    .sort((a, b) => (getPaymentDiffDays(a) ?? 99) - (getPaymentDiffDays(b) ?? 99));
  const attentionClientIds = new Set(paymentAttentionClients.map(client => client.id));
  const todaySummary = todayTrainingClients.length === 0 && paymentAttentionClients.length === 0
    ? (language === 'es' ? 'Hoy no tienes entrenamientos ni cobros urgentes' : 'You have no urgent workouts or payments today')
    : language === 'es'
      ? `Hoy tienes ${todayTrainingClients.length} entrenamiento${todayTrainingClients.length === 1 ? '' : 's'} y ${paymentAttentionClients.length} cobro${paymentAttentionClients.length === 1 ? '' : 's'} pendiente${paymentAttentionClients.length === 1 ? '' : 's'}`
      : `Today you have ${todayTrainingClients.length} workout${todayTrainingClients.length === 1 ? '' : 's'} and ${paymentAttentionClients.length} pending payment${paymentAttentionClients.length === 1 ? '' : 's'}`;
  const getPriorityPhone = (client: Client) => normalizeWhatsAppPhone(client.phone);
  const buildTrainingReminder = (client: Client) => language === 'es'
    ? `Hola ${client.name} ${EMOJI.wave} te recuerdo que hoy tenemos entrenamiento a las ${client.trainingTime || 'la hora acordada'}. Nos vemos puntual ${EMOJI.muscle}`
    : `Hi ${client.name} ${EMOJI.wave} this is a reminder that we have training today at ${client.trainingTime || 'the agreed time'}. See you on time ${EMOJI.muscle}`;
  const openPriorityWhatsApp = (client: Client, message: string) => {
    if (!hasAccess) {
      setShowPaywall(true);
      return;
    }
    const phone = getPriorityPhone(client);
    if (!phone) {
      setToast({ title: appCopy.noPhoneTitle, message: appCopy.noPhoneSend, type: 'warning' });
      return;
    }
    window.open(buildWhatsAppUrl(phone, message), '_blank');
  };
  const openPriorityChat = (client: Client) => {
    if (!hasAccess) {
      setShowPaywall(true);
      return;
    }
    const phone = getPriorityPhone(client);
    if (!phone) {
      setToast({ title: appCopy.noPhoneTitle, message: appCopy.noPhoneOpen, type: 'warning' });
      return;
    }
    window.open(buildWhatsAppUrl(phone), '_blank');
  };
  const nextItems = [
    ...actionableTodaySessions.slice(0, 1).map(session => ({
      id: `training-${session.id}`,
      kind: 'training' as const,
      client: session.client,
      label: `${session.client.name} - ${formatSessionCountdown(session, language)}`,
      message: buildTrainingReminder(session.client)
    })),
    ...paymentAttentionClients.slice(0, 2).map(client => ({
      id: `payment-${client.id}`,
      kind: 'payment' as const,
      client,
      label: `${client.name} - ${formatPaymentTimeline(client, language)}`,
      message: buildPaymentReminderText(client, language)
    }))
  ].slice(0, 3);

  const openClientDetail = (client: Client, tab: TabType = 'profile') => {
    const check = canUseFeature(user, 'viewClientDetails');
    if (!check.allowed) {
      setShowPaywall(true);
      setToast({ title: appCopy.proAccess, message: check.reason, type: 'warning' });
      return;
    }
    setSelectedClient(client);
    setClientInitialTab(tab);
    setClientAutoGenerateRequest(null);
    setView('client');
  };

  const handleQuickCreateClient = () => {
    const check = canUseFeature(user, 'createClient');
    if (!check.allowed) {
      setShowPaywall(true);
      setToast({ title: appCopy.limitReachedTitle, message: check.reason || appCopy.clientLimitReached, type: 'warning' });
      return;
    }
    setEditingClient(null);
    setIsClientModalOpen(true);
  };

  const handleQuickAIAction = (type: 'routine' | 'diet' = 'routine') => {
    setPlanAiInitialType(type);
    setIsPlanAiModalOpen(true);
  };

  const handlePlanAiGenerate = (target: Client, type: 'routine' | 'diet') => {
    const feature = type === 'routine' ? 'generateRoutine' : 'generateDiet';
    const check = canUseFeature(user, feature, { clientId: target.id });
    if (!check.allowed) {
      setShowPaywall(true);
      setToast({ title: appCopy.limitReachedTitle, message: check.reason || appCopy.aiLimitReached, type: 'warning' });
      return;
    }
    setSelectedClient(target);
    setClientInitialTab(type === 'routine' ? 'routines' : 'nutrition');
    setClientAutoGenerateRequest({ type, id: Date.now() });
    setIsPlanAiModalOpen(false);
    setView('client');
  };

  const handleQuickPayment = () => {
    const check = canUseFeature(user, 'payments');
    if (!check.allowed) {
      setShowPaywall(true);
      setToast({ title: appCopy.proAccess, message: check.reason, type: 'warning' });
      return;
    }
    const target = paymentAttentionClients[0] || activeClients[0];
    if (target) {
      openClientDetail(target, 'payments');
    } else {
      setView('payments');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      <DevViewportSwitcher />
      {showReconnecting && <ReconnectingOverlay />}
      <AnimatePresence>
        {toast && <Toast key={`${toast.type}-${toast.title}-${toast.message}`} {...toast} onClose={() => setToast(null)} />}
      </AnimatePresence>
      <AnimatePresence>
      {showPaywall && <PaywallPro onClose={() => setShowPaywall(false)} user={user} onShowToast={(t: any) => setToast(t)} language={language} />}
      </AnimatePresence>
      <AnimatePresence>
      {isPlanAiModalOpen && (
        <PlanAIModal
          clients={activeClients}
          onClose={() => setIsPlanAiModalOpen(false)}
          onCreateClient={handleQuickCreateClient}
          onGenerate={handlePlanAiGenerate}
          initialType={planAiInitialType}
          language={language}
        />
      )}
      </AnimatePresence>
      
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        type={confirmConfig.type}
      />

      {/* Header */}
      <header className="trainer-brand-header p-4 border-b flex justify-between items-center backdrop-blur-md z-10">
         <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            {user.branding?.logoUrl ? (
                <img src={user.branding.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10" />
            ) : (
                <MVPBrandLogo className="w-9 h-9 rounded-xl bg-black/30 border border-mvp-gold/20 p-0.5" />
            )}
            
            <span className="font-bold tracking-tighter hidden md:inline truncate max-w-[150px]">
                {user.branding?.brandName || (
                    <>MVP<span className="text-mvp-gold">TRAINER</span></>
                )}
            </span>
            {isSyncingSession && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-[10px] text-amber-400 font-semibold border border-amber-500/20 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    {appCopy.sync}
                </span>
            )}
         </div>
         <div className="flex items-center gap-3">
             {trialDaysRemaining !== null && (
                <button
                  onClick={() => setView('account')}
                  className="hidden sm:inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-violet-400/25 bg-violet-500/10 text-xs font-bold text-violet-200"
                  title={language === 'es' ? 'Ver estado de la prueba' : 'View trial status'}
                >
                  <Timer size={15} />
                  {language === 'es' ? `${trialDaysRemaining} días de prueba` : `${trialDaysRemaining} trial days`}
                </button>
             )}
             <IconButton
                active={view === 'day'}
                onClick={() => {
                    const check = canUseFeature(user, 'agenda');
                    if (!check.allowed) {
                        setShowPaywall(true);
                        setToast({ title: appCopy.proAccess, message: check.reason, type: 'warning' });
                        return;
                    }
                    setView('day');
                }}
                title={appCopy.myDay}
                aria-label={appCopy.myDay}
             >
                <Calendar size={18} strokeWidth={1.9} />
             </IconButton>
             
             <IconButton
                active={view === 'payments'}
                onClick={() => {
                    const check = canUseFeature(user, 'payments');
                    if (!check.allowed) {
                        setShowPaywall(true);
                        setToast({ title: appCopy.proAccess, message: check.reason, type: 'warning' });
                        return;
                    }
                    setView('payments');
                }}
                title={appCopy.payments}
                aria-label={appCopy.payments}
             >
                <Banknote size={18} strokeWidth={1.9} />
             </IconButton>

             <IconButton active={view === 'account'} onClick={() => setView('account')} title={language === 'es' ? 'Mi cuenta' : 'My account'} aria-label={language === 'es' ? 'Mi cuenta' : 'My account'}>
                <UserIcon size={18} strokeWidth={1.9} />
             </IconButton>
             <IconButton tone="danger" onClick={handleLogout} title={appCopy.logout} aria-label={appCopy.logout}>
                <LogOut size={18} strokeWidth={1.9} />
             </IconButton>
         </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
         
         <AnimatePresence mode="wait" initial={false}>
         {view === 'dashboard' ? (
             <PageTransition key="dashboard" className="space-y-5 overflow-y-auto pb-24 custom-scrollbar motion-card-stagger">
                 <section className="dashboard-command-header flex items-start gap-4">
                     <div className="min-w-0">
                         <span className="dashboard-command-kicker"><Zap size={13} /> {language === 'es' ? 'Centro de comando' : 'Command center'}</span>
                         <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight truncate">{appCopy.hello}, {user.displayName}</h1>
                         <p className="text-zinc-500 text-sm mt-1">{appCopy.dayStarts}</p>
                     </div>
                 </section>

                 {accessLocked && (
                    <section className="rounded-2xl border border-violet-400/25 bg-[linear-gradient(135deg,rgba(139,92,246,0.16),rgba(13,17,25,0.96))] p-5 md:p-6">
                      <div className="flex items-start gap-4">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-200"><Lock size={20} /></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-lg font-black text-white">{language === 'es' ? 'Tu prueba terminó, tus clientes siguen aquí' : 'Your trial ended, your clients are still here'}</h2>
                          <p className="mt-1 text-sm leading-relaxed text-zinc-400">{language === 'es' ? 'Puedes ver la lista, pero las fichas, planes, agenda, pagos y envíos están protegidos hasta activar tu plan.' : 'You can see the list, but records, plans, schedule, payments, and sharing are protected until you activate your plan.'}</p>
                          <AppButton onClick={() => setShowPaywall(true)} variant="primary" icon={<Crown size={16} />} className="mt-4">{language === 'es' ? 'Activar mi plan' : 'Activate my plan'}</AppButton>
                        </div>
                      </div>
                    </section>
                 )}

                 <section className={accessLocked ? 'hidden' : 'dashboard-summary'}>
                     <div className="flex items-start justify-between gap-4 p-5">
                         <div className="min-w-0">
                             <div className="flex items-center gap-2 text-violet-300">
                                 <Activity size={17} />
                                 <h2 className="text-sm font-black uppercase tracking-[0.08em]">{appCopy.todaySummary}</h2>
                             </div>
                             <p className="mt-2 text-base md:text-lg font-bold text-white leading-snug">{todaySummary}</p>
                         </div>
                         <IconButton onClick={() => setView('day')} title={appCopy.viewAgenda} aria-label={appCopy.viewAgenda} className="shrink-0">
                             <Calendar size={18} />
                         </IconButton>
                     </div>

                     <div className="dashboard-metric-grid">
                         <button onClick={() => setView('dashboard')} className="dashboard-metric">
                             <span className="text-xl font-black text-white">{activeClients.length}</span>
                             <span>{appCopy.activeClients}</span>
                         </button>
                         <button onClick={() => setView('day')} className="dashboard-metric">
                             <span className="text-xl font-black text-white">{todayTrainingClients.length}</span>
                             <span>{appCopy.todayAgenda}</span>
                         </button>
                         <button onClick={handleQuickPayment} className="dashboard-metric">
                             <span className="text-xl font-black text-white">{paymentAttentionClients.length}</span>
                             <span>{appCopy.upcomingPayments}</span>
                         </button>
                     </div>
                 </section>

                 <section className={accessLocked ? 'hidden' : 'space-y-3'}>
                     <h2 className="text-lg font-black text-white">{appCopy.todayPriority}</h2>
                     {nextItems.length === 0 ? (
                         <div className="guided-empty-state border border-dashed border-zinc-800 rounded-2xl p-5">
                             <p className="text-sm font-bold text-zinc-300">{appCopy.allReadyToday}</p>
                             <p className="mt-1 text-xs leading-relaxed text-zinc-500">{appCopy.allReadyTodayHint}</p>
                         </div>
                     ) : (
                         <div className="space-y-2">
                             {nextItems.slice(0, 3).map(item => (
                                 <PrioritySessionCard
                                    key={item.id}
                                    kind={item.kind}
                                    clientName={item.client.name}
                                    avatarUrl={item.client.avatarUrl}
                                    initials={getClientInitials(item.client.name)}
                                    schedule={item.client.trainingTime}
                                    detail={item.kind === 'payment' ? formatPaymentTimeline(item.client, language) : item.label}
                                    language={language}
                                    hasPhone={Boolean(getPriorityPhone(item.client))}
                                    onOpenClient={() => openClientDetail(item.client)}
                                    onWhatsApp={() => openPriorityWhatsApp(item.client, item.message)}
                                    onOpenChat={() => openPriorityChat(item.client)}
                                 />
                             ))}
                         </div>
                     )}
                 </section>

                 <section className={accessLocked ? 'hidden' : 'space-y-3'}>
                     <div className="flex items-center justify-between gap-3">
                         <h2 className="text-lg font-black text-white">{appCopy.quickActions}</h2>
                         <button onClick={() => setView('account')} className="text-xs font-bold text-zinc-500 hover:text-violet-300 transition-colors">
                             {appCopy.usageAndLimits}
                         </button>
                     </div>
                     <div className="quick-action-grid">
                         <button onClick={handleQuickCreateClient} className="quick-action">
                             <span className="quick-action-icon"><Users size={18} /></span>
                             <span>{appCopy.newClient}</span>
                         </button>
                         <button onClick={() => handleQuickAIAction('routine')} className="quick-action">
                             <span className="quick-action-icon"><Dumbbell size={18} /></span>
                             <span>{appCopy.generateRoutine}</span>
                         </button>
                         <button onClick={() => handleQuickAIAction('diet')} className="quick-action">
                             <span className="quick-action-icon"><Utensils size={18} /></span>
                             <span>{appCopy.generateDiet}</span>
                         </button>
                         <button onClick={handleQuickPayment} className="quick-action">
                             <span className="quick-action-icon"><Banknote size={18} /></span>
                             <span>{appCopy.registerPayment}</span>
                         </button>
                     </div>
                 </section>

                 <section>
                     <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                       <h2 className="text-lg font-black text-white">{appCopy.myClients}</h2>
                       <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1" role="tablist" aria-label={language === 'en' ? 'Client status' : 'Estado de clientes'}>
                         {([
                           ['active', language === 'en' ? 'Active' : 'Activos', activeClients.length],
                           ['paused', language === 'en' ? 'Paused' : 'Pausados', pausedClients.length],
                           ['inactive', language === 'en' ? 'Finished' : 'Finalizados', finishedClients.length]
                         ] as const).map(([value, label, count]) => (
                           <button key={value} type="button" role="tab" aria-selected={clientListFilter === value} onClick={() => setClientListFilter(value)} className={`min-h-8 rounded-lg px-3 text-[10px] font-black transition-colors ${clientListFilter === value ? 'bg-violet-500 text-white' : 'text-zinc-500 hover:text-white'}`}>
                             {label} <span className="ml-1 opacity-70">{count}</span>
                           </button>
                         ))}
                       </div>
                     </div>
                     {clientsLoading ? (
                         <div className="space-y-3">
                             <p className="text-xs font-semibold text-zinc-500">{appCopy.loadingClients}</p>
                             <SkeletonList count={3} />
                         </div>
                     ) : visibleClients.length === 0 ? (
                         <div className="guided-empty-state text-center px-5 py-10 border border-dashed border-zinc-800 rounded-2xl">
                             <div className="guided-empty-icon mb-4">
                                 <Users size={20} />
                             </div>
                             <p className="text-sm font-black text-zinc-200">{clientListFilter === 'active' ? appCopy.firstClientPrompt : (language === 'en' ? `No ${clientListFilter === 'paused' ? 'paused' : 'finished'} clients` : `No hay clientes ${clientListFilter === 'paused' ? 'pausados' : 'finalizados'}`)}</p>
                             {clientListFilter === 'active' && <><p className="mx-auto mt-2 mb-5 max-w-md text-xs leading-relaxed text-zinc-500">{appCopy.firstClientDescription}</p><AppButton onClick={handleQuickCreateClient} variant="primary" icon={<Plus size={16} />}>{appCopy.createFirstClient}</AppButton></>}
                         </div>
                     ) : (
                         <div className="space-y-2">
                             {visibleClients.map(client => {
                                 const paymentAlert = needsPaymentAttention(client);
                                 const aiAlert = needsAIPlan(client);
                                 const statusClass = paymentAlert ? 'bg-red-500' : aiAlert ? 'bg-mvp-gold' : 'bg-green-500';
                                 return (
                                     <button
                                        key={client.id}
                                        onClick={() => openClientDetail(client)}
                                        className="dashboard-row-card w-full flex items-center justify-between gap-3 group text-left"
                                     >
                                         <div className="flex items-center gap-3 min-w-0">
                                             {client.avatarUrl ? (
                                                 <img src={client.avatarUrl} className="w-11 h-11 rounded-full bg-zinc-800 object-cover shrink-0" />
                                             ) : (
                                                 <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-black text-zinc-300 shrink-0">
                                                     {getClientInitials(client.name)}
                                                 </div>
                                             )}
                                             <div className="min-w-0">
                                                 <h4 className="font-black text-white text-sm group-hover:text-mvp-gold truncate">{client.name}</h4>
                                                 {accessLocked ? (
                                                   <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500"><Lock size={12} /> {language === 'es' ? 'Ficha protegida' : 'Protected record'}</p>
                                                 ) : (
                                                   <>
                                                     <p className="text-xs text-zinc-500 truncate">{client.mainGoal ? goalLabel(client.mainGoal, language) : appCopy.undefinedGoal}</p>
                                                     <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                                                        {client.phone && <span className="truncate">WhatsApp: {client.phone}</span>}
                                                        {client.trainingTime && <span className="truncate">{client.trainingTime}</span>}
                                                     </div>
                                                   </>
                                                 )}
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-3 shrink-0">
                                             {!accessLocked && client.status === 'active' && <span className={`hidden sm:inline-flex px-2 py-1 rounded-full border text-[10px] font-bold ${getPaymentBadgeClass(client)}`}>
                                                {getPaymentLabel(client, language)}
                                             </span>}
                                             {!accessLocked && client.status !== 'active' && <span className={`hidden sm:inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${client.status === 'paused' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400'}`}>{client.status === 'paused' ? (language === 'en' ? 'Paused' : 'Pausado') : (language === 'en' ? 'Finished' : 'Finalizado')}</span>}
                                             {!accessLocked && client.status === 'active' && <span className={`w-2.5 h-2.5 rounded-full ${statusClass}`} />}
                                             {accessLocked ? <Lock size={16} className="text-zinc-600" /> : <ChevronRight size={16} className="text-zinc-600"/>}
                                         </div>
                                     </button>
                                 );
                             })}
                         </div>
                     )}
                 </section>
             </PageTransition>         ) : view === 'client' ? (
             <PageTransition key={`client-${selectedClient?.id || 'none'}`} className="flex-1 min-h-0">
             <ClientDetail 
                client={selectedClient} 
                user={user}
                initialTab={clientInitialTab}
                autoGenerateRequest={clientAutoGenerateRequest}
                onBack={() => { setView('dashboard'); setSelectedClient(null); setClientInitialTab('profile'); setClientAutoGenerateRequest(null); }}
                onUpdate={handleClientUpdate}
                onDelete={() => selectedClient && handleDeleteClient(selectedClient.id)}
                onEdit={() => {
                    setEditingClient(selectedClient);
                    setIsClientModalOpen(true);
                }}
                onShowPaywall={() => setShowPaywall(true)}
                onShowToast={(t: any) => setToast(t)}
                onUserUsageUpdate={handleUserUpdate}
                requestConfirm={(config: any) => setConfirmConfig({ ...config, isOpen: true })}
                language={language}
             />
             </PageTransition>
         ) : view === 'day' ? (
            <PageTransition key="day" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <DailySchedule 
                user={user}
                clients={clients}
                onOpenClient={(client: Client) => openClientDetail(client)}
                onShowPaywall={() => setShowPaywall(true)}
                onShowToast={(t) => setToast(t)}
                language={language}
            />
            </PageTransition>
         ) : view === 'payments' ? (
            <PageTransition key="payments" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <PaymentCalendar 
                user={user}
                clients={clients}
                billingRecords={billingRecords}
                onShowPaywall={() => setShowPaywall(true)}
                onOpenClient={(client, tab) => openClientDetail(client, tab)}
                onUpdatePayment={handleCalendarPaymentUpdate}
                onShowToast={(t) => setToast(t)}
                language={language}
            />
            </PageTransition>
         ) : (
             <PageTransition key="account" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
             <AccountView 
                user={user} 
                clients={clients} 
                onShowPaywall={() => setShowPaywall(true)} 
                onBack={() => setView('dashboard')}
                onUpdateUser={handleUserUpdate}
                requestConfirm={(config: any) => setConfirmConfig({ ...config, isOpen: true })}
                onShowToast={(t: any) => setToast(t)}
                onLogout={handleLogout}
                language={language}
                onLanguageChange={setLanguage}
             />
             </PageTransition>
         )}
         </AnimatePresence>
      </main>
      
      {/* Client Form Modal (Create or Edit) */}
      <AnimatePresence>
      {isClientModalOpen && (
          <ClientFormModal 
            onClose={() => { setIsClientModalOpen(false); setEditingClient(null); }} 
            onSubmit={handleSaveClient} 
            initialData={editingClient || undefined}
            onShowToast={(t: any) => setToast(t)}
            existingClients={clients}
            language={language}
          />
      )}
      </AnimatePresence>
    </div>
  );
};

export default App;



