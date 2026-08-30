import QRCode from 'qrcode';
import { PublicProfile, User } from '../types';

type Language = 'es' | 'en';

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  const timeoutId = window.setTimeout(() => reject(new Error('La imagen tardó demasiado en responder.')), 7000);
  image.crossOrigin = 'anonymous';
  image.onload = () => { window.clearTimeout(timeoutId); resolve(image); };
  image.onerror = () => { window.clearTimeout(timeoutId); reject(new Error('No se pudo cargar la imagen.')); };
  image.src = url;
});

const roundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
};

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3 ? normalized.split('').map(char => char + char).join('') : normalized.padEnd(6, '0').slice(0, 6);
  const number = Number.parseInt(value, 16);
  return `rgba(${(number >> 16) & 255}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
};

const contrastColor = (hex: string) => {
  const normalized = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const luminance = (((value >> 16) & 255) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
  return luminance > 155 ? '#08090d' : '#ffffff';
};

const initialsFrom = (value: string) => value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'PT';

const fitSingleLine = (context: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  if (context.measureText(text).width <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && context.measureText(`${result}...`).width > maxWidth) result = result.slice(0, -1);
  return `${result.trim()}...`;
};

const wrapText = (context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((current, index) => {
    const clipped = index === maxLines - 1 && lines.length > maxLines;
    context.fillText(clipped ? `${current.replace(/[.,;:]?$/, '')}...` : current, x, y + index * lineHeight);
  });
  return Math.min(lines.length, maxLines) * lineHeight;
};

const drawCoverImage = (context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, focusY = 50) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = Math.max(0, image.naturalHeight - sourceHeight) * Math.min(100, Math.max(0, focusY)) / 100;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const drawContainImage = (context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) => {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
};

const tryLoadImage = async (url?: string | null) => {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
};

export const generateTrainerSocialCard = async (user: User, profile: PublicProfile, language: Language = 'es', publicUrl?: string) => {
  await document.fonts?.ready;
  const story = profile.cardFormat === 'story';
  const width = 1080;
  const height = story ? 1920 : 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la imagen.');

  const primary = user.branding?.primaryColor || '#8B5CF6';
  const secondary = user.branding?.secondaryColor || profile.backgroundColor || '#050505';
  const trainerName = profile.trainerName?.trim() || user.displayName || 'Personal Trainer';
  const brandName = user.branding?.brandName?.trim() || trainerName;
  const mode = profile.presentationMode || 'mixed';
  const template = profile.cardTemplate || 'balanced';
  const headline = profile.headline?.trim() || (language === 'es' ? 'Entrena con un plan hecho para ti' : 'Train with a plan built for you');
  const cta = profile.callToAction?.trim() || (language === 'es' ? 'Reserva tu evaluación' : 'Book your assessment');
  const portrait = mode !== 'logo' ? await tryLoadImage(profile.profileImageUrl || user.photoURL) : null;
  const logo = mode !== 'photo' ? await tryLoadImage(user.branding?.logoUrl) : null;
  const qrImage = publicUrl ? await tryLoadImage(await QRCode.toDataURL(publicUrl, { width: 230, margin: 1, color: { dark: '#07080d', light: '#ffffff' } })) : null;
  const topHeight = story ? 780 : 490;

  context.fillStyle = secondary;
  context.fillRect(0, 0, width, height);
  if (portrait) {
    drawCoverImage(context, portrait, 0, 0, width, topHeight, profile.photoPositionY ?? 50);
    const fade = context.createLinearGradient(0, topHeight * 0.25, 0, topHeight);
    fade.addColorStop(0, 'rgba(5,5,9,0.02)');
    fade.addColorStop(1, secondary);
    context.fillStyle = fade;
    context.fillRect(0, 0, width, topHeight + 5);
  } else {
    context.fillStyle = hexToRgba(primary, template === 'brand' ? 0.19 : 0.1);
    context.fillRect(0, 0, width, topHeight);
    context.strokeStyle = hexToRgba(primary, 0.32);
    context.lineWidth = 2;
    for (let radius = 110; radius <= 420; radius += 105) {
      context.beginPath();
      context.arc(width / 2, topHeight / 2, radius, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.fillStyle = primary;
  context.fillRect(0, 0, 16, height);
  context.fillRect(64, topHeight - 8, width - 128, 8);

  if (logo) {
    const box = portrait ? 148 : (template === 'brand' ? 300 : 220);
    const logoX = portrait ? 72 : (width - box) / 2;
    const logoY = portrait ? 62 : (topHeight - box) / 2 - 16;
    context.fillStyle = 'rgba(5,5,9,0.72)';
    roundedRect(context, logoX - 14, logoY - 14, box + 28, box + 28, 28);
    drawContainImage(context, logo, logoX, logoY, box, box);
  } else if (!portrait) {
    context.fillStyle = primary;
    context.beginPath();
    context.arc(width / 2, topHeight / 2 - 10, 118, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = contrastColor(primary);
    context.font = '800 62px Manrope, Arial, sans-serif';
    context.textAlign = 'center';
    context.fillText(initialsFrom(trainerName), width / 2, topHeight / 2 + 12);
    context.textAlign = 'left';
  }

  const contentX = 70;
  const contentWidth = width - 140;
  let y = topHeight + (story ? 78 : 66);
  context.fillStyle = primary;
  context.font = '800 24px Manrope, Arial, sans-serif';
  context.fillText((profile.professionalTitle || (language === 'es' ? 'ENTRENAMIENTO PERSONAL' : 'PERSONAL COACHING')).toUpperCase(), contentX, y, contentWidth);
  y += story ? 82 : 70;
  context.fillStyle = '#ffffff';
  context.font = `${template === 'personal' ? 800 : 700} ${story ? 64 : 56}px Montserrat, Manrope, Arial, sans-serif`;
  y += wrapText(context, headline, contentX, y, contentWidth, story ? 78 : 68, story ? 4 : 3);
  y += 26;
  context.fillStyle = '#d4d4d8';
  context.font = `500 ${story ? 31 : 28}px Manrope, Arial, sans-serif`;
  y += wrapText(context, profile.description, contentX, y, contentWidth, story ? 46 : 42, story ? 4 : 3);
  y += story ? 52 : 38;

  const details = [
    profile.modality === 'online' ? 'Online' : profile.modality === 'presencial' ? (language === 'es' ? 'Presencial' : 'In person') : (language === 'es' ? 'Presencial + Online' : 'In person + Online'),
    profile.location?.trim()
  ].filter(Boolean) as string[];
  context.font = '700 23px Manrope, Arial, sans-serif';
  details.forEach(detail => {
    const chipWidth = Math.min(contentWidth, context.measureText(detail).width + 54);
    context.fillStyle = 'rgba(255,255,255,0.07)';
    roundedRect(context, contentX, y, chipWidth, 52, 12);
    context.fillStyle = '#e4e4e7';
    context.fillText(detail, contentX + 27, y + 34);
    y += 64;
  });
  y += story ? 20 : 8;
  profile.services.filter(Boolean).slice(0, 3).forEach(service => {
    context.fillStyle = primary;
    context.beginPath();
    context.arc(contentX + 8, y - 8, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f4f4f5';
    context.font = `700 ${story ? 28 : 25}px Manrope, Arial, sans-serif`;
    context.fillText(fitSingleLine(context, service, contentWidth - 40), contentX + 34, y, contentWidth - 40);
    y += story ? 52 : 46;
  });

  const footerHeight = story ? 290 : 230;
  const footerY = height - footerHeight;
  context.fillStyle = '#0d1017';
  context.fillRect(0, footerY, width, footerHeight);
  context.fillStyle = primary;
  roundedRect(context, 64, footerY + 44, qrImage ? 680 : 952, 106, 18);
  context.fillStyle = contrastColor(primary);
  context.font = '800 31px Manrope, Arial, sans-serif';
  context.fillText(fitSingleLine(context, cta, qrImage ? 590 : 860), 102, footerY + 91, qrImage ? 590 : 860);
  context.font = '600 22px Manrope, Arial, sans-serif';
  context.fillText(profile.whatsAppNumber, 102, footerY + 125);
  if (qrImage) {
    context.fillStyle = '#ffffff';
    roundedRect(context, 796, footerY + 24, 204, 204, 18);
    drawContainImage(context, qrImage, 808, footerY + 36, 180, 180);
  }
  context.fillStyle = '#ffffff';
  context.font = '800 26px Manrope, Arial, sans-serif';
  context.fillText(fitSingleLine(context, trainerName, 430), 64, footerY + footerHeight - 34, 430);
  if (brandName !== trainerName) {
    context.fillStyle = '#a1a1aa';
    context.font = '600 19px Manrope, Arial, sans-serif';
    context.fillText(fitSingleLine(context, brandName, 300), 505, footerY + footerHeight - 36, 300);
  }
  context.fillStyle = '#71717a';
  context.font = '600 16px Manrope, Arial, sans-serif';
  context.textAlign = 'right';
  context.fillText('Creado con MVP Trainer', width - 64, footerY + footerHeight - 36);
  context.textAlign = 'left';

  const blob = await new Promise<Blob>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('La exportación tardó demasiado.')), 10000);
    canvas.toBlob(value => {
      window.clearTimeout(timeout);
      if (value) resolve(value); else reject(new Error('No se pudo exportar la imagen.'));
    }, 'image/png');
  });
  const safeName = trainerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trainer';
  return new File([blob], `${safeName}-${story ? 'historia' : 'publicacion'}.png`, { type: 'image/png' });
};

export const shareOrDownloadTrainerCard = async (file: File, language: Language = 'es', options?: { text?: string; url?: string }) => {
  const isAppleTouchDevice = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isAppleTouchDevice;
  if (isMobileDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: language === 'es' ? 'Mi presentación profesional' : 'My professional profile', text: options?.text, url: options?.url });
      return 'shared' as const;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled' as const;
      throw error;
    }
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded' as const;
};
