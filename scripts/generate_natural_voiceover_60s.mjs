import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const voiceSegments = [
  {
    id: "vo_01_hook",
    text: "Most property managers struggle with disconnected spreadsheets, paper utility logs, and mental floorplans.",
    startSec: 1.2
  },
  {
    id: "vo_02_doctrine",
    text: "Property Visualizer unites physical building architecture with real-time operational control.",
    startSec: 8.8
  },
  {
    id: "vo_03_dashboard",
    text: "Open the executive control deck to immediately review occupancy, active tenants, and monthly cash flow.",
    startSec: 15.5
  },
  {
    id: "vo_04_revenue",
    text: "Automated rent rolls track collection in real time, alerting you the moment a payment is overdue.",
    startSec: 23.0
  },
  {
    id: "vo_05_3d_spatial",
    text: "Step inside the Obsidian 3D darkroom. Your physical building is spatially tracked with our Tenancy Triad.",
    startSec: 30.0
  },
  {
    id: "vo_06_maintenance",
    text: "Occupied in terracotta, overdue in coral, and vacant in slate, with live maintenance pins on every roof.",
    startSec: 38.5
  },
  {
    id: "vo_07_cad_blueprint",
    text: "Switch seamlessly to 2D CAD blueprints with zero GPU overhead and sixty frames per second on iPad.",
    startSec: 46.0
  },
  {
    id: "vo_08_outro",
    text: "Spatial truth over spreadsheets. Elevate your portfolio with Property Visualizer today.",
    startSec: 53.0
  }
];

async function generateVO() {
  const outDir = path.resolve("./audio_generated_60s");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-GuyNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  console.log("Generating perfectly timed 60s natural VO...");
  for (const seg of voiceSegments) {
    const tmpDir = path.join(outDir, `tmp_${seg.id}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const res = await tts.toFile(tmpDir, seg.text, { rate: 1.0, pitch: "+0Hz" });
    const finalPath = path.join(outDir, `${seg.id}.mp3`);
    fs.copyFileSync(res.audioFilePath, finalPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`, { encoding: "utf8" });
    const dur = parseFloat(probe.trim()) || 0;
    seg.duration = dur;
    seg.filePath = finalPath;
    console.log(`[${seg.id}] ${dur.toFixed(2)}s | starts: ${seg.startSec}s | ends: ${(seg.startSec + dur).toFixed(2)}s`);
  }

  fs.writeFileSync(path.join(outDir, "segments_60s.json"), JSON.stringify(voiceSegments, null, 2));
  console.log("60-second natural VO locked!");
}

generateVO().catch(console.error);
