import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SAMPLE_RATE = 44100;
const TOTAL_SECONDS = 60.0;
const TOTAL_SAMPLES = Math.floor(SAMPLE_RATE * TOTAL_SECONDS);

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
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // 16-bit
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

function generateDynamicSoundtrack60s() {
  console.log("Synthesizing 60-second high-energy cinematic electronic soundtrack...");
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  const bpm = 120;
  const beatSec = 60 / bpm; // 0.5s per beat
  const bassFreqs = [73.42, 87.31, 65.41, 98.00]; // D2, F2, C2, G2
  const leadFreqs = [293.66, 349.23, 261.63, 392.00]; // D4, F4, C4, G4

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatSec;
    const bar = Math.floor(beat / 4);
    const sixteenth = (beat * 4) % 1;

    let masterEnv = 1.0;
    if (t < 0.8) masterEnv = t / 0.8;
    if (t > 59.0) masterEnv = Math.max(0, (60.0 - t) / 1.0);

    // Dynamic energy contour
    let energy = 0.5;
    if (t >= 5.5 && t < 12.5) energy = 0.75;
    if (t >= 12.5 && t < 26.0) energy = 0.95;
    if (t >= 26.0 && t < 39.5) energy = 0.90;
    if (t >= 39.5 && t < 47.5) energy = 1.05;
    if (t >= 47.5 && t < 58.5) energy = 1.25;
    if (t >= 58.5) energy = 0.35;

    let sampleL = 0;
    let sampleR = 0;

    // 1. Kick Drum (Punchy 808 transient)
    if ((t >= 5.8 && t < 12.5) || (t >= 12.8 && t < 58.5)) {
      const kickT = (beat % 1) * beatSec;
      if (kickT < 0.28) {
        const kickPitch = 60 * Math.exp(-kickT * 24) + 42;
        const kickEnv = Math.exp(-kickT * 14);
        const kick = Math.sin(2 * Math.PI * kickPitch * kickT) * kickEnv * 0.5;
        const click = (Math.random() * 2 - 1) * Math.exp(-kickT * 90) * 0.15;
        sampleL += kick + click;
        sampleR += kick + click;
      }
    }

    // 2. Crisp Snare / Clap on beats 2 & 4
    if ((t >= 6.0 && t < 12.5) || (t >= 13.0 && t < 58.5)) {
      const snareBeat = (beat % 2);
      if (snareBeat >= 1.0) {
        const snareT = (snareBeat - 1.0) * beatSec;
        if (snareT < 0.22) {
          const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 18);
          const tone = Math.sin(2 * Math.PI * 190 * snareT) * Math.exp(-snareT * 28);
          const snare = (noise * 0.24 + tone * 0.18);
          sampleL += snare;
          sampleR += snare;
        }
      }
    }

    // 3. Cyber Hi-Hats (16th notes with stereo ping-pong)
    if (t >= 12.5 && t < 58.5) {
      const hatT = sixteenth * (beatSec / 4);
      if (hatT < 0.05) {
        const hatEnv = Math.exp(-hatT * 65);
        const hat = (Math.random() * 2 - 1) * hatEnv * 0.08;
        const pan = Math.sin(beat * 2);
        sampleL += hat * (0.8 - pan * 0.3);
        sampleR += hat * (0.8 + pan * 0.3);
      }
    }

    // 4. Arpeggiated Bassline
    const chordIdx = Math.floor(bar) % bassFreqs.length;
    const baseFreq = bassFreqs[chordIdx];
    const arpSteps = [0, 7, 12, 7, 3, 7, 12, 15];
    const stepIdx = Math.floor((beat * 4) % 8);
    const arpFreq = baseFreq * Math.pow(2, arpSteps[stepIdx] / 12);

    const stepT = sixteenth * (beatSec / 4);
    const bassEnv = Math.exp(-stepT * 12);
    const saw = (2 * ((t * arpFreq) % 1) - 1);
    const sub = Math.sin(2 * Math.PI * (arpFreq * 0.5) * t);
    const bass = (saw * 0.45 + sub * 0.55) * bassEnv * 0.26;
    sampleL += bass;
    sampleR += bass;

    // 5. Soaring Lead Synth
    if (t >= 5.5 && t < 58.5) {
      const leadBase = leadFreqs[chordIdx];
      const leadStep = Math.floor((beat * 8) % 8);
      const leadNotes = [0, 12, 7, 15, 12, 19, 15, 24];
      const leadFreq = leadBase * Math.pow(2, leadNotes[leadStep] / 12);
      const leadT = ((beat * 8) % 1) * (beatSec / 8);
      const leadEnv = Math.exp(-leadT * 16);
      const lead = Math.sin(2 * Math.PI * leadFreq * t) * leadEnv * 0.14;

      sampleL += lead * (0.3 + 0.7 * Math.sin(t * 2));
      sampleR += lead * (0.3 + 0.7 * Math.cos(t * 2));
    }

    // 6. Ambient Tech Pad
    const droneFreq = 146.83; // D3
    const pad = Math.sin(2 * Math.PI * droneFreq * t) * 0.08 + Math.sin(2 * Math.PI * (droneFreq * 1.5) * t) * 0.05;
    sampleL += pad;
    sampleR += pad;

    // Climax resolution hit at 58.4s
    if (t >= 58.4) {
      const hitT = t - 58.4;
      if (hitT < 1.4) {
        const hitSub = Math.sin(2 * Math.PI * 45 * hitT) * Math.exp(-hitT * 4);
        const hitShimmer = (Math.random() * 2 - 1) * Math.exp(-hitT * 12) * 0.15;
        sampleL += (hitSub + hitShimmer) * 0.5;
        sampleR += (hitSub + hitShimmer) * 0.5;
      }
    }

    left[i] = Math.max(-0.95, Math.min(0.95, sampleL * energy * masterEnv));
    right[i] = Math.max(-0.95, Math.min(0.95, sampleR * energy * masterEnv));
  }

  return { left, right };
}

