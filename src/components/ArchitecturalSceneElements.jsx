"use client";

import React, { useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { Html, RoundedBox, Edges } from "@react-three/drei";
import {
  getWallTextures,
  getRoofTextures,
  getInteriorFloorTexture,
  getAsphaltRoadTexture,
  getPavingTexture,
  compressFacadeImage,
} from "@/lib/architecturalTextures";
import {
  compileFloorGeometries,
  compileBuildingRoofs,
} from "@/lib/buildingGeometry";

/**
 * Loads a base64 / URL image into a THREE.Texture with sRGB color space.
 */
function usePhotoTexture(dataUrl) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    if (!dataUrl) {
      setTexture(null);
      return;
    }
    let active = true;
    const loader = new THREE.TextureLoader();
    loader.load(
      dataUrl,
      (loaded) => {
        if (!active) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = 8;
        loaded.needsUpdate = true;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (active) setTexture(null);
      }
    );
    return () => {
      active = false;
    };
  }, [dataUrl]);

  return texture;
}

/**
 * Projects uploaded real-world building photos (Front, Back, Left, Right)
 * onto the 3D outer envelope of the building, with X-Ray transparency
 * so users can see both their real building facade AND the room statuses inside.
 */
export function PhotoFacadeShell({
  bounds,
  facadePhotos = {},
  opacity = 0.85,
  autoXRayActive = false,
  cutawayMode = false,
}) {
  const frontTex = usePhotoTexture(facadePhotos?.front);
  const backTex = usePhotoTexture(facadePhotos?.back);
  const leftTex = usePhotoTexture(facadePhotos?.left);
  const rightTex = usePhotoTexture(facadePhotos?.right);

  if (!bounds || cutawayMode) return null;
  const hasAnyPhoto = Boolean(frontTex || backTex || leftTex || rightTex);
  if (!hasAnyPhoto || opacity <= 0.02) return null;

  const effectiveOpacity = autoXRayActive ? Math.min(opacity, 0.32) : opacity;
  const { centerX, centerZ, width, depth, totalHeight } = bounds;
  const yCenter = totalHeight / 2 + 0.08;
  const offset = 0.14; // sits just outside the unit walls & window mullions

  return (
    <group>
      {/* FRONT FACADE (+Z / South) */}
      {frontTex && (
        <mesh
          position={[centerX, yCenter, centerZ + depth / 2 + offset]}
          raycast={() => null}
        >
          <planeGeometry args={[width + 0.1, totalHeight]} />
          <meshStandardMaterial
            map={frontTex}
            transparent={effectiveOpacity < 0.99}
            opacity={effectiveOpacity}
            roughness={0.65}
            metalness={0.05}
            side={THREE.DoubleSide}
            depthWrite={effectiveOpacity > 0.9}
          />
        </mesh>
      )}

      {/* BACK FACADE (-Z / North) */}
      {backTex && (
        <mesh
          position={[centerX, yCenter, centerZ - depth / 2 - offset]}
          rotation={[0, Math.PI, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[width + 0.1, totalHeight]} />
          <meshStandardMaterial
            map={backTex}
            transparent={effectiveOpacity < 0.99}
            opacity={effectiveOpacity}
            roughness={0.65}
            metalness={0.05}
            side={THREE.DoubleSide}
            depthWrite={effectiveOpacity > 0.9}
          />
        </mesh>
      )}

      {/* LEFT FACADE (-X / West) */}
      {leftTex && (
        <mesh
          position={[centerX - width / 2 - offset, yCenter, centerZ]}
          rotation={[0, -Math.PI / 2, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[depth + 0.1, totalHeight]} />
          <meshStandardMaterial
            map={leftTex}
            transparent={effectiveOpacity < 0.99}
            opacity={effectiveOpacity}
            roughness={0.65}
            metalness={0.05}
            side={THREE.DoubleSide}
            depthWrite={effectiveOpacity > 0.9}
          />
        </mesh>
      )}

      {/* RIGHT FACADE (+X / East) */}
      {rightTex && (
        <mesh
          position={[centerX + width / 2 + offset, yCenter, centerZ]}
          rotation={[0, Math.PI / 2, 0]}
          raycast={() => null}
        >
          <planeGeometry args={[depth + 0.1, totalHeight]} />
          <meshStandardMaterial
            map={rightTex}
            transparent={effectiveOpacity < 0.99}
            opacity={effectiveOpacity}
            roughness={0.65}
            metalness={0.05}
            side={THREE.DoubleSide}
            depthWrite={effectiveOpacity > 0.9}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * High-detail interior furnishings & textured ceramic floor for Dollhouse Cutaway mode.
 */
export function DetailedUnitInterior3D({ w, d, h, statusColor, isOccupied }) {
  const floorTex = useMemo(
    () => getInteriorFloorTexture(statusColor, Math.max(1, w / 2), Math.max(1, d / 2)),
    [statusColor, w, d]
  );

  const bedW = Math.min(1.35, w * 0.38);
  const bedD = Math.min(1.9, d * 0.48);
  const bedX = -w / 2 + bedW / 2 + 0.24;
  const bedZ = -d / 2 + bedD / 2 + 0.22;

  return (
    <group position={[0, -h / 2, 0]}>
      {/* Textured Ceramic Tile Floor Slab */}
      <mesh position={[0, 0.06, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[w - 0.18, 0.12, d - 0.18]} />
        <meshStandardMaterial
          map={floorTex.map}
          bumpMap={floorTex.bumpMap}
          bumpScale={0.015}
          roughness={0.42}
          metalness={0.08}
        />
      </mesh>

      {/* Interior Baseboard Trim */}
      <mesh position={[0, 0.16, -d / 2 + 0.13]} raycast={() => null}>
        <boxGeometry args={[w - 0.24, 0.08, 0.02]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
      </mesh>

      {w >= 2.2 && d >= 2.2 && (
        <group>
          {/* Wooden Bed Frame & Headboard */}
          <mesh position={[bedX, 0.22, bedZ]} castShadow receiveShadow raycast={() => null}>
            <boxGeometry args={[bedW, 0.18, bedD]} />
            <meshStandardMaterial color="#473628" roughness={0.7} metalness={0.05} />
          </mesh>
          <mesh
            position={[bedX, 0.48, -d / 2 + 0.26]}
            castShadow
            receiveShadow
            raycast={() => null}
          >
            <boxGeometry args={[bedW, 0.52, 0.08]} />
            <meshStandardMaterial color="#3b2b1f" roughness={0.65} />
          </mesh>

          {/* Mattress */}
          <mesh position={[bedX, 0.34, bedZ + 0.02]} castShadow receiveShadow raycast={() => null}>
            <boxGeometry args={[bedW - 0.08, 0.14, bedD - 0.1]} />
            <meshStandardMaterial color="#f1f5f9" roughness={0.85} />
          </mesh>

          {/* Status-Tinted Blanket / Duvet */}
          <mesh
            position={[bedX, 0.36, bedZ + bedD * 0.15]}
            castShadow
            receiveShadow
            raycast={() => null}
          >
            <boxGeometry args={[bedW - 0.06, 0.15, bedD * 0.58]} />
            <meshStandardMaterial
              color={statusColor}
              roughness={0.75}
              emissive={statusColor}
              emissiveIntensity={isOccupied ? 0.18 : 0.05}
            />
          </mesh>

          {/* Two Pillows */}
          <mesh
            position={[bedX - bedW * 0.22, 0.44, -d / 2 + 0.46]}
            castShadow
            raycast={() => null}
          >
            <boxGeometry args={[bedW * 0.38, 0.08, 0.26]} />
            <meshStandardMaterial color="#ffffff" roughness={0.8} />
          </mesh>
          <mesh
            position={[bedX + bedW * 0.22, 0.44, -d / 2 + 0.46]}
            castShadow
            raycast={() => null}
          >
            <boxGeometry args={[bedW * 0.38, 0.08, 0.26]} />
            <meshStandardMaterial color="#ffffff" roughness={0.8} />
          </mesh>

          {/* Wardrobe / Study Desk on opposite wall */}
          {w >= 2.8 && (
            <group position={[w / 2 - 0.38, 0, -d / 2 + 0.55]}>
              {/* Wardrobe Closet */}
              <mesh position={[0, 0.85, 0]} castShadow receiveShadow raycast={() => null}>
                <boxGeometry args={[0.48, 1.5, 0.75]} />
                <meshStandardMaterial color="#64748b" roughness={0.55} metalness={0.15} />
              </mesh>
              {/* Desk Table */}
              <mesh position={[0, 0.48, 0.85]} castShadow receiveShadow raycast={() => null}>
                <boxGeometry args={[0.5, 0.05, 0.8]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.5} />
              </mesh>
            </group>
          )}
        </group>
      )}
    </group>
  );
}

/**
 * High-detail exterior architectural attachments for rentable units:
 * - Multi-pane reflective glass window with aluminum frame, mullions, concrete sill & header lintel
 * - Paneled architectural front entry door with frame & handle
 * - Exterior split-type AC condenser unit with louver grille
 */
export function DetailedUnitExteriorAttachments({
  w,
  h,
  d,
  isGroundFloor,
  statusColor,
  isSelected,
  isHovered,
}) {
  const winW = Math.min(1.4, w * 0.44);
  const winH = Math.min(1.15, h * 0.42);
  const winX = w >= 3.0 ? w * 0.18 : 0;
  const doorX = w >= 3.0 ? -w * 0.24 : -w * 0.22;
  const showDoor = w >= 2.4;

  return (
    <group>
      {/* ── FRONT MULTI-PANE ARCHITECTURAL WINDOW (+Z) ── */}
      {w >= 1.6 && (
        <group position={[winX, 0.12, d / 2]}>
          {/* Outer Aluminum Frame */}
          <mesh position={[0, 0, 0.015]} raycast={() => null}>
            <boxGeometry args={[winW + 0.1, winH + 0.1, 0.04]} />
            <meshStandardMaterial color="#334155" roughness={0.35} metalness={0.7} />
          </mesh>
          {/* Reflective Insulated Glass Pane */}
          <mesh position={[0, 0, 0.025]} raycast={() => null}>
            <planeGeometry args={[winW, winH]} />
            <meshStandardMaterial
              color={isSelected || isHovered ? "#bae6fd" : "#38bdf8"}
              roughness={0.1}
              metalness={0.88}
              emissive={statusColor}
              emissiveIntensity={isSelected ? 0.45 : isHovered ? 0.3 : 0.18}
            />
          </mesh>
          {/* Center Vertical & Horizontal Mullions */}
          <mesh position={[0, 0, 0.038]} raycast={() => null}>
            <boxGeometry args={[0.035, winH, 0.02]} />
            <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.038]} raycast={() => null}>
            <boxGeometry args={[winW, 0.035, 0.02]} />
            <meshStandardMaterial color="#1e293b" roughness={0.3} metalness={0.8} />
          </mesh>
          {/* Concrete Window Sill Ledge */}
          <mesh position={[0, -winH / 2 - 0.06, 0.05]} castShadow raycast={() => null}>
            <boxGeometry args={[winW + 0.22, 0.06, 0.12]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.75} />
          </mesh>
          {/* Top Window Header Lintel */}
          <mesh position={[0, winH / 2 + 0.06, 0.03]} raycast={() => null}>
            <boxGeometry args={[winW + 0.18, 0.07, 0.07]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.7} />
          </mesh>
        </group>
      )}

      {/* ── PANELED ENTRY DOOR (+Z) ── */}
      {showDoor && (
        <group position={[doorX, -h / 2 + 0.92, d / 2]}>
          {/* Door Frame Jamb */}
          <mesh position={[0, 0, 0.015]} raycast={() => null}>
            <boxGeometry args={[0.92, 1.84, 0.04]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.4} />
          </mesh>
          {/* Solid Architectural Wood/Steel Door Leaf */}
          <mesh position={[0, -0.02, 0.028]} raycast={() => null}>
            <boxGeometry args={[0.8, 1.76, 0.03]} />
            <meshStandardMaterial color="#4b3621" roughness={0.62} metalness={0.12} />
          </mesh>
          {/* Upper Door Glass Lite */}
          <mesh position={[0, 0.42, 0.046]} raycast={() => null}>
            <planeGeometry args={[0.48, 0.42]} />
            <meshStandardMaterial
              color="#7dd3fc"
              roughness={0.15}
              metalness={0.8}
              emissive={statusColor}
              emissiveIntensity={0.22}
            />
          </mesh>
          {/* Metallic Door Handle */}
          <mesh position={[0.28, -0.05, 0.055]} raycast={() => null}>
            <boxGeometry args={[0.09, 0.03, 0.04]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.2} metalness={0.9} />
          </mesh>
          {/* Concrete Doorstep Threshold (Ground Floor) */}
          {isGroundFloor && (
            <mesh position={[0, -0.88, 0.12]} receiveShadow raycast={() => null}>
              <boxGeometry args={[1.05, 0.08, 0.26]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.8} />
            </mesh>
          )}
        </group>
      )}

      {/* ── SPLIT-TYPE AC CONDENSER UNIT (Exterior Detail) ── */}
      {w >= 3.2 && (
        <group position={[w / 2 - 0.42, 0.42, d / 2 + 0.12]}>
          <mesh castShadow raycast={() => null}>
            <boxGeometry args={[0.52, 0.38, 0.22]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.5} metalness={0.3} />
          </mesh>
          {/* Fan Grille Circle */}
          <mesh position={[-0.08, 0, 0.115]} raycast={() => null}>
            <circleGeometry args={[0.13, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.8} />
          </mesh>
        </group>
      )}

      {/* ── REAR VENTILATION WINDOW (-Z) ── */}
      {w >= 2.0 && (
        <group position={[0, 0.2, -d / 2]}>
          <mesh position={[0, 0, -0.015]} raycast={() => null}>
            <boxGeometry args={[winW * 0.85, winH * 0.75, 0.03]} />
            <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0, -0.032]} rotation={[0, Math.PI, 0]} raycast={() => null}>
            <planeGeometry args={[winW * 0.78, winH * 0.68]} />
            <meshStandardMaterial color="#38bdf8" roughness={0.15} metalness={0.85} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Lightweight Canvas2D text quad (creates 0 WebGL contexts, preventing GPU context exhaustion).
 */
const textTextureCache = new Map();

function getCanvasTextTexture(text, { color = "#ffffff", fontSize = 48, fontWeight = "bold" } = {}) {
  const key = `${text}_${color}_${fontSize}_${fontWeight}`;
  if (textTextureCache.has(key)) return textTextureCache.get(key);
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `${fontWeight} ${fontSize}px sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width) + 32;
  const textHeight = Math.ceil(fontSize * 1.35) + 20;
  canvas.width = Math.max(64, textWidth);
  canvas.height = Math.max(32, textHeight);

  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const aspect = canvas.width / canvas.height;
  const res = { texture: tex, aspect };
  textTextureCache.set(key, res);
  return res;
}

function CanvasTextPlane({
  text,
  height = 0.5,
  color = "#ffffff",
  fontSize = 52,
  fontWeight = "bold",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) {
  const res = useMemo(
    () => getCanvasTextTexture(text, { color, fontSize, fontWeight }),
    [text, color, fontSize, fontWeight]
  );
  if (!res || !res.texture) return null;
  const width = height * res.aspect;

  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial
        map={res.texture}
        transparent
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Renders the recognizable real-world property surroundings:
 * - High-res Asphalt Front Road with yellow lane markings & concrete curbs
 * - Customizable Street Name painted on the road + corner street sign
 * - Main Entrance Gate with masonry pillars & walkway
 * - Concrete Parking Bays (P1, P2, P3) with wheel stops
 * - Custom 3D Landmark Pins around the compound
 */
export function SiteContext3D({
  bounds,
  siteContext = {},
  buildingAddress = "",
}) {
  const streetName =
    siteContext?.streetName?.trim() ||
    (buildingAddress ? buildingAddress.split(",")[0].trim() : "Front Street (Main Road)");
  const streetSide = siteContext?.streetSide || "front"; // front (+Z), back (-Z), left (-X), right (+X)
  const showMainGate = siteContext?.showMainGate !== false;
  const parkingSide = siteContext?.parkingSide || "right"; // right, left, front, none
  const landmarks = Array.isArray(siteContext?.landmarks) ? siteContext.landmarks : [];

  const { centerX = 0, centerZ = 0, width = 14, depth = 10 } = bounds || {};
  const lotW = Math.max(width + 7, 16);
  const lotD = Math.max(depth + 6, 13);

  const asphaltTex = useMemo(() => getAsphaltRoadTexture(Math.max(2, Math.round(lotW / 5)), 1), [lotW]);
  const pavingTex = useMemo(
    () => getPavingTexture(Math.max(4, Math.round(lotW / 2.5)), Math.max(4, Math.round(lotD / 2.5))),
    [lotW, lotD]
  );

  // Compute rotation & offset of the street relative to the building center
  const streetConfig = useMemo(() => {
    const roadWidth = 5.4;
    const sidewalkWidth = 1.6;
    if (streetSide === "back") {
      return {
        roadPos: [centerX, 0.015, centerZ - lotD / 2 - sidewalkWidth - roadWidth / 2],
        sidewalkPos: [centerX, 0.05, centerZ - lotD / 2 - sidewalkWidth / 2],
        gatePos: [centerX, 0, centerZ - lotD / 2],
        rotY: Math.PI,
        roadLength: lotW + 14,
      };
    }
    if (streetSide === "left") {
      return {
        roadPos: [centerX - lotW / 2 - sidewalkWidth - roadWidth / 2, 0.015, centerZ],
        sidewalkPos: [centerX - lotW / 2 - sidewalkWidth / 2, 0.05, centerZ],
        gatePos: [centerX - lotW / 2, 0, centerZ],
        rotY: -Math.PI / 2,
        roadLength: lotD + 14,
      };
    }
    if (streetSide === "right") {
      return {
        roadPos: [centerX + lotW / 2 + sidewalkWidth + roadWidth / 2, 0.015, centerZ],
        sidewalkPos: [centerX + lotW / 2 + sidewalkWidth / 2, 0.05, centerZ],
        gatePos: [centerX + lotW / 2, 0, centerZ],
        rotY: Math.PI / 2,
        roadLength: lotD + 14,
      };
    }
    // Default: front (+Z / South)
    return {
      roadPos: [centerX, 0.015, centerZ + lotD / 2 + sidewalkWidth + roadWidth / 2],
      sidewalkPos: [centerX, 0.05, centerZ + lotD / 2 + sidewalkWidth / 2],
      gatePos: [centerX, 0, centerZ + lotD / 2],
      rotY: 0,
      roadLength: lotW + 14,
    };
  }, [streetSide, centerX, centerZ, lotW, lotD]);

  // Helper to resolve landmark preset position into [x, z]
  const resolveLandmarkCoords = (lm, idx) => {
    const pos = lm.position || "front-left";
    const marginX = lotW / 2 - 1.2;
    const marginZ = lotD / 2 - 1.2;
    switch (pos) {
      case "front-left":
        return [centerX - marginX, centerZ + marginZ];
      case "front-right":
        return [centerX + marginX, centerZ + marginZ];
      case "left":
        return [centerX - marginX, centerZ];
      case "right":
        return [centerX + marginX, centerZ];
      case "back-left":
        return [centerX - marginX, centerZ - marginZ];
      case "back-right":
        return [centerX + marginX, centerZ - marginZ];
      case "back":
        return [centerX, centerZ - marginZ];
      default:
        return [centerX - marginX + idx * 2.5, centerZ + marginZ];
    }
  };

  return (
    <group>
      {/* ── PROPERTY COMPOUND PAVED YARD APRON ── */}
      <mesh position={[centerX, 0.01, centerZ]} receiveShadow raycast={() => null}>
        <boxGeometry args={[lotW, 0.04, lotD]} />
        <meshStandardMaterial
          map={pavingTex.map}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* ── PERIMETER COMPOUND CURB WALL ── */}
      <lineSegments position={[centerX, 0.08, centerZ]} raycast={() => null}>
        <edgesGeometry args={[new THREE.BoxGeometry(lotW, 0.14, lotD)]} />
        <lineBasicMaterial color="#479de9" transparent opacity={0.45} />
      </lineSegments>

      {/* ── 3D ASPHALT STREET & SIDEWALK ── */}
      <group
        position={streetConfig.roadPos}
        rotation={[0, streetConfig.rotY, 0]}
      >
        {/* Asphalt Road Surface */}
        <mesh receiveShadow raycast={() => null}>
          <boxGeometry args={[streetConfig.roadLength, 0.05, 5.4]} />
          <meshStandardMaterial
            map={asphaltTex.map}
            bumpMap={asphaltTex.bumpMap}
            bumpScale={0.02}
            roughness={0.88}
            metalness={0.04}
          />
        </mesh>

        {/* Concrete Sidewalk & Curb */}
        <mesh position={[0, 0.04, -3.5]} receiveShadow raycast={() => null}>
          <boxGeometry args={[streetConfig.roadLength, 0.1, 1.6]} />
          <meshStandardMaterial color="#475569" roughness={0.8} />
        </mesh>

        {/* Street Name Stencil on Asphalt */}
        <CanvasTextPlane
          text={`◄  ${streetName.toUpperCase()}  ►`}
          position={[0, 0.04, 1.35]}
          rotation={[-Math.PI / 2, 0, 0]}
          height={0.62}
          color="#e2e8f0"
          fontSize={48}
        />

        {/* Streetlamp Post & Corner Street Sign */}
        <group position={[-streetConfig.roadLength * 0.28, 0, -3.1]}>
          {/* Pole */}
          <mesh position={[0, 1.6, 0]} castShadow raycast={() => null}>
            <cylinderGeometry args={[0.05, 0.07, 3.2, 10]} />
            <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
          </mesh>
          {/* Sign Plate */}
          <mesh position={[0.45, 2.55, 0]} castShadow raycast={() => null}>
            <boxGeometry args={[1.35, 0.32, 0.04]} />
            <meshStandardMaterial color="#0b3860" roughness={0.4} />
          </mesh>
          <CanvasTextPlane
            text={streetName}
            position={[0.45, 2.55, 0.03]}
            height={0.16}
            color="#f8fafc"
            fontSize={36}
          />
          {/* Warm Streetlight Luminaire */}
          <mesh position={[0, 3.22, 0.35]} raycast={() => null}>
            <boxGeometry args={[0.24, 0.08, 0.45]} />
            <meshStandardMaterial
              color="#fef08a"
              emissive="#facc15"
              emissiveIntensity={0.9}
            />
          </mesh>
        </group>
      </group>

      {/* ── MAIN ENTRANCE GATE & ARCHWAY ── */}
      {showMainGate && (
        <group
          position={streetConfig.gatePos}
          rotation={[0, streetConfig.rotY, 0]}
        >
          {/* Left & Right Masonry Gate Pillars */}
          <mesh position={[-1.45, 0.95, 0]} castShadow receiveShadow raycast={() => null}>
            <boxGeometry args={[0.42, 1.9, 0.42]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          <mesh position={[1.45, 0.95, 0]} castShadow receiveShadow raycast={() => null}>
            <boxGeometry args={[0.42, 1.9, 0.42]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          {/* Overhead Gate Header Beam */}
          <mesh position={[0, 1.98, 0]} castShadow raycast={() => null}>
            <boxGeometry args={[3.45, 0.24, 0.46]} />
            <meshStandardMaterial color="#0b3860" roughness={0.45} />
          </mesh>
          <CanvasTextPlane
            text="MAIN ENTRANCE"
            position={[0, 1.98, 0.25]}
            height={0.18}
            color="#93c5fd"
            fontSize={38}
          />
          {/* Entrance Walkway Path */}
          <mesh position={[0, 0.025, -1.2]} receiveShadow raycast={() => null}>
            <boxGeometry args={[2.4, 0.03, 2.4]} />
            <meshStandardMaterial color="#475569" roughness={0.75} />
          </mesh>
        </group>
      )}

      {/* ── PARKING BAYS (P1, P2, P3) ── */}
      {parkingSide !== "none" && (
        <group
          position={
            parkingSide === "left"
              ? [centerX - width / 2 - 2.1, 0.025, centerZ]
              : parkingSide === "front"
              ? [centerX + width * 0.28, 0.025, centerZ + depth / 2 + 1.8]
              : [centerX + width / 2 + 2.1, 0.025, centerZ]
          }
          rotation={[0, parkingSide === "front" ? Math.PI / 2 : 0, 0]}
        >
          {/* Concrete Parking Pad */}
          <mesh receiveShadow raycast={() => null}>
            <boxGeometry args={[2.8, 0.03, 6.6]} />
            <meshStandardMaterial color="#1e293b" roughness={0.85} />
          </mesh>
          {[-2.1, 0, 2.1].map((zOff, i) => (
            <group key={i} position={[0, 0.02, zOff]}>
              {/* Stall Divider Lines */}
              <mesh position={[0, 0, -1.02]} raycast={() => null}>
                <boxGeometry args={[2.5, 0.01, 0.06]} />
                <meshStandardMaterial color="#f8fafc" />
              </mesh>
              {/* Wheel Stop Curb */}
              <mesh position={[0.85, 0.05, 0]} castShadow raycast={() => null}>
                <boxGeometry args={[0.16, 0.09, 1.3]} />
                <meshStandardMaterial color="#eab308" roughness={0.6} />
              </mesh>
              <CanvasTextPlane
                text={`P${i + 1}`}
                position={[-0.4, 0.02, 0]}
                rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                height={0.42}
                color="#93c5fd"
                fontSize={48}
              />
            </group>
          ))}
        </group>
      )}

      {/* ── CUSTOM LANDMARK PINS AROUND THE PROPERTY ── */}
      {landmarks.map((lm, idx) => {
        const [lx, lz] = resolveLandmarkCoords(lm, idx);
        return (
          <group key={lm.id || idx} position={[lx, 0, lz]}>
            {/* Small Architectural Structure / Kiosk Base */}
            <RoundedBox
              args={[1.1, 0.9, 1.1]}
              radius={0.06}
              smoothness={2}
              position={[0, 0.45, 0]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#1e3a5f" roughness={0.6} metalness={0.2} />
            </RoundedBox>
            {/* Floating Landmark Callout Badge */}
            <Html position={[0, 1.35, 0]} center distanceFactor={24} zIndexRange={[10, 0]}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "#141a21",
                  border: "1px solid #262f38",
                  color: "#f0f6fc",
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  letterSpacing: "0.04em",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.55)",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#479de9",
                    flexShrink: 0,
                  }}
                />
                <span>{lm.label}</span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Interactive Modal for uploading 4-Side Real Building Facade Photos,
 * adjusting X-Ray opacity, choosing High-Res Wall Finishes, and customizing
 * the Front Street, Main Gate, Parking, and Landmark Pins.
 */
export function SiteAndFacadeModal({
  isOpen,
  onClose,
  facadePhotos = {},
  setFacadePhotos,
  facadeOpacity,
  setFacadeOpacity,
  autoXRayOnSelect,
  setAutoXRayOnSelect,
  wallFinish,
  setWallFinish,
  siteContext = {},
  setSiteContext,
  onPersistSiteAndFacade,
  isSaving = false,
}) {
  const [activeTab, setActiveTab] = useState("photos"); // "photos" | "street"
  const [uploadingSide, setUploadingSide] = useState(null);
  const [newLandmarkLabel, setNewLandmarkLabel] = useState("");
  const [newLandmarkPos, setNewLandmarkPos] = useState("front-left");

  if (!isOpen) return null;

  const handleFileChange = async (side, file) => {
    if (!file) return;
    setUploadingSide(side);
    try {
      const compressed = await compressFacadeImage(file, 1024, 1024, 0.78);
      setFacadePhotos((prev) => ({ ...(prev || {}), [side]: compressed }));
    } catch (err) {
      console.error("Failed to compress facade photo:", err);
    } finally {
      setUploadingSide(null);
    }
  };

  const handleAddLandmark = (labelOverride, posOverride) => {
    const label = (labelOverride ?? newLandmarkLabel).trim();
    if (!label) return;
    const position = posOverride ?? newLandmarkPos;
    const next = [
      ...(siteContext?.landmarks || []),
      { id: `lm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, label, position },
    ];
    setSiteContext((prev) => ({ ...(prev || {}), landmarks: next }));
    if (!labelOverride) setNewLandmarkLabel("");
  };

  const handleRemoveLandmark = (id) => {
    setSiteContext((prev) => ({
      ...(prev || {}),
      landmarks: (prev?.landmarks || []).filter((l) => l.id !== id),
    }));
  };

  const sides = [
    { key: "front", label: "Front Facade (Street / +Z)", hint: "Main street-facing elevation" },
    { key: "back", label: "Back Facade (Rear / -Z)", hint: "Rear compound elevation" },
    { key: "left", label: "Left Side (West / -X)", hint: "Left wing elevation" },
    { key: "right", label: "Right Side (East / +X)", hint: "Right wing elevation" },
  ];

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] overflow-y-auto hud-surface rounded-3xl p-6 text-[#f0f6fc] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[#262f38]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#479de9] font-['Manrope']">
              Real-World Familiarity &amp; Orientation
            </div>
            <h3 className="text-[17px] font-bold text-[#f0f6fc] font-['Sora'] tracking-[-0.02em] mt-0.5">
              Photo Facade Mapping, Textures &amp; Street Landmarks
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="press-scale h-8 w-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-[#262f38] flex items-center justify-center text-[#8b949e] hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#0b0f13] border border-[#262f38] rounded-2xl my-4">
          <button
            type="button"
            onClick={() => setActiveTab("photos")}
            className={`press-scale py-2 px-3 rounded-xl text-[12px] font-bold font-['Manrope'] cursor-pointer ${
              activeTab === "photos"
                ? "bg-[#2270b8] text-white shadow-sm"
                : "text-[#8b949e] hover:text-[#f0f6fc]"
            }`}
          >
            Real Photo Facades &amp; PBR Finish
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("street")}
            className={`press-scale py-2 px-3 rounded-xl text-[12px] font-bold font-['Manrope'] cursor-pointer ${
              activeTab === "street"
                ? "bg-[#2270b8] text-white shadow-sm"
                : "text-[#8b949e] hover:text-[#f0f6fc]"
            }`}
          >
            Street Name, Gate &amp; Landmarks
          </button>
        </div>

        {activeTab === "photos" ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#0b0f13] border border-[#262f38] p-3.5 text-[12px] text-[#8b949e] font-['Manrope'] leading-relaxed">
              Upload actual photos of your building&apos;s <strong className="text-[#f0f6fc]">Front, Back, Left, and Right</strong> sides. They project directly onto the 3D building shell and fade into <strong className="text-[#479de9]">X-Ray Mode</strong> when you hover or select units.
            </div>

            {/* 4-Side Photo Upload Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sides.map(({ key, label, hint }) => {
                const currentImg = facadePhotos?.[key];
                return (
                  <div
                    key={key}
                    className="rounded-2xl bg-[#0b0f13] border border-[#262f38] p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[12px] font-bold text-[#f0f6fc] font-['Sora']">
                          {label}
                        </div>
                        <div className="text-[10.5px] text-[#8b949e] font-['Manrope']">
                          {hint}
                        </div>
                      </div>
                      {currentImg && (
                        <button
                          type="button"
                          onClick={() =>
                            setFacadePhotos((prev) => ({ ...(prev || {}), [key]: null }))
                          }
                          className="press-scale px-2 py-0.5 rounded-lg border border-rose-500/35 bg-rose-500/15 text-rose-300 text-[10px] font-bold cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {currentImg ? (
                      <div className="h-28 rounded-xl overflow-hidden border border-[#2270b8]/45 relative">
                        <img
                          src={currentImg}
                          alt={label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <label className="press-scale h-28 rounded-xl border border-dashed border-[#2270b8]/45 bg-[#2270b8]/10 hover:bg-[#2270b8]/15 flex flex-col items-center justify-center cursor-pointer text-[11.5px] text-[#479de9] font-bold font-['Manrope']">
                        <span>
                          {uploadingSide === key ? "Optimizing photo..." : "+ Upload Real Photo"}
                        </span>
                        <span className="text-[10px] text-[#8b949e] font-normal mt-1">
                          JPG, PNG, WebP (Auto-fitted)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleFileChange(key, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {/* X-Ray Slider & Architectural Texture Selector */}
            <div className="rounded-2xl bg-[#0b0f13] border border-[#262f38] p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-[#f0f6fc] font-['Sora'] tabular-nums">
                  Photo Shell Opacity (X-Ray Blend): {Math.round(facadeOpacity * 100)}%
                </span>
                <label className="flex items-center gap-2 text-[11px] text-[#8b949e] font-['Manrope'] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoXRayOnSelect}
                    onChange={(e) => setAutoXRayOnSelect(e.target.checked)}
                    className="accent-[#2270b8] rounded"
                  />
                  <span>Auto X-Ray fade when selecting units</span>
                </label>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={facadeOpacity}
                onChange={(e) => setFacadeOpacity(parseFloat(e.target.value))}
                className="w-full accent-[#479de9] cursor-pointer"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#262f38]">
                <span className="text-[11.5px] font-bold text-[#8b949e] font-['Manrope']">
                  3D Wall Material (Procedural PBR Grain):
                </span>
                <div className="flex items-center gap-1.5">
                  {[
                    { id: "concrete", label: "Precast Concrete" },
                    { id: "stucco", label: "Warm Stucco" },
                    { id: "brick", label: "Modern Brick" },
                  ].map((mat) => (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setWallFinish(mat.id)}
                      className={`press-scale px-3 py-1.5 rounded-xl border text-[11px] font-bold font-['Manrope'] cursor-pointer ${
                        wallFinish === mat.id
                          ? "bg-[#2270b8] border-[#479de9] text-white"
                          : "bg-[#141a21] border-[#262f38] text-[#8b949e] hover:text-white"
                      }`}
                    >
                      {mat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Street & Gate Settings */}
            <div className="rounded-2xl bg-[#0b0f13] border border-[#262f38] p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8b949e] block mb-1 font-['Manrope']">
                  Street / Road Name in Front
                </label>
                <input
                  type="text"
                  value={siteContext?.streetName ?? ""}
                  placeholder="e.g. 106 Maple Ave."
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), streetName: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#262f38] focus:border-[#2270b8] bg-[#141a21] text-[#f0f6fc] text-[12px] outline-none"
                />
              </div>

              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8b949e] block mb-1 font-['Manrope']">
                  Street-Facing Orientation
                </label>
                <select
                  value={siteContext?.streetSide || "front"}
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), streetSide: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#262f38] focus:border-[#2270b8] bg-[#141a21] text-[#f0f6fc] text-[12px] outline-none"
                >
                  <option value="front">Front Side (South / +Z)</option>
                  <option value="back">Back Side (North / -Z)</option>
                  <option value="left">Left Side (West / -X)</option>
                  <option value="right">Right Side (East / +X)</option>
                </select>
              </div>

              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#8b949e] block mb-1 font-['Manrope']">
                  Parking / Driveway Zone
                </label>
                <select
                  value={siteContext?.parkingSide || "right"}
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), parkingSide: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl border border-[#262f38] focus:border-[#2270b8] bg-[#141a21] text-[#f0f6fc] text-[12px] outline-none"
                >
                  <option value="right">Right Wing Parking (P1-P3)</option>
                  <option value="left">Left Wing Parking (P1-P3)</option>
                  <option value="front">Front Apron Parking</option>
                  <option value="none">No Parking Lot</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 text-[12px] text-[#f0f6fc] font-semibold font-['Manrope'] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={siteContext?.showMainGate !== false}
                    onChange={(e) =>
                      setSiteContext((prev) => ({
                        ...(prev || {}),
                        showMainGate: e.target.checked,
                      }))
                    }
                    className="accent-[#2270b8] h-4 w-4 rounded"
                  />
                  <span>Show 3D Main Entrance Gate Archway</span>
                </label>
              </div>
            </div>

            {/* Landmarks Manager */}
            <div className="rounded-2xl bg-[#0b0f13] border border-[#262f38] p-3.5 space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#479de9] font-['Manrope']">
                Familiar Property Landmarks (Guardhouse, Water Tank, Laundry)
              </div>

              {/* 1-Click Quick Landmark Presets */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: "Guardhouse", pos: "front-left" },
                  { label: "Refuse Enclosure", pos: "front-right" },
                  { label: "Water Tank", pos: "back-right" },
                  { label: "Laundry Area", pos: "back-left" },
                  { label: "Generator Room", pos: "left" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleAddLandmark(preset.label, preset.pos)}
                    className="press-scale px-2.5 py-1 rounded-full border border-[#2270b8]/40 bg-[#2270b8]/15 hover:bg-[#2270b8]/25 text-[#f0f6fc] text-[11px] font-semibold font-['Manrope'] cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Landmark Input */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newLandmarkLabel}
                  placeholder="Custom landmark name (e.g. Gate 2, Bike Rack)..."
                  onChange={(e) => setNewLandmarkLabel(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-[#262f38] focus:border-[#2270b8] bg-[#141a21] text-[#f0f6fc] text-[12px] outline-none"
                />
                <select
                  value={newLandmarkPos}
                  onChange={(e) => setNewLandmarkPos(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-[#262f38] bg-[#141a21] text-[#f0f6fc] text-[12px] outline-none"
                >
                  <option value="front-left">Front-Left Corner</option>
                  <option value="front-right">Front-Right Corner</option>
                  <option value="left">Left Compound Side</option>
                  <option value="right">Right Compound Side</option>
                  <option value="back-left">Back-Left Corner</option>
                  <option value="back-right">Back-Right Corner</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleAddLandmark()}
                  className="press-scale px-4 py-2 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12px] font-bold font-['Manrope'] cursor-pointer"
                >
                  Add
                </button>
              </div>

              {/* Existing Landmarks List */}
              {(siteContext?.landmarks || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(siteContext?.landmarks || []).map((lm) => (
                    <div
                      key={lm.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-xl bg-[#141a21] border border-[#262f38] text-[11px] text-[#f0f6fc]"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-[#479de9]" />
                      <span>
                        <strong>{lm.label}</strong>{" "}
                        <span className="text-[#8b949e]">({lm.position})</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveLandmark(lm.id)}
                        className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer ml-0.5"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Save Button */}
        <div className="flex justify-end gap-2.5 mt-5 pt-4 border-t border-[#262f38]">
          <button
            type="button"
            onClick={onClose}
            className="press-scale px-4 py-2 rounded-xl border border-[#262f38] bg-white/[0.04] hover:bg-white/[0.08] text-[#8b949e] hover:text-white text-[12px] font-semibold font-['Manrope'] cursor-pointer"
          >
            Close
          </button>
          {onPersistSiteAndFacade && (
            <button
              type="button"
              onClick={onPersistSiteAndFacade}
              disabled={isSaving}
              className="press-scale px-5 py-2 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12px] font-bold font-['Manrope'] shadow-lg cursor-pointer disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Photos & Street Context"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const NOOP_RAYCAST = () => null;

/**
 * 5. BATCHED FLOOR ARCHITECTURE 3D (BIM-Lite v3.0)
 * Renders an entire floor's deduplicated walls (with punched window & door openings),
 * continuous floor slab (with subtracted stairwell voids), staircases, railings,
 * columns, doors, and windows in just ~7 batched WebGL draw calls.
 */
export function BatchedFloorArchitecture3D({
  topology,
  floorNumber = 1,
  floorHeight = 2.6,
  isCutaway = false,
  isGhosted = false,
  isLowPower = false,
  architecture = {},
}) {
  const wallMatType = architecture?.wall_material || "stucco";
  const extWallColor = architecture?.exterior_color || "#e5dacb";
  const pbrWall = useMemo(() => getWallTextures(wallMatType), [wallMatType]);
  const pbrAccentBrick = useMemo(() => getWallTextures("brick"), []);

  const compiled = useMemo(
    () => compileFloorGeometries(topology, floorHeight, isCutaway, architecture),
    [topology, floorHeight, isCutaway, architecture]
  );

  // Dispose merged geometries on unmount or recompile to prevent GPU memory leaks
  useEffect(() => {
    return () => {
      if (!compiled) return;
      Object.values(compiled).forEach((geo) => {
        if (geo && typeof geo.dispose === "function") geo.dispose();
      });
    };
  }, [compiled]);

  const baseY = (floorNumber - 1) * floorHeight;
  const opacity = isGhosted ? 0.14 : 1;

  return (
    <group position={[0, baseY, 0]}>
      {/* 1. Continuous Structural Floor Slab (with Stairwell Voids subtracted) */}
      {compiled.slabGeo && (
        <mesh
          geometry={compiled.slabGeo}
          castShadow={!isLowPower && !isGhosted}
          receiveShadow={!isLowPower}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#334155"
            roughness={0.82}
            metalness={0.08}
            transparent={isGhosted}
            opacity={opacity}
          />
          {!isLowPower && !isGhosted && (
            <Edges threshold={25} color="#1e293b" />
          )}
        </mesh>
      )}

      {/* 2. Batched Exterior Envelope Walls (with punched Window & Entry Door holes) */}
      {compiled.exteriorWallGeo && (
        <mesh
          geometry={compiled.exteriorWallGeo}
          castShadow={!isLowPower && !isGhosted}
          receiveShadow={!isLowPower}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color={extWallColor}
            map={pbrWall.map}
            bumpMap={pbrWall.bumpMap}
            bumpScale={0.016}
            roughness={0.65}
            metalness={0.05}
            transparent={isGhosted}
            opacity={opacity}
          />
          {!isLowPower && !isGhosted && (
            <Edges threshold={22} color="#334155" />
          )}
        </mesh>
      )}

      {/* 2B. Batched Dark Brick / Charcoal Accent Facade Piers & Plinth Walls */}
      {compiled.accentWallGeo && (
        <mesh
          geometry={compiled.accentWallGeo}
          castShadow={!isLowPower && !isGhosted}
          receiveShadow={!isLowPower}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#4b5059"
            map={pbrAccentBrick.map}
            bumpMap={pbrAccentBrick.bumpMap}
            bumpScale={0.024}
            roughness={0.78}
            metalness={0.08}
            transparent={isGhosted}
            opacity={opacity}
          />
          {!isLowPower && !isGhosted && (
            <Edges threshold={22} color="#1e293b" />
          )}
        </mesh>
      )}

      {/* 3. Batched Shared Interior Partition Walls (Deduplicated, with Hallway Door cutouts) */}
      {compiled.interiorWallGeo && (
        <mesh
          geometry={compiled.interiorWallGeo}
          castShadow={!isLowPower && !isGhosted}
          receiveShadow={!isLowPower}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#f1f5f9"
            map={pbrWall.map}
            bumpMap={pbrWall.bumpMap}
            bumpScale={0.01}
            roughness={0.72}
            transparent={isGhosted}
            opacity={opacity}
          />
          {!isLowPower && !isGhosted && (
            <Edges threshold={22} color="#64748b" />
          )}
        </mesh>
      )}

      {/* 4. Batched Architectural Concrete Trim (Columns, Stair Treads, Sills, Canopies, Balconies) */}
      {compiled.concreteTrimGeo && (
        <mesh
          geometry={compiled.concreteTrimGeo}
          castShadow={!isLowPower && !isGhosted}
          receiveShadow={!isLowPower}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#cbd5e1"
            roughness={0.68}
            metalness={0.1}
            transparent={isGhosted}
            opacity={opacity}
          />
          {!isLowPower && !isGhosted && (
            <Edges threshold={25} color="#475569" />
          )}
        </mesh>
      )}

      {/* 5. Batched Dark Architectural Metal (Door/Window Frames, Mullions, Balusters, Handrails) */}
      {compiled.darkMetalGeo && (
        <mesh
          geometry={compiled.darkMetalGeo}
          castShadow={!isLowPower && !isGhosted}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#1e293b"
            roughness={0.35}
            metalness={0.72}
            transparent={isGhosted}
            opacity={opacity}
          />
        </mesh>
      )}

      {/* 6. Batched Wooden Door Leaves (Slightly ajar in Cutaway mode) */}
      {compiled.woodDoorGeo && (
        <mesh
          geometry={compiled.woodDoorGeo}
          castShadow={!isLowPower && !isGhosted}
          raycast={NOOP_RAYCAST}
        >
          <meshStandardMaterial
            color="#6d4c3d"
            roughness={0.55}
            metalness={0.08}
            transparent={isGhosted}
            opacity={opacity}
          />
        </mesh>
      )}

      {/* 7. Batched Reflective Window Glass Panes */}
      {compiled.glassGeo && !isCutaway && (
        <mesh geometry={compiled.glassGeo} raycast={NOOP_RAYCAST}>
          <meshStandardMaterial
            color="#38bdf8"
            roughness={0.12}
            metalness={0.85}
            transparent
            opacity={isGhosted ? 0.06 : 0.48}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * 6. BUILDING ROOFS 3D (BIM-Lite v3.0)
 * Renders unified building-level Gable, Hip, Shed, or Flat Parapet roofs.
 */
export function BuildingRoofs3D({
  building,
  allSpaces = [],
  maxFloor = 1,
  floorHeight = 2.6,
  isGhosted = false,
  isLowPower = false,
}) {
  const pbrRoof = useMemo(() => getRoofTextures("ribbed"), []);
  const extWallColor = building?.architecture?.exterior_color || "#e5dacb";

  const roofZones = useMemo(
    () => compileBuildingRoofs(building, allSpaces, maxFloor, floorHeight),
    [building, allSpaces, maxFloor, floorHeight]
  );

  useEffect(() => {
    return () => {
      roofZones.forEach((zone) => {
        zone.roofDeckGeo?.dispose?.();
        zone.parapetWallGeo?.dispose?.();
        zone.trimGeo?.dispose?.();
      });
    };
  }, [roofZones]);

  const opacity = isGhosted ? 0.14 : 1;

  return (
    <group>
      {roofZones.map((zone) => (
        <group key={zone.id}>
          {zone.roofDeckGeo && (
            <mesh
              geometry={zone.roofDeckGeo}
              castShadow={!isLowPower && !isGhosted}
              receiveShadow={!isLowPower}
              raycast={NOOP_RAYCAST}
            >
              <meshStandardMaterial
                color={zone.color || "#334155"}
                map={pbrRoof.map}
                bumpMap={pbrRoof.bumpMap}
                bumpScale={0.025}
                roughness={0.55}
                metalness={0.22}
                side={THREE.DoubleSide}
                transparent={isGhosted}
                opacity={opacity}
              />
              {!isLowPower && !isGhosted && (
                <Edges threshold={22} color="#1e293b" />
              )}
            </mesh>
          )}

          {zone.parapetWallGeo && (
            <mesh
              geometry={zone.parapetWallGeo}
              castShadow={!isLowPower && !isGhosted}
              receiveShadow={!isLowPower}
              raycast={NOOP_RAYCAST}
            >
              <meshStandardMaterial
                color={extWallColor}
                roughness={0.68}
                side={THREE.DoubleSide}
                transparent={isGhosted}
                opacity={opacity}
              />
              {!isLowPower && !isGhosted && (
                <Edges threshold={22} color="#334155" />
              )}
            </mesh>
          )}

          {zone.trimGeo && (
            <mesh
              geometry={zone.trimGeo}
              castShadow={!isLowPower && !isGhosted}
              raycast={NOOP_RAYCAST}
            >
              <meshStandardMaterial
                color="#1e293b"
                roughness={0.45}
                metalness={0.35}
                transparent={isGhosted}
                opacity={opacity}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

