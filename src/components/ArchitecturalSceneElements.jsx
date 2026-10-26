"use client";

import React, { useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { Text, Html, RoundedBox } from "@react-three/drei";
import {
  getWallTextures,
  getInteriorFloorTexture,
  getAsphaltRoadTexture,
  getPavingTexture,
  compressFacadeImage,
} from "@/lib/architecturalTextures";

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
      <mesh position={[0, 0.07, 0]} receiveShadow raycast={() => null}>
        <boxGeometry args={[w - 0.18, 0.1, d - 0.18]} />
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
        <Text
          position={[0, 0.04, 1.35]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.58}
          color="#e2e8f0"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#0f172a"
        >
          {`◄  ${streetName.toUpperCase()}  ►`}
        </Text>

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
          <Text
            position={[0.45, 2.55, 0.03]}
            fontSize={0.13}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            maxWidth={1.25}
          >
            {streetName}
          </Text>
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
          <Text
            position={[0, 1.98, 0.25]}
            fontSize={0.15}
            color="#93c5fd"
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.015}
            outlineColor="#06152d"
          >
            MAIN ENTRANCE
          </Text>
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
              <Text
                position={[-0.4, 0.02, 0]}
                rotation={[-Math.PI / 2, 0, -Math.PI / 2]}
                fontSize={0.34}
                color="#93c5fd"
                anchorX="center"
                anchorY="middle"
              >
                {`P${i + 1}`}
              </Text>
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
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "rgba(11, 56, 96, 0.92)",
                  border: "1px solid rgba(71, 157, 233, 0.65)",
                  color: "#f8fafc",
                  fontSize: 10,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  letterSpacing: "0.04em",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
                  pointerEvents: "none",
                }}
              >
                📍 {lm.label}
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(6, 15, 30, 0.76)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 660,
          maxHeight: "88vh",
          overflowY: "auto",
          background: "linear-gradient(165deg, rgba(11, 56, 96, 0.97), rgba(8, 28, 52, 0.99))",
          border: "1px solid rgba(71, 157, 233, 0.45)",
          borderRadius: 16,
          padding: 20,
          color: "#f8fafc",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "#60a5fa",
              }}
            >
              Real-World Familiarity & Orientation
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: "2px 0 0" }}>
              Photo Facade Mapping, Textures & Street Landmarks
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#cbd5e1",
              borderRadius: 8,
              padding: "6px 10px",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>

        {/* Mode Tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            onClick={() => setActiveTab("photos")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 9,
              border: "1px solid",
              borderColor:
                activeTab === "photos" ? "#479de9" : "rgba(148,163,184,0.2)",
              background:
                activeTab === "photos"
                  ? "rgba(34, 112, 184, 0.38)"
                  : "rgba(15, 23, 42, 0.45)",
              color: "#f8fafc",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            📷 Real Photo Facades & PBR Finish
          </button>
          <button
            onClick={() => setActiveTab("street")}
            style={{
              flex: 1,
              padding: "9px 12px",
              borderRadius: 9,
              border: "1px solid",
              borderColor:
                activeTab === "street" ? "#479de9" : "rgba(148,163,184,0.2)",
              background:
                activeTab === "street"
                  ? "rgba(34, 112, 184, 0.38)"
                  : "rgba(15, 23, 42, 0.45)",
              color: "#f8fafc",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🛣️ Street Name, Gate & Landmarks
          </button>
        </div>

        {activeTab === "photos" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: "1px solid rgba(71, 157, 233, 0.28)",
                borderRadius: 10,
                padding: 12,
                fontSize: 12,
                color: "#cbd5e1",
                lineHeight: 1.5,
              }}
            >
              Upload actual photos of your building&apos;s <strong>Front, Back, Left, and Right</strong> sides. They project directly onto the 3D building shell, and fade into <strong>X-Ray Mode</strong> when you hover or click rooms so you can see room occupancy inside your real building.
            </div>

            {/* 4-Side Photo Upload Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 10,
              }}
            >
              {sides.map(({ key, label, hint }) => {
                const currentImg = facadePhotos?.[key];
                return (
                  <div
                    key={key}
                    style={{
                      background: "rgba(15, 23, 42, 0.6)",
                      border: "1px solid rgba(148, 163, 184, 0.25)",
                      borderRadius: 10,
                      padding: 10,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f8fafc" }}>{label}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</div>
                      </div>
                      {currentImg && (
                        <button
                          onClick={() =>
                            setFacadePhotos((prev) => ({ ...(prev || {}), [key]: null }))
                          }
                          style={{
                            padding: "3px 8px",
                            borderRadius: 6,
                            border: "1px solid rgba(239,68,68,0.4)",
                            background: "rgba(239,68,68,0.15)",
                            color: "#fca5a5",
                            fontSize: 10,
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {currentImg ? (
                      <div
                        style={{
                          height: 110,
                          borderRadius: 8,
                          overflow: "hidden",
                          border: "1px solid rgba(71, 157, 233, 0.45)",
                          position: "relative",
                        }}
                      >
                        <img
                          src={currentImg}
                          alt={label}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    ) : (
                      <label
                        style={{
                          height: 110,
                          borderRadius: 8,
                          border: "1px dashed rgba(71, 157, 233, 0.45)",
                          background: "rgba(11, 56, 96, 0.25)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          fontSize: 11,
                          color: "#93c5fd",
                          fontWeight: 600,
                        }}
                      >
                        {uploadingSide === key ? "Optimizing photo..." : "+ Upload Real Photo"}
                        <span style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>
                          JPG, PNG, WebP (Auto-fitted)
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => handleFileChange(key, e.target.files?.[0])}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>

            {/* X-Ray Slider & Architectural Texture Selector */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  Photo Shell Opacity (X-Ray Blend): {Math.round(facadeOpacity * 100)}%
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#93c5fd", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={autoXRayOnSelect}
                    onChange={(e) => setAutoXRayOnSelect(e.target.checked)}
                  />
                  Auto X-Ray fade when hovering/selecting rooms
                </label>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={facadeOpacity}
                onChange={(e) => setFacadeOpacity(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#479de9" }}
              />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  3D Architectural Wall Material (PBR Bump & Grain):
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { id: "concrete", label: "Precast Concrete" },
                    { id: "stucco", label: "Warm Stucco" },
                    { id: "brick", label: "Modern Brick" },
                  ].map((mat) => (
                    <button
                      key={mat.id}
                      onClick={() => setWallFinish(mat.id)}
                      style={{
                        padding: "5px 10px",
                        borderRadius: 7,
                        border: "1px solid",
                        borderColor: wallFinish === mat.id ? "#479de9" : "rgba(148,163,184,0.25)",
                        background:
                          wallFinish === mat.id
                            ? "rgba(34, 112, 184, 0.45)"
                            : "rgba(15, 23, 42, 0.6)",
                        color: "#f8fafc",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {mat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Street & Gate Settings */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                borderRadius: 10,
                padding: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <label style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, display: "block", marginBottom: 4 }}>
                  Street / Road Name in Front
                </label>
                <input
                  type="text"
                  value={siteContext?.streetName ?? ""}
                  placeholder="e.g. Rizal Ave. / Main Road"
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), streetName: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(71, 157, 233, 0.4)",
                    background: "rgba(6, 15, 30, 0.8)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, display: "block", marginBottom: 4 }}>
                  Which Side Faces the Street?
                </label>
                <select
                  value={siteContext?.streetSide || "front"}
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), streetSide: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(71, 157, 233, 0.4)",
                    background: "rgba(6, 15, 30, 0.9)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                >
                  <option value="front">Front Side (South / +Z)</option>
                  <option value="back">Back Side (North / -Z)</option>
                  <option value="left">Left Side (West / -X)</option>
                  <option value="right">Right Side (East / +X)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, display: "block", marginBottom: 4 }}>
                  Parking / Driveway Zone
                </label>
                <select
                  value={siteContext?.parkingSide || "right"}
                  onChange={(e) =>
                    setSiteContext((prev) => ({ ...(prev || {}), parkingSide: e.target.value }))
                  }
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(71, 157, 233, 0.4)",
                    background: "rgba(6, 15, 30, 0.9)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                >
                  <option value="right">Right Wing Parking (P1-P3)</option>
                  <option value="left">Left Wing Parking (P1-P3)</option>
                  <option value="front">Front Apron Parking</option>
                  <option value="none">No Parking Lot</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", paddingTop: 18 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={siteContext?.showMainGate !== false}
                    onChange={(e) =>
                      setSiteContext((prev) => ({
                        ...(prev || {}),
                        showMainGate: e.target.checked,
                      }))
                    }
                  />
                  Show 3D Main Entrance Gate Archway
                </label>
              </div>
            </div>

            {/* Landmarks Manager */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.55)",
                border: "1px solid rgba(148, 163, 184, 0.22)",
                borderRadius: 10,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd" }}>
                📍 Familiar Property Landmarks (Guardhouse, Water Tank, Store, Laundry)
              </div>

              {/* 1-Click Quick Landmark Presets */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[
                  { label: "Guardhouse", pos: "front-left" },
                  { label: "Sari-Sari Store", pos: "front-right" },
                  { label: "Water Tank", pos: "back-right" },
                  { label: "Laundry Area", pos: "back-left" },
                  { label: "Generator Room", pos: "left" },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handleAddLandmark(preset.label, preset.pos)}
                    style={{
                      padding: "4px 9px",
                      borderRadius: 999,
                      border: "1px solid rgba(71, 157, 233, 0.4)",
                      background: "rgba(34, 112, 184, 0.25)",
                      color: "#e2e8f0",
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Landmark Input */}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={newLandmarkLabel}
                  placeholder="Custom landmark name (e.g. Gate 2, Pump Room)..."
                  onChange={(e) => setNewLandmarkLabel(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148,163,184,0.3)",
                    background: "rgba(6, 15, 30, 0.8)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                />
                <select
                  value={newLandmarkPos}
                  onChange={(e) => setNewLandmarkPos(e.target.value)}
                  style={{
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(148,163,184,0.3)",
                    background: "rgba(6, 15, 30, 0.9)",
                    color: "#f8fafc",
                    fontSize: 12,
                  }}
                >
                  <option value="front-left">Front-Left Corner</option>
                  <option value="front-right">Front-Right Corner</option>
                  <option value="left">Left Compound Side</option>
                  <option value="right">Right Compound Side</option>
                  <option value="back-left">Back-Left Corner</option>
                  <option value="back-right">Back-Right Corner</option>
                </select>
                <button
                  onClick={() => handleAddLandmark()}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid #479de9",
                    background: "linear-gradient(135deg, #2270b8, #0b3860)",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Add
                </button>
              </div>

              {/* Existing Landmarks List */}
              {(siteContext?.landmarks || []).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                  {(siteContext?.landmarks || []).map((lm) => (
                    <div
                      key={lm.id}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 10px",
                        borderRadius: 8,
                        background: "rgba(11, 56, 96, 0.65)",
                        border: "1px solid rgba(71, 157, 233, 0.45)",
                        fontSize: 11,
                      }}
                    >
                      <span>
                        📍 <strong>{lm.label}</strong> ({lm.position})
                      </span>
                      <button
                        onClick={() => handleRemoveLandmark(lm.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fca5a5",
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
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
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 16,
            paddingTop: 12,
            borderTop: "1px solid rgba(148, 163, 184, 0.18)",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: 9,
              border: "1px solid rgba(148, 163, 184, 0.3)",
              background: "rgba(15, 23, 42, 0.6)",
              color: "#cbd5e1",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Close
          </button>
          {onPersistSiteAndFacade && (
            <button
              onClick={onPersistSiteAndFacade}
              disabled={isSaving}
              style={{
                padding: "8px 16px",
                borderRadius: 9,
                border: "1px solid #479de9",
                background: "linear-gradient(135deg, #2270b8, #0b3860)",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: isSaving ? "wait" : "pointer",
              }}
            >
              {isSaving ? "Saving to Property..." : "Save Photos & Street Context"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
