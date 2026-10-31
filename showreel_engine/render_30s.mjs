import http from "http";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import { spawn } from "child_process";

const PORT = 4568;
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
    if (reqPath === "/") reqPath = "/player_30s.html";
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

async function renderShowreel30s() {
  console.log("=== STEP 1: Starting Local Asset Server ===");
  const server = await startServer();

  console.log("=== STEP 2: Launching Headless Chrome (1920x1080) ===");
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
  page.setDefaultTimeout(300000);
  page.on("console", msg => console.log(`[Browser]: ${msg.text()}`));

  await page.goto(`http://localhost:${PORT}/player_30s.html`, { waitUntil: "networkidle2" });
  await page.evaluate(async () => {
    await window.preloadAll();
  });

  console.log("=== STEP 3: Capturing High-Res Verification Stills Across All 5 Acts ===");
  const verifyStills = [
    { t: 4.50, name: "verify_30s_act1_genesis.png" },
    { t: 7.50, name: "verify_30s_act2_dashboard.png" },
    { t: 10.50, name: "verify_30s_act2_inspector.png" },
    { t: 14.80, name: "verify_30s_act3_3d.png" },
    { t: 19.00, name: "verify_30s_act4_cad_ipad.png" },
    { t: 22.20, name: "verify_30s_act4_bento.png" },
    { t: 23.00, name: "verify_30s_act5_montage.png" },
    { t: 28.00, name: "verify_30s_act5_finale.png" }
  ];

  for (const s of verifyStills) {
    await page.evaluate((time) => window.renderFrame(time), s.t);
    const outPath = path.join(BASE_DIR, "assets", s.name);
    await page.screenshot({ path: outPath });
    console.log(`Saved verification still (${s.t.toFixed(2)}s): ${outPath}`);
  }

  console.log("=== STEP 4: Frame-Exact 30.0s Offline Render (900 Frames @ 30 FPS -> FFmpeg H.264) ===");
  const audioMasterPath = path.join(BASE_DIR, "assets", "audio_master_30s.wav");
  const finalOutput30s = path.resolve("./Property_Visualizer_Showreel_30s_1080p.mp4");
  const finalOutputMain = path.resolve("./Property_Visualizer_Showreel_1080p.mp4");

  const ffmpegArgs = [
    "-y",
    "-f", "image2pipe",
    "-vcodec", "mjpeg",
    "-framerate", "30",
    "-i", "-",
    "-i", audioMasterPath,
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "15",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "320k",
    "-t", "30.0",
    "-movflags", "+faststart",
    finalOutput30s
  ];

  const ff = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "inherit", "inherit"] });
  const ffClosePromise = new Promise((resolve, reject) => {
    ff.on("close", code => (code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code}`))));
    ff.on("error", reject);
  });

  const FPS = 30;
  const TOTAL_FRAMES = 900; // 30.00s
  const tStart = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t = frame / FPS;
    const base64Jpeg = await page.evaluate((time) => {
      window.renderFrame(time);
      const c = document.getElementById("c");
      return c.toDataURL("image/jpeg", 0.96).split(",")[1];
    }, t);

    const buf = Buffer.from(base64Jpeg, "base64");
    const canWrite = ff.stdin.write(buf);
    if (!canWrite) {
      await new Promise(r => ff.stdin.once("drain", r));
    }

    if ((frame + 1) % 150 === 0 || frame === TOTAL_FRAMES - 1) {
      const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
      console.log(`Rendered frame ${frame + 1} / ${TOTAL_FRAMES} (${(t).toFixed(2)}s) [${elapsed}s elapsed]`);
    }
  }

  ff.stdin.end();
  await ffClosePromise;

  await browser.close();
  server.close();

  // Also update Property_Visualizer_Showreel_1080p.mp4 so both filenames point to the new 30s master
  fs.copyFileSync(finalOutput30s, finalOutputMain);

  const stats = fs.statSync(finalOutput30s);
  console.log("\n🎉 30-SECOND 1920x1080 SHOWREEL RENDER COMPLETE! 🎉");
  console.log(`Output 1: ${finalOutput30s} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Output 2: ${finalOutputMain} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

renderShowreel30s().catch(err => {
  console.error("Render failed:", err);
  process.exit(1);
});