function generateDynamicSFX60s() {
  console.log("Synthesizing 60-second synchronized SFX track...");
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  const addSFX = (startSec, durationSec, genFn) => {
    const startSample = Math.floor(startSec * SAMPLE_RATE);
    const numSamples = Math.floor(durationSec * SAMPLE_RATE);
    for (let j = 0; j < numSamples; j++) {
      const idx = startSample + j;
      if (idx >= TOTAL_SAMPLES) break;
      const t = j / SAMPLE_RATE;
      const [l, r] = genFn(t, durationSec);
      left[idx] += l;
      right[idx] += r;
    }
  };

  // 0.8s: Spreadsheet error buzz & glitch
  addSFX(0.8, 0.4, (t) => {
    const buzz = Math.sin(2 * Math.PI * 110 * t) * Math.exp(-t * 8) * 0.35;
    const glitch = (Math.random() * 2 - 1) * Math.exp(-t * 15) * 0.2;
    return [buzz + glitch, buzz + glitch];
  });

  // 5.8s: Giant Sub Drop & Mascot Reveal Boom
  addSFX(5.8, 1.8, (t) => {
    const p = Math.max(30, 150 * Math.exp(-t * 7));
    const sub = Math.sin(2 * Math.PI * p * t) * Math.exp(-t * 3) * 0.8;
    const impact = (Math.random() * 2 - 1) * Math.exp(-t * 30) * 0.3;
    return [sub + impact, sub + impact];
  });

  // 12.6s: Camera Whip Whoosh into Executive Dashboard
  addSFX(12.6, 0.8, (t, dur) => {
    const env = Math.sin((t / dur) * Math.PI);
    const sweep = Math.sin(2 * Math.PI * (200 + 1200 * (t / dur)) * t) * env * 0.3;
    const noise = (Math.random() * 2 - 1) * env * 0.25;
    return [sweep * 0.6 + noise, sweep * 1.3 + noise];
  });

  // 14.5s: UI Selection Click & Metric Pop
  addSFX(14.5, 0.15, (t) => {
    const click = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 60) * 0.3;
    return [click, click];
  });

  // 19.5s: Urgent Overdue Warning Alarm (Two quick pings)
  [19.5, 19.8].forEach(time => {
    addSFX(time, 0.25, (t) => {
      const beep = Math.sin(2 * Math.PI * 920 * t) * Math.exp(-t * 16) * 0.4;
      return [beep, beep];
    });
  });

  // 26.5s: Portal Warp into Obsidian 3D Engine
  addSFX(26.5, 1.2, (t) => {
    const ping = Math.sin(2 * Math.PI * 660 * t) * Math.exp(-t * 5) * 0.35;
    const servo = Math.sin(2 * Math.PI * (150 + 400 * t) * t) * Math.exp(-t * 2) * 0.3;
    return [ping + servo, ping * 0.8 + servo * 1.2];
  });

  // 28.5s, 30.5s, 32.5s: Spatial Hologram Reticle Locks
  [28.5, 30.5, 32.5].forEach(time => {
    addSFX(time, 0.18, (t) => {
      const lock = Math.sin(2 * Math.PI * 1350 * t) * Math.exp(-t * 40) * 0.3;
      return [lock, lock];
    });
  });

  // 34.2s: Heavy Mechanical Wrench Clank on Roof Maintenance
  addSFX(34.2, 0.6, (t) => {
    const clank = Math.sin(2 * Math.PI * 480 * t) * Math.exp(-t * 18) * 0.4;
    const sub = Math.sin(2 * Math.PI * 75 * t) * Math.exp(-t * 8) * 0.35;
    return [clank + sub, clank + sub];
  });

  // 40.8s: Cyan Laser Scanner Wipe across Canvas
  addSFX(40.8, 1.0, (t, dur) => {
    const laserP = 2400 - 1900 * (t / dur);
    const laser = Math.sin(2 * Math.PI * laserP * t) * Math.exp(-t * 3.5) * 0.4;
    return [laser, laser];
  });

  // 42.0s: Tactile Glass iPad Tap
  addSFX(42.0, 0.15, (t) => {
    const tap = Math.sin(2 * Math.PI * 2200 * t) * Math.exp(-t * 50) * 0.25;
    return [tap, tap];
  });

  // 47.5s: Grand Climax Riser and Impact
  addSFX(47.5, 1.8, (t) => {
    const drop = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 3) * 0.7;
    const riser = Math.sin(2 * Math.PI * (300 + 1000 * t) * t) * Math.exp(-t * 1.5) * 0.25;
    return [drop + riser, drop + riser];
  });

  // 58.4s: Final Crystalline Resolution Sub-Drop
  addSFX(58.4, 1.2, (t) => {
    const sub = Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 4) * 0.6;
    const shimmer = Math.sin(2 * Math.PI * 3400 * t) * Math.exp(-t * 10) * 0.2;
    return [sub + shimmer, sub + shimmer];
  });

  return { left, right };
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
  console.log(`Saved audio file: ${filePath}`);
}

