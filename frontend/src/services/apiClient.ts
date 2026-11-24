import axios from "axios";
import { resolveApiBaseUrl } from '../config/network';

const apiClient = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL, import.meta.env.DEV,
    typeof window === 'undefined' ? '' : window.location.hostname),
  timeout: 60000,
  withCredentials: true // Required for sending/receiving HttpOnly cookies
});

apiClient.interceptors.request.use((config) => {
  // Let cookies handle the token
  return config;
});

let refreshPromise: Promise<unknown> | null = null;

const toCamelCase = (str: string) => {
  return str.replace(/([-_][a-z])/gi, ($1) => {
    return $1.toUpperCase().replace("-", "").replace("_", "");
  });
};

const camelizeKeys = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map((v) => camelizeKeys(v));
  } else if (obj !== null && obj.constructor === Object) {
    const result = Object.keys(obj).reduce((acc, key) => {
      acc[toCamelCase(key)] = camelizeKeys(obj[key]);
      return acc;
    }, {} as any);

    // Auto-reconstruct location object for User models from flattened DB columns
    // We check if the object has an id, which implies it's a User model (or similar),
    // and if so, we enforce the creation of the location object.
    if (
      "id" in result &&
      ("city" in result || "country" in result || "firstName" in result)
    ) {
      if (!result.location || typeof result.location !== "object") {
        result.location = {
          city: result.city || "",
          country: result.country || "",
          latitude: result.latitude ?? null,
          longitude: result.longitude ?? null,
        };
      } else {
        // If location exists but is missing city/country, fill them in
        result.location.city = result.location.city || result.city || "";
        result.location.country =
          result.location.country || result.country || "";
        result.location.latitude =
          result.location.latitude ?? result.latitude ?? null;
        result.location.longitude =
          result.location.longitude ?? result.longitude ?? null;
      }
    }

    // Parse photos if it comes back as a JSON string
    if (typeof result.photos === "string") {
      try {
        result.photos = JSON.parse(result.photos);
      } catch (e) {
        result.photos = [];
      }
    }

    return result;
  }
  return obj;
};

// Response interceptor
apiClient.interceptors.response.use(
  (response) => {
    // Convert snake_case from backend to camelCase for frontend
    if (response.data) {
      response.data = camelizeKeys(response.data);
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    // Bỏ qua lỗi 401 cho các route login và refresh để component tự xử lý hiển thị lỗi
    if (
      originalRequest.url?.includes("/auth/login") ||
      originalRequest.url?.includes("/auth/register") ||
      originalRequest.url?.includes("/auth/refresh")
    ) {
      return Promise.reject(error);
    }

    // Nếu lỗi 401 và chưa thử lại
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios.post(
            `${apiClient.defaults.baseURL}/auth/refresh`, {},
            { withCredentials: true, timeout: apiClient.defaults.timeout },
          ).finally(() => { refreshPromise = null; });
        }
        await refreshPromise;
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        if ([401, 403].includes(refreshError.response?.status)) window.location.href = "/login";
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const failure = error as { response?: { data?: { error?: unknown; message?: unknown } }; message?: unknown };
  const apiError = failure?.response?.data?.error;
  if (typeof apiError === "string" && apiError.trim()) return apiError;
  if (apiError && typeof apiError === "object" && "message" in apiError && typeof (apiError as { message?: unknown }).message === "string") {
    return (apiError as { message: string }).message;
  }
  if (typeof failure?.response?.data?.message === "string" && failure.response.data.message.trim()) {
    return failure.response.data.message;
  }
  if (typeof failure?.message === "string" && failure.message.trim()) return failure.message;
  return fallback;
};

export default apiClient;
