import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

async function run() {
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
  await new Promise(r => setTimeout(r, 2000));

  const emailInput = await page.$('input[type="email"]');
  const passInput = await page.$('input[type="password"]');
  if (emailInput && passInput) {
    await emailInput.type("propviz_showreel@demo.com");
    await passInput.type("Showreel2026!");
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click();
  }
  await new Promise(r => setTimeout(r, 4500));

  // Click Apex Tower card (matching leaf element with short text)
  const allEls = await page.$$("div, button, a, h3, p, span");
  for (const el of allEls) {
    const txt = await page.evaluate(e => (e.innerText || "").trim(), el);
    if (txt === "Apex Tower & Residences") {
      console.log("Found exact 'Apex Tower & Residences' element, clicking...");
      await el.click();
      break;
    }
  }
  await new Promise(r => setTimeout(r, 2800));

  // 1. Click "Units Directory" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Units Directory"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_07_units_directory.png" });
  console.log("Saved showreel_screen_07_units_directory.png");

  // 2. Click Unit 103 row or Pay/Edit button to open UnitPanel drawer
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("tr"));
    const row103 = rows.find(r => r.innerText && r.innerText.includes("103"));
    if (row103) row103.click();
    else if (rows[1]) rows[1].click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_08_unit_modal.png" });
  console.log("Saved showreel_screen_08_unit_modal.png");

  // Close drawer if open
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button[aria-label*="Close"], button[title*="Close"]'));
    if (closeBtns.length > 0) closeBtns[0].click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 3. Click "Maintenance" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Maintenance"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_09_maintenance_list.png" });
  console.log("Saved showreel_screen_09_maintenance_list.png");

  // 4. Click "Staff & Payroll" tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Staff & Payroll"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: "showreel_screen_10_staff.png" });
  console.log("Saved showreel_screen_10_staff.png");

  // 5. Launch 3D View
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const btn = buttons.find(b => b.innerText && b.innerText.includes("Launch 3D"));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 4500));

  // Click F1 in bottom dock to isolate Floor 1 in 3D, or click Unit 103 pin
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const f1Btn = buttons.find(b => (b.innerText || "").trim() === "F1");
    if (f1Btn) f1Btn.click();
  });
  await new Promise(r => setTimeout(r, 1800));
  await page.screenshot({ path: "showreel_screen_06_3d_f1.png" });
  console.log("Saved showreel_screen_06_3d_f1.png");

  // 6. Switch to 2D Blueprint while on F1 and zoom in!
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const bpBtn = buttons.find(b => b.innerText && b.innerText.includes("2D Blueprint"));
    if (bpBtn) bpBtn.click();
  });
  await new Promise(r => setTimeout(r, 1500));

  // Click Zoom In button twice so the CAD blueprint fills the screen nicely
  await page.evaluate(() => {
    const zoomInBtn = document.querySelector('button[title="Zoom In"], button[aria-label="Zoom In"]') ||
      Array.from(document.querySelectorAll("button")).find(b => b.innerHTML.includes("lucide-zoom-in"));
    if (zoomInBtn) {
      zoomInBtn.click();
      zoomInBtn.click();
      zoomInBtn.click();
    }
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: "showreel_screen_05_2d_blueprint_f1.png" });
  console.log("Saved showreel_screen_05_2d_blueprint_f1.png");

  // Copy all newly captured screenshots into showreel_engine/assets/
  const assetsDir = path.resolve("./showreel_engine/assets");
  const filesToCopy = [
    "showreel_screen_01_dashboard.png",
    "showreel_screen_02_property_detail.png",
    "showreel_screen_04_3d_spatial.png",
    "showreel_3d_angle_cinematic.png",
    "showreel_3d_angle_front.png",
    "showreel_3d_angle_top.png",
    "showreel_screen_05_2d_blueprint.png",
    "showreel_screen_05_2d_blueprint_f1.png",
    "showreel_screen_06_3d_f1.png",
    "showreel_screen_07_units_directory.png",
    "showreel_screen_08_unit_modal.png",
    "showreel_screen_09_maintenance_list.png",
    "showreel_screen_10_staff.png"
  ];
  for (const f of filesToCopy) {
    if (fs.existsSync(f)) {
      fs.copyFileSync(f, path.join(assetsDir, f));
    }
  }
  console.log("Copied all screenshots to showreel_engine/assets/");

  await browser.close();
}

run().catch(console.error);
