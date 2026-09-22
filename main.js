// Bun carica automaticamente il file .env, non serve dotenv.
import TelegramBot from './services/telegram-bot.js';

await TelegramBot.start();
