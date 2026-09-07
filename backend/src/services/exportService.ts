import type { BackupRecord } from '../models/backup';
import type { Company, CurrencyCode } from '../models/company';
import type { Notification } from '../models/notification';
import type { Project } from '../models/project';
import type { TaskComment } from '../models/taskComment';
import type { TaskWithProject } from '../models/task';
import type { User } from '../models/user';
import { listBackups } from './backupService';
import { getCompanyById } from './companyService';
import { listAllAssignmentsByCompany, listAssignedProjects } from './projectAssignmentService';
import { listProjects } from './projectService';
import { listCommentsByAuthor, listCommentsByCompany } from './taskCommentService';
import { listTasksByCompany } from './taskService';
import { getUserById, listUsers } from './userService';
import { listForUser } from './notificationService';

// Forma di ritorno di notificationService.listForUser: interfaccia dedicata
// (non un tipo inline nel campo sotto) perché tsoa deve poterla risolvere per
// nome nello schema generato, stesso principio già seguito da tutti gli altri
// modelli condivisi in models/.
export interface UserNotificationsExport {
  items: Notification[];
  unreadCount: number;
}

// Punto 1 del piano: export dei dati di un singolo utente (self-service),
// aggregando service esistenti invece di introdurre nuove query pesanti.
export interface UserExportData {
  profile: User;
  assignedProjects: Project[];
  tasks: TaskWithProject[];
  comments: TaskComment[];
  notifications: UserNotificationsExport;
}

// Coppia (projectId, userId): stessa forma restituita da
// listAllAssignmentsByCompany, riportata qui come vista pubblica dell'export.
export interface ProjectAssignmentExport {
  projectId: string;
  userId: string;
}

// Export dell'intera azienda (owner): backups è solo metadata (id, filename,
// dimensione, timestamp) mai il contenuto fisico del dump, coerente con
// listBackups in backupService.ts.
export interface CompanyExportData {
  company: Company;
  users: User[];
  projects: Project[];
  // Aggiunta rispetto alla lista letterale del piano (che non la cita in
  // questo punto ma la richiede al punto 4, "ricreare ... project_assignments"):
  // senza questo campo l'import non avrebbe modo di sapere quali dipendenti
  // sono assegnati a quali progetti, dato che né Project né la company export
  // portano quell'informazione altrove (a differenza di Task.assignees, che la
  // porta già per task_assignments).
  projectAssignments: ProjectAssignmentExport[];
  tasks: TaskWithProject[];
  comments: TaskComment[];
  backups: BackupRecord[];
}

// Variante usata SOLO per il body di POST /companies/import (vedi
// companyController.ImportCompanyRequest/companyService.ImportCompanyInput):
// un export prodotto prima della migration 0043 non ha alcuna chiave
// "valuta" nel JSON, quindi qui è opzionale — a differenza di
// CompanyExportData.company sopra, sempre completo perché letto fresco dal DB
// (GET /companies/{id}/export). tsoa genera lo schema di validazione runtime
// del body direttamente da questo tipo: se company.valuta restasse
// obbligatoria come in CompanyExportData, un export legacy verrebbe respinto
// con un 400 generico di tsoa PRIMA di raggiungere il fallback 'EUR' già
// scritto in companyService.validateImportPayload/importCompanyData.
export interface ImportedCompanyExportData extends Omit<CompanyExportData, 'company'> {
  company: Omit<Company, 'valuta'> & { valuta?: CurrencyCode | null };
}

// Task "Cancellazione account self-service": stesso principio del vecchio
// downloadProjectModal, ma per l'intero profilo invece di un solo progetto.
// assignedProjects usa listAssignedProjects, che internamente richiede
// role === 'employee' (assertOwnEmployee in projectAssignmentService.ts): un
// owner/manager che esporta i propri dati non ha un sottoinsieme "progetti
// assegnati" nello stesso senso (vede/gestisce tutti i progetti della company),
// quindi per loro il campo resta un array vuoto invece di propagare
// EmployeeNotFoundError per un caso che non è affatto un errore.
export async function exportUserData(userId: string, companyId: string | null): Promise<UserExportData> {
  const profile = await getUserById(userId);
  const [assignedProjects, tasks, comments, notifications] = await Promise.all([
    profile.role === 'employee' && companyId !== null
      ? listAssignedProjects(userId, companyId)
      : Promise.resolve([]),
    listTasksByCompany(companyId, userId),
    listCommentsByAuthor(userId),
    listForUser(userId),
  ]);
  return { profile, assignedProjects, tasks, comments, notifications };
}

// Segnala un'inconsistenza interna (companyId validato dal chiamante, la riga
// dovrebbe sempre esistere): non un errore di dominio con uno status HTTP
// proprio come ProjectNotFoundError, quindi risale come 500 tramite l'error
// handler generico di app.ts.
export class CompanyExportNotFoundError extends Error {
  constructor(companyId: string) {
    super(`Company con id ${companyId} non trovata durante l'export`);
    this.name = 'CompanyExportNotFoundError';
  }
}

// Task "Cancellazione azienda"/"Export azienda": aggrega l'intera azienda per
// l'owner. Nessuna nuova query pesante oltre alle due già previste dal piano
// (listCommentsByCompany) e a listAllAssignmentsByCompany sopra: il resto
// riusa query esistenti di altri service.
export async function exportCompanyData(companyId: string): Promise<CompanyExportData> {
  const company = await getCompanyById(companyId);
  if (!company) {
    throw new CompanyExportNotFoundError(companyId);
  }
  const [users, projects, projectAssignments, tasks, comments, backups] = await Promise.all([
    listUsers(companyId),
    listProjects(companyId),
    listAllAssignmentsByCompany(companyId),
    listTasksByCompany(companyId),
    listCommentsByCompany(companyId),
    listBackups(companyId),
  ]);
  return { company, users, projects, projectAssignments, tasks, comments, backups };
}
