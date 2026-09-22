import fs from 'fs';
import path from 'path';
import format from 'date-fns/format/index.js';
import locale from 'date-fns/locale/it/index.js';
import formatDistanceToNow from 'date-fns/formatDistanceToNow/index.js';
import Bot from 'node-telegram-bot-api';
import reserve from './reserve.js';
import { fileURLToPath } from 'url';

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) {
  throw new Error('TELEGRAM_TOKEN non configurato: crea un file .env partendo da .env.example');
}

const ALLOWED_CHAT_IDS = (process.env.CHAT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);
const MAX_ATTEMPTS = 500;
const DEFAULT_MAX_DAYS = 30;

// Nei gruppi Telegram autocompleta i comandi come "/help@nome_bot": il suffisso va accettato.
const MENTION = '(?:@\\w+)?';
const HELP_RE = new RegExp(`^/(?:help|start)${MENTION}$`, 'i');
const STATUS_RE = new RegExp(`^/status${MENTION}$`, 'i');
const STOP_RE = new RegExp(`^/stop${MENTION} (010A2[0-9]+)$`, 'i');
// La regex del codice fiscale è delicata: non toccarla senza test di equivalenza.
const PRENOTA_RE =
  /^\/prenota(?:@\w+)? ((?:[A-Z][AEIOU][AEIOUX]|[AEIOU]X{2}|[B-DF-HJ-NP-TV-Z]{2}[A-Z]){2}(?:[\dLMNP-V]{2}(?:[A-EHLMPR-T](?:[04LQ][1-9MNP-V]|[15MR][\dLMNP-V]|[26NS][0-8LMNP-U])|[DHPS][37PT][0L]|[ACELMRT][37PT][01LM]|[AC-EHLMPR-T][26NS][9V])|(?:[02468LNQSU][048LQU]|[13579MPRTV][26NS])B[26NS][9V])(?:[A-MZ][1-9MNP-V][\dLMNP-V]{2}|[A-M][0L](?:[1-9MNP-V][\dLMNP-V]|[0L][1-9MNP-V]))[A-Z]) (010A2[0-9]+) ?([0-9]*)? ?([a-z0-9[\]()|\-*.]*)? ?([a-z0-9[\]()|\-*.]*)?/i;
const COMMAND_REGEXPS = [HELP_RE, STATUS_RE, STOP_RE, PRENOTA_RE];

function printMsgInfo(msg) {
  const chatId = msg.chat.id;
  const { username, first_name, last_name } = msg.from;
  console.log(
    `${format(msg.date * 1000, 'd MMMM yyyy H:mm', { locale })}: "${
      msg.text
    }" in ${chatId} from @${username} (${first_name} ${last_name})`
  );
}

function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

function formatAppuntamenti(result) {
  const righe = result.appuntamenti.map(
    ({ date, address, isGoodDate, isGoodPlace }) =>
      `- ${format(date, 'EEE dd/MM/yy H:mm', { locale })} ${address} || Posizione: ${
        isGoodPlace ? '✅' : '❌'
      } Data: ${isGoodDate ? '✅' : '❌'}`
  );
  return `${result.cf} ${result.ricetta} :: ${result.info}${righe.join('\n')}`;
}

class TelegramBot {
  _ricette = new Map();
  bot;
  constructor() {
    this.bot = new Bot(TOKEN, { polling: true });
    console.log('Bot started... 🚀');
    if (ALLOWED_CHAT_IDS.length === 0) {
      console.warn('⚠️  CHAT_IDS non configurato: il bot accetta comandi da chiunque.');
    }
    this._loadRicette();
  }

