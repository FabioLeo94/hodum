// 'owner' | 'manager' | 'employee' (migrations/0014_add_company_id_e_role_a_users.sql,
// esteso con 'manager' da 0017_add_manager_role_a_users.sql). null finché
// l'utente non è agganciato a un'azienda (task 5/6 del task "Azienda
// multi-utente", non ancora implementati).
export type UserRole = 'owner' | 'manager' | 'employee';

// Forma dell'entità User esposta dall'API: camelCase lato applicativo, e
// soprattutto SENZA il campo password — l'hash non deve mai lasciare il
// service (vedi toUser in userService.ts).
export interface User {
  id: string;
  // Nullable da migrations/0041: lo username resta unico se valorizzato
  // (users_unique invariato, più righe NULL non lo violano in Postgres), ma
  // non è più obbligatorio — se assente si mostra "nome cognome" (vedi
  // firstName/lastName sotto e la regola di composizione nei service che
  // calcolano un display name, es. taskService/notificationService).
  username: string | null;
  email: string;
  companyId: string | null;
  role: UserRole | null;
  // NOT NULL da migrations/0041: a differenza di username, sempre richiesti.
  firstName: string;
  lastName: string;
  // Nullable da migrations/0041: informativo, mai usato per il display name
  // (quello si compone solo da username/firstName/lastName).
  pronoun: string | null;
  // Task "cambio password obbligatorio al primo accesso": a differenza di
  // companyId/role, NON nullable, perché la colonna DB è NOT NULL DEFAULT
  // false (migrations/0016_add_must_change_password_a_users.sql) — ogni riga
  // ne ha sempre un valore booleano.
  mustChangePassword: boolean;
  // ISO 8601. NOT NULL DEFAULT now() (migrations/0019), sola lettura lato
  // frontend: mai valorizzato da un body di richiesta, solo dal DB.
  createdAt: string;
  // ISO 8601 o null se l'account non ha ancora effettuato un accesso
  // (migrations/0019). Valorizzato da authService.login lato backend, mai da
  // un body di richiesta: sola lettura lato frontend, come createdAt.
  lastLoginAt: string | null;
  // ISO 8601 o null se l'utente è attivo (migrations/0040). Non-null blocca
  // login (authService.login) e ogni richiesta autenticata anche con un
  // token già valido (expressAuthentication), senza eccezioni: solo l'owner
  // può riabilitarlo via updateUser, l'utente stesso non ha via d'uscita.
  disabledAt: string | null;
}
