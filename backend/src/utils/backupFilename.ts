// Placeholder supportati nel formato scelto dall'owner (BackupSettings.filenameFormat):
// {company} nome azienda slugificato, {date} YYYYMMDD, {time} HHmmss,
// {index} contatore monotono a 4 cifre (vedi company_backup_settings.next_index).
const PLACEHOLDER_PATTERN = /\{(company|date|time|index)\}/g;

// Il formato è testo scelto dall'owner (PUT /company/backups/settings), non
// un valore server-generato: prima ancora di renderizzarlo, si valida che
// fuori dai placeholder contenga solo caratteri sicuri per un nome file, così
// un tentativo di iniettare '/', '..' o simili viene rifiutato in fase di
// salvataggio delle impostazioni invece di scoprirlo solo al primo backup.
const SAFE_LITERAL_REGEX = /^[A-Za-z0-9 _.-]*$/;
const MAX_FORMAT_LENGTH = 150;

export function isValidFilenameFormat(format: string): boolean {
  if (format.length === 0 || format.length > MAX_FORMAT_LENGTH) return false;
  const withoutPlaceholders = format.replace(PLACEHOLDER_PATTERN, '');
  // Un '{' o '}' sopravvissuto significa un placeholder sconosciuto o non
  // chiuso: SAFE_LITERAL_REGEX li respinge già (non sono nel charset), questo
  // controllo è ridondante ma esplicita l'intento a chi legge.
  return SAFE_LITERAL_REGEX.test(withoutPlaceholders) && !withoutPlaceholders.includes('{') && !withoutPlaceholders.includes('}');
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function formatDate(now: Date): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
}

function formatTime(now: Date): string {
  return `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
}

// Slug via replace di ogni carattere non alfanumerico invece di una libreria
// dedicata: nessuna dipendenza di slugificazione nel progetto e la
// trasformazione che serve qui è a un passo solo (niente traslitterazione di
// accenti, un nome come "Acme S.r.l." diventa "acme-s-r-l" ed è comunque un
// nome file leggibile e univoco a sufficienza).
function slugifyCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'azienda';
}

export interface RenderFilenameInput {
  format: string;
  companyName: string;
  index: number;
  now: Date;
}

const BACKUP_EXTENSION = '.dump';

// Seconda linea di difesa dopo isValidFilenameFormat: anche un formato già
// validato al salvataggio produce comunque un output da ripulire (lo slug
// aziendale o un futuro placeholder potrebbero introdurre spazi/punti
// consecutivi), quindi il rendering finale passa sempre da qui prima di
// toccare il filesystem.
function sanitizeFilename(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9 _.-]/g, '-').trim();
  return cleaned.length > 0 ? cleaned : 'backup';
}

export function renderBackupFilename({ format, companyName, index, now }: RenderFilenameInput): string {
  const rendered = format.replace(PLACEHOLDER_PATTERN, (_match, token: string) => {
    switch (token) {
      case 'company':
        return slugifyCompanyName(companyName);
      case 'date':
        return formatDate(now);
      case 'time':
        return formatTime(now);
      case 'index':
        return pad(index, 4);
      default:
        return _match;
    }
  });
  return `${sanitizeFilename(rendered)}${BACKUP_EXTENSION}`;
}
