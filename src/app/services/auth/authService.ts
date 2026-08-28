import { API_BASE_URL } from "../httpClient";

export const AUTH_STORAGE_KEY = "isAuthenticated";

export async function login(email: string, password: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return response.ok;
}

export function persistSession(rememberMe: boolean): void {
  sessionStorage.setItem(AUTH_STORAGE_KEY, "true");
  if (rememberMe) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
  }
}

export function isAuthenticated(): boolean {
  return (
    sessionStorage.getItem(AUTH_STORAGE_KEY) === "true" ||
    localStorage.getItem(AUTH_STORAGE_KEY) === "true"
  );
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_STORAGE_KEY);
}
