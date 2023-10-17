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
 * @param phone
 * @param email
 * @param counter
 * @returns {Promise<{appuntamenti: [{date: Date, address: string, isGood: boolean}], confirmed: {date: Date, address: string, isGood: boolean}, images: [Buffer], info: string}>}
 */
async function reserve({ cf, ricetta: numeroRicetta, phone, email, counter = 0 }) {
  console.log(`Cerco di prenotare ${cf} ${numeroRicetta} ${phone} ${email} tentativo ${counter}`);
  const result = {
    info: undefined,
    found: undefined,
    confirmed: undefined,
    error: undefined,
    appuntamenti: [],
    images: [],
  };
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--window-size=1920,1080`],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(2 * 60_000);
  page.setDefaultTimeout(2 * 60_000);

  // PROSEGUI/AVANTI/NOTE+PRESAVISIONE/CONFERMA
  async function nextPage(counter = 0) {
    const [prosegui] = await page.$$('span[aria-describedby="Prosegui"] button');
    if (prosegui) {
      await page.click('span[aria-describedby="Prosegui"] button');
    }
    const [avanti] = await page.$$('span[aria-describedby="Avanti"] button');
    if (avanti) {
      await page.click('span[aria-describedby="Avanti"] button');
    }
    // Note
    const [note] = await page.$$('span[aria-describedby="Note"] button');
    if (note) {
      await page.click('span[aria-describedby="Note"] button');
      return nextPage();
    }
    // Conferma presa visione
    const [presaVisione] = await page.$$('span[aria-describedby="Conferma presa visione"] button');
    if (presaVisione) {
      await page.click('span[aria-describedby="Conferma presa visione"] button');
      return nextPage();
    }
    const [conferma] = await page.$$('span[aria-describedby="Conferma"] button');
    if (conferma) {
      await page.click('span[aria-describedby="Conferma"] button');
    }

    await new Promise((r) => setTimeout(r, 5_000));
    const [warning] = await page.$$('.messagifyMsg.alert-danger span');
    if (warning && counter < 5) {
      const message = await warning?.evaluate((el) => el.textContent);
      console.log(message);
      result.error = message;
      return nextPage(counter + 1);
    }
  }

  await page.goto(CUP_URL, { waitUntil: 'networkidle2' });
  await page.$eval('input.codice-fiscale-bt', (el, value) => (el.value = value), cf);
  await page.$eval('input.nreInput-bt', (el, value) => (el.value = value), numeroRicetta);
  await new Promise((r) => setTimeout(r, 5_000));
  //result.images.push(await page.screenshot({ fullPage: true }));

  await nextPage();
  if (result.error) {
    result.images.push(await page.screenshot({ fullPage: true }));
    await browser.close();
    return result;
  }
  await page.waitForSelector(
    'button[name="_ricettaelettronica_WAR_cupprenotazione_\\:navigation-epPrestazioni-main:epPrestazioni-nextButton-main_button"]'
  );
  // PAGE 2
  const infos = await page.$$('.prestazioneRow .infoValue');
  const info = await infos[2]?.evaluate((el) => el.textContent);
  result.info = `${info}\n`;
  result.images.push(await page.screenshot({ fullPage: true }));
  await nextPage();
  if (result.error) {
    result.images.push(await page.screenshot({ fullPage: true }));
    await browser.close();
    return result;
  }
  await page.waitForSelector('[name="_ricettaelettronica_WAR_cupprenotazione_:appuntamentiForm"],.no-available');
  // PAGE 3
  result.images.push(await page.screenshot({ fullPage: true }));
  await page.click('span[aria-describedby="Altre disponibilità"] button');
  await page.waitForSelector('#availableAppointmentsBlock');
  await new Promise((r) => setTimeout(r, 5_000));
  result.images.push(await page.screenshot({ fullPage: true }));
  const appuntamenti = await page.$$('#availableAppointmentsBlock .appuntamento');
  for (const appuntamento of appuntamenti) {
    const data = (await appuntamento.$eval('.captionAppointment-dateApp', (el) => el.textContent))
      .replace(/\n\t*/, '')
      .replace('alle ore', ' ');
    const address = (await appuntamento.$eval('.captionAppointment-address', (el) => el.getAttribute('data-address')))
      .replace('\n', '')
      .replace('null', 'N/A');
    const zip = address.split(' ').findLast((item) => /[0-9]{5}/.test(item));
    const date = parse(data, 'EEEE d MMMM yyyy HH:mm', new Date(), { locale });
    const difference = differenceInCalendarDays(date, new Date());
    if (difference === 0) {
      console.log(`${numeroRicetta} C'è poco tempo...`);
    }
    const isNear = /101[0-9]{2}/.test(zip);
    let isGood = false;
    switch (true) {
      case numeroRicetta === '010A24768440188':
        isGood = difference > 0 && difference <= 60 && isNear;
        break;
      default:
        isGood = difference > 0 && difference <= 60;
        break;
    }
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
  result.found = result.appuntamenti.find(({ isGood }) => isGood);
  if (!result.found) {
    console.log(`${numeroRicetta} Non ho trovato nulla`);
    await browser.close();
    return result;
  }
  console.log(`${numeroRicetta} Ho trovato qualcosa...`);
  console.log(result.found);
  await nextPage();
  await new Promise((r) => setTimeout(r, 5_000));
  if (result.error) {
    result.images.push(await page.screenshot({ fullPage: true }));
    await browser.close();
    return result;
  }

  // PAGE 4 (conferma prenotazione)
  result.images.push(await page.screenshot({ fullPage: true }));
  // input.telefono3-bt:not(disabled)
  const [phoneInput] = await page.$$('input.telefono1-bt:not(disabled)');
  if (phoneInput) {
    await page.$eval('input.telefono1-bt:not(disabled)', (el, value) => (el.value = value), phone);
  }
  // input.email-bt
  const [emailInput] = await page.$$('input.email-bt:not(disabled)');
  if (emailInput) {
    await page.$eval('input.email-bt:not(disabled)', (el, value) => (el.value = value), email);
  }

  await nextPage();
  await new Promise((r) => setTimeout(r, 10_000));
  if (result.error) {
    result.images.push(await page.screenshot({ fullPage: true }));
    await browser.close();
    return result;
  }

  // PAGE 5 (prenotazione confermata)
  console.log(`${numeroRicetta} Preso!`);
  result.images.push(await page.screenshot({ fullPage: true }));
  result.confirmed = result.found;

  await browser.close();
  return result;
}

export default reserve;
