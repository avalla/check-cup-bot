import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Sovrascrivibile con RICETTE_FILE: utile per i test e per montare un volume in Docker.
const FILE_PATH = process.env.RICETTE_FILE
  ? path.resolve(process.env.RICETTE_FILE)
  : path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ricette.json');

/**
 * Formato su disco, compatibile con ricette.json.example e con i file scritti a mano:
 * [ { "<ricetta>": { cf, chat_id, giorni_max, filtro_cap, filtro } } ]
 */
function toRequest(ricetta, details) {
  return {
    ricetta,
    cf: details.cf,
    chatId: details.chat_id,
    maxDays: details.giorni_max,
    zipFilter: details.filtro_cap,
    addressFilter: details.filtro,
  };
}

function toEntry(request) {
  return {
    [request.ricetta]: {
      cf: request.cf,
      chat_id: request.chatId,
      giorni_max: request.maxDays,
      filtro_cap: request.zipFilter,
      filtro: request.addressFilter,
    },
  };
}

/**
 * Le ricerche da riprendere. Un file assente è una condizione normale:
 * è gitignorato perché contiene codici fiscali.
 * @returns {Array<{ricetta: string, cf: string, chatId: number, maxDays: number, zipFilter: string, addressFilter: string}>}
 */
export function loadRequests() {
  let data;
  try {
    data = fs.readFileSync(FILE_PATH, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Nessun ricette.json, parto senza ricerche memorizzate.');
      return [];
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    console.error(`ricette.json non è JSON valido (${FILE_PATH}): ${error.message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.error(`ricette.json deve contenere un array, trovato ${typeof parsed}. Lo ignoro.`);
    return [];
  }

  const requests = [];
  for (const item of parsed) {
    const [ricetta, details] = Object.entries(item ?? {})[0] ?? [];
    if (!ricetta || !details) {
      console.warn('Voce vuota in ricette.json, la salto.');
      continue;
    }
    const request = toRequest(ricetta, details);
    // Senza cf non si può prenotare, senza chat_id non si può rispondere a nessuno.
    if (!request.cf || !request.chatId) {
      console.warn(`Salto ${ricetta}: mancano "cf" e/o "chat_id" in ricette.json.`);
      continue;
    }
    requests.push(request);
  }
  return requests;
}

/**
 * Scrittura atomica (file temporaneo + rename) così un crash a metà non lascia
 * un ricette.json troncato. Permessi 0600: il file contiene codici fiscali.
 */
export function saveRequests(requests) {
  const payload = `${JSON.stringify(requests.map(toEntry), null, 2)}\n`;
  const tmpPath = `${FILE_PATH}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpPath, payload, { mode: 0o600 });
    fs.renameSync(tmpPath, FILE_PATH);
  } catch (error) {
    fs.rmSync(tmpPath, { force: true });
    console.error('Non sono riuscito a salvare ricette.json:', error.message);
  }
}
