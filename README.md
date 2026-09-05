# Hodum

Task manager full-stack con assistente AI integrato: React 19 + TypeScript + Vite sul frontend, Express 5 + TSOA su PostgreSQL sul backend, sincronizzazione realtime via Socket.IO.

## Stack

- **Frontend**: React 19, TypeScript, Vite 8, routing con `react-router` 8. Test con Vitest + React Testing Library.
- **Backend**: Express 5, TSOA, PostgreSQL (`pg`), Socket.IO.
- **Assistente**: Ollama (locale), invocato dal backend per la chat integrata nell'app.

## Prerequisiti

Con Docker (vedi sezione sotto) serve solo Docker Compose: Postgres, `pg_dump`
e le dipendenze Node sono già dentro le immagini. Per un setup senza Docker:

- Node.js 20+
- Un'istanza PostgreSQL raggiungibile
- `pg_dump` disponibile nel PATH del server backend, stessa versione major del PostgreSQL usato (client tools ufficiali, es. pacchetto `postgresql-client`): richiesto dalla feature di backup (Gestione aziendale > Backup, owner-only), che lo invoca come processo esterno
- Ollama in esecuzione localmente, con il modello configurato già scaricato (`ollama pull <modello>`, default `qwen2.5:14b`)

## Avvio con Docker Compose (consigliato per il self-hosting)

Il modo più semplice per avviare l'app su un server aziendale senza installare
Node/PostgreSQL a mano: `docker-compose.yml` mette su Postgres, backend e
frontend, con le migration applicate automaticamente all'avvio del backend.

```bash
cp .env.example .env   # valorizza POSTGRES_PASSWORD e JWT_SECRET come minimo
docker compose up -d --build
```

Il frontend è raggiungibile su `http://localhost:8080` (porta configurabile
con `FRONTEND_PORT` in `.env`), il backend su `http://localhost:3000`
(`BACKEND_PORT`). Per l'accesso da altri PC della rete/VPN, sostituisci
`localhost` con l'IP o l'hostname del server in `VITE_API_URL` e
`FRONTEND_ORIGIN` dentro `.env`, poi ripeti `docker compose up -d --build`
(il frontend è una SPA statica: `VITE_API_URL` viene incorporato nel bundle a
build time, non letto a runtime).

**Ollama**: di default il backend containerizzato cerca un'istanza Ollama in
esecuzione **sull'host** (raggiunta via `host.docker.internal`) — installala e
avviala normalmente sull'host (`ollama serve`, poi `ollama pull <modello>`),
è il modo più semplice per sfruttare GPU/CPU della macchina senza passare da
Docker. In alternativa, per containerizzare anche Ollama:

```bash
docker compose --profile ollama up -d
```

