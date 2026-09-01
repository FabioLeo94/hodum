import { useSyncExternalStore } from "react";
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

// Sottoscrittori di useAuthUser sotto: getUser() legge dallo storage, non da
// uno state React, quindi un componente che lo chiama in render (pattern
// diffuso in questo progetto, es. topbarComponent) non si ri-renderizza da
// solo quando lo storage cambia altrove (un'altra tab, o un evento socket
// 'user:updated' - vedi socketService.ts). notifyUserChange chiude questo
// buco senza introdurre una libreria di state management.
const userChangeListeners = new Set<() => void>();

function notifyUserChange(): void {
  for (const listener of userChangeListeners) {
    listener();
  }
}

// Scrive lo user sotto AUTH_USER_KEY, mirror di dove vive già il token: se
// il token è in localStorage (rememberMe true) lo user lo segue lì, altrimenti
// resta solo in sessionStorage. Usata sia al login/registrazione sia dopo un
// cambio password riuscito, che aggiorna mustChangePassword senza un nuovo
// login, sia dall'handler di 'user:updated' quando è l'owner a modificare
// questo utente (es. promozione a project manager) da un'altra sessione.
export function updateStoredUser(user: User): void {
  sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  if (localStorage.getItem(AUTH_TOKEN_KEY) !== null) {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  }
  notifyUserChange();
}

// Hook di lettura reattiva: da usare al posto di getUser() ovunque il
// risultato guidi cosa viene mostrato (ruolo, mustChangePassword), così un
// 'user:updated' ricevuto mentre l'utente è già sulla pagina aggiorna la UI
// subito invece che alla prossima navigazione/riconnessione.
export function useAuthUser(): User | null {
  return useSyncExternalStore(subscribeUserChange, getUserSnapshot);
}

function subscribeUserChange(listener: () => void): () => void {
  userChangeListeners.add(listener);
  return () => userChangeListeners.delete(listener);
}

// getSnapshot di useSyncExternalStore deve ritornare un riferimento stabile
// finché il valore non cambia davvero, altrimenti React rientra in un loop
// di ri-render infinito ("The result of getSnapshot should be cached").
// getUser() sotto fa un JSON.parse a ogni chiamata, quindi ritorna sempre un
// oggetto nuovo anche a parità di contenuto: questa cache confronta la
// stringa grezza e riusa l'oggetto già parsato quando non è cambiata nulla.
let lastRawUser: string | null = null;
let lastParsedUser: User | null = null;

function getUserSnapshot(): User | null {
  const raw = sessionStorage.getItem(AUTH_USER_KEY) ?? localStorage.getItem(AUTH_USER_KEY);
  if (raw === lastRawUser) {
    return lastParsedUser;
  }
  lastRawUser = raw;
  lastParsedUser = raw === null ? null : parseUser(raw);
  return lastParsedUser;
}

function parseUser(raw: string): User | null {
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
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
  return raw === null ? null : parseUser(raw);
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
  notifyUserChange();
}