  _loadRicette() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const filePath = path.join(__dirname, '..', 'ricette.json');
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const ricette = JSON.parse(data);
      ricette.forEach((item) => {
        const [ricetta, details] = Object.entries(item)[0];
        this._ricette.set(ricetta, details);
      });
      console.log('Ricette loaded:', this._ricette);
    } catch (error) {
      console.error('Error loading ricette:', error);
    }
  }

  _isAllowed(msg) {
    if (ALLOWED_CHAT_IDS.length === 0) {
      return true;
    }
    return ALLOWED_CHAT_IDS.includes(String(msg.chat.id));
  }

  _guard(handler) {
    return async (msg, match) => {
      printMsgInfo(msg);
      if (!this._isAllowed(msg)) {
        console.warn(`Comando rifiutato dalla chat non autorizzata ${msg.chat.id}`);
        await this.bot.sendMessage(msg.chat.id, 'Non sei autorizzato a usare questo bot.');
        return;
      }
      return handler.call(this, msg, match);
    };
  }

  async start() {
    await this.bot.setMyCommands([
      { command: 'prenota', description: 'prenota codice_fiscale ricetta giorni filtrocap filtroindirizzo' },
      { command: 'status', description: 'Le ricette in ricerca' },
      { command: 'stop', description: 'stop ricetta - interrompe la ricerca' },
      { command: 'help', description: 'Mostra un help' },
    ]);
    const commands = [
      [HELP_RE, this._help],
      [STATUS_RE, this._status],
      [STOP_RE, this._stop],
      [PRENOTA_RE, this._reserve],
    ];
    for (const [regexp, handler] of commands) {
      this.bot.onText(regexp, this._guard(handler));
    }
    // Fallback: senza questo qualsiasi comando malformato sparisce nel nulla.
    this.bot.on('message', (msg) => this._fallback(msg).catch((error) => console.error(error)));
  }

  async _fallback(msg) {
    if (!msg.text || !this._isAllowed(msg)) {
      return;
    }
    if (COMMAND_REGEXPS.some((regexp) => regexp.test(msg.text))) {
      return;
    }
    printMsgInfo(msg);
    await this.bot.sendMessage(
      msg.chat.id,
      `Non ho capito il comando. Usa /help per vedere la sintassi.\nEsempio:\n/prenota RSSMRA85L14H501M 010A21234567890 45`
    );
  }

  async _help(msg) {
    return await this.bot.sendMessage(
      msg.chat.id,
      `I comandi disponibili sono i seguenti:
- /prenota: Richiedi prenotazione codice_fiscale ricetta [maxDays] [cap regexp] [indirizzo regexp]
- /status: Le ricette ricercate
- /stop: Interrompe la ricerca di una ricetta
- /help: Questo help`
    );
  }

  async _status(msg) {
    const chatId = msg.chat.id;
    const text = Array.from(this._ricette.values())
      .filter((result) => result?.chatId === chatId)
      .map(formatAppuntamenti)
      .join('\n-------\n');
    await this.bot.sendMessage(chatId, text || 'Ancora nessuna informazione...');
  }

  async _stop(msg, match) {
    const chatId = msg.chat.id;
    const [, ricetta] = match;
    if (!this._ricette.has(ricetta)) {
      await this.bot.sendMessage(chatId, `Non sto cercando la ricetta ${ricetta}.`);
      return;
    }
    this._ricette.delete(ricetta);
    await this.bot.sendMessage(chatId, `Ok, interrompo la ricerca di ${ricetta} al prossimo controllo.`);
  }

  async _reserve(msg, match) {
    const chatId = msg.chat.id;
    const [, cf, ricetta, maxDaysRaw, zipFilter, addressFilter] = match;
    const maxDays = maxDaysRaw ? Number(maxDaysRaw) : DEFAULT_MAX_DAYS;
    if (this._ricette.has(ricetta)) {
      await this.bot.sendMessage(chatId, `Sto già cercando di prenotare questa ricetta!`);
      return;
    }
    this._ricette.set(ricetta, null);
    let result = {
      info: undefined,
      found: undefined,
      confirmed: undefined,
      error: undefined,
      appuntamenti: [],
      images: [],
      cf,
      ricetta,
      chatId,
    };
    let counter = 1;
    let previousMessage;
    let previousPhotoMessageId;
    await this.bot.sendMessage(
      chatId,
      `Ok proverò a cercare una visita ${ricetta} a ${maxDays} giorni di distanza, filtro cap: ${
        zipFilter || 'N/A'
      } e filtro indirizzo: ${addressFilter || 'N/A'}`
    );

    while (true) {
      try {
        result = await reserve({ chatId, cf, ricetta, maxDays, zipFilter, addressFilter });
        // La ricerca può essere stata interrotta da /stop mentre reserve() era in corso.
        if (!this._ricette.has(ricetta)) {
          return;
        }
        this._ricette.set(ricetta, result);

        if (result.appuntamenti.length > 0) {
          if (previousMessage) {
            await this.bot.deleteMessage(chatId, previousMessage.message_id);
          }
          previousMessage = await this.bot.sendMessage(chatId, formatAppuntamenti(result));

          // Send the latest screenshot and delete the previous one
          if (result.images.length > 0) {
            if (previousPhotoMessageId) {
              await this.bot.deleteMessage(chatId, previousPhotoMessageId);
            }
            const photoMessage = await this.bot.sendPhoto(chatId, result.images[0]);
            previousPhotoMessageId = photoMessage.message_id;
          }
        }
      } catch (error) {
        console.error(error);
        await this.bot.sendMessage(chatId, `Scusa, c'è stato un errore :( Riprovo tra poco.`);
      }

      if (result.confirmed || result.error) {
        break;
      }

      if (counter >= MAX_ATTEMPTS) {
        await this.bot.sendMessage(
          chatId,
          `Ho raggiunto ${MAX_ATTEMPTS} tentativi per ${ricetta} senza trovare nulla. Mi fermo, rilancia /prenota se vuoi riprovare.`
        );
        break;
      }

      const minutes = randomIntFromInterval(0, 2) * 60;
      const seconds = randomIntFromInterval(0, 60);
      if (counter % 10 === 0) {
        await this.bot.sendMessage(
          chatId,
          `Ho fatto ${counter} tentativi per prenotare la ${ricetta}. Continuo a cercare...`
        );
      }
      console.log(`${ricetta} aspetto ${minutes + seconds} secondi`);
      await new Promise((r) => setTimeout(r, (minutes + seconds) * 1_000));
      if (!this._ricette.has(ricetta)) {
        console.log(`${ricetta} ricerca interrotta`);
        return;
      }
      counter++;
    }

    if (result.confirmed) {
      for (const image of result.images) {
        await this.bot.sendPhoto(chatId, image);
      }
      const daysToNow = formatDistanceToNow(result.confirmed.date, { locale });
      const friendlyDate = format(result.confirmed.date, 'EEEE d MMMM yyyy H:mm', { locale });
      await this.bot.sendMessage(
        chatId,
        `Prenotazione confermata tra ${daysToNow} 🍾\n${cf} ${ricetta}\n${result.info}\n${result.confirmed.address}\n${friendlyDate}`
      );
    } else if (result.error) {
      for (const image of result.images) {
        await this.bot.sendPhoto(chatId, image);
      }
      await this.bot.sendMessage(chatId, `Rimuovo ${cf} ${ricetta}\n${result.error}`);
    }
    this._ricette.delete(ricetta);
  }
}

const singletonInstance = new TelegramBot();

Object.freeze(singletonInstance);
export default singletonInstance;