e imposta `OLLAMA_BASE_URL=http://ollama:11434` in `.env` prima di rifare
`docker compose up -d`. Con GPU NVIDIA disponibile, decommenta il blocco
`deploy` del servizio `ollama` in `docker-compose.yml` (richiede anche
`nvidia-container-toolkit` installato sull'host).

I dump generati dalla feature di backup (Gestione aziendale > Backup)
persistono nel volume Docker `backend-backups` anche se il container viene
ricreato.

Comandi utili:

```bash
docker compose logs -f backend   # segue i log del backend (incluse le migration all'avvio)
docker compose down              # ferma i container, mantiene i volumi (dati)
docker compose down -v           # ferma e cancella anche i volumi: PERDE i dati del database
```

## Modello di rete e accesso remoto

Hodum è pensato per girare **on-prem**, su un server dell'azienda stessa, e
**mai esposto direttamente su internet**: nessun port forwarding dal router
verso le porte del frontend/backend, nessun reverse proxy pubblico davanti
all'app. Il perimetro di sicurezza è la rete locale (LAN) dell'azienda, non
l'autenticazione applicativa da sola — quest'ultima resta comunque necessaria,
ma è pensata come seconda barriera contro un uso interno improprio (vedi i
test sui permessi per ruolo), non come difesa da attacchi via internet.

Chi installa l'app deve conoscere questo presupposto prima ancora di avviarla:
se il server è raggiungibile da internet senza VPN, il modello di sicurezza
descritto qui non vale più.

### Accesso da remoto (dipendenti fuori sede)

Un dipendente che lavora fuori ufficio non deve raggiungere l'app tramite un
indirizzo pubblico: deve prima collegarsi alla rete aziendale via **VPN**
(es. OpenVPN, WireGuard o equivalente) e poi usare Hodum con lo stesso
IP/hostname interno usato in LAN, come se fosse fisicamente in ufficio.
La VPN sorveglia e autentica l'accesso a livello di rete prima ancora che
la richiesta arrivi all'app.

Nota opzionale su TLS: se si vuole cifratura end-to-end anche dentro il
tunnel VPN (oltre alla cifratura del tunnel stesso), è possibile mettere un
reverse proxy con certificato self-signed o interno davanti al frontend —
non incluso di default in questo repo, da valutare caso per caso.

### Offboarding: revoca dell'accesso VPN

L'unico punto debole di questo modello dipende da un processo umano, non dal
codice: un certificato o una credenziale VPN non revocati quando un
dipendente lascia l'azienda restano una porta d'accesso permanente alla rete
aziendale, Hodum incluso. Alla cessazione di un rapporto di lavoro:

1. **Revoca il certificato/credenziale VPN** del dipendente sul server VPN
   (es. su OpenVPN, revoca il certificato client e rigenera la CRL).
2. **Disattiva l'utente** su Hodum stesso, così anche un accesso residuo alla
   rete (es. da un altro dispositivo già collegato) non porta comunque a dati
   applicativi.
3. Verifica che non esistano altre copie della configurazione VPN (file
   `.ovpn`, chiavi) rimaste su dispositivi aziendali non restituiti.

## Setup senza Docker (sviluppo)

```bash
# Frontend (root del repo)
npm install

# Backend
cd backend
npm install
cp .env.example .env   # imposta DATABASE_URL e le altre variabili
npm run migrate:up
```

## Avvio in locale

```bash
# Backend (backend/)
npm run dev

# Frontend (root, in un altro terminale)
npm run dev
```

## Comandi

Frontend (root del repo):

```bash
npm run dev       # avvia il dev server Vite
npm run build     # type-check (tsc -b) e build
npm run lint      # ESLint su tutto il progetto
npm run preview   # preview della build di produzione
npm test          # esegue la test suite una volta (vitest run)
npm run test:watch
```

Backend (`backend/`):

```bash
npm run dev             # rigenera routes/spec TSOA e avvia il server in watch
npm run build            # rigenera routes/spec TSOA e compila
npm start                 # avvia il server compilato
npm run migrate:up       # esegue le migration pendenti
npm run migrate:create   # crea una nuova migration
npm run db:check         # verifica la connessione al database
```

Il backend non ha uno script `lint`: `typescript-eslint` non supporta ancora
TypeScript 7 (usato qui per `tsc -b`/`tsoa:gen`), limite tracciato in
[typescript-eslint/typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
Un override npm mirato a isolare solo ESLint da questo vincolo è stato
tentato e si è rivelato inaffidabile (vedi `CLAUDE.md`, sezione Linting).

## Struttura

- `src/app/components/<nome>/` — componenti, un folder ciascuno con CSS co-locato
- `src/app/pages/<nome>/` — pagine (auth, dashboard, task list)
- `src/shared/` — routing e codice condiviso lato frontend
- `backend/src/controllers|services/` — controller TSOA e logica di business (auth, progetti, task, assistente)
- `backend/src/realtime/` — gateway Socket.IO
- `backend/migrations/` — migration SQL numerate

## Licenza

Hodum è distribuito sotto **GNU Affero General Public License v3.0 o
successiva** (AGPL-3.0-or-later) — vedi [`LICENSE`](./LICENSE). In sintesi:
puoi usare, modificare e ridistribuire liberamente il progetto, anche per
scopi commerciali (es. supporto o hosting a pagamento), ma qualunque
versione modificata — anche se offerta solo come servizio via rete, senza
distribuzione di binari — deve restare open source con la stessa licenza,
e ogni utente che ci interagisce ha diritto al codice sorgente completo
di quella versione (AGPLv3 §13).

La licenza include inoltre un termine aggiuntivo (AGPLv3 §7) che richiede
di mantenere, in ogni fork o versione derivata, una nota che ne dichiari
la derivazione da questo progetto: vedi [`NOTICE`](./NOTICE) per il testo
esatto della nota richiesta.
