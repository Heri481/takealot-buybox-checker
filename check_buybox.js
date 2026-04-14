const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const ExcelJS = require('exceljs');

puppeteer.use(StealthPlugin());

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readUrls() {
  const filePath = path.join(__dirname, 'urls.csv');
  const data = fs.readFileSync(filePath, 'utf8');
  const lines = data.split('\n').slice(1);

  return lines
    .map(l => l.split(',')[0].replace(/"/g, '').trim())
    .filter(l => l.startsWith('http'));
}

async function extractSellerAndPrice(page) {

  await delay(5000);

  return await page.evaluate(() => {

    let seller = null;
    let price = null;

    const pageText = document.body.innerText;

    const priceMatch = pageText.match(/R\s?[\d,]+(\.\d{2})?/);
    if (priceMatch) {
      price = priceMatch[0].trim();
    }

    const soldByMatch = pageText.match(/Sold by\s+([^\n]+)/i);
    if (soldByMatch) {
      seller = soldByMatch[1].trim();
    }

    if (!seller) {
      const sellerLink = document.querySelector('a[href*="/seller/"]');
      if (sellerLink && sellerLink.innerText) {
        seller = sellerLink.innerText.trim();
      }
    }

    return { seller, price };
  });
}

async function loadExistingReminders(filePath) {

  const reminders = {};

  if (!fs.existsSync(filePath)) return reminders;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('BuyBox Results');

  if (!sheet) return reminders;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const url = row.getCell(1).value;
    const reminder = row.getCell(6).value;

    if (url) {
      reminders[url] = reminder || '';
    }
  });

  return reminders;
}

async function writeExcel(results, existingReminders) {

  const filePath = path.join(__dirname, 'BuyBox_Results.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('BuyBox Results');

  const headers = [
    'Product URL',
    'Status',
    'Detected Seller',
    'Selling Price',
    'Competitor Price',
    'Reminder',
    'Checked At'
  ];

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };

  for (const r of results) {

    const reminder = existingReminders[r.product_url] || '';

    const row = sheet.addRow([
      r.product_url,
      r.status,
      r.detected_seller,
      r.selling_price,
      r.competitor_price,
      reminder,
      r.checked_at
    ]);

    const statusCell = row.getCell(2);

    if (r.status === '✅ Winning') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'C6EFCE' }
      };
    }

    if (r.status === '❌ Lost') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFC7CE' }
      };
    }
  }

  sheet.columns.forEach(column => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: true }, cell => {
      const length = cell.value ? cell.value.toString().length : 10;
      if (length > maxLength) maxLength = length;
    });
    column.width = maxLength + 2;
  });

  await workbook.xlsx.writeFile(filePath);
}

async function main() {

  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')
  );

  const urls = await readUrls();
  const results = [];

  const outputPath = path.join(__dirname, 'BuyBox_Results.xlsx');
  const existingReminders = await loadExistingReminders(outputPath);

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized'],
    defaultViewport: null
  });

  for (const productUrl of urls) {

    const page = await browser.newPage();

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    try {

      await page.goto(productUrl, {
        waitUntil: 'networkidle2',
        timeout: config.timeoutMs || 30000
      });

      const { seller, price } = await extractSellerAndPrice(page);

      console.log('DEBUG:', seller, price);

      let status = '⚠ Seller Not Found';

      if (seller) {
        const winning = seller.toLowerCase().includes(config.sellerName.toLowerCase());
        status = winning ? '✅ Winning' : '❌ Lost';
      }

      results.push({
        product_url: productUrl,
        status: status,
        detected_seller: seller ? seller : '',
        selling_price: price ? price : '',
        competitor_price: (status === '❌ Lost') ? price || '' : '',
        checked_at: new Date().toISOString()
      });

      console.log(`${status} | ${seller || ''} | ${price || ''}`);

    } catch (err) {
      console.log(`Error: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  await writeExcel(results, existingReminders);

  console.log('Excel file updated successfully.');
}

main();