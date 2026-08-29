import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Share2,
  Sparkles,
  Trash2
} from 'lucide-react';

export type AppButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'success' | 'danger' | 'contact' | 'whatsapp' | 'ai' | 'share';

export type AppButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  isLoading?: boolean;
  icon?: React.ReactNode;
  compact?: boolean;
  iconOnly?: boolean;
};

const BUTTON_TRANSITION = { type: 'spring' as const, stiffness: 420, damping: 24 };
const BUTTON_PRESS = { scale: 0.96 };

const VARIANT_CLASSES: Record<AppButtonVariant, string> = {
  primary: 'border-violet-300/40 bg-[linear-gradient(180deg,#9b63f6_0%,#7c3aed_52%,#5b21b6_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_6px_18px_rgba(124,58,237,0.34),0_2px_3px_rgba(0,0,0,0.44)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_9px_26px_rgba(124,58,237,0.44),0_2px_4px_rgba(0,0,0,0.46)] focus:ring-violet-300/35',
  secondary: 'border-white/10 bg-[linear-gradient(180deg,#202638_0%,#151a27_100%)] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_4px_12px_rgba(0,0,0,0.28)] hover:border-violet-300/25 hover:bg-[linear-gradient(180deg,#272e42_0%,#191f2e_100%)] focus:ring-violet-300/20',
  tertiary: 'border-transparent bg-transparent text-zinc-300 shadow-none hover:bg-white/[0.06] hover:text-white focus:ring-zinc-500/20',
  success: 'border-emerald-300/30 bg-[linear-gradient(180deg,#24c77a_0%,#11945a_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.24),0_5px_16px_rgba(16,185,129,0.24)] hover:brightness-110 focus:ring-emerald-300/30',
  danger: 'border-red-400/30 bg-[linear-gradient(180deg,rgba(127,29,29,0.78)_0%,rgba(69,10,10,0.88)_100%)] text-red-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_4px_14px_rgba(127,29,29,0.22)] hover:border-red-300/45 hover:bg-[linear-gradient(180deg,#dc2626_0%,#991b1b_100%)] hover:text-white focus:ring-red-300/30',
  contact: 'border-white/10 bg-[linear-gradient(180deg,#202638_0%,#151a27_100%)] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_4px_12px_rgba(0,0,0,0.28)] hover:border-violet-300/25 focus:ring-violet-300/20',
  whatsapp: 'border-emerald-200/40 bg-[linear-gradient(180deg,#28E06B_0%,#1FB855_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_5px_16px_rgba(37,211,102,0.32),0_2px_3px_rgba(0,0,0,0.42)] hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.34),0_7px_22px_rgba(37,211,102,0.42),0_2px_4px_rgba(0,0,0,0.44)] focus:ring-emerald-300/35',
  ai: 'border-violet-300/45 bg-[linear-gradient(135deg,#8A2BE2_0%,#6D28D9_50%,#4C1D95_100%)] text-[#F7F7FB] shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_6px_22px_rgba(138,43,226,0.40),0_2px_4px_rgba(0,0,0,0.42)] hover:brightness-110 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_9px_28px_rgba(138,43,226,0.48),0_2px_4px_rgba(0,0,0,0.45)] focus:ring-violet-300/40',
  share: 'border-violet-300/35 bg-[linear-gradient(180deg,#2E1065_0%,#1E1B4B_100%)] text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_5px_18px_rgba(76,29,149,0.30)] hover:border-violet-200/50 hover:brightness-110 focus:ring-violet-300/30'
};

const ICON_TONES: Record<AppButtonVariant, string> = {
  primary: 'bg-black/16 text-white',
  secondary: 'bg-black/24 text-zinc-300',
  tertiary: 'bg-white/[0.06] text-zinc-300',
  success: 'bg-black/16 text-white',
  danger: 'bg-red-950/40 text-red-100',
  contact: 'bg-black/24 text-zinc-300',
  whatsapp: 'bg-black/15 text-white',
  ai: 'bg-white/15 text-white shadow-[0_0_12px_rgba(216,180,254,0.20)]',
  share: 'bg-violet-300/12 text-violet-200'
};

