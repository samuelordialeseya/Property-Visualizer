import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SAMPLE_RATE = 44100;
const TOTAL_SECONDS = 30.0;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * TOTAL_SECONDS);

// 128.0 BPM => 1 beat = 0.46875s, 1 bar (4 beats) = 1.875s, 16 bars = 30.000s
const BPM = 128.0;
const BEAT_SEC = 60.0 / BPM; // 0.46875s
const BAR_SEC = BEAT_SEC * 4; // 1.875s

// Curated 5-Act 30.0s Showreel Voiceover Script mapped to 16 Bars @ 128 BPM
const voicePlan = [
  {
    id: "vo_30s_01_genesis",
    sourceFile: "audio_generated_v4/vo_02_twin.mp3",
    text: "Meet Property Visualizer. The spatial digital twin turning abstract rows into living architecture.",
    startSec: 0.30,
    tempo: 1.18
  },
  {
    id: "vo_30s_02_dashboard",
    sourceFile: "audio_generated_v4/vo_03_dashboard.mp3",
    text: "Your executive deck delivers instant clarity on portfolio health, occupancy, and cash flow.",
    startSec: 5.95,
    tempo: 1.18
  },
  {
    id: "vo_30s_03_obsidian3d",
    sourceFile: "audio_generated_v4/vo_05_3d_spatial.mp3",
    text: "Step into the Obsidian 3D darkroom. Orbit every unit in real time, coded by Tenancy Triad.",
    startSec: 11.40,
    tempo: 1.18
  },
  {
    id: "vo_30s_04_cad_ipad",
    sourceFile: "audio_generated_v4/vo_07_cad_ipad.mp3",
    text: "Slide into 2D CAD blueprints with buttery sixty frames per second on your iPad.",
    startSec: 17.25,
    tempo: 1.18
  },
  {
    id: "vo_30s_05_anthem",
    sourceFile: "audio_generated_v4/vo_08_anthem.mp3",
    text: "Every tenant. Every floor. Every single dollar. Exactly where it belongs.",
    startSec: 22.55,
    tempo: 1.22
  },
  {
    id: "vo_30s_06_outro",
    sourceFile: "audio_generated_v4/vo_09_outro.mp3",
    text: "Command your portfolio with Property Visualizer today.",
    trimStartSec: 1.52, // skips "Stop drowning in rows." and starts cleanly on "Command your portfolio with Property Visualizer today."
    startSec: 26.55,
    tempo: 1.12
  }
];

async function prepareVoiceSegments(outDir) {
  console.log("=== Preparing Broadcast Studio Voice-Over Segments (30.0s Showreel) ===");
  const elevenKey = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

  for (const seg of voicePlan) {
    const outMp3 = path.join(outDir, `${seg.id}.mp3`);
    let rawSource = path.resolve(seg.sourceFile);

    if (elevenKey) {
      try {
        const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },
          body: JSON.stringify({
            text: seg.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.45, similarity_boost: 0.82, style: 0.35, use_speaker_boost: true }
          })
        });
        if (resp.ok) {
          const rawEleven = path.join(outDir, `raw_eleven_${seg.id}.mp3`);
          fs.writeFileSync(rawEleven, Buffer.from(await resp.arrayBuffer()));
          rawSource = rawEleven;
        }
      } catch (e) {
        console.warn("ElevenLabs fallback:", e.message);
      }
    }

    const trimArg = seg.trimStartSec ? `-ss ${seg.trimStartSec}` : "";
    const filterChain = [
      `silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB`,
      `areverse`,
      `silenceremove=start_periods=1:start_duration=0.02:start_threshold=-45dB`,
      `areverse`,
      `atempo=${seg.tempo || 1.15}`,
      `highpass=f=80`,
      `equalizer=f=175:t=q:w=1.1:g=2.4`,
      `equalizer=f=3100:t=q:w=1.2:g=2.2`,
      `acompressor=threshold=-16dB:ratio=2.5:attack=10:release=80:makeup=2`
    ].join(",");

    execSync(`ffmpeg -y ${trimArg} -i "${rawSource}" -af "${filterChain}" -ar 44100 "${outMp3}"`, { stdio: "pipe" });

    const probe = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outMp3}"`,
      { encoding: "utf8" }
    );
    const dur = parseFloat(probe.trim()) || 0;
    seg.duration = dur;
    seg.endSec = +(seg.startSec + dur).toFixed(2);
    seg.filePath = outMp3;
    console.log(`[${seg.id}] ${seg.startSec.toFixed(2)}s -> ${seg.endSec.toFixed(2)}s (${dur.toFixed(2)}s): "${seg.text}"`);
  }

  for (let i = 0; i < voicePlan.length - 1; i++) {
    const cur = voicePlan[i];
    const nxt = voicePlan[i + 1];
    const gap = nxt.startSec - cur.endSec;
    console.log(`   ↳ Breathing gap between ${cur.id} and ${nxt.id}: ${gap.toFixed(2)}s`);
    if (gap < 0.1) {
      console.warn(`   ⚠ Tight gap detected!`);
    }
  }

  fs.writeFileSync(path.join(outDir, "segments_30s.json"), JSON.stringify(voicePlan, null, 2));
  return voicePlan;
}

