export const AUTH_STORAGE_KEY = "isAuthenticated";

interface MockUser {
  email: string;
  password: string;
}

const MOCK_USERS: MockUser[] = [
  { email: "demo@taskmanager.dev", password: "demo1234" },
];

export async function login(email: string, password: string): Promise<boolean> {
  const user = MOCK_USERS.find(
    (u) => u.email === email && u.password === password,
  );
  return Boolean(user);
}

export function persistSession(rememberMe: boolean): void {
  if (rememberMe) {
    localStorage.setItem(AUTH_STORAGE_KEY, "true");
  }
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_STORAGE_KEY) === "true";
}
