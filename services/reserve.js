import puppeteer from 'puppeteer';
import locale from 'date-fns/locale/it/index.js';
import parse from 'date-fns/parse/index.js';
import format from 'date-fns/format/index.js';
import differenceInCalendarDays from 'date-fns/differenceInCalendarDays/index.js';
import {isBefore, isSameDay} from "date-fns";

const CUP_URL = 'https://cup.isan.csi.it/web/guest/ricetta-dematerializzata';

/**
 * Reserve
 * @param cf
 * @param numeroRicetta
 * @param phone
 * @param email
 * @param counter
 * @returns {Promise<{appuntamenti: [{date: Date, address: string, isGood: boolean, isNear: boolean}], confirmed: {date: Date, address: string, isGood: boolean, isNear: boolean}, images: [Buffer], info: string}>}
 */
async function reserve({ cf, ricetta: numeroRicetta, phone, email, counter = 0 }) {
  // console.log(`Cerco di prenotare ${cf} ${numeroRicetta} ${phone} ${email} tentativo ${counter}`);
  const result = {
    info: undefined,
    found: undefined,
    confirmed: undefined,
    error: undefined,
    appuntamenti: [],
    images: [],
  };
  const browser = await puppeteer.launch({
    headless: false,// 'new',
    args: [`--window-size=1920,1080`],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(2 * 60_000);
  page.setDefaultTimeout(2 * 60_000);

  // PROSEGUI/AVANTI/NOTE+PRESAVISIONE/CONFERMA
  async function checkAndClickSelector(selector, counter = 0) {
    if (result.error) {
      return false;
    }
    // try {
    //   await page.waitForSelector(selector, { timeout: 10_000 });
    // } catch(error) {
    //   return false;
    // }
    await new Promise((r) => setTimeout(r, 10_000));
    const [selectorFound] = await page.$$(selector);
    if (selectorFound) {
      await page.click(selector);
      await new Promise((r) => setTimeout(r, 5_000));
    }

    const [warning] = await page.$$('.messagifyMsg.alert-danger span');
    if (warning && counter < 5) {
      return checkAndClickSelector(selector, counter + 1)
    } else if (warning && counter >= 5) {
      const message = await warning?.evaluate((el) => el.textContent);
      console.log(`${numeroRicetta} errore ${message}`)
      result.error = message;
      result.images.push(await page.screenshot({ fullPage: true }));
      await browser.close();
    }
    return true;
  }

  // PAGE 1 (insert cf+prenotazione)
  await page.goto(CUP_URL, { waitUntil: 'networkidle2' });
  await page.$eval('input.codice-fiscale-bt', (el, value) => (el.value = value), cf);
  await page.$eval('input.nreInput-bt', (el, value) => (el.value = value), numeroRicetta);
  await new Promise((r) => setTimeout(r, 5_000));
  await checkAndClickSelector('span[aria-describedby="Avanti"],span[aria-describedby="Prosegui"] button');
  if (result.error) {
    return result;
  }

  // PAGE 2 (confirm)
  console.log(`${numeroRicetta} page 2`)
  const infos = await page.$$('.prestazioneRow .infoValue');
  const info = await infos[2]?.evaluate((el) => el.textContent);
  result.info = `${info}\n`;
  result.images.push(await page.screenshot({ fullPage: true }));
  await checkAndClickSelector('span[aria-describedby="Avanti"] button');

  // PAGE 3 (appointments)
  await page.waitForSelector('[name="_ricettaelettronica_WAR_cupprenotazione_:appuntamentiForm"],.no-available');
  console.log(`${numeroRicetta} page 3`)
  result.images.push(await page.screenshot({ fullPage: true }));
  await page.click('span[aria-describedby="Altre disponibilità"] button');
  await page.waitForSelector('#availableAppointmentsBlock');
  result.images.push(await page.screenshot({ fullPage: true }));
  const appuntamenti = await page.$$('#availableAppointmentsBlock .appuntamento');
  for (const [i, appuntamento] of appuntamenti.entries()) {
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
    const isNear = /101[235][0-9]/.test(zip); // Cerca in zone comode...
    // const isNear = /101[0-9]{2}/.test(zip); //  // Cerca in zone comode...Cerca in zone comode...

    let isGood = 0;
    if (difference > 0 && difference <= 30) {
      isGood += 1;
    }
    // if (difference > 0 && difference <= 30) {
    //   isGood += 1;
    // }
    // if (difference > 0 && difference <= 60) {
    //   isGood += 1;
    // }
    // if (difference > 0 && difference <= 90) {
    //   isGood += 1;
    // }
    // if (isGood > 0 && isNear) {
    //   isGood += 1;
    // }
    const friendlyDate = format(date, 'EEEE d MMMM yyyy HH:mm', { locale });
    if (!isGood) {
      console.log(`${numeroRicetta} il ${friendlyDate} è un po' troppo lontano, vero? sono ben ${difference} giorni`);
    }
    // if (isSameDay(date, new Date('2024-04-24')) && isBefore(date, new Date('2024-04-24 10:30'))) {
    //   console.log(`${numeroRicetta} il ${friendlyDate} è prima dell'orario`);
    //   isGood -= 1;
    // }
    result.appuntamenti.push({
      index: i,
      isNear,
      isGood,
      date,
      address,
    });
  }
  console.log(`Posti disponibili:`, result);
  const [found] = result.appuntamenti
    .filter(({ isGood }) => isGood > 0)
    .filter(({ isNear }) => isNear > 0)
    .sort((a, b) => b.isGood - a.isGood);
  result.found = found;
  if (!result.found || result.appuntamenti.length < 2) {
    console.log(`${numeroRicetta} Non ho trovato nulla`);
    await browser.close();
    return result;
  }
  console.log(`${numeroRicetta} Ho trovato qualcosa...`);
  console.log(result.found);
  if (result.found.index > 0) {
    console.log(`Provo a selezionare l'elemento ${found.index}`)
    await checkAndClickSelector(`.disponibiliPanel:nth-child(${found.index+1}) span[aria-describedby="Seleziona"] button`);
    // await new Promise((r) => setTimeout(r, 5_000));
  }
  await checkAndClickSelector('span[aria-describedby="Avanti"] button');
  // await new Promise((r) => setTimeout(r, 5_000));
  if (result.error) {
    return result;
  }

  // PAGE 4 (conferma prenotazione)
  console.log(`${numeroRicetta} page 4`)
  result.images.push(await page.screenshot({ fullPage: true }));
  // input.telefono3-bt:not(disabled)
  const [phoneInput] = await page.$$('input.telefono1-bt:not(disabled)');
  if (phoneInput && phone) {
    await page.$eval('input.telefono1-bt:not(disabled)', (el, value) => (el.value = value), phone);
  }
  // input.email-bt
  const [emailInput] = await page.$$('input.email-bt:not(disabled)');
  if (emailInput && email) {
    await page.$eval('input.email-bt:not(disabled)', (el, value) => (el.value = value), email);
  }
  // Note
  await (async function seeNotes(counter = 0) {
    const [note] = await page.$$('span[aria-describedby="Note"] button');
    if (note) {
      console.log(`${numeroRicetta} Note`);
      await page.click('span[aria-describedby="Note"] button');
      await new Promise((r) => setTimeout(r, 5_000));
    }
    result.images.push(await page.screenshot({ fullPage: true }));
    const [presaVisione] = await page.$$('span[aria-describedby="Conferma presa visione"] button');
    if (presaVisione) {
      console.log(`${numeroRicetta} Presa visione`);
      await page.click('span[aria-describedby="Conferma presa visione"] button');
      await new Promise(r => setTimeout(r, 5_000));
      return;
    }
    return await seeNotes(counter + 1);
  })();

  await checkAndClickSelector('span[aria-describedby="Conferma"] button');


  // await nextPage();
  // await new Promise((r) => setTimeout(r, 10_000));
  // if (result.error) {
  //   result.images.push(await page.screenshot({ fullPage: true }));
  //   await browser.close();
  //   return result;
  // }

  // PAGE 5 (prenotazione confermata)
  console.log(`${numeroRicetta} page 5`)
  console.log(`${numeroRicetta} Preso!`);
  result.images.push(await page.screenshot({ fullPage: true }));
  result.confirmed = result.found;

  await browser.close();
  return result;
}

export default reserve;
