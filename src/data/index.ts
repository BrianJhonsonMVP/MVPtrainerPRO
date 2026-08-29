
import { supabaseProvider } from './supabaseProvider';
import { IDBProvider } from './dbInterface';
import { isVisualReviewMode, visualReviewProvider } from './visualReviewProvider';

export const dbProvider: IDBProvider = isVisualReviewMode()
  ? visualReviewProvider
  : supabaseProvider;

if ((import.meta as any).env?.DEV) {
  console.log(`%c ACTIVE PROVIDER: ${dbProvider.name} `, "color: #fff; background: #7c3aed; padding: 3px; border-radius: 4px; font-weight: bold;");
}
