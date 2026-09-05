// Riusato da ogni punto di export JSON (dati utente, dati azienda): stesso
// pattern di downloadProject in projectExport.ts (URL.createObjectURL + <a
// download> temporaneo, rimosso subito dopo il click), senza le varianti
// xml/csv/excel perché qui l'unico formato è sempre JSON.
export function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
