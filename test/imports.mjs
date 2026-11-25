import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.addInitScript(() => { window.print = () => {}; });
const B = 'http://localhost:8765/#/import';
const summary = () => page.$eval('#h-chk', () => document.querySelector('.stats').innerText.replace(/\n/g, ' '));
// สร้าง PDF ข้อมูลตัวอย่างเล็ก
await page.goto(B); await page.waitForTimeout(400);
await page.click('[data-sample="small"]'); await page.waitForTimeout(300);
console.log('sample  :', await summary());
await page.click('[data-act="print-data"]'); await page.waitForTimeout(400);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: 'samples/sample-small.pdf', format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });
// นำเข้า PDF
await page.goto(B); await page.reload(); await page.waitForTimeout(400);
await page.setInputFiles('#file', 'samples/sample-small.pdf');
await page.waitForSelector('#h-chk', { timeout: 30000 }); await page.waitForTimeout(300);
console.log('pdf     :', await summary());
const iss = await page.$$eval('.issue', (x) => x.slice(0, 6).map((e) => e.innerText.replace(/\n/g, ' ')));
iss.forEach((i) => console.log('   ', i));
// CSV zip
await page.click('[data-act="clear"]'); await page.waitForTimeout(200);
await page.setInputFiles('#file', 'samples/sample-small-csv.zip'); await page.waitForSelector('#h-chk'); await page.waitForTimeout(300);
console.log('csv zip :', await summary());
await page.click('[data-act="clear"]'); await page.waitForTimeout(200);
await page.setInputFiles('#file', 'samples/sample-large.json'); await page.waitForSelector('#h-chk'); await page.waitForTimeout(300);
console.log('json lg :', await summary());
await page.click('[data-act="clear"]'); await page.waitForTimeout(200);
await page.setInputFiles('#file', 'samples/template.xlsx'); await page.waitForSelector('#h-chk'); await page.waitForTimeout(300);
console.log('template:', await summary());
await browser.close();