function createWavHeader(numSamples, numChannels = 2) {
  const byteRate = SAMPLE_RATE * numChannels * 2;
  const blockAlign = numChannels * 2;
  const dataSize = numSamples * numChannels * 2;
  const buffer = Buffer.alloc(44);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function writeStereoWav(filePath, left, right) {
  const numSamples = left.length;
  const header = createWavHeader(numSamples, 2);
  const data = Buffer.alloc(numSamples * 4);

  for (let i = 0; i < numSamples; i++) {
    const sL = Math.max(-1, Math.min(1, left[i]));
    const sR = Math.max(-1, Math.min(1, right[i]));
    const valL = sL < 0 ? sL * 32768 : sL * 32767;
    const valR = sR < 0 ? sR * 32768 : sR * 32767;
    data.writeInt16LE(Math.floor(valL), i * 4);
    data.writeInt16LE(Math.floor(valR), i * 4 + 2);
  }

  fs.writeFileSync(filePath, Buffer.concat([header, data]));
  console.log(`Saved WAV: ${filePath}`);
}

function generateSoundtrack30s() {
  console.log("Synthesizing 128 BPM 16-Bar Motion Graphics Soundtrack (30.0s)...");
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  // Progression: D minor9 -> Bb maj7 -> F maj7 -> C add9
  const bassFreqs = [73.42, 58.27, 87.31, 65.41]; // D2, Bb1, F2, C2
  const chordRoots = [293.66, 233.08, 349.23, 261.63]; // D4, Bb3, F4, C4

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / BEAT_SEC;
    const bar = Math.floor(beat / 4); // 0..15
    const sixteenth = (beat * 4) % 1;

    let masterEnv = 1.0;
    if (t < 0.25) masterEnv = t / 0.25;
    if (t > 29.35) masterEnv = Math.max(0, (30.0 - t) / 0.65);

    let energy = 0.68;
    if (bar >= 1 && bar < 3) energy = 0.86;       // Mascot genesis
    else if (bar >= 3 && bar < 6) energy = 0.94;  // Daylight Command Deck
    else if (bar >= 6 && bar < 9) energy = 0.98;  // Obsidian 3D Engine
    else if (bar >= 9 && bar < 12) energy = 1.04; // 2D CAD + Bento Grid
    else if (bar >= 12 && bar < 14) energy = 1.20;// Rapid-fire Showreel Climax
    else if (bar >= 14) energy = 0.82;            // Grand Brand Resolve

    let sampleL = 0;
    let sampleR = 0;

    const kickActive = (bar >= 1 && bar < 14);
    const beatFrac = beat % 1;
    const sidechain = kickActive ? (0.35 + 0.65 * Math.min(1, beatFrac * 2.8)) : 1.0;

    // 1. Punchy Studio Kick
    if (kickActive) {
      const kickT = beatFrac * BEAT_SEC;
      if (kickT < 0.24) {
        const pitch = 135 * Math.exp(-kickT * 32) + 44;
        const env = Math.exp(-kickT * 14);
        const body = Math.sin(2 * Math.PI * pitch * kickT) * env * 0.52;
        const click = Math.sin(2 * Math.PI * 1600 * kickT) * Math.exp(-kickT * 95) * 0.16;
        sampleL += body + click;
        sampleR += body + click;
      }
    }

    // 2. Crisp Snare / Clap on beats 2 & 4
    if (bar >= 2 && bar < 14) {
      const snarePhase = beat % 2;
      if (snarePhase >= 1.0) {
        const snareT = (snarePhase - 1.0) * BEAT_SEC;
        if (snareT < 0.18) {
          const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 22);
          const snap = Math.sin(2 * Math.PI * 220 * snareT) * Math.exp(-snareT * 35);
          const s = noise * 0.24 + snap * 0.18;
          sampleL += s * 0.95;
          sampleR += s * 1.05;
        }
      }
    }

    // 3. Precision 16th-Note Hi-Hats & Shaker
    if (bar >= 2 && bar < 14) {
      const hatT = sixteenth * (BEAT_SEC / 4);
      const accent = (Math.floor(beat * 4) % 4 === 2) ? 1.45 : 0.75;
      const decay = (Math.floor(beat * 4) % 4 === 2) ? 35 : 75;
      if (hatT < 0.08) {
        const hat = (Math.random() * 2 - 1) * Math.exp(-hatT * decay) * 0.075 * accent;
        const pan = Math.sin(beat * Math.PI * 0.5) * 0.35;
        sampleL += hat * (1 - pan);
        sampleR += hat * (1 + pan);
      }
    }

    // 4. Driving Sub & Analog Pluck Bassline
    const chordIdx = bar % 4;
    const bassRoot = bassFreqs[chordIdx];
    const arpPattern = [0, 0, 12, 7, 0, 12, 10, 7];
    const step8 = Math.floor((beat * 4) % 8);
    const noteFreq = bassRoot * Math.pow(2, arpPattern[step8] / 12);
    const stepT = sixteenth * (BEAT_SEC / 4);
    const pluckEnv = Math.exp(-stepT * 15);

    const subWave = Math.sin(2 * Math.PI * bassRoot * t) * 0.34;
    const sawHarm = (
      Math.sin(2 * Math.PI * noteFreq * t) +
      0.5 * Math.sin(4 * Math.PI * noteFreq * t) +
      0.25 * Math.sin(6 * Math.PI * noteFreq * t)
    ) * pluckEnv * 0.16;

    const bassSig = (subWave + sawHarm) * sidechain;
    sampleL += bassSig;
    sampleR += bassSig;

    // 5. Crystalline Architectural Pluck Arpeggio (Stereo Ping-Pong)
    if (bar >= 1 && bar < 15) {
      const root = chordRoots[chordIdx];
      const leadIntervals = [0, 3, 7, 12, 15, 12, 7, 10];
      const lIdx = Math.floor((beat * 4) % 8);
      const lFreq = root * Math.pow(2, leadIntervals[lIdx] / 12);
      const lEnv = Math.exp(-stepT * 20);
      const bell = (
        Math.sin(2 * Math.PI * lFreq * t) +
        0.35 * Math.sin(2 * Math.PI * (lFreq * 2) * t) * Math.exp(-stepT * 35)
      ) * lEnv * 0.11 * sidechain;

      const stereoPan = Math.sin(beat * Math.PI * 0.75);
      sampleL += bell * (0.65 + 0.35 * stereoPan);
      sampleR += bell * (0.65 - 0.35 * stereoPan);
    }

    // 6. Warm Lush Poly-Synth Pad
    const padFreqs = [146.83, 220.00, 261.63, 329.63];
    let padL = 0, padR = 0;
    for (let p = 0; p < padFreqs.length; p++) {
      const f = padFreqs[p];
      const detune = 1 + (p - 1.5) * 0.0018;
      padL += Math.sin(2 * Math.PI * f * t) * 0.038;
      padR += Math.sin(2 * Math.PI * (f * detune) * t) * 0.038;
    }
    sampleL += padL * sidechain;
    sampleR += padR * sidechain;

    // 7. Bar 12 Pre-Montage Riser (20.625s -> 22.50s)
    if (t >= 20.625 && t < 22.50) {
      const rP = (t - 20.625) / 1.875;
      const rFreq = 180 * Math.pow(2, rP * 3.0);
      const riser = Math.sin(2 * Math.PI * rFreq * t) * (rP * rP) * 0.22;
      const white = (Math.random() * 2 - 1) * (rP * rP * rP) * 0.18;
      sampleL += riser + white;
      sampleR += riser + white;
    }

    // 8. Bar 15 Grand Finale Resolution Chord (26.25s -> 30.00s)
    if (t >= 26.25) {
      const finT = t - 26.25;
      const finEnv = Math.exp(-finT * 0.85);
      const chord = [146.83, 220.0, 293.66, 369.99, 440.0, 587.33];
      for (let c = 0; c < chord.length; c++) {
        const cf = chord[c];
        sampleL += Math.sin(2 * Math.PI * cf * 1.001 * t) * finEnv * 0.06;
        sampleR += Math.sin(2 * Math.PI * cf * 0.999 * t) * finEnv * 0.06;
      }
    }

    left[i] = Math.max(-0.95, Math.min(0.95, sampleL * energy * masterEnv));
    right[i] = Math.max(-0.95, Math.min(0.95, sampleR * energy * masterEnv));
  }

  return { left, right };
}

