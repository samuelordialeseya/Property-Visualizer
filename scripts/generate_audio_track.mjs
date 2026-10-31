import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const SAMPLE_RATE = 44100;
const TOTAL_SECONDS = 25.0;
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
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

// Generate the cinematic electronic soundtrack
function generateSoundtrack() {
  console.log("Synthesizing cinematic electronic soundtrack...");
  const left = new Float32Array(TOTAL_SAMPLES);
  const right = new Float32Array(TOTAL_SAMPLES);

  const bpm = 124;
  const beatSec = 60 / bpm;
  const numBeats = Math.floor(TOTAL_SECONDS / beatSec);

  // Bass notes progression (Key of D minor / Tech blueprint vibe: D - F - C - G)
  const bassFreqs = [73.42, 87.31, 65.41, 98.00]; // D2, F2, C2, G2
  const leadFreqs = [293.66, 349.23, 261.63, 392.00]; // D4, F4, C4, G4

  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    const beat = t / beatSec;
    const bar = Math.floor(beat / 4);
    const beatInBar = beat % 4;
    const sixteenth = (beat * 4) % 1;

    // Master volume envelope (fade in 0-0.5s, fade out 24.5-25s)
    let masterEnv = 1.0;
    if (t < 0.6) masterEnv = t / 0.6;
    if (t > 24.2) masterEnv = Math.max(0, (25.0 - t) / 0.8);

    // Section energy scaling
    // S1 (0-5s): Ambient tech intro, pulsing bass
    // S2 (5-10s): Groove enters (kick + bass + arp)
    // S3 (10-15s): 3D spatial tech arpeggios + hi-hats
    // S4 (15-20s): Full drive with snare build
    // S5 (20-25s): Maximum climax, rapid breakdown, final hit at 24.3s
    let energy = 0.6;
    if (t >= 5.0 && t < 10.0) energy = 0.85;
    if (t >= 10.0 && t < 15.0) energy = 0.95;
    if (t >= 15.0 && t < 20.0) energy = 1.0;
    if (t >= 20.0 && t < 24.3) energy = 1.15;
    if (t >= 24.3) energy = 0.3;

    let sampleL = 0;
    let sampleR = 0;

    // 1. Kick Drum (on beats 1, 2, 3, 4 from 5.0s to 24.0s)
    if (t >= 5.0 && t < 24.0) {
      const kickT = (beat % 1) * beatSec;
      if (kickT < 0.28) {
        const kickPitch = 55 * Math.exp(-kickT * 22) + 42;
        const kickEnv = Math.exp(-kickT * 15);
        const kick = Math.sin(2 * Math.PI * kickPitch * kickT) * kickEnv * 0.45;
        // Subtle click
        const click = (Math.random() * 2 - 1) * Math.exp(-kickT * 80) * 0.15;
        sampleL += kick + click;
        sampleR += kick + click;
      }
    }

    // 2. Snare / Clap (on beats 2 and 4 from 10.0s to 24.0s)
    if (t >= 10.0 && t < 24.0) {
      const snareBeat = (beat % 2);
      if (snareBeat >= 1.0) {
        const snareT = (snareBeat - 1.0) * beatSec;
        if (snareT < 0.22) {
          const noise = (Math.random() * 2 - 1) * Math.exp(-snareT * 18);
          const tone = Math.sin(2 * Math.PI * 185 * snareT) * Math.exp(-snareT * 25);
          const snare = (noise * 0.22 + tone * 0.18);
          sampleL += snare;
          sampleR += snare;
        }
      }
    }

    // 3. Hi-Hats (16th notes from 8.0s to 24.0s)
    if (t >= 8.0 && t < 24.0) {
      const hatT = sixteenth * (beatSec / 4);
      if (hatT < 0.06) {
        const hatEnv = Math.exp(-hatT * 60);
        const hat = (Math.random() * 2 - 1) * hatEnv * 0.08;
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
    const bassEnv = Math.exp(-stepT * 14);
    // Sawtooth approximation + sub
    const saw = (2 * ((t * arpFreq) % 1) - 1);
    const sub = Math.sin(2 * Math.PI * (arpFreq * 0.5) * t);
    const bass = (saw * 0.5 + sub * 0.5) * bassEnv * 0.25;
    sampleL += bass;
    sampleR += bass;

    // 5. Tech Holographic Lead / Arp (stereo ping-pong)
    if (t >= 3.0 && t < 24.0) {
      const leadBase = leadFreqs[chordIdx];
      const leadStep = Math.floor((beat * 8) % 8);
      const leadNotes = [0, 12, 7, 15, 12, 19, 15, 24];
      const leadFreq = leadBase * Math.pow(2, leadNotes[leadStep] / 12);
      const leadT = ((beat * 8) % 1) * (beatSec / 8);
      const leadEnv = Math.exp(-leadT * 18);
      const lead = Math.sin(2 * Math.PI * leadFreq * t) * leadEnv * 0.12;

      sampleL += lead * (0.3 + 0.7 * Math.sin(t * 3));
      sampleR += lead * (0.3 + 0.7 * Math.cos(t * 3));
    }

    // 6. Ambient Pad / Drone
    const droneFreq = 146.83; // D3
    const pad = Math.sin(2 * Math.PI * droneFreq * t) * 0.08 + Math.sin(2 * Math.PI * (droneFreq * 1.5) * t) * 0.05;
    sampleL += pad;
    sampleR += pad;

    // Final hit at 24.3s
    if (t >= 24.3) {
      const hitT = t - 24.3;
      if (hitT < 0.7) {
        const hitSub = Math.sin(2 * Math.PI * 45 * hitT) * Math.exp(-hitT * 6);
        const hitShimmer = (Math.random() * 2 - 1) * Math.exp(-hitT * 15) * 0.15;
        sampleL += (hitSub + hitShimmer) * 0.6;
        sampleR += (hitSub + hitShimmer) * 0.6;
      }
    }

    left[i] = Math.max(-0.95, Math.min(0.95, sampleL * energy * masterEnv));
    right[i] = Math.max(-0.95, Math.min(0.95, sampleR * energy * masterEnv));
  }

  return { left, right };
}

// Generate Synchronized Motion Graphic SFX Track
function generateSFX() {
  console.log("Synthesizing synchronized motion graphics SFX...");
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

  // SFX 1 (0.1s): Dramatic Sub Boom + Mascot Lock-in
  addSFX(0.1, 1.8, (t, dur) => {
    const p = Math.max(30, 140 * Math.exp(-t * 8));
    const sub = Math.sin(2 * Math.PI * p * t) * Math.exp(-t * 3.5) * 0.7;
    const impact = (Math.random() * 2 - 1) * Math.exp(-t * 25) * 0.3;
    return [sub + impact, sub + impact];
  });

  // SFX 2 (4.8s): Digital Whip Whoosh & UI Ticker (Transition to Dashboard)
  addSFX(4.8, 0.8, (t, dur) => {
    const env = Math.sin((t / dur) * Math.PI);
    const noise = (Math.random() * 2 - 1) * env * 0.35;
    const sweep = Math.sin(2 * Math.PI * (300 + 1200 * (t / dur)) * t) * env * 0.2;
    return [noise + sweep * 0.7, noise + sweep * 1.2];
  });

  // SFX 3 (10.0s): Heavy Servo Whir + 3D Hologram Sonar Ping (Transition to 3D)
  addSFX(10.0, 1.2, (t, dur) => {
    const ping = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 6) * 0.35;
    const servo = Math.sin(2 * Math.PI * (180 + 350 * t) * t) * Math.exp(-t * 2) * 0.25;
    return [ping + servo, ping * 0.8 + servo * 1.1];
  });

  // SFX 4 (15.0s): Laser Scanner Wipe + Blueprint Grid Snap
  addSFX(15.0, 1.0, (t, dur) => {
    const laserP = 2200 - 1800 * (t / dur);
    const laser = Math.sin(2 * Math.PI * laserP * t) * Math.exp(-t * 4) * 0.3;
    const click = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.25;
    return [laser + click, laser + click];
  });

  // SFX 5 (20.0s): Kinetic Typographic Impact + Rhythmic Cuts
  addSFX(20.0, 1.5, (t, dur) => {
    const drop = Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t * 4) * 0.6;
    const riser = Math.sin(2 * Math.PI * (400 + 800 * t) * t) * Math.exp(-t * 2) * 0.2;
    return [drop + riser, drop + riser];
  });

  // Rapid montage cut ticks at 20.8s, 21.4s, 22.0s, 22.6s, 23.2s
  [20.8, 21.4, 22.0, 22.6, 23.2].forEach(time => {
    addSFX(time, 0.15, (t) => {
      const tick = Math.sin(2 * Math.PI * 1200 * t) * Math.exp(-t * 50) * 0.2;
      return [tick, tick];
    });
  });

  // SFX 6 (24.2s): Final Climactic Sub Boom + Crystalline Shimmer
  addSFX(24.2, 0.8, (t, dur) => {
    const sub = Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 5) * 0.6;
    const shimmer = Math.sin(2 * Math.PI * 3200 * t) * Math.exp(-t * 12) * 0.15;
    return [sub + shimmer, sub + shimmer];
  });

  return { left, right };
}

