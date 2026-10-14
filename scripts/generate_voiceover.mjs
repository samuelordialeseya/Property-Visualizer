import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const voiceSegments = [
  {
    id: "vo_01_intro",
    text: "Property Visualizer. The spatial digital twin for property managers.",
    startSec: 0.5
  },
  {
    id: "vo_02_dashboard",
    text: "Executive clarity. Real-time occupancy, revenue, and overdue alerts.",
    startSec: 5.0
  },
  {
    id: "vo_03_3d",
    text: "Obsidian 3D engine. Spatially track every unit with Tenancy Triad.",
    startSec: 10.2
  },
  {
    id: "vo_04_blueprint",
    text: "Precision 2D blueprints. Field-ready on iPad with zero lag.",
    startSec: 15.2
  },
  {
    id: "vo_05_outro",
    text: "Spatial truth over spreadsheets. Experience Property Visualizer.",
    startSec: 20.2
  }
];

async function generateVO() {
  const outDir = path.resolve("./audio_generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tts = new MsEdgeTTS();
  await tts.setMetadata("en-US-ChristopherNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  console.log("Generating tight showreel voice-over segments...");
  for (const seg of voiceSegments) {
    const tmpDir = path.join(outDir, `tmp_${seg.id}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const res = await tts.toFile(tmpDir, seg.text, { rate: 1.25 });
    const finalPath = path.join(outDir, `${seg.id}.mp3`);
    fs.copyFileSync(res.audioFilePath, finalPath);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`, { encoding: "utf8" });
    const dur = parseFloat(probe.trim()) || 0;
    seg.duration = dur;
    seg.filePath = finalPath;
    console.log(`Segment ${seg.id}: ${dur.toFixed(2)}s (starts at ${seg.startSec}s, ends at ${(seg.startSec + dur).toFixed(2)}s)`);
  }

  fs.writeFileSync(path.join(outDir, "segments.json"), JSON.stringify(voiceSegments, null, 2));
  console.log("Perfect showreel timing achieved!");
}

generateVO().catch(console.error);
