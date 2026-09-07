// Generazione e persistenza su disco del PDF di pre-fattura. Isolato da
// invoiceService.ts (che orchestra la transazione DB) per stessa separazione
// di responsabilità di backupService.ts (dump/restore) vs backupFilename.ts
// (solo formattazione): qui non c'è alcuna query, solo composizione del
// documento e I/O sul filesystem.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import type { Company } from '../models/company';
import type { Customer } from '../models/customer';
import type { Invoice } from '../models/invoice';
import type { InvoiceItem } from '../models/invoiceItem';
import { roundToCents } from '../utils/rounding';

// backend/invoices: stessa profondità/motivo di BACKUPS_DIR in
// backupService.ts (da src/services risale a backend/), fuori da src/ e da
// dist/ così sopravvive indipendentemente da dove gira il codice compilato, e
// va escluso da git (vedi backend/.gitignore) perché contiene documenti
// generati, non codice.
const INVOICES_DIR = join(__dirname, '..', '..', 'invoices');

function formatCurrency(value: number): string {
  return `€ ${value.toFixed(2)}`;
}

function formatHours(secondi: number): string {
  return `${(secondi / 3600).toFixed(2)} h`;
}

// Nessuna libreria di formattazione data aggiuntiva: lo stesso principio già
// applicato altrove nel backend (formatDateOnly in utils/dateOnly.ts) non fa
// al caso di un timestamp con ora, quindi qui un giro diretto via
// toLocaleDateString basta per un documento non fiscale.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('it-IT');
}

// Solo i campi che questa funzione legge davvero (taskTitle, secondiFatturati,
// tariffaOrariaSnapshot, nonFatturabile): invoiceService.previewInvoicePdf
// costruisce righe non ancora persistite (nessun id/invoiceId/projectId reali,
// la pre-fattura non esiste ancora) e non deve inventare valori fittizi per
// soddisfare un tipo più largo del necessario. I due chiamanti che passano
// InvoiceItem[] completi restano compatibili: è un sottoinsieme strutturale.
type InvoicePdfItem = Pick<InvoiceItem, 'taskTitle' | 'secondiFatturati' | 'tariffaOrariaSnapshot' | 'nonFatturabile'>;

// Documento semplice, non un layout fiscale: intestazione azienda/cliente,
// tabella dei task inclusi, totali, e l'etichetta obbligatoria "non fiscale"
// (vedi piano feature) ben visibile in testa, non in un footer che potrebbe
// passare inosservato.
//
// `preview`: usata da invoiceService.previewInvoicePdf per l'anteprima
// pre-conferma (task 13 del backlog UI) — nessuna invoice persistita ancora,
// quindi niente numero/data di generazione reali da stampare in intestazione.
export async function renderInvoicePdf(
  invoice: Invoice,
  items: InvoicePdfItem[],
  company: Company,
  customer: Customer,
  options?: { preview?: boolean },
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .fontSize(9)
    .fillColor('red')
    .text('Documento non fiscale - pre-fattura ad uso interno, non sostituisce la fattura elettronica', {
      align: 'center',
    })
    .fillColor('black');
  doc.moveDown();

  if (options?.preview) {
    doc.fontSize(18).text('Anteprima pre-fattura', { align: 'left' });
    doc.fontSize(10).text(`Documento generato il ${formatDateTime(new Date().toISOString())} — non ancora confermato`);
  } else {
    doc.fontSize(18).text(`Pre-fattura n. ${invoice.numero}`, { align: 'left' });
    doc.fontSize(10).text(`Generata il ${formatDateTime(invoice.dataGenerazione)}`);
  }
  doc.moveDown();

  doc.fontSize(12).text(company.name, { continued: false });
  if (company.ragioneSociale) doc.fontSize(10).text(company.ragioneSociale);
  if (company.piva) doc.fontSize(10).text(`P.IVA ${company.piva}`);
  doc.moveDown();

  doc.fontSize(12).text(`Cliente: ${customer.name}`);
  doc.moveDown();

  // Intestazione tabella: colonne a larghezza fissa, sufficiente per un
  // documento interno (nessun wrapping/paginazione sofisticata necessaria per
  // il volume atteso di una PMI/freelance, stesso ordine di grandezza già
  // assunto per i backup sincroni in backupService.ts).
  // Colonne posizionate con chiamate indipendenti (niente `continued: true`):
  // in modalità continued pdfkit non rispetta in modo affidabile la x
  // esplicita passata a ogni segmento della catena, disallineando l'header
  // rispetto alle righe dati sottostanti, che già usano questo stesso
  // pattern a chiamate indipendenti.
  doc.fontSize(10).font('Helvetica-Bold');
  const headerY = doc.y;
  doc.text('Task', 50, headerY, { width: 220 });
  doc.text('Ore', 270, headerY, { width: 60 });
  doc.text('Tariffa', 330, headerY, { width: 80 });
  doc.text('Importo', 410, headerY, { width: 100 });
  doc.font('Helvetica');
  doc.y = headerY;
  doc.moveDown(1.5);

  for (const item of items) {
    // roundToCents PRIMA di stampare, stessa formula e stesso arrotondamento
    // per riga usati da invoiceService.generateInvoice per calcolare
    // totaleImporto (somma delle righe già arrotondate, non l'arrotondamento
    // della somma raw): senza, la somma dei centesimi stampati riga per riga
    // potrebbe non tornare con "Totale importo" in fondo allo stesso PDF.
    const importoRiga = item.nonFatturabile ? 0 : roundToCents((item.secondiFatturati / 3600) * item.tariffaOrariaSnapshot);
    const y = doc.y;
    doc.text(item.taskTitle, 50, y, { width: 220 });
    doc.text(formatHours(item.secondiFatturati), 270, y, { width: 60 });
    doc.text(formatCurrency(item.tariffaOrariaSnapshot) + '/h', 330, y, { width: 80 });
    doc.text(item.nonFatturabile ? `${formatCurrency(0)} (omaggio)` : formatCurrency(importoRiga), 410, y, {
      width: 100,
    });
    doc.moveDown(0.5);
  }

  doc.moveDown();
  doc.font('Helvetica-Bold');
  doc.text(`Totale ore: ${formatHours(invoice.totaleSecondi)}`);
  doc.text(`Totale importo: ${formatCurrency(invoice.totaleImporto)}`);
  doc.font('Helvetica');

  doc.end();
  return done;
}

// Mirror esatto di come backupService.ts gestisce la propria cartella (vedi
// mkdir + join in performBackup): filename deterministico dall'id fattura,
// niente di configurabile come backupFilename.ts perché qui non c'è una
// rotazione/formato scelto dall'utente.
export async function writeInvoicePdfToDisk(invoiceId: string, buffer: Buffer): Promise<string> {
  await mkdir(INVOICES_DIR, { recursive: true });
  const filename = `${invoiceId}.pdf`;
  await writeFile(join(INVOICES_DIR, filename), buffer);
  return filename;
}

// Usata da invoiceService.getInvoicePdfPath per ricostruire il path assoluto
// dal filename salvato in invoices.pdf_path, stesso principio di
// join(BACKUPS_DIR, target.filename) in backupService.deleteBackup.
export function resolveInvoicePdfPath(filename: string): string {
  return join(INVOICES_DIR, filename);
}
