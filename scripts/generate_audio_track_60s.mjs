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

function generateSoundtrack60s() {
  console.log("Synthesizing 60-second cinematic soundtrack...");
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

    // Master volume envelope
    let masterEnv = 1.0;
    if (t < 1.0) masterEnv = t / 1.0;
    if (t > 59.0) masterEnv = Math.max(0, (60.0 - t) / 1.0);

    // Section energy scaling across 60 seconds:
    // 0.0 - 15.0s: Atmospheric intro (energy 0.5)
    // 15.0 - 29.5s: Dashboard groove (energy 0.8)
    // 29.5 - 45.5s: 3D spatial tech drive (energy 0.95)
    // 45.5 - 53.0s: CAD precision build (energy 1.05)
    // 53.0 - 59.2s: Maximum climax (energy 1.2)
    // 59.2 - 60.0s: Resolution fade (energy 0.4)
    let energy = 0.5;
    if (t >= 15.0 && t < 29.5) energy = 0.8;
    if (t >= 29.5 && t < 45.5) energy = 0.95;
    if (t >= 45.5 && t < 53.0) energy = 1.05;
    if (t >= 53.0 && t < 59.2) energy = 1.2;
    if (t >= 59.2) energy = 0.35;

    let sampleL = 0;
    let sampleR = 0;

    // 1. Kick Drum (from 15.0s to 59.0s on every beat)
    if (t >= 15.0 && t < 59.0) {
      const kickT = (beat % 1) * beatSec;
      if (kickT < 0.28) {
        const kickPitch = 55 * Math.exp(-kickT * 22) + 42;
        const kickEnv = Math.exp(-kickT * 15);
        const kick = Math.sin(2 * Math.PI * kickPitch * kickT) * kickEnv * 0.45;
        const click = (Math.random() * 2 - 1) * Math.exp(-kickT * 80) * 0.12;
        sampleL += kick + click;
        sampleR += kick + click;
      }
    }

    // 2. Snare / Clap (on beats 2 & 4 from 22.0s to 59.0s)
    if (t >= 22.0 && t < 59.0) {
      const snareBeat = (beat % 2);
      if (snareBeat >= 1.0) {
        const snareT = (snareBeat - 1.0) * beatSec;
        if (snareT < 0.24) {
          const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 18);
          const tone = Math.sin(2 * Math.PI * 180 * snareT) * Math.exp(-snareT * 25);
          const snare = (noise * 0.22 + tone * 0.18);
          sampleL += snare;
          sampleR += snare;
        }
      }
    }

    // 3. Hi-Hats (16th notes from 18.0s to 59.0s)
    if (t >= 18.0 && t < 59.0) {
      const hatT = sixteenth * (beatSec / 4);
      if (hatT < 0.05) {
        const hatEnv = Math.exp(-hatT * 60);
        const hat = (Math.random() * 2 - 1) * hatEnv * 0.07;
        sampleL += hat * 0.8;
        sampleR += hat * 1.2;
      }
    }

    // 4. Arpeggiated Cyber Bassline (16th notes)
    const chordIdx = Math.floor(bar) % bassFreqs.length;
    const baseFreq = bassFreqs[chordIdx];
    const arpSteps = [0, 7, 12, 7, 3, 7, 12, 15];
    const stepIdx = Math.floor((beat * 4) % 8);
    const arpFreq = baseFreq * Math.pow(2, arpSteps[stepIdx] / 12);

    const stepT = sixteenth * (beatSec / 4);
    const bassEnv = Math.exp(-stepT * 12);
    const saw = (2 * ((t * arpFreq) % 1) - 1);
    const sub = Math.sin(2 * Math.PI * (arpFreq * 0.5) * t);
    const bass = (saw * 0.45 + sub * 0.55) * bassEnv * 0.24;
    sampleL += bass;
    sampleR += bass;

    // 5. Tech Lead & Chords (from 8.0s onward)
    if (t >= 8.0 && t < 59.0) {
      const leadBase = leadFreqs[chordIdx];
      const leadStep = Math.floor((beat * 8) % 8);
      const leadNotes = [0, 12, 7, 15, 12, 19, 15, 24];
      const leadFreq = leadBase * Math.pow(2, leadNotes[leadStep] / 12);
      const leadT = ((beat * 8) % 1) * (beatSec / 8);
      const leadEnv = Math.exp(-leadT * 16);
      const lead = Math.sin(2 * Math.PI * leadFreq * t) * leadEnv * 0.12;

      sampleL += lead * (0.3 + 0.7 * Math.sin(t * 2));
      sampleR += lead * (0.3 + 0.7 * Math.cos(t * 2));
    }

    // 6. Warm Ambient Pad
    const droneFreq = 146.83; // D3
    const pad = Math.sin(2 * Math.PI * droneFreq * t) * 0.08 + Math.sin(2 * Math.PI * (droneFreq * 1.5) * t) * 0.05;
    sampleL += pad;
    sampleR += pad;

    // Final resolution hit at 59.2s
    if (t >= 59.2) {
      const hitT = t - 59.2;
      if (hitT < 0.8) {
        const hitSub = Math.sin(2 * Math.PI * 45 * hitT) * Math.exp(-hitT * 5);
        const hitShimmer = (Math.random() * 2 - 1) * Math.exp(-hitT * 15) * 0.15;
        sampleL += (hitSub + hitShimmer) * 0.5;
        sampleR += (hitSub + hitShimmer) * 0.5;
      }
    }

    left[i] = Math.max(-0.95, Math.min(0.95, sampleL * energy * masterEnv));
    right[i] = Math.max(-0.95, Math.min(0.95, sampleR * energy * masterEnv));
  }

  return { left, right };
}

