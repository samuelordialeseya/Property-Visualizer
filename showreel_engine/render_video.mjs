import http from "http";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";

const PORT = 4567;
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
    server.listen(PORT, () => {
      console.log(`Local asset server running at http://localhost:${PORT}/`);
      resolve(server);
    });
  });
}

async function renderShowreel() {
  console.log("=== STEP 1: Starting Local Asset Server ===");
  const server = await startServer();

  console.log("=== STEP 2: Launching Headless Chrome via Puppeteer ===");
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
  page.setDefaultTimeout(240000); // 4-minute timeout for 60s recording

  page.on("console", msg => console.log(`[Browser Console]: ${msg.text()}`));

  console.log("Navigating to showreel player...");
  await page.goto(`http://localhost:${PORT}/player.html`, { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 2000));

  console.log("=== STEP 3: Executing 60-Second Motion Graphics Recording (1800 frames @ 30 FPS) ===");
  const base64Video = await page.evaluate(async () => {
    return await window.startRecording();
  });

  console.log("=== STEP 4: Saving Raw VP9 WebM Video ===");
  const rawWebmPath = path.join(BASE_DIR, "raw_video_60s.webm");
  fs.writeFileSync(rawWebmPath, Buffer.from(base64Video, "base64"));
  console.log(`Saved raw video (${(fs.statSync(rawWebmPath).size / 1024 / 1024).toFixed(2)} MB)`);

  await browser.close();
  server.close();

  console.log("=== STEP 5: Final Mastering & Muxing with FFmpeg ===");
  const audioMasterPath = path.join(BASE_DIR, "assets", "audio_master_60s.wav");
  const finalOutputPath = path.resolve("./Property_Visualizer_Showreel_60s_1080p.mp4");

  const ffmpegCmd = [
    `ffmpeg -y`,
    `-i "${rawWebmPath}"`,
    `-i "${audioMasterPath}"`,
    `-c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -r 30`,
    `-c:a aac -b:a 320k`,
    `-t 60.0`,
    `-movflags +faststart`,
    `"${finalOutputPath}"`
  ].join(" ");

  console.log("Running FFmpeg multiplexer command:");
  console.log(ffmpegCmd);
  execSync(ffmpegCmd, { stdio: "inherit" });

  console.log("\n🎉 60-SECOND SHOWREEL RENDER COMPLETE! 🎉");
  console.log(`Final Video File: ${finalOutputPath}`);
  const stats = fs.statSync(finalOutputPath);
  console.log(`File Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
}

renderShowreel().catch(err => {
  console.error("Render failed:", err);
  process.exit(1);
});