async function buildMasterV4Audio() {
  const outDir = path.resolve("./audio_generated_v4");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const music = generateDynamicSoundtrack60s();
  const musicPath = path.join(outDir, "music_60s.wav");
  writeStereoWav(musicPath, music.left, music.right);

  const sfx = generateDynamicSFX60s();
  const sfxPath = path.join(outDir, "sfx_60s.wav");
  writeStereoWav(sfxPath, sfx.left, sfx.right);

  const voSegments = JSON.parse(fs.readFileSync(path.join(outDir, "segments_v4.json"), "utf8"));

  let inputs = `-i "${musicPath}" -i "${sfxPath}"`;
  let filterParts = [];

  // Duck music under voiceover
  filterParts.push(`[0:a]volume=0.30[music]`);
  filterParts.push(`[1:a]volume=0.85[sfx]`);

  let voMixInputs = [];
  voSegments.forEach((seg, idx) => {
    const inputIdx = idx + 2;
    inputs += ` -i "${seg.filePath}"`;
    const delayMs = Math.round(seg.startSec * 1000);
    // Studio vocal EQ: high-pass filter at 85Hz + warmth + smooth limiter
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},highpass=f=85,equalizer=f=2800:t=q:w=1.2:g=1.5,volume=1.35[vo${idx}]`);
    voMixInputs.push(`[vo${idx}]`);
  });

  const allInputs = `[music][sfx]${voMixInputs.join("")}`;
  const totalMixCount = 2 + voSegments.length;
  filterParts.push(`${allInputs}amix=inputs=${totalMixCount}:duration=first:dropout_transition=2,alimiter=limit=0.96[master]`);

  const masterAudioPath = path.join(outDir, "audio_master_60s.wav");
  const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterParts.join(";")}" -map "[master]" -t 60.0 "${masterAudioPath}"`;

  console.log("Rendering 60.0s Master Audio Mix v4 with ffmpeg...");
  execSync(cmd, { stdio: "inherit" });
  console.log("Master Audio Mix complete:", masterAudioPath);

  // Copy to showreel assets
  const assetDest = path.resolve("./showreel_engine/assets/audio_master_60s.wav");
  fs.copyFileSync(masterAudioPath, assetDest);
  console.log(`Copied master audio to ${assetDest}`);
}

buildMasterV4Audio().catch(console.error);
