import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const voiceSegments = [
  {
    id: "vo_01_hook",
    text: "Still managing multi-million dollar properties with messy spreadsheets and guesswork?",
    startSec: 0.8
  },
  {
    id: "vo_02_twin",
    text: "Meet Property Visualizer. The spatial digital twin that turns abstract data into living architecture.",
    startSec: 6.2
  },
  {
    id: "vo_03_dashboard",
    text: "Your executive dashboard gives you instant clarity on occupancy, cash flow, and tenant health.",
    startSec: 12.0
  },
  {
    id: "vo_04_alerts",
    text: "When rent is overdue, you don't dig through paper logs. Unit 103 alerts you with one-tap automated notices.",
    startSec: 18.0
  },
  {
    id: "vo_05_3d_spatial",
    text: "Step into the Obsidian 3D darkroom. Orbit every floor in real time, color-coded by our Tenancy Triad.",
    startSec: 24.5
  },
  {
    id: "vo_06_maintenance",
    text: "Track live maintenance tickets right on the roof, from HVAC repairs to emergency inspections.",
    startSec: 32.0
  },
  {
    id: "vo_07_cad_ipad",
    text: "Need architectural precision? Slide into CAD blueprints with buttery sixty frames per second on iPad.",
    startSec: 38.5
  },
  {
    id: "vo_08_doctrine",
    text: "Every tenant. Every floor. Every single dollar. Exactly where it belongs.",
    startSec: 45.5
  },
  {
    id: "vo_09_outro",
    text: "Stop drowning in rows. Command your portfolio with Property Visualizer today.",
    startSec: 52.0
  }
];

async function generateNaturalVO() {
  const outDir = path.resolve("./audio_generated_v3");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tts = new MsEdgeTTS();
  // Use AndrewNeural - warm, conversational American narrator
  await tts.setMetadata("en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  console.log("Generating 9 punchy, conversational voiceover segments with en-US-AndrewNeural...");

  for (const seg of voiceSegments) {
    const tmpDir = path.join(outDir, `tmp_${seg.id}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // 1.0x natural rate - no robotic speeding
    const res = await tts.toFile(tmpDir, seg.text, { rate: 1.0 });
    const finalPath = path.join(outDir, `${seg.id}.mp3`);
    fs.copyFileSync(res.audioFilePath, finalPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`,
      { encoding: "utf8" }
    );
    const dur = parseFloat(probe.trim()) || 0;
    seg.duration = dur;
    seg.filePath = finalPath;
    console.log(`[${seg.id}] (${dur.toFixed(2)}s, starts at ${seg.startSec}s): "${seg.text}"`);
  }

  const jsonPath = path.join(outDir, "segments_v3.json");
  fs.writeFileSync(jsonPath, JSON.stringify(voiceSegments, null, 2));
  console.log(`Saved segments map to ${jsonPath}`);
}

generateNaturalVO().catch(console.error);
