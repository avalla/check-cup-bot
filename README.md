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
