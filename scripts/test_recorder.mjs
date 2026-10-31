import puppeteer from "puppeteer-core";
import fs from "fs";

async function testRecorder() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--enable-features=WebCodecs",
      "--window-size=1920,1080"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>body { margin:0; overflow:hidden; background: #000; }</style></head>
    <body>
      <canvas id="c" width="1920" height="1080"></canvas>
      <script>
        window.startRecord = async () => {
          const canvas = document.getElementById("c");
          const ctx = canvas.getContext("2d");
          const stream = canvas.captureStream(30);
          const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
          const chunks = [];
          recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

          const recordPromise = new Promise(resolve => {
            recorder.onstop = async () => {
              const blob = new Blob(chunks, { type: "video/webm" });
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(",")[1]);
              reader.readAsDataURL(blob);
            };
          });

          recorder.start();

          // Render 3 seconds of animation
          let f = 0;
          const interval = setInterval(() => {
            ctx.fillStyle = f % 2 === 0 ? "#0b3860" : "#2270b8";
            ctx.fillRect(0, 0, 1920, 1080);
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 80px sans-serif";
            ctx.fillText("FRAME " + f, 800, 540);
            f++;
            if (f >= 90) {
              clearInterval(interval);
              recorder.stop();
            }
          }, 1000 / 30);

          return await recordPromise;
        };
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  console.log("Starting test recording in browser...");
  const base64Data = await page.evaluate(async () => {
    return await window.startRecord();
  });

  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync("test_recording.webm", buffer);
  console.log("Recorded video written! File size:", buffer.length);

  await browser.close();
}

testRecorder().catch(console.error);