export const AppButton = ({
  variant = 'secondary',
  isLoading = false,
  icon,
  compact = false,
  iconOnly = false,
  children,
  className = '',
  disabled,
  ...props
}: AppButtonProps) => {
  const resolvedIcon = isLoading ? <Loader2 size={16} className="animate-spin" /> : icon;
  const dimensions = iconOnly
    ? compact ? 'h-[38px] w-[38px] p-0' : 'h-11 w-11 p-0'
    : compact ? 'min-h-[38px] px-3 py-2' : 'min-h-11 px-4 py-2.5';

  return (
    <motion.button
      {...props}
      disabled={disabled || isLoading}
      whileHover={disabled || isLoading ? undefined : { scale: 1.015, y: -1 }}
      whileTap={disabled || isLoading ? undefined : BUTTON_PRESS}
      transition={BUTTON_TRANSITION}
      className={`ui-tactile-button relative isolate inline-flex items-center justify-center overflow-hidden rounded-xl border text-[13px] font-bold tracking-normal transition-[filter,border-color,box-shadow,background-color] focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-45 ${dimensions} ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {variant === 'ai' && <span aria-hidden="true" className="ui-ai-shimmer absolute inset-y-0 -left-1/2 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/24 to-transparent" />}
      {resolvedIcon && (
        <span className={`relative z-10 grid shrink-0 place-items-center rounded-lg ${compact || iconOnly ? 'h-7 w-7' : 'h-[30px] w-[30px]'} ${ICON_TONES[variant]}`}>
          {resolvedIcon}
        </span>
      )}
      {!iconOnly && <span className="relative z-10 min-w-0 text-center leading-tight">{children}</span>}
    </motion.button>
  );
};

export const PrimaryButton = (props: AppButtonProps) => <AppButton {...props} variant="primary" />;
export const SecondaryButton = (props: AppButtonProps) => <AppButton {...props} variant="secondary" />;
export const DangerButton = ({ icon = <Trash2 size={16} />, ...props }: AppButtonProps) => <AppButton {...props} icon={icon} variant="danger" />;
export const DestructiveButton = DangerButton;
export const ShareImageButton = ({ icon = <Share2 size={16} />, ...props }: AppButtonProps) => <AppButton {...props} icon={icon} variant="share" />;

export const WhatsAppButton = ({ icon = <MessageCircle size={17} strokeWidth={2.2} />, ...props }: AppButtonProps) => (
  <AppButton {...props} icon={icon} variant="whatsapp" />
);

export const AiButton = ({ icon, ...props }: AppButtonProps) => (
  <AppButton
    {...props}
    variant="ai"
    icon={icon || (
      <motion.span animate={{ rotate: [0, 12, -12, 0] }} transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}>
        <Sparkles size={17} />
      </motion.span>
    )}
  />
);

export const IconButton = ({ active = false, tone = 'neutral', className = '', children, ...props }: AppButtonProps & { active?: boolean; tone?: 'neutral' | 'danger' }) => (
  <motion.button
    {...props}
    disabled={props.disabled}
    whileHover={props.disabled ? undefined : { scale: 1.04, y: -1 }}
    whileTap={props.disabled ? undefined : BUTTON_PRESS}
    transition={BUTTON_TRANSITION}
    className={`inline-grid h-11 w-11 min-h-11 min-w-11 place-items-center rounded-xl border shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.24)] transition-[background,border-color,color,box-shadow] focus:outline-none focus:ring-2 focus:ring-violet-300/25 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'border-violet-400 bg-[linear-gradient(180deg,rgba(138,43,226,0.30),rgba(91,33,182,0.16))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_0_16px_rgba(138,43,226,0.24)]' : tone === 'danger' ? 'border-white/8 bg-[linear-gradient(180deg,#1d2230,#131722)] text-red-400 hover:border-red-400/25 hover:bg-red-500/12 hover:text-red-300' : 'border-white/8 bg-[linear-gradient(180deg,#1d2230,#131722)] text-slate-400 hover:border-violet-300/25 hover:text-white'} ${className}`}
  >
    {children}
  </motion.button>
);

export const ContactButton = ({ tone = 'neutral', ...props }: AppButtonProps & { tone?: 'whatsapp' | 'neutral' | 'danger' }) => {
  if (tone === 'whatsapp') return <WhatsAppButton {...props} />;
  if (tone === 'danger') return <DangerButton {...props} />;
  return <SecondaryButton {...props} />;
};

export const CopyButton = ({ onClick, children = 'Copiar', copiedLabel = '¡Copiado!', ...props }: AppButtonProps & { copiedLabel?: React.ReactNode }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <SecondaryButton
      {...props}
      icon={copied ? <Check size={16} className="text-emerald-300" /> : <Copy size={16} />}
      onClick={(event) => {
        onClick?.(event);
        setCopied(true);
      }}
    >
      {copied ? copiedLabel : children}
    </SecondaryButton>
  );
};

export const ButtonGroup = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
);