function generateSFX60s() {
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

  // 0.2s: Initial sub boom & mascot reveal
  addSFX(0.2, 1.8, (t) => {
    const p = Math.max(30, 140 * Math.exp(-t * 8));
    const sub = Math.sin(2 * Math.PI * p * t) * Math.exp(-t * 3.5) * 0.7;
    const impact = (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.25;
    return [sub + impact, sub + impact];
  });

  // 15.0s: Transition to Executive Dashboard
  addSFX(15.0, 1.0, (t, dur) => {
    const env = Math.sin((t / dur) * Math.PI);
    const noise = (Math.random() * 2 - 1) * env * 0.3;
    const sweep = Math.sin(2 * Math.PI * (250 + 1000 * (t / dur)) * t) * env * 0.2;
    return [noise + sweep * 0.7, noise + sweep * 1.2];
  });

  // 29.5s: Transition to Obsidian 3D Engine
  addSFX(29.5, 1.2, (t) => {
    const ping = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 6) * 0.35;
    const servo = Math.sin(2 * Math.PI * (180 + 350 * t) * t) * Math.exp(-t * 2) * 0.25;
    return [ping + servo, ping * 0.8 + servo * 1.1];
  });

  // 37.0s: Spatial unit target reticle locks
  [37.0, 37.6, 38.2].forEach(time => {
    addSFX(time, 0.15, (t) => {
      const ping = Math.sin(2 * Math.PI * 1400 * t) * Math.exp(-t * 40) * 0.25;
      return [ping, ping];
    });
  });

  // 45.5s: Laser scanner wipe to 2D Blueprint
  addSFX(45.5, 1.2, (t, dur) => {
    const laserP = 2200 - 1800 * (t / dur);
    const laser = Math.sin(2 * Math.PI * laserP * t) * Math.exp(-t * 3.5) * 0.35;
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.2;
    return [laser + click, laser + click];
  });

  // 52.8s: Grand climax riser and impact
  addSFX(52.8, 1.8, (t) => {
    const drop = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 3.5) * 0.65;
    const riser = Math.sin(2 * Math.PI * (350 + 900 * t) * t) * Math.exp(-t * 1.8) * 0.2;
    return [drop + riser, drop + riser];
  });

  // 59.2s: Final crystalline resolution
  addSFX(59.2, 0.8, (t) => {
    const sub = Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 5) * 0.5;
    const shimmer = Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 12) * 0.15;
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

async function buildMaster60sAudio() {
  const outDir = path.resolve("./audio_generated_60s");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const music = generateSoundtrack60s();
  const musicPath = path.join(outDir, "music_60s.wav");
  writeStereoWav(musicPath, music.left, music.right);

  const sfx = generateSFX60s();
  const sfxPath = path.join(outDir, "sfx_60s.wav");
  writeStereoWav(sfxPath, sfx.left, sfx.right);

  const voSegments = JSON.parse(fs.readFileSync(path.join(outDir, "segments_60s.json"), "utf8"));

  let inputs = `-i "${musicPath}" -i "${sfxPath}"`;
  let filterParts = [];

  // Duck music under voiceover (-14dB)
  filterParts.push(`[0:a]volume=0.32[music]`);
  filterParts.push(`[1:a]volume=0.85[sfx]`);

  let voMixInputs = [];
  voSegments.forEach((seg, idx) => {
    const inputIdx = idx + 2;
    inputs += ` -i "${seg.filePath}"`;
    const delayMs = Math.round(seg.startSec * 1000);
    // Equalizer: Warm presence boost on Guy's voice
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},equalizer=f=3500:t=q:w=1.5:g=2.2,volume=1.45[vo${idx}]`);
    voMixInputs.push(`[vo${idx}]`);
  });

  const allInputs = `[music][sfx]${voMixInputs.join("")}`;
  const totalMixCount = 2 + voSegments.length;
  filterParts.push(`${allInputs}amix=inputs=${totalMixCount}:duration=first:dropout_transition=2,alimiter=limit=0.96[master]`);

  const masterAudioPath = path.join(outDir, "audio_master_60s.wav");
  const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterParts.join(";")}" -map "[master]" -t 60.0 "${masterAudioPath}"`;

  console.log("Rendering 60.0s Master Audio Mix with ffmpeg...");
  execSync(cmd, { stdio: "inherit" });
  console.log("Master Audio Mix complete:", masterAudioPath);
}

buildMaster60sAudio().catch(console.error);
