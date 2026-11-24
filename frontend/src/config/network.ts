export const DEFAULT_API_URL = 'https://heartconnect-api.vercel.app/api';
const legacyApiUrl = 'https://heartconnect-qa29.onrender.com/api';

export function resolveApiBaseUrl(configuredUrl: string | undefined, isDev: boolean, hostname: string): string {
  const apiUrl = configuredUrl?.trim().replace(/\/+$/, '') || '';
  // Vite proxies and Vercel rewrites keep cookies on the website's origin.
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(hostname) ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  const proxyHost = ['.vercel.app', '.devtunnels.ms', '.ngrok-free.app', '.ngrok-free.dev']
    .some(suffix => hostname.endsWith(suffix));
  const hasProxy = isDev || localHost || proxyHost;
  if (hasProxy && (!apiUrl || apiUrl === DEFAULT_API_URL || apiUrl === legacyApiUrl)) return '/api';
  // An explicit relative URL must work for LAN, tunnels, and custom domains too.
  if (apiUrl) return apiUrl === legacyApiUrl ? DEFAULT_API_URL : apiUrl;
  return DEFAULT_API_URL;
}
