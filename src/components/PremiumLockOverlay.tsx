import React from 'react';
import { motion } from 'framer-motion';
import { Lock, Sparkles } from 'lucide-react';

interface PremiumLockOverlayProps {
  title: string;
  description: string;
  cta: string;
  onUnlock: () => void;
  eyebrow?: string;
}

const PremiumLockOverlay: React.FC<PremiumLockOverlayProps> = ({
  title,
  description,
  cta,
  onUnlock,
  eyebrow = 'MVP TRAINER'
}) => (
  <motion.div
    className="premium-lock-overlay absolute inset-0 z-20 flex items-center justify-center p-5 sm:p-8"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
  >
    <motion.div
      className="premium-lock-panel"
      initial={{ opacity: 0, y: 10, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="premium-lock-icon" aria-hidden="true">
        <Lock size={23} strokeWidth={2} />
      </div>
      <div className="premium-lock-eyebrow">
        <Sparkles size={12} />
        <span>{eyebrow}</span>
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      <motion.button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onUnlock();
        }}
        className="premium-lock-cta"
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.14 }}
      >
        <Lock size={16} />
        <span>{cta}</span>
      </motion.button>
    </motion.div>
  </motion.div>
);

export default PremiumLockOverlay;
