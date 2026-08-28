import { PublicProfile, User } from '../types';

type Language = 'es' | 'en';

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timeoutId = window.setTimeout(() => {
      image.src = '';
      reject(new Error('La imagen externa tardó demasiado en responder.'));
    }, 5000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      window.clearTimeout(timeoutId);
      resolve(image);
    };
    image.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('No se pudo cargar la imagen externa.'));
    };
    image.src = url;
  });

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
};

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 4
) => {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else if (line) {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);

  lines.slice(0, maxLines).forEach((currentLine, index) => {
    const isLastVisibleLine = index === maxLines - 1 && lines.length > maxLines;
    context.fillText(isLastVisibleLine ? `${currentLine.replace(/[.,;:]?$/, '')}...` : currentLine, x, y + index * lineHeight);
  });
  return Math.min(lines.length, maxLines) * lineHeight;
};

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
};

const initialsFrom = (value: string) => {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'MVP';
};

const drawInitialsAvatar = (
  context: CanvasRenderingContext2D,
  label: string,
  color: string
) => {
  context.fillStyle = color;
  context.beginPath();
  context.arc(170, 150, 88, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.font = '800 48px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(initialsFrom(label), 170, 154, 130);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
};

const fitSingleLine = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
) => {
  if (context.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}...`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trim()}...`;
};

export const generateTrainerSocialCard = async (
  user: User,
  profile: PublicProfile,
  language: Language = 'es'
) => {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la imagen.');

  const primary = user.branding?.primaryColor || '#8B5CF6';
  const brandName = user.branding?.brandName?.trim() || user.displayName || 'MVP Trainer';
  context.fillStyle = '#07080d';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#11141d';
  context.fillRect(0, 0, canvas.width, 290);
  context.fillStyle = primary;
  context.fillRect(0, 0, 18, canvas.height);
  context.fillRect(70, 248, 940, 8);

  const portraitUrl = profile.profileImageUrl || user.photoURL || '';
  let portraitDrawn = false;
  if (portraitUrl) {
    try {
      const portrait = await loadImage(portraitUrl);
      context.save();
      context.beginPath();
      context.arc(170, 150, 88, 0, Math.PI * 2);
      context.clip();
      drawCoverImage(context, portrait, 82, 62, 176, 176);
      context.restore();
      context.strokeStyle = primary;
      context.lineWidth = 8;
      context.beginPath();
      context.arc(170, 150, 92, 0, Math.PI * 2);
      context.stroke();
      portraitDrawn = true;
    } catch {
      portraitDrawn = false;
    }
  }
  if (!portraitDrawn) drawInitialsAvatar(context, brandName, primary);

  if (user.branding?.logoUrl) {
    try {
      const logo = await loadImage(user.branding.logoUrl);
      context.drawImage(logo, 884, 78, 110, 110);
    } catch {
      // The card remains useful even if an external logo blocks canvas access.
    }
  }

  context.fillStyle = '#ffffff';
  context.font = '800 54px Arial, sans-serif';
  context.fillText(fitSingleLine(context, brandName, 540), 300, 125, 540);
  context.fillStyle = '#a1a1aa';
  context.font = '600 27px Arial, sans-serif';
  context.fillText(language === 'es' ? 'Entrenamiento personal' : 'Personal coaching', 300, 174);
  context.fillStyle = primary;
  context.font = '800 22px Arial, sans-serif';
  context.fillText('MVP TRAINER PRO', 300, 215);

  context.fillStyle = '#ffffff';
  context.font = '800 54px Arial, sans-serif';
  context.fillText(language === 'es' ? 'Entrena con un plan hecho para ti' : 'Train with a plan built for you', 70, 354, 940);
  context.fillStyle = '#c4c4cc';
  context.font = '400 31px Arial, sans-serif';
  const descriptionHeight = wrapText(
    context,
    profile.description || (language === 'es' ? 'Acompanamiento profesional para alcanzar tus objetivos.' : 'Professional coaching to reach your goals.'),
    70,
    416,
    940,
    44,
    4
  );

  const servicesY = Math.max(610, 430 + descriptionHeight);
  context.fillStyle = '#ffffff';
  context.font = '800 28px Arial, sans-serif';
  context.fillText(language === 'es' ? 'SERVICIOS' : 'SERVICES', 70, servicesY);
  const services = profile.services.length ? profile.services.slice(0, 4) : [language === 'es' ? 'Asesoria personalizada' : 'Personalized coaching'];
  services.forEach((service, index) => {
    const y = servicesY + 42 + index * 76;
    context.fillStyle = '#151925';
    drawRoundedRect(context, 70, y, 940, 58, 14);
    context.fillStyle = primary;
    context.beginPath();
    context.arc(104, y + 29, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f4f4f5';
    context.font = '700 27px Arial, sans-serif';
    context.fillText(fitSingleLine(context, service, 840), 132, y + 38, 840);
  });

  const goalsY = servicesY + 42 + services.length * 76 + 52;
  context.fillStyle = '#ffffff';
  context.font = '800 28px Arial, sans-serif';
  context.fillText(language === 'es' ? 'OBJETIVOS' : 'GOALS', 70, goalsY);
  const goals = profile.targets.length > 0
    ? profile.targets.slice(0, 3)
    : [language === 'es' ? 'Resultados sostenibles' : 'Sustainable results'];
  let goalX = 70;
  let goalY = goalsY + 26;
  goals.forEach(goal => {
    context.font = '700 22px Arial, sans-serif';
    const width = Math.min(360, context.measureText(goal).width + 56);
    if (goalX + width > 1010) {
      goalX = 70;
      goalY += 66;
    }
    context.fillStyle = `${primary}33`;
    drawRoundedRect(context, goalX, goalY, width, 54, 27);
    context.fillStyle = '#ddd6fe';
    context.fillText(fitSingleLine(context, goal, width - 44), goalX + 28, goalY + 35, width - 44);
    goalX += width + 14;
  });

  context.fillStyle = primary;
  drawRoundedRect(context, 70, 1172, 940, 108, 18);
  context.fillStyle = '#ffffff';
  context.font = '800 33px Arial, sans-serif';
  context.fillText(language === 'es' ? 'Conversemos por WhatsApp' : 'Let us talk on WhatsApp', 112, 1223);
  context.font = '600 25px Arial, sans-serif';
  context.fillText(profile.whatsAppNumber || (language === 'es' ? 'Agenda tu evaluacion' : 'Book your assessment'), 112, 1260);

  const blob = await new Promise<Blob>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error('La exportación de la imagen tardó demasiado.')),
      8000
    );
    canvas.toBlob(value => {
      window.clearTimeout(timeoutId);
      if (value) resolve(value);
      else reject(new Error('No se pudo exportar la imagen.'));
    }, 'image/png');
  });
  const safeName = brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'trainer';
  return new File([blob], `${safeName}-presentacion.png`, { type: 'image/png' });
};

export const shareOrDownloadTrainerCard = async (file: File, language: Language = 'es') => {
  const isAppleTouchDevice = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || isAppleTouchDevice;

  if (isMobileDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: language === 'es' ? 'Mi presentacion profesional' : 'My professional profile'
    });
    return 'shared' as const;
  }

  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded' as const;
};
