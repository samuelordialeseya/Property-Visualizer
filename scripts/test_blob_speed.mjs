import puppeteer from "puppeteer-core";

async function testSpeed() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--enable-webgl", "--ignore-gpu-blocklist"]
  });

  const page = await browser.newPage();
  const times = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1920; c.height = 1080;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ff0000"; ctx.fillRect(0, 0, 1920, 1080);

    const results = {};

    // 1. toBlob JPEG
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      await new Promise(r => c.toBlob(r, "image/jpeg", 0.9));
    }
    results.jpegBlob = (performance.now() - t0) / 10;

    // 2. toBlob WebP
    const t1 = performance.now();
    for (let i = 0; i < 10; i++) {
      await new Promise(r => c.toBlob(r, "image/webp", 0.9));
    }
    results.webpBlob = (performance.now() - t1) / 10;

    return results;
  });

  console.log("Blob creation time per 1080p frame (in ms):", times);
  await browser.close();
}

testSpeed().catch(console.error);
