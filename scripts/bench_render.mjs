import http from "http";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";

const PORT = 4599;
const BASE_DIR = path.resolve("./showreel_engine");

function startServer() {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".webm": "video/webm"
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split("?")[0];
    if (reqPath === "/") reqPath = "/player.html";
    const filePath = path.join(BASE_DIR, reqPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  return new Promise((resolve) => {
    server.listen(PORT, () => resolve(server));
  });
}

async function bench() {
  const server = await startServer();
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
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
  await page.goto(`http://localhost:${PORT}/player.html`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));

  const stats = await page.evaluate(async () => {
    await preloadAll();
    const testTimes = [3.0, 10.0, 18.0, 24.0, 32.0, 37.0, 44.0, 50.0, 56.0];
    const results = {};

    for (const t of testTimes) {
      const diffs = [];
      for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        renderFrame(t + i * 0.033);
        diffs.push(performance.now() - t0);
      }
      results[`t_${t}s`] = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2);
    }
    return results;
  });

  console.log("Benchmark frame durations across scenes (in ms):");
  console.log(stats);

  await browser.close();
  server.close();
}

bench().catch(console.error);
