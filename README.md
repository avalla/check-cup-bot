# Check CUP Bot

## ASL Italy Appointment Booking Bot

Use at your own risk!

## Setup

Richiede [Bun](https://bun.sh) (>= 1.0).

```shell
bun install
cp .env.example .env   # poi compila TELEGRAM_TOKEN e CHAT_IDS
bun run start
```

`bun install` esegue il postinstall di Puppeteer, che scarica la build di Chrome
corrispondente. Se il browser risulta mancante:

```shell
bunx puppeteer browsers install chrome
```

### Variabili d'ambiente

Bun carica automaticamente il file `.env`.

| Variabile        | Descrizione                                                                       |
| ---------------- | --------------------------------------------------------------------------------- |
| `TELEGRAM_TOKEN` | Token del bot (obbligatorio).                                                     |
| `CHAT_IDS`       | Chat ID autorizzate, separate da virgola. Se vuoto **chiunque** può usare il bot. |
| `RICETTE_FILE`   | Percorso dello stato. Default: `ricette.json` nella root del progetto.            |

### Stato delle ricerche

Le ricerche in corso sono salvate in `ricette.json`, che il bot **scrive da solo**
a ogni `/prenota` e a ogni `/stop`: non va creato a mano e se manca il bot parte
senza ricerche memorizzate. La scrittura è atomica (file temporaneo + rename) e il
file ha permessi `0600` perché contiene codici fiscali. È gitignorato: il formato
è documentato in `ricette.json.example`.

Al riavvio il bot **riprende le ricerche interrotte** e lo comunica alla chat che
le aveva richieste. Le voci senza `cf` o `chat_id` vengono saltate con un warning.
Vengono salvati solo i parametri della richiesta, mai le screenshot.

### Dipendenze di sistema (Linux)

Chromium richiede queste librerie, già incluse nel `Dockerfile`:

```shell
apt install libatk1.0-0 libatk-bridge2.0-0 libcups2 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libpangocairo-1.0-0 libasound2 libgbm1 libnss3
```

## Comandi del bot

- `/prenota <codice_fiscale> <ricetta> [maxDays] [regexp cap] [regexp indirizzo]`
- `/status` — le ricerche in corso per questa chat
- `/stop <ricetta>` — interrompe una ricerca
- `/help`

## Script

```shell
bun run start    # avvia il bot
bun run lint     # eslint
bun run format   # prettier
bun test         # test runner di Bun
```
