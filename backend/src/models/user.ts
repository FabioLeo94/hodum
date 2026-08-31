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
  username: string;
  email: string;
  companyId: string | null;
  role: UserRole | null;
  // Task "cambio password obbligatorio al primo accesso": a differenza di
  // companyId/role, NON nullable, perché la colonna DB è NOT NULL DEFAULT
  // false (migrations/0016_add_must_change_password_a_users.sql) — ogni riga
  // ne ha sempre un valore booleano.
  mustChangePassword: boolean;
}
