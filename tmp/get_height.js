const puppeteer = require('puppeteer');

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // Set a matching viewport (e.g. 1920x1080)
    await page.setViewport({ width: 1440, height: 900 });
    
    // Wait for the app to load
    await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // We might be on a login page or /dashboard or /nodes
    console.log("Current URL:", page.url());
    
    // If it requires login or click, we might need to handle it.
    // Let's just output the current HTML body length
    const bodyLen = await page.evaluate(() => document.body.innerHTML.length);
    console.log("Body length:", bodyLen);

    // Let's try to find an EvaraFlow card or link to click
    const flowLink = await page.$('a[href*="/analytics/"]');
    if (flowLink) {
        await flowLink.click();
        await page.waitForNavigation({ waitUntil: 'networkidle0' });
        console.log("Navigated to:", page.url());
    }
    
    // Look for the meter reading card
    await page.waitForSelector('.lg\\:col-span-1.apple-glass-card', { timeout: 10000 }).catch(e => console.log("Card not found immediately"));
    
    const height = await page.evaluate(() => {
        const el = document.querySelector('.lg\\:col-span-1.apple-glass-card');
        if (!el) return null;
        return window.getComputedStyle(el).height;
    });
    
    console.log('Meter card computed height:', height);
    
    await browser.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
