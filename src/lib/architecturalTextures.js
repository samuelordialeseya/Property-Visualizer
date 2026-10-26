"use client";

import * as THREE from "three";

const textureCache = new Map();

/**
 * Compress an uploaded image File/DataURL to a lightweight WebP data URL
 * so all 4 facade photos fit comfortably inside a Firestore building document.
 */
export function compressFacadeImage(fileOrDataUrl, maxWidth = 1024, maxHeight = 1024, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      // Try webp first, fallback to jpeg
      let out = canvas.toDataURL("image/webp", quality);
      if (!out.startsWith("data:image/webp")) {
        out = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(out);
    };
    img.onerror = (err) => reject(err);

    if (typeof fileOrDataUrl === "string") {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

/**
 * Helper to configure repeating Three.js CanvasTextures with crisp anisotropy
 */
function finalizeCanvasTexture(canvas, repeatX = 1, repeatY = 1, isColor = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (isColor) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.needsUpdate = true;
  return tex;
}

/**
 * High-res Architectural Wall Texture (Plastered Concrete / Masonry / Brick / Stone)
 * Returns { map, bumpMap }
 */
export function getWallTextures(style = "concrete", repeatX = 2, repeatY = 1) {
  const key = `wall_${style}_${repeatX.toFixed(1)}_${repeatY.toFixed(1)}`;
  if (textureCache.has(key)) return textureCache.get(key);

  if (typeof document === "undefined") return { map: null, bumpMap: null };

  const size = 512;
  const diffCanvas = document.createElement("canvas");
  diffCanvas.width = size;
  diffCanvas.height = size;
  const dCtx = diffCanvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  if (style === "brick") {
    // Warm modern architectural brick
    dCtx.fillStyle = "#c8b9a6"; // mortar base
    dCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#404040";
    bCtx.fillRect(0, 0, size, size);

    const rows = 16;
    const cols = 8;
    const rowH = size / rows;
    const colW = size / cols;
    const mortar = 3;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW / 2);
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const y = r * rowH;
        const shade = (Math.sin(r * 7 + c * 13) * 0.5 + 0.5) * 22 - 11;
        const baseR = Math.min(255, Math.max(0, 215 + shade));
        const baseG = Math.min(255, Math.max(0, 200 + shade));
        const baseB = Math.min(255, Math.max(0, 185 + shade));
        dCtx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
        dCtx.fillRect(x + mortar, y + mortar, colW - mortar * 2, rowH - mortar * 2);

        bCtx.fillStyle = "#d8d8d8";
        bCtx.fillRect(x + mortar, y + mortar, colW - mortar * 2, rowH - mortar * 2);
      }
    }
  } else if (style === "stucco") {
    // Fine warm architectural stucco
    dCtx.fillStyle = "#edeae4";
    dCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#808080";
    bCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 18000; i++) {
      const x = (i * 73) % size;
      const y = (i * 137 + Math.floor(i / size) * 29) % size;
      const v = 228 + ((i * 19) % 24);
      dCtx.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
      dCtx.fillRect(x, y, 2, 2);

      const bv = 100 + ((i * 23) % 55);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 2, 2);
    }
  } else {
    // Default: Smooth Architectural Precast Concrete with subtle panel joints & micro-grain
    dCtx.fillStyle = "#e6eaef";
    dCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#909090";
    bCtx.fillRect(0, 0, size, size);

    // Subtle concrete aggregate micro-speckle
    for (let i = 0; i < 14000; i++) {
      const x = (i * 97) % size;
      const y = (i * 53 + Math.floor(i / 64) * 17) % size;
      const delta = ((i * 31) % 16) - 8;
      const v = 230 + delta;
      dCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
      dCtx.fillRect(x, y, 3, 2);

      const bv = 128 + delta * 3;
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 3, 2);
    }

    // Architectural formwork seam lines & tie-rod dots
    dCtx.strokeStyle = "rgba(140, 152, 168, 0.35)";
    dCtx.lineWidth = 2;
    bCtx.strokeStyle = "#484848";
    bCtx.lineWidth = 3;

    const panelRows = 4;
    const panelCols = 2;
    for (let r = 1; r < panelRows; r++) {
      const y = (size / panelRows) * r;
      dCtx.beginPath();
      dCtx.moveTo(0, y);
      dCtx.lineTo(size, y);
      dCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(0, y);
      bCtx.lineTo(size, y);
      bCtx.stroke();
    }
    for (let c = 1; c <= panelCols; c++) {
      const x = (size / panelCols) * c;
      dCtx.beginPath();
      dCtx.moveTo(x, 0);
      dCtx.lineTo(x, size);
      dCtx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(x, 0);
      bCtx.lineTo(x, size);
      bCtx.stroke();
    }
  }

  const result = {
    map: finalizeCanvasTexture(diffCanvas, repeatX, repeatY, true),
    bumpMap: finalizeCanvasTexture(bumpCanvas, repeatX, repeatY, false),
  };
  textureCache.set(key, result);
  return result;
}

