import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import type { Provider, SupabaseClient } from '@supabase/supabase-js';

const CALLBACK_URL = 'com.mvptrainer.pro://auth/callback';

export const signInWithOAuth = async (client: SupabaseClient, provider: Provider) => {
  const isNative = Capacitor.isNativePlatform();
  const redirectTo = isNative ? CALLBACK_URL : `${window.location.origin}/`;
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'consent' } : undefined
    }
  });
  if (error) throw error;
  if (!data.url) throw new Error(`${provider} OAuth URL was not returned`);

  if (!isNative) {
    window.location.assign(data.url);
    return;
  }

  await new Promise<void>(async (resolve, reject) => {
    let settled = false;
    const finish = async (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      await urlListener.remove();
      await browserListener.remove();
      callback();
    };
    const urlListener = await App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(CALLBACK_URL)) return;
      const callbackUrl = new URL(url);
      const code = callbackUrl.searchParams.get('code');
      const oauthError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
      await Browser.close().catch(() => undefined);
      if (oauthError || !code) {
        await finish(() => reject(new Error(oauthError || 'OAuth callback did not include an authorization code.')));
        return;
      }
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
      await finish(() => exchangeError ? reject(exchangeError) : resolve());
    });
    const browserListener = await Browser.addListener('browserFinished', async () => {
      await finish(() => reject(new Error('OAuth sign-in was canceled.')));
    });
    const timeout = window.setTimeout(() => {
      void finish(() => reject(new Error('OAuth sign-in timed out.')));
    }, 120_000);
    await Browser.open({ url: data.url, presentationStyle: 'popover' });
  });
};
