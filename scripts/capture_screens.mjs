import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

async function run() {
  console.log("Launching Chrome...");
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
    args: [
      "--no-sandbox",
      "--window-size=1920,1080",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=d3d11"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("Navigating to https://property-visualizer-b04f3.web.app ...");
  await page.goto("https://property-visualizer-b04f3.web.app", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2500));

  console.log("Submitting login...");
  const emailInput = await page.$('input[type="email"]');
  const passInput = await page.$('input[type="password"]');
  if (emailInput && passInput) {
    await emailInput.type("propviz_showreel@demo.com");
    await passInput.type("Showreel2026!");
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
  }

  console.log("Waiting for dashboard to load data...");
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot 1: Executive Dashboard
  await page.screenshot({ path: "showreel_screen_01_dashboard.png" });
  console.log("Saved showreel_screen_01_dashboard.png");

  // Click on Apex Tower card to view Property Detail
  const cards = await page.$$("div, button, a");
  for (const c of cards) {
    const txt = await page.evaluate(el => el.innerText, c);
    if (txt && txt.includes("Apex Tower & Residences") && txt.length < 40) {
      console.log("Clicking Apex Tower card...");
      await c.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot 2: Property Detail (Units Grid & Tenancy Triad)
  await page.screenshot({ path: "showreel_screen_02_property_detail.png" });
  console.log("Saved showreel_screen_02_property_detail.png");

  // Click on an occupied unit or overdue unit to open Unit Panel
  const unitBtns = await page.$$("button, div");
  for (const ub of unitBtns) {
    const txt = await page.evaluate(el => el.innerText, ub);
    if (txt && (txt.includes("103") || txt.includes("OVERDUE") || txt.includes("David Kim"))) {
      console.log("Clicking Unit 103 overdue...");
      await ub.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2500));

  // Screenshot 3: Unit Panel with billing / status details
  await page.screenshot({ path: "showreel_screen_03_unit_panel.png" });
  console.log("Saved showreel_screen_03_unit_panel.png");

  // Close unit panel if modal or backdrop
  const closeBtn = await page.$('button[title="Close"], button[aria-label="Close"], button svg.lucide-x');
  if (closeBtn) {
    await closeBtn.click().catch(() => {});
    await new Promise(r => setTimeout(r, 1000));
  }

  // Click 3D Visualizer View
  const allBtns = await page.$$("button, a");
  for (const b of allBtns) {
    const txt = await page.evaluate(el => el.innerText, b);
    if (txt && (txt.includes("3D Visualizer") || txt.includes("3D View") || txt.includes("Spatial 3D"))) {
      console.log("Clicking 3D Visualizer:", txt);
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot 4: 3D Visualizer
  await page.screenshot({ path: "showreel_screen_04_3d_spatial.png" });
  console.log("Saved showreel_screen_04_3d_spatial.png");

  // Click 2D Blueprint button
  const bpBtns = await page.$$("button");
  for (const b of bpBtns) {
    const txt = await page.evaluate(el => el.innerText, b);
    if (txt && (txt.includes("2D Blueprint") || txt.includes("2D") || txt.includes("Floorplan"))) {
      console.log("Clicking 2D Blueprint button:", txt);
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 3000));

  // Screenshot 5: 2D Blueprint
  await page.screenshot({ path: "showreel_screen_05_2d_blueprint.png" });
  console.log("Saved showreel_screen_05_2d_blueprint.png");

  // Let's also navigate to Maintenance Tab
  for (const b of allBtns) {
    const txt = await page.evaluate(el => el.innerText, b);
    if (txt && txt.includes("Maintenance")) {
      console.log("Clicking Maintenance tab...");
      await b.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: "showreel_screen_06_maintenance.png" });
  console.log("Saved showreel_screen_06_maintenance.png");

  await browser.close();
  console.log("Finished capturing all screens!");
}

run().catch(console.error);