function generateSFX30s() {
  console.log("Synthesizing frame-accurate Motion Graphics SFX synced to 128 BPM cuts...");
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  const addSFX = (startSec, durationSec, genFn) => {
    const startSample = Math.floor(startSec * SAMPLE_RATE);
    const numSamples = Math.floor(durationSec * SAMPLE_RATE);
    for (let j = 0; j < numSamples; j++) {
      const idx = startSample + j;
      if (idx < 0 || idx >= TOTAL_SAMPLES) continue;
      const t = j / SAMPLE_RATE;
      const [l, r] = genFn(t, durationSec);
      left[idx] += l;
      right[idx] += r;
    }
  };

  // 1. 0.15s: Spreadsheet Matrix Glitch & Error Buzz
  addSFX(0.15, 0.45, (t) => {
    const step = Math.floor(t * 28) % 2 === 0 ? 140 : 210;
    const buzz = Math.sin(2 * Math.PI * step * t) * Math.exp(-t * 6) * 0.25;
    const crackle = (Math.random() * 2 - 1) * Math.exp(-t * 10) * 0.18;
    return [buzz + crackle, buzz + crackle];
  });

  // 2. 1.40s: Razor Cobalt Laser Slice & Glass Shatter
  addSFX(1.40, 0.45, (t) => {
    const f = 2600 * Math.exp(-t * 7) + 220;
    const zap = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 8) * 0.42;
    const burst = (Math.random() * 2 - 1) * Math.exp(-t * 14) * 0.32;
    return [zap * 1.2 + burst, zap * 0.8 + burst];
  });

  // 3. 1.875s (Bar 2): Mascot 3D Genesis Sub-Drop + Crystalline Lock
  addSFX(1.875, 1.4, (t) => {
    const subF = 145 * Math.exp(-t * 7.5) + 36;
    const sub = Math.sin(2 * Math.PI * subF * t) * Math.exp(-t * 3.2) * 0.72;
    const chime = (
      Math.sin(2 * Math.PI * 1174.66 * t) +
      Math.sin(2 * Math.PI * 1760.00 * t) * 0.6
    ) * Math.exp(-t * 6.5) * 0.22;
    return [sub + chime, sub + chime];
  });

  // 4. 3.60s, 3.75s, 3.90s: 3 Capability Pills Stagger Pop
  [3.60, 3.75, 3.90].forEach((time, idx) => {
    addSFX(time, 0.12, (t) => {
      const f = 900 + idx * 250;
      const pop = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 45) * 0.25;
      return [pop, pop];
    });
  });

  // 5. 5.625s (Bar 4): Daylight Mist Shutter Whip Pan into Executive Deck
  addSFX(5.58, 0.55, (t, dur) => {
    const env = Math.sin((t / dur) * Math.PI);
    const sweep = Math.sin(2 * Math.PI * (180 + 1400 * (t / dur)) * t) * env * 0.28;
    const air = (Math.random() * 2 - 1) * env * 0.26;
    return [sweep * 0.6 + air, sweep * 1.3 + air];
  });

  // 6. 6.09s & 6.56s: Stat Cards Elastic Pop + Revenue Counter Ticks
  [6.09, 6.56].forEach((time, i) => {
    addSFX(time, 0.18, (t) => {
      const pop = Math.sin(2 * Math.PI * (680 + i * 220) * (1 + t * 4) * t) * Math.exp(-t * 35) * 0.32;
      return [pop, pop];
    });
  });
  for (let k = 0; k < 10; k++) {
    addSFX(6.65 + k * 0.08, 0.04, (t) => {
      const tick = Math.sin(2 * Math.PI * (1600 + k * 90) * t) * Math.exp(-t * 80) * 0.16;
      return [tick, tick];
    });
  }

  // 7. 8.4375s (Bar 5.5): Camera Whip to Property Detail, Units Directory & Unit 103 Inspector
  addSFX(8.40, 0.45, (t, dur) => {
    const env = Math.sin((t / dur) * Math.PI);
    const whoosh = (Math.random() * 2 - 1) * env * 0.28 + Math.sin(2 * Math.PI * (300 + 900 * (t / dur)) * t) * env * 0.22;
    return [whoosh * 1.2, whoosh * 0.8];
  });

  // 8. 9.375s (Bar 6): Unit 103 Overdue Urgent Coral Double-Ping + 10.10s Inspector Click
  [9.375, 9.60].forEach((time) => {
    addSFX(time, 0.20, (t) => {
      const ping = Math.sin(2 * Math.PI * 987.77 * t) * Math.exp(-t * 18) * 0.34;
      return [ping, ping];
    });
  });
  addSFX(10.15, 0.25, (t) => {
    const click = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 65) * 0.32;
    const confirm = Math.sin(2 * Math.PI * 1318.5 * t) * Math.exp(-t * 16) * 0.24;
    return [click + confirm, click + confirm];
  });

  // 9. 11.25s (Bar 7): The Dual-World Eclipse Warp into Obsidian 3D Engine
  addSFX(11.22, 0.95, (t) => {
    const drop = Math.sin(2 * Math.PI * (180 * Math.exp(-t * 5) + 42) * t) * Math.exp(-t * 3.5) * 0.65;
    const servo = Math.sin(2 * Math.PI * (220 + 680 * t) * t) * Math.exp(-t * 3.0) * 0.25;
    return [drop + servo * 0.8, drop + servo * 1.2];
  });

  // 10. 12.65s, 13.59s, 14.53s: Tenancy Triad 3D Spatial Reticle Locks
  [12.65, 13.59, 14.53].forEach((time, idx) => {
    const freqs = [1174.66, 987.77, 1318.51];
    addSFX(time, 0.22, (t) => {
      const sonar = Math.sin(2 * Math.PI * freqs[idx] * t) * Math.exp(-t * 25) * 0.34;
      const mech = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.18;
      return [sonar + mech, sonar + mech];
    });
  });

  // 11. 15.468s: Roof Maintenance Pin Lock & Metallic Wrench Impact
  addSFX(15.468, 0.50, (t) => {
    const clank = (Math.sin(2 * Math.PI * 520 * t) + Math.sin(2 * Math.PI * 1380 * t) * 0.7) * Math.exp(-t * 20) * 0.36;
    const sub = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 9) * 0.35;
    return [clank + sub, clank + sub];
  });

  // 12. 16.875s (Bar 10): Cyan Laser Scanner Wipe into 2D CAD Blueprint
  addSFX(16.85, 0.85, (t) => {
    const laserF = 2400 * Math.exp(-t * 3.5) + 280;
    const laser = Math.sin(2 * Math.PI * laserF * t) * Math.exp(-t * 3.5) * 0.38;
    const shimmer = (Math.random() * 2 - 1) * Math.exp(-t * 8) * 0.20;
    return [laser + shimmer, laser * 0.85 + shimmer];
  });

  // 13. 18.20s: CAD Dimension Line Draw Ticks & iPad 60FPS Touch Tap
  [18.10, 18.35, 18.60, 19.10].forEach((time, idx) => {
    addSFX(time, 0.12, (t) => {
      const tap = Math.sin(2 * Math.PI * (1800 + idx * 150) * t) * Math.exp(-t * 55) * 0.24;
      return [tap, tap];
    });
  });

  // 14. 20.625s, 21.09s, 21.56s, 22.03s (Bar 12): 4 Bento Grid Mechanical Snaps
  [20.625, 21.09375, 21.5625, 22.03125].forEach((time, idx) => {
    addSFX(time, 0.18, (t) => {
      const snap = Math.sin(2 * Math.PI * (440 + idx * 110) * t) * Math.exp(-t * 35) * 0.34;
      const thud = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 20) * 0.32;
      return [snap + thud, snap + thud];
    });
  });

  // 15. 22.50s, 23.4375s, 24.375s, 24.84375s, 25.3125s, 25.78125s (Bars 13–14): Rapid-Fire Showreel Montage Hits!
  [22.50, 23.4375, 24.375, 24.84375, 25.3125, 25.78125].forEach((time, idx) => {
    addSFX(time, 0.35, (t) => {
      const impact = Math.sin(2 * Math.PI * (110 * Math.exp(-t * 12) + 48) * t) * Math.exp(-t * 8) * 0.55;
      const shutter = (Math.random() * 2 - 1) * Math.exp(-t * 38) * 0.32;
      const tone = Math.sin(2 * Math.PI * (587.33 + idx * 110) * t) * Math.exp(-t * 22) * 0.22;
      return [impact + shutter + tone, impact + shutter + tone];
    });
  });

  // 16. 26.25s (Bar 15): Grand Finale Sub Boom + Crystalline Brand Lockup Shimmer
  addSFX(26.25, 2.2, (t) => {
    const sub = Math.sin(2 * Math.PI * (120 * Math.exp(-t * 8) + 40) * t) * Math.exp(-t * 2.2) * 0.78;
    const sparkle = (
      Math.sin(2 * Math.PI * 2349.32 * t) +
      Math.sin(2 * Math.PI * 2959.96 * t) * 0.7 +
      Math.sin(2 * Math.PI * 3520.00 * t) * 0.5
    ) * Math.exp(-t * 3.5) * 0.14;
    return [sub + sparkle, sub + sparkle];
  });

  return { left, right };
}

