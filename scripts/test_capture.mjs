import puppeteer from "puppeteer-core";
import fs from "fs";
import { execSync } from "child_process";

async function testDeterministicRecording() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: [
      "--no-sandbox",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-gl=angle",
      "--use-angle=d3d11"
    ]
  });

  const page = await browser.newPage();
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const stream = canvas.captureStream(0); // 0 fps = manual requestFrame only!
    const track = stream.getVideoTracks()[0];

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=h264",
      videoBitsPerSecond: 25000000
    });

    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      };
    });

    recorder.start();

    // Render exactly 90 frames (3.0s at 30 FPS)
    const totalFrames = 90;
    for (let f = 0; f < totalFrames; f++) {
      ctx.fillStyle = f % 2 === 0 ? "#112233" : "#445566";
      ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 80px sans-serif";
      ctx.fillText(`FRAME ${f} of ${totalFrames}`, 100, 200);

      track.requestFrame();
      // Wait 33ms so recorder can ingest
      await new Promise((r) => setTimeout(r, 34));
    }

    await new Promise((r) => setTimeout(r, 200));
    recorder.stop();
    return await done;
  });

  fs.writeFileSync("test_90f.webm", Buffer.from(base64, "base64"));
  console.log("Saved test_90f.webm");

  const probe = execSync(
    'ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of default=noprint_wrappers=1:nokey=1 "test_90f.webm"',
    { encoding: "utf8" }
  );
  console.log("Recorded video packet count:", probe.trim());

  const mux = execSync(
    'ffmpeg -y -i "test_90f.webm" -c:v libx264 -r 30 "test_90f.mp4" 2>&1',
    { encoding: "utf8" }
  );
  console.log("FFmpeg mux output (check for dup/drop):");
  const match = mux.match(/frame=\s*(\d+).*dup=(\d+)\s*drop=(\d+)/);
  if (match) {
    console.log(`Frames: ${match[1]}, Dup: ${match[2]}, Drop: ${match[3]}`);
  } else {
    console.log(mux.slice(-300));
  }

  await browser.close();
  // Clean up test files
  if (fs.existsSync("test_90f.webm")) fs.unlinkSync("test_90f.webm");
  if (fs.existsSync("test_90f.mp4")) fs.unlinkSync("test_90f.mp4");
}

testDeterministicRecording().catch(console.error);
