import puppeteer from "puppeteer-core";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
    args: ["--no-sandbox", "--window-size=1920,1080"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  await page.goto("https://property-visualizer-b04f3.web.app", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));

  const emailInput = await page.$('input[type="email"]');
  const passInput = await page.$('input[type="password"]');
  if (emailInput && passInput) {
    await emailInput.type("propviz_showreel@demo.com");
    await passInput.type("Showreel2026!");
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
  }
  await new Promise(r => setTimeout(r, 4000));

  // Click Apex Tower card
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("div, button, h3"));
    const match = els.find(e => e.innerText && e.innerText.includes("Apex Tower & Residences"));
    if (match) match.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  // Click "Units Directory" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Units Directory"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_07_units_directory.png" });
  console.log("Captured units directory!");

  // Click on Unit 103 card/row to open Unit Panel
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("button, tr, div"));
    const btn = els.find(e => e.innerText && e.innerText.includes("103") && e.innerText.includes("David Kim"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_08_unit_modal.png" });
  console.log("Captured unit modal!");

  // Close panel
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 1000));

  // Click "Maintenance" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Maintenance") && b.getAttribute("aria-label")?.includes("tab"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_09_maintenance_list.png" });
  console.log("Captured maintenance tab!");

  // Click "Staff & Payroll" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Staff & Payroll"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_10_staff.png" });
  console.log("Captured staff tab!");

  await browser.close();
}

run().catch(console.error);
