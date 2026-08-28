import { supabase } from './supabaseClient';

export type TrainerAssetKind = 'brand-logo' | 'profile-photo';

const BUCKET = 'trainer-assets';
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const optimizeImage = (file: File, maxDimension = 1600): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) return reject(new Error('No se pudo preparar la imagen.'));

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('No se pudo optimizar la imagen.')),
        'image/webp',
        0.86
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('El archivo no es una imagen valida.'));
    };
    image.src = objectUrl;
  });

export const uploadTrainerAsset = async (trainerId: string, kind: TrainerAssetKind, file: File) => {
  if (!supabase) throw new Error('Supabase no esta disponible.');
  if (!ALLOWED_TYPES.has(file.type)) throw new Error('Usa una imagen JPG, PNG o WebP.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('La imagen debe pesar menos de 5 MB.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== trainerId) {
    throw new Error('Tu sesion no permite subir esta imagen.');
  }

  const optimized = await optimizeImage(file);
  const path = `${trainerId}/${kind}.webp`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, optimized, {
    cacheControl: '3600',
    contentType: 'image/webp',
    upsert: true
  });
  if (error) throw error;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
};
