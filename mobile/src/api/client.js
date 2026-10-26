// REBU backend client. In dev the phone reaches the PC's API through
// `adb reverse tcp:4000 tcp:4000`, so localhost works on device too.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_URL = __DEV__
  ? 'http://localhost:4000'
  : 'https://api.rebu.app';

// Keep in step with android/app/build.gradle versionName.
export const APP_VERSION = '1.3.0';

const TOKEN_KEY = 'rebu.token.v1';
let token = null;
let onUnauthorized = null;

export async function loadToken() {
  token = await AsyncStorage.getItem(TOKEN_KEY).catch(() => null);
  return token;
}
export async function setToken(t) {
  token = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}
export const getToken = () => token;
/** Called when the server says the session is gone (expired, banned…). */
export const setUnauthorizedHandler = fn => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(method, path, body) {
  const sentToken = token; // a 401 only ends the session if we sent one
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-cache',
        ...(sentToken ? { authorization: `Bearer ${sentToken}` } : null),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach REBU. Check your internet.');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error || {};
    if (res.status === 401 && sentToken && sentToken === token) onUnauthorized?.();
    throw new ApiError(
      res.status,
      e.code || 'error',
      e.message || 'Something went wrong.',
      e.details,
    );
  }
  return json;
}

export const get = path => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const patch = (path, body = {}) => api('PATCH', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const del = path => api('DELETE', path);

/** Upload a local image (file:// or content://) → public URL on the server. */
export async function uploadImage(uri) {
  if (!uri || /^https?:/.test(uri)) return uri; // already hosted
  const blob = await (await fetch(uri)).blob();
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: 'POST',
    headers: {
      'content-type': blob.type || 'image/jpeg',
      ...(token ? { authorization: `Bearer ${token}` } : null),
    },
    body: blob,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code || 'upload_failed',
      json.error?.message || 'Couldn’t upload the photo.',
    );
  }
  return json.url;
}
