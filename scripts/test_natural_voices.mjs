import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

async function testNaturalVoices() {
  const outDir = "./test_audio_voices";
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const voicesToTest = [
    { id: "andrew_multi", name: "en-US-AndrewMultilingualNeural" },
    { id: "brian_multi", name: "en-US-BrianMultilingualNeural" },
    { id: "guy_natural", name: "en-US-GuyNeural" },
    { id: "ava_multi", name: "en-US-AvaMultilingualNeural" }
  ];

  const testText = "Most property managers run their portfolios on disconnected spreadsheets and paper logs. Property Visualizer changes everything.";

  for (const v of voicesToTest) {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(v.name, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    const tmpDir = path.join(outDir, `tmp_${v.id}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Rate 1.0 (natural 100% human speed)
    const res = await tts.toFile(tmpDir, testText, { rate: 1.0, pitch: "+0Hz" });
    const finalMp3 = path.join(outDir, `${v.id}.mp3`);
    fs.copyFileSync(res.audioFilePath, finalMp3);
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const probe = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalMp3}"`, { encoding: "utf8" });
    console.log(`Generated ${v.id} (${v.name}): ${parseFloat(probe).toFixed(2)}s`);
  }
}

testNaturalVoices().catch(console.error);
