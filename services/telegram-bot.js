import format from 'date-fns/format/index.js';
import locale from 'date-fns/locale/it/index.js';
import dotenv from 'dotenv';
import Bot from 'node-telegram-bot-api';
import reserve from './reserve.js';
import formatDistanceToNow from 'date-fns/formatDistanceToNow/index.js';
dotenv.config();

const TOKEN = process.env.TELEGRAM_TOKEN;

function printMsgInfo(msg) {
  const chatId = msg.chat.id;

  const { username, first_name, last_name } = msg.from;
  console.log(
    `${format(msg.date*1000, 'd MMMM yyyy H:mm', { locale })}: "${
      msg.text
    }" in ${chatId} from @${username} (${first_name} ${last_name})`
  );
}
function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

class TelegramBot {
  _ricette = new Set();
  bot;
  constructor() {
    this.bot = new Bot(TOKEN, { polling: true });
    console.log('Bot started... 🚀');
  }
  async start() {
    await this.bot.setMyCommands([
      { command: 'prenota', description: 'prenota <codice fiscale> <ricetta>' },
      { command: 'help', description: 'Mostra un help' },
    ]);
    this.bot.onText(/\/help/, this._help.bind(this));
    this.bot.onText(
      /\/prenota ((?:[A-Z][AEIOU][AEIOUX]|[AEIOU]X{2}|[B-DF-HJ-NP-TV-Z]{2}[A-Z]){2}(?:[\dLMNP-V]{2}(?:[A-EHLMPR-T](?:[04LQ][1-9MNP-V]|[15MR][\dLMNP-V]|[26NS][0-8LMNP-U])|[DHPS][37PT][0L]|[ACELMRT][37PT][01LM]|[AC-EHLMPR-T][26NS][9V])|(?:[02468LNQSU][048LQU]|[13579MPRTV][26NS])B[26NS][9V])(?:[A-MZ][1-9MNP-V][\dLMNP-V]{2}|[A-M][0L](?:[1-9MNP-V][\dLMNP-V]|[0L][1-9MNP-V]))[A-Z]) (010A2[0-9]+) ?(3[0-9]{8-9})?/i,
      this._reserve.bind(this)
    );
  }
  async _help(msg) {
    const chatId = msg.chat.id;
    printMsgInfo(msg);
    return await this.bot.sendMessage(
      chatId,
      `I comandi disponibili sono i seguenti:
- prenota: Richiedi prenotazione <codice fiscale> <ricetta>
- help: Questo help`
    );
  }
  async _reserve(msg, match) {
    const chatId = msg.chat.id;
    printMsgInfo(msg);
    const [_, cf, ricetta, phone, email] = match;
    if (this._ricette.has(ricetta)) {
      await this.bot.sendMessage(chatId, `Sto già cercando di prenotare questa ricetta!`);
      return;
    }
    this._ricette.add(ricetta);
    let result = {};
    let counter = 0;

    while (!result.confirmed) {
      const randomMinutes = randomIntFromInterval(2, 5);
      const randomSeconds = randomIntFromInterval(55, 65);
      try {
        result = await reserve({ cf, ricetta, phone, email, counter });
      } catch (error) {
        await this.bot.sendMessage(chatId, `Scusa, c\'è stato un errore :( ${error}`);
        console.error(error);
      }
      if (result.confirmed) {
        break;
      }
      await this.bot.sendMessage(chatId, `${result.info}\n${result.appuntamenti.map((a) => a.text).join('\n')}`);
      await this.bot.sendMessage(
        chatId,
        `Tra circa ${Math.round(
          (randomMinutes * randomSeconds) / 60
        )} minuti proverò a cercare un appuntamento per la ricetta ${ricetta} tentativo ${counter+1}`
      );
      await new Promise((r) => setTimeout(r, randomMinutes * randomSeconds * 1_000));
      counter++;
    }
    if (result.confirmed) {
      for (const image of result.images) {
        await this.bot.sendPhoto(chatId, image);
      }
    }
    if (!result.confirmed) {
      await this.bot.sendMessage(chatId, `${result.info}\n${result.appuntamenti.map((a) => a.text).join('\n')}`);
      return;
    }
    const daysToNow = formatDistanceToNow(result.confirmed.date, { locale });
    const friendlyDate = format(result.confirmed.date, 'EEEE d MMMM yyyy H:mm', { locale });
    await this.bot.sendMessage(
      chatId,
      `Ho prenotato tra ${daysToNow} 🍾\n${cf} ${ricetta}\n${result.info}\n${result.confirmed.address}\n${friendlyDate}`
    );
    this._ricette.delete(ricetta);
  }
}

const singletonInstance = new TelegramBot();

Object.freeze(singletonInstance);
export default singletonInstance;