function writeStereoWav(filePath, left, right) {
  const numSamples = left.length;
  const header = createWavHeader(numSamples, 2);
  const data = Buffer.alloc(numSamples * 4); // 2 channels * 2 bytes

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

async function buildFullAudioMaster() {
  const outDir = path.resolve("./audio_generated");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const music = generateSoundtrack();
  const musicPath = path.join(outDir, "music_track.wav");
  writeStereoWav(musicPath, music.left, music.right);

  const sfx = generateSFX();
  const sfxPath = path.join(outDir, "sfx_track.wav");
  writeStereoWav(sfxPath, sfx.left, sfx.right);

  // Combine Music (-12dB ducked under VO), SFX (-3dB), and VO segments using ffmpeg
  const voSegments = JSON.parse(fs.readFileSync(path.join(outDir, "segments.json"), "utf8"));
  
  // Build ffmpeg complex filter
  let inputs = `-i "${musicPath}" -i "${sfxPath}"`;
  let filterParts = [];
  
  // Input 0 = music, Input 1 = sfx
  filterParts.push(`[0:a]volume=0.38[music]`);
  filterParts.push(`[1:a]volume=0.85[sfx]`);

  let voMixInputs = [];
  voSegments.forEach((seg, idx) => {
    const inputIdx = idx + 2;
    inputs += ` -i "${seg.filePath}"`;
    const delayMs = Math.round(seg.startSec * 1000);
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=1.35[vo${idx}]`);
    voMixInputs.push(`[vo${idx}]`);
  });

  const allInputs = `[music][sfx]${voMixInputs.join("")}`;
  const totalMixCount = 2 + voSegments.length;
  filterParts.push(`${allInputs}amix=inputs=${totalMixCount}:duration=first:dropout_transition=2,alimiter=limit=0.95[master]`);

  const masterAudioPath = path.join(outDir, "audio_master_25s.wav");
  const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterParts.join(";")}" -map "[master]" -t 25.0 "${masterAudioPath}"`;

  console.log("Rendering 25.0s Master Audio Mix with ffmpeg...");
  execSync(cmd, { stdio: "inherit" });
  console.log("Master Audio Mix complete:", masterAudioPath);
}

buildFullAudioMaster().catch(console.error);
