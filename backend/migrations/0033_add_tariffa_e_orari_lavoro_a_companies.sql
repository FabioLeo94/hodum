-- add tariffa e orari lavoro a companies (pre-fatturazione, punto 2)
-- tariffa_oraria è sempre il valore CANONICO in €/ora, indipendentemente
-- dall'unità che l'owner preferisce vedere/inserire: il frontend converte
-- sempre a/da orario prima di salvare/mostrare (usando i giorni/orari di
-- lavoro qui sotto), così se in futuro l'azienda cambia i giorni o le fasce
-- orarie la tariffa resta coerente senza dover essere ricalcolata a mano.
-- tariffa_unita serve solo a ricordare in che unità mostrarla nella UI, non
-- è usata per interpretare tariffa_oraria.
-- I 7 booleani lavora_*: giorni della settimana in cui l'azienda presta
-- servizio. Default false su tutti, coerente con "nessun dato compilato
-- finché l'owner non lo imposta esplicitamente" già scelto in 0030 per
-- l'anagrafica.
-- orario_continuativo (default true): un'unica fascia continuativa
-- (ora_inizio_1/ora_fine_1 = apertura/chiusura, tipico di un freelance senza
-- pausa pranzo). Se false: due fasce distinte, mattina
-- (ora_inizio_1/ora_fine_1) e pomeriggio (ora_inizio_2/ora_fine_2), con una
-- pausa nel mezzo; in questo caso ora_inizio_2/ora_fine_2 restano NULL.
-- Nessun CHECK di coerenza oraria qui (es. ora_fine_1 > ora_inizio_1): stesso
-- principio di piva/codice_fiscale in 0030, la validazione vive lato
-- applicativo (companyController.ts) per poter cambiare la policy senza una
-- migration.
-- Questi campi sono il prerequisito per calcolare tariffe orarie/
-- giornaliere/ecc. che serviranno alla futura pre-fatturazione
-- (.tasks/TASK.md).

ALTER TABLE companies
  ADD COLUMN tariffa_oraria      numeric(10,2),
  ADD COLUMN tariffa_unita       varchar CHECK (tariffa_unita IN ('oraria','giornaliera','settimanale','mensile','annuale')),
  ADD COLUMN lavora_lunedi       boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_martedi      boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_mercoledi    boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_giovedi      boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_venerdi      boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_sabato       boolean NOT NULL DEFAULT false,
  ADD COLUMN lavora_domenica     boolean NOT NULL DEFAULT false,
  ADD COLUMN orario_continuativo boolean NOT NULL DEFAULT true,
  ADD COLUMN ora_inizio_1        time,
  ADD COLUMN ora_fine_1          time,
  ADD COLUMN ora_inizio_2        time,
  ADD COLUMN ora_fine_2          time;
