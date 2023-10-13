import dotenv from 'dotenv';
dotenv.config();
import TelegramBot from './services/telegram-bot.js';

await TelegramBot.start();