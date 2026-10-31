import puppeteer from "puppeteer-core";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
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

  // Click 3D View button directly on the Apex Tower card!
  console.log("Looking for 3D View button on card...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const btn3d = btns.find(b => b.innerText && b.innerText.includes("3D View"));
    if (btn3d) btn3d.click();
  });
  await new Promise(r => setTimeout(r, 5000));

  // Shot 1: Default Isometric view
  await page.screenshot({ path: "showreel_3d_angle_iso.png" });
  console.log("Captured showreel_3d_angle_iso.png");

  // Let's drag the canvas to rotate to a dramatic low-angle corner
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    // Drag to rotate
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 350, centerY - 150, { steps: 25 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 1500));
    await page.screenshot({ path: "showreel_3d_angle_cinematic.png" });
    console.log("Captured showreel_3d_angle_cinematic.png");

    // Click Top view preset button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const topBtn = btns.find(b => b.innerText && b.innerText.includes("Top"));
      if (topBtn) topBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: "showreel_3d_angle_top.png" });
    console.log("Captured showreel_3d_angle_top.png");

    // Click Front view preset button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const frontBtn = btns.find(b => b.innerText && b.innerText.includes("Front"));
      if (frontBtn) frontBtn.click();
    });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: "showreel_3d_angle_front.png" });
    console.log("Captured showreel_3d_angle_front.png");
  }

  await browser.close();
  console.log("3D angles captured successfully!");
}

run().catch(console.error);
