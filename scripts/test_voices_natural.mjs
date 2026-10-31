import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import fs from "fs";
import path from "path";

async function testVoices() {
  const voices = ["en-US-AndrewNeural", "en-US-AvaNeural", "en-US-BrianNeural", "en-US-EmmaNeural"];
  const text = "What if your properties weren't rows in a spreadsheet... but a living, breathing digital twin? Every floor. Every tenant. In real-time.";
  
  for (const v of voices) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const res = await tts.toFile("./audio_generated_60s", text);
      const target = `./audio_generated_60s/test_${v}.mp3`;
      fs.copyFileSync(res.audioFilePath, target);
      console.log("Successfully generated voice:", v, target);
    } catch (e) {
      console.error("Failed voice:", v, e.message);
    }
  }
}

testVoices();
