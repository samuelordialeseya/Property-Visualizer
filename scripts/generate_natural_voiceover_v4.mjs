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
    text: "Meet Property Visualizer. The spatial digital twin turning abstract rows into living architecture.",
    startSec: 6.0
  },
  {
    id: "vo_03_dashboard",
    text: "Your executive deck delivers instant clarity on portfolio health, occupancy, and cash flow.",
    startSec: 13.0
  },
  {
    id: "vo_04_alerts",
    text: "Unit 103 overdue? No searching through paper logs. It alerts you with one-tap automated notices.",
    startSec: 19.5
  },
  {
    id: "vo_05_3d_spatial",
    text: "Step into the Obsidian 3D darkroom. Orbit every unit in real time, coded by Tenancy Triad.",
    startSec: 27.0
  },
  {
    id: "vo_06_maintenance",
    text: "Track active maintenance right on the roof, from HVAC repairs to urgent inspections.",
    startSec: 34.2
  },
  {
    id: "vo_07_cad_ipad",
    text: "Slide into 2D CAD blueprints with buttery sixty frames per second on your iPad.",
    startSec: 41.0
  },
  {
    id: "vo_08_anthem",
    text: "Every tenant. Every floor. Every single dollar. Exactly where it belongs.",
    startSec: 47.8
  },
  {
    id: "vo_09_outro",
    text: "Stop drowning in rows. Command your portfolio with Property Visualizer today.",
    startSec: 53.8
  }
];

async function generateNaturalVO() {
  const outDir = path.resolve("./audio_generated_v4");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tts = new MsEdgeTTS();
  // AndrewNeural has extraordinary warmth, natural breathing, and dynamic inflection
  await tts.setMetadata("en-US-AndrewNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

  console.log("Generating 9 high-energy, natural broadcast voiceover segments...");

  for (const seg of voiceSegments) {
    const tmpDir = path.join(outDir, `tmp_${seg.id}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Rate 1.05 gives energetic commercial pace without sounding robotic
    const res = await tts.toFile(tmpDir, seg.text, { rate: 1.05 });
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
    const endSec = seg.startSec + dur;
    console.log(`[${seg.id}] (${dur.toFixed(2)}s | ${seg.startSec.toFixed(1)}s -> ${endSec.toFixed(1)}s): "${seg.text}"`);
  }

  const jsonPath = path.join(outDir, "segments_v4.json");
  fs.writeFileSync(jsonPath, JSON.stringify(voiceSegments, null, 2));
  console.log(`Saved calibrated segments map to ${jsonPath}`);
}

generateNaturalVO().catch(console.error);
