import { API_BASE_URL } from "../httpClient";

// Il token JWT sostituisce il vecchio flag booleano: la sessione ora sa
// "chi" è l'utente autenticato, non solo che qualcuno lo è.
export const AUTH_TOKEN_KEY = "authToken";

interface LoginResponseBody {
  token: string;
}

// Ritorna il token di sessione su credenziali valide, null altrimenti: chi
// chiama decide se e dove persisterlo (vedi persistSession).
export async function login(email: string, password: string): Promise<string | null> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as LoginResponseBody;
  return body.token;
}

export function persistSession(token: string, rememberMe: boolean): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

export function getToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem(AUTH_TOKEN_KEY);
}

// Header da fondere in ogni fetch verso una rotta @Security('jwt') (vedi
// backend/src/middleware/authentication.ts). Oggetto vuoto se non c'è
// sessione, invece di lanciare qui: la richiesta parte comunque e sarà il
// 401 del backend a segnalare l'assenza di token, coerente con readErrorMessage.
export function authHeader(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

// Sessione stateless lato server (nessuna tabella di revoca, vedi
// backend/src/services/tokenService.ts): il logout invalida solo lato
// client, rimuovendo il token da entrambi gli storage.
export function logout(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
