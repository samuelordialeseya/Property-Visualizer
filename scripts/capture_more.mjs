import puppeteer from "puppeteer-core";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
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

  // Click Apex Tower
  const allCards = await page.$$("div, button, a");
  for (const c of allCards) {
    const txt = await page.evaluate(el => el.innerText, c);
    if (txt && txt.includes("Apex Tower & Residences") && txt.length < 50) {
      await c.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2500));

  // 1. Click Units Directory tab
  const tabs = await page.$$("button, div");
  for (const t of tabs) {
    const txt = await page.evaluate(el => el.innerText, t);
    if (txt && txt.includes("Units Directory")) {
      await t.click();
      console.log("Clicked Units Directory");
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_07_units_directory.png" });
  console.log("Saved showreel_screen_07_units_directory.png");

  // Click on Unit 103 (Overdue) to open unit editor panel
  const unitRows = await page.$$("button, tr, div");
  for (const row of unitRows) {
    const txt = await page.evaluate(el => el.innerText, row);
    if (txt && txt.includes("103") && txt.includes("David Kim")) {
      await row.click();
      console.log("Clicked Unit 103 row");
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_08_unit_modal.png" });
  console.log("Saved showreel_screen_08_unit_modal.png");

  // Close modal/panel if open
  await page.keyboard.press("Escape");
  await new Promise(r => setTimeout(r, 1000));

  // Click Maintenance tab
  const tabs2 = await page.$$("button, div");
  for (const t of tabs2) {
    const txt = await page.evaluate(el => el.innerText, t);
    if (txt && txt.includes("Maintenance") && !txt.includes("active")) {
      await t.click();
      console.log("Clicked Maintenance tab");
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_09_maintenance_list.png" });
  console.log("Saved showreel_screen_09_maintenance_list.png");

  // Click Staff & Payroll tab
  const tabs3 = await page.$$("button, div");
  for (const t of tabs3) {
    const txt = await page.evaluate(el => el.innerText, t);
    if (txt && txt.includes("Staff & Payroll")) {
      await t.click();
      console.log("Clicked Staff tab");
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_10_staff.png" });
  console.log("Saved showreel_screen_10_staff.png");

  await browser.close();
  console.log("Done!");
}

run().catch(console.error);