async function main() {
  const outDir = path.resolve("./audio_generated_30s");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const voSegments = await prepareVoiceSegments(outDir);

  const music = generateSoundtrack30s();
  const musicPath = path.join(outDir, "music_30s.wav");
  writeStereoWav(musicPath, music.left, music.right);

  const sfx = generateSFX30s();
  const sfxPath = path.join(outDir, "sfx_30s.wav");
  writeStereoWav(sfxPath, sfx.left, sfx.right);

  let inputs = `-i "${musicPath}" -i "${sfxPath}"`;
  let filterParts = [];

  filterParts.push(`[0:a]volume=0.33[music]`);
  filterParts.push(`[1:a]volume=0.88[sfx]`);

  let voMixInputs = [];
  voSegments.forEach((seg, idx) => {
    const inputIdx = idx + 2;
    inputs += ` -i "${seg.filePath}"`;
    const delayMs = Math.round(seg.startSec * 1000);
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=1.55[vo${idx}]`);
    voMixInputs.push(`[vo${idx}]`);
  });

  const allInputs = `[music][sfx]${voMixInputs.join("")}`;
  const totalMixCount = 2 + voSegments.length;
  filterParts.push(
    `${allInputs}amix=inputs=${totalMixCount}:duration=first:dropout_transition=0,volume=${(totalMixCount * 0.42).toFixed(2)},alimiter=limit=0.96[master]`
  );

  const masterAudioPath = path.join(outDir, "audio_master_30s.wav");
  const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterParts.join(";")}" -map "[master]" -t 30.0 "${masterAudioPath}"`;

  console.log("Mastering 30.0s Audio Mix via FFmpeg...");
  execSync(cmd, { stdio: "inherit" });

  const assetDest = path.resolve("./showreel_engine/assets/audio_master_30s.wav");
  fs.copyFileSync(masterAudioPath, assetDest);
  console.log(`Copied 30.0s master audio to ${assetDest}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
