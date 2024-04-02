import puppeteer from 'puppeteer';
import fs from 'fs';


(async function() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [`--window-size=1920,1080`],
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(2 * 60_000);
  page.setDefaultTimeout(2 * 60_000);

  const result = [];
  for (let i = 1; i <= 46; i++) {
    console.log(`Processing page ${i}`);
    await page.goto(`https://www.doctena.lu/it/medico-generalista/lussemburgo?page=${i}`, { waitUntil: 'networkidle2' });

    const dottori = await page.$$('.js-search-result');
    for (const dottore of dottori) {
      const data = {};
      data.link = (await dottore.$eval('h5.Search__result-name.dsg-uppercase a', (el) => el.href))
        .replace(/\n\t*/, '');

      console.log(`Opening link ${data.link}`);


      await page.goto(data.link, { waitUntil: 'networkidle2' });


      try {
        data.name = (await page.$eval('div.dsg-profile-header__title.dsg-mg-bottom h1.title-seo.dsg-title-1.dsg-no-mg-bottom.dsg-no-mg-top', (el) => el.textContent))
          .replace(/\n\t*/, '');
      } catch (err) {
        // console.error(err);
      }

      const fields = new Map();
      fields.set('addr1', 'div.Profile__address-section h5.Profile__address-name');
      fields.set('addr2', 'div.Profile__address-section address.Profile__address');
      fields.set('language', 'div.Profile__section:nth-child(4) > .Profile__list');
      fields.set('description', 'div.Profile__section:nth-child(5) > p');
      fields.set('diploma', 'div.Profile__section:nth-child(6) > .Profile__list');

      for (const [key, selector] of fields) {
        try {
          data[key] = (await page.$eval(selector, (el) => el.textContent))
            .replace(/\n\t*/, '');
        } catch (err) {
          console.error(`Issue searching for selector ${key}`);
          console.error(err);
        }
      }
      console.log(`Saving doctor ${data.name}`);
      result.push(data);

      await page.goBack({ waitUntil: 'networkidle2' });

      // try {
      //   data.name = (await dottore.$eval('.dsg-profile-header__title.dsg-mg-bottom h1.title-seo.dsg-title-1.dsg-no-mg-bottom.dsg-no-mg-top', (el) => el.textContent))
      //     .replace(/\n\t*/, '');
      // } catch (err) {
      //   // console.error(err);
      // }
      // try {
      //   data.address = (await dottore.$eval('.Profile__address-section address.Profile__address', (el) => el.textContent))
      //     .replace(/\n\t*/, '');
      // } catch (err) {
      //   // console.error(err);
      // }
      // try {
      //   data.lingue = [];
      //   const lingue = await page.$$('.Profile__section:contains("Lingue parlate") li');
      //   for (const lingua of lingue) {
      //     try {
      //       const valore= (await lingua.$eval('', (el) => el.textContent))
      //         .replace(/\n\t*/, '')
      //       data.lingue.push(valore);
      //     } catch (err) {
      //       // console.error(err);
      //     }
      //   }
      //   // data.address = (await dottore.$eval('.Profile__section:contains("Lingue parlate") li', (el) => el.textContent))
      //   //   .replace(/\n\t*/, '');
      // } catch (err) {
      //   // console.error(err);
      // }
      // try {
      //   data.description = (await dottore.$eval('.Search__result-calendar-container p', (el) => el.textContent))
      //     .replace(/\n\t*/, '');
      // } catch (err) {
      //   // console.error(err);
      // }

    }
  }
  fs.writeFileSync('doctena.json', JSON.stringify(result, null, 2));

})();
