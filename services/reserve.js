import puppeteer from 'puppeteer';
import locale from 'date-fns/locale/it/index.js';
import parse from 'date-fns/parse/index.js';
import format from 'date-fns/format/index.js';
import differenceInCalendarDays from 'date-fns/differenceInCalendarDays/index.js';

const CUP_URL = 'https://cup.isan.csi.it/web/guest/ricetta-dematerializzata';

/**
 * Reserve
 * @param cf
 * @param numeroRicetta
 * @param counter
 * @returns {Promise<{appuntamenti: [{date: Date, address: string, isGood: boolean}], confirmed: {date: Date, address: string, isGood: boolean}, image: Buffer, info: string}>}
 */
async function reserve({ cf, ricetta: numeroRicetta, counter = 0 }) {
  console.log(`Cerco di prenotare ${cf} ${numeroRicetta} tentativo ${counter}`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--window-size=1920,1080`],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(2 * 60_000);
  page.setDefaultTimeout(2 * 60_000);
  const result = {
    info: undefined,
    confirmed: undefined,
    appuntamenti: [],
    image: undefined,
  };
  await page.goto(CUP_URL, { waitUntil: 'networkidle2' });
  await page.$eval('input.codice-fiscale-bt', (el, value) => (el.value = value), cf);
  await page.$eval('input.nreInput-bt', (el, value) => (el.value = value), numeroRicetta);
  result.image = await page.screenshot({ fullPage: true });
  await page.click(
    'button[name="_ricettaelettronica_WAR_cupprenotazione_\\:ePrescriptionSearchForm:nreButton_button"]'
  );
  // TODO: check alert _ricettaelettronica_WAR_cupprenotazione_:allMsgs
  // #_ricettaelettronica_WAR_cupprenotazione_:j_idt10:0:_t11


  await page.waitForSelector(
    'button[name="_ricettaelettronica_WAR_cupprenotazione_\\:navigation-epPrestazioni-main:epPrestazioni-nextButton-main_button"]'
  );
  // PAGE 2
  const infos = await page.$$('.prestazioneRow .infoValue');
  const info = await infos[2]?.evaluate((el) => el.textContent);
  result.info = `${info}\n`;
  result.image = await page.screenshot({ fullPage: true });
  await page.click(
    'button[name="_ricettaelettronica_WAR_cupprenotazione_:navigation-epPrestazioni-main:epPrestazioni-nextButton-main_button"]'
  );
  await page.waitForSelector('[name="_ricettaelettronica_WAR_cupprenotazione_:appuntamentiForm"],.no-available');
  result.image = await page.screenshot({ fullPage: true });
  await page.click('span[aria-describedby="Altre disponibilità"] button');
  await page.waitForSelector('#availableAppointmentsBlock');
  await new Promise((r) => setTimeout(r, 5_000));
  result.image = await page.screenshot({ fullPage: true });
  const appuntamenti = await page.$$('#availableAppointmentsBlock .appuntamento');
  for (const appuntamento of appuntamenti) {
    const data = (await appuntamento.$eval('.captionAppointment-dateApp', (el) => el.textContent))
      .replace(/\n\t*/, '')
      .replace('alle ore', ' ');
    const address = (await appuntamento.$eval('.captionAppointment-address', (el) => el.getAttribute('data-address')))
      .replace('\n', '')
      .replace('null', 'N/A');
    const zip = result.appuntamenti[0].address.split(' ').findLast(item => /[0-9]{5}/.test(item));
    const date = parse(data, 'EEEE d MMMM yyyy HH:mm', new Date(), { locale });
    const difference = differenceInCalendarDays(date, new Date());
    const isNear = !/101[0-9]{2}/.test(zip);
    if (difference === 0) {
      console.log(`${numeroRicetta} C'è poco tempo...`);
    }
    const isGood = difference > 0 && difference <= 30 && isNear;
    const friendlyDate = format(date, 'EEEE d MMMM yyyy HH:mm', { locale });
    if (!isGood) {
      console.log(`${numeroRicetta} il ${friendlyDate} è un po' troppo lontano, vero? sono ben ${difference} giorni`);
    }
    result.appuntamenti.push({
      isGood,
      date,
      address,
    });
  }
  const found = result.appuntamenti.find(({ isGood }) => isGood);
  if (!found) {
    console.log(`${numeroRicetta} Non ho trovato nulla`);
    await browser.close();
    return result;
  }
  console.log(`${numeroRicetta} Ho trovato qualcosa...`);
  await page.click('span[aria-describedby="Avanti"] button');
  await new Promise((r) => setTimeout(r, 5_000));
  result.image = await page.screenshot({ fullPage: true });
  // TODO: fill telefono + mail
  await page.click('span[aria-describedby="Conferma"] button');
  console.log(`${numeroRicetta} Preso!`);
  await new Promise((r) => setTimeout(r, 5_000));
  result.image = await page.screenshot({ fullPage: true });
  result.confirmed = found;
  return result;
}

export default reserve;
