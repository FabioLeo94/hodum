import { API_BASE_URL } from "../httpClient";

// Il token JWT sostituisce il vecchio flag booleano: la sessione ora sa
// "chi" è l'utente autenticato, non solo che qualcuno lo è.
export const AUTH_TOKEN_KEY = "authToken";
export const AUTH_USER_KEY = "authUser";

// "employee"/"manager" sono gli unici ruoli assegnabili a un dipendente (task
// "Ruolo project manager"): "owner" esiste solo come titolare della company,
// mai come valore selezionabile in una form. Riesportati da qui perché User
// resta la fonte di verità per la forma di un utente autenticato.
export type EmployeeRole = "employee" | "manager";
export type UserRole = "owner" | EmployeeRole;

export interface User {
  id: string;
  username: string;
  email: string;
  companyId: string | null;
  role: UserRole | null;
  mustChangePassword: boolean;
}

interface LoginResponseBody {
  user: User;
  token: string;
}

// Ritorna { user, token } su credenziali valide, null altrimenti: chi
// chiama decide se e dove persisterli (vedi persistSession).
export async function login(
  email: string,
  password: string,
): Promise<{ user: User; token: string } | null> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as LoginResponseBody;
  return body;
}

// Scrive lo user sotto AUTH_USER_KEY, mirror di dove vive già il token: se
// il token è in localStorage (rememberMe true) lo user lo segue lì, altrimenti
// resta solo in sessionStorage. Usata sia al login/registrazione sia dopo un
// cambio password riuscito, che aggiorna mustChangePassword senza un nuovo login.
export function updateStoredUser(user: User): void {
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (localStorage.getItem(AUTH_TOKEN_KEY) !== null) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
}

export function persistSession(token: string, user: User, rememberMe: boolean): void {
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  if (rememberMe) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
  updateStoredUser(user);
}

export function getToken(): string | null {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getUser(): User | null {
  const raw = sessionStorage.getItem(AUTH_USER_KEY) ?? localStorage.getItem(AUTH_USER_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
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
// client, rimuovendo token e user da entrambi gli storage.
export function logout(): void {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_USER_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