/**
 * High-res Interior Room Floor Tile / Wood Plank Texture (for Dollhouse Cutaway mode)
 */
export function getInteriorFloorTexture(statusColorHex = "#6e8592", repeatX = 2, repeatY = 2) {
  const key = `int_floor_${statusColorHex}_${repeatX.toFixed(1)}_${repeatY.toFixed(1)}`;
  if (textureCache.has(key)) return textureCache.get(key);
  if (typeof document === "undefined") return { map: null, bumpMap: null };

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext("2d");

  const baseColor = new THREE.Color(statusColorHex);
  const rBase = Math.round(baseColor.r * 255);
  const gBase = Math.round(baseColor.g * 255);
  const bBase = Math.round(baseColor.b * 255);

  // Grout background
  ctx.fillStyle = `rgb(${Math.max(0, rBase - 42)}, ${Math.max(0, gBase - 42)}, ${Math.max(0, bBase - 42)})`;
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = "#303030";
  bCtx.fillRect(0, 0, size, size);

  // 4x4 Ceramic Floor Tiles with subtle marble/stone veining
  const grid = 4;
  const tileW = size / grid;
  const grout = 4;

  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const x = col * tileW + grout / 2;
      const y = row * tileW + grout / 2;
      const w = tileW - grout;
      const h = tileW - grout;

      const variation = ((row * 3 + col * 5) % 7) * 3 - 9;
      const tr = Math.min(255, Math.max(0, rBase + variation));
      const tg = Math.min(255, Math.max(0, gBase + variation));
      const tb = Math.min(255, Math.max(0, bBase + variation));

      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, `rgb(${tr}, ${tg}, ${tb})`);
      grad.addColorStop(1, `rgb(${Math.max(0, tr - 14)}, ${Math.max(0, tg - 14)}, ${Math.max(0, tb - 14)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);

      // Subtle inner tile highlight
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);

      bCtx.fillStyle = "#e0e0e0";
      bCtx.fillRect(x, y, w, h);
    }
  }

  const res = {
    map: finalizeCanvasTexture(canvas, repeatX, repeatY, true),
    bumpMap: finalizeCanvasTexture(bumpCanvas, repeatX, repeatY, false),
  };
  textureCache.set(key, res);
  return res;
}

/**
 * High-res Corrugated Metal / Architectural Roof Tile Texture
 */
export function getRoofTextures(roofType = "gable", repeatX = 4, repeatY = 4) {
  const key = `roof_${roofType}_${repeatX}_${repeatY}`;
  if (textureCache.has(key)) return textureCache.get(key);
  if (typeof document === "undefined") return { map: null, bumpMap: null };

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const bump = document.createElement("canvas");
  bump.width = size;
  bump.height = size;
  const bCtx = bump.getContext("2d");

  if (roofType === "flat" || roofType === "parapet") {
    // Architectural membrane + fine gravel concrete deck
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, 0, size, size);
    bCtx.fillStyle = "#808080";
    bCtx.fillRect(0, 0, size, size);

    for (let i = 0; i < 16000; i++) {
      const x = (i * 67) % size;
      const y = (i * 113 + Math.floor(i / 128) * 19) % size;
      const v = 46 + ((i * 29) % 24);
      ctx.fillStyle = `rgb(${v},${v + 8},${v + 18})`;
      ctx.fillRect(x, y, 2, 2);

      const bv = 90 + ((i * 37) % 80);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x, y, 2, 2);
    }

    // Expansion seams
    ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
    ctx.lineWidth = 3;
    for (let i = 1; i < 4; i++) {
      const p = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
    }
  } else {
    // Ribbed Architectural Long-Span Metal / Tile Roofing
    const ribs = 16;
    const ribW = size / ribs;
    for (let i = 0; i < ribs; i++) {
      const x = i * ribW;
      const grad = ctx.createLinearGradient(x, 0, x + ribW, 0);
      grad.addColorStop(0, "#1e293b");
      grad.addColorStop(0.25, "#334155");
      grad.addColorStop(0.5, "#475569");
      grad.addColorStop(0.8, "#263445");
      grad.addColorStop(1, "#0f172a");
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, ribW, size);

      const bGrad = bCtx.createLinearGradient(x, 0, x + ribW, 0);
      bGrad.addColorStop(0, "#303030");
      bGrad.addColorStop(0.5, "#f0f0f0");
      bGrad.addColorStop(1, "#303030");
      bCtx.fillStyle = bGrad;
      bCtx.fillRect(x, 0, ribW, size);
    }
    // Horizontal tile overlapping courses
    const courses = 8;
    const courseH = size / courses;
    ctx.strokeStyle = "rgba(15, 23, 42, 0.65)";
    ctx.lineWidth = 3;
    bCtx.strokeStyle = "#202020";
    bCtx.lineWidth = 4;
    for (let r = 1; r < courses; r++) {
      const y = r * courseH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();

      bCtx.beginPath();
      bCtx.moveTo(0, y);
      bCtx.lineTo(size, y);
      bCtx.stroke();
    }
  }

  const res = {
    map: finalizeCanvasTexture(canvas, repeatX, repeatY, true),
    bumpMap: finalizeCanvasTexture(bump, repeatX, repeatY, false),
  };
  textureCache.set(key, res);
  return res;
}

/**
 * High-res Asphalt Street Texture with Road Grain & Center Markings
 */
export function getAsphaltRoadTexture(repeatX = 4, repeatY = 1) {
  const key = `asphalt_${repeatX}_${repeatY}`;
  if (textureCache.has(key)) return textureCache.get(key);
  if (typeof document === "undefined") return { map: null, bumpMap: null };

  const w = 512;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const bump = document.createElement("canvas");
  bump.width = w;
  bump.height = h;
  const bCtx = bump.getContext("2d");

  // Dark asphalt base
  ctx.fillStyle = "#1c2430";
  ctx.fillRect(0, 0, w, h);
  bCtx.fillStyle = "#707070";
  bCtx.fillRect(0, 0, w, h);

  // Coarse aggregate grain
  for (let i = 0; i < 20000; i++) {
    const x = (i * 89) % w;
    const y = (i * 131 + Math.floor(i / 64) * 31) % h;
    const v = 22 + ((i * 17) % 22);
    ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
    ctx.fillRect(x, y, 2, 2);

    const bv = 70 + ((i * 29) % 110);
    bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bCtx.fillRect(x, y, 2, 2);
  }

  // Edge shoulder lines (top & bottom)
  ctx.fillStyle = "rgba(226, 232, 240, 0.55)";
  ctx.fillRect(0, 18, w, 6);
  ctx.fillRect(0, h - 24, w, 6);

  // Dashed yellow/amber center road divider line
  ctx.fillStyle = "#eab308";
  const dashes = 4;
  const seg = w / dashes;
  for (let d = 0; d < dashes; d++) {
    ctx.fillRect(d * seg + seg * 0.15, h / 2 - 5, seg * 0.55, 10);
  }

  const res = {
    map: finalizeCanvasTexture(canvas, repeatX, repeatY, true),
    bumpMap: finalizeCanvasTexture(bump, repeatX, repeatY, false),
  };
  textureCache.set(key, res);
  return res;
}

/**
 * Concrete Sidewalk / Compound Yard Paving Texture
 */
export function getPavingTexture(repeatX = 6, repeatY = 6) {
  const key = `paving_${repeatX}_${repeatY}`;
  if (textureCache.has(key)) return textureCache.get(key);
  if (typeof document === "undefined") return { map: null };

  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#293548";
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = (i * 59) % size;
    const y = (i * 83) % size;
    const v = 38 + ((i * 19) % 14);
    ctx.fillStyle = `rgb(${v},${v + 10},${v + 22})`;
    ctx.fillRect(x, y, 2, 2);
  }

  ctx.strokeStyle = "rgba(15, 23, 42, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();

  const res = {
    map: finalizeCanvasTexture(canvas, repeatX, repeatY, true),
  };
  textureCache.set(key, res);
  return res;
}
