import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';

let dir;
let file;

/** store.js legge RICETTE_FILE all'import, quindi va impostato prima e il modulo ricaricato. */
async function freshStore() {
  return await import(`./store.js?${Math.random()}`);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cupbot-'));
  file = path.join(dir, 'ricette.json');
  process.env.RICETTE_FILE = file;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.RICETTE_FILE;
});

const request = {
  ricetta: '010A34068144576',
  cf: 'TLIMRAS8B43B098W',
  chatId: 55501,
  maxDays: 45,
  zipFilter: '(101.*|N.*)',
  addressFilter: '.*',
};

describe('loadRequests', () => {
  test('file assente: nessuna ricerca, nessuna eccezione', async () => {
    const { loadRequests } = await freshStore();
    expect(loadRequests()).toEqual([]);
  });

  test('JSON corrotto: non fa crashare il bot', async () => {
    fs.writeFileSync(file, '{rotto');
    const { loadRequests } = await freshStore();
    expect(loadRequests()).toEqual([]);
  });

  test('radice non array: ignorata', async () => {
    fs.writeFileSync(file, '{"010A34068144576": {}}');
    const { loadRequests } = await freshStore();
    expect(loadRequests()).toEqual([]);
  });

  test('scarta le voci senza cf o chat_id, tiene le altre', async () => {
    fs.writeFileSync(
      file,
      JSON.stringify([
        { '010A34068144576': { cf: 'TLIMRAS8B43B098W', chat_id: 55501, giorni_max: 45 } },
        { '010A34068144577': { chat_id: 55501 } }, // manca cf
        { '010A34068144578': { cf: 'TLIMRAS8B43B098W' } }, // manca chat_id
        {}, // voce vuota
      ])
    );
    const { loadRequests } = await freshStore();
    const caricate = loadRequests();
    expect(caricate).toHaveLength(1);
    expect(caricate[0].ricetta).toBe('010A34068144576');
    expect(caricate[0].maxDays).toBe(45);
  });

  test('legge il formato di ricette.json.example', async () => {
    const example = fs.readFileSync(new URL('../ricette.json.example', import.meta.url), 'utf8');
    const entries = JSON.parse(example);
    // L'example non ha chat_id: lo aggiungo, il resto del formato deve bastare.
    const [ricetta, details] = Object.entries(entries[0])[0];
    fs.writeFileSync(file, JSON.stringify([{ [ricetta]: { ...details, chat_id: 1 } }]));
    const { loadRequests } = await freshStore();
    const [caricata] = loadRequests();
    expect(caricata.cf).toBe(details.cf);
    expect(caricata.maxDays).toBe(details.giorni_max);
    expect(caricata.zipFilter).toBe(details.filtro_cap);
    expect(caricata.addressFilter).toBe(details.filtro);
  });
});

describe('saveRequests', () => {
  test('salva e rilegge senza perdere nulla', async () => {
    const { loadRequests, saveRequests } = await freshStore();
    saveRequests([request]);
    expect(loadRequests()).toEqual([request]);
  });

  test('scrive con permessi 0600: il file contiene codici fiscali', async () => {
    const { saveRequests } = await freshStore();
    saveRequests([request]);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  test('non lascia file temporanei in giro', async () => {
    const { saveRequests } = await freshStore();
    saveRequests([request]);
    expect(fs.readdirSync(dir)).toEqual(['ricette.json']);
  });

  test('lista vuota: azzera il file', async () => {
    const { loadRequests, saveRequests } = await freshStore();
    saveRequests([request]);
    saveRequests([]);
    expect(loadRequests()).toEqual([]);
  });

  test('non persiste screenshot o altri campi di runtime', async () => {
    const { saveRequests } = await freshStore();
    saveRequests([request]);
    const scritto = fs.readFileSync(file, 'utf8');
    expect(scritto).not.toContain('images');
    expect(scritto).not.toContain('appuntamenti');
  });
});
