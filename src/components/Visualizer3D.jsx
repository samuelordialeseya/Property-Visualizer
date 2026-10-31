"use client";
import React, { useRef, useMemo, useState, useEffect, Component } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, Edges, Html, Bvh } from "@react-three/drei";
import * as THREE from "three";
import {
  Building2, ArrowLeft, Pencil, Layers, X, Check, Plus, CopyPlus,
  RotateCw, Trash2, Info, Box, Grid, Square, Search, Upload, Wrench,
  HelpCircle, MousePointer, Move, Maximize2, Palette, ChevronUp,
  ChevronDown, ChevronLeft, ChevronRight, Sparkles, Copy, Eye, Camera, MapPin, Tag
} from "lucide-react";
import { UNIT_H } from "@/lib/footprints";
import { uploadFile, useMaintenanceTickets } from "@/hooks/useFirestore";
import {
  solveFloorTopology,
  normalizeSpace,
} from "@/lib/buildingGeometry";
import {
  ARCHITECTURAL_PRESETS,
  parseAgentBlueprintJSON,
  serializeBlueprintJSON,
} from "@/lib/architecturalPresets";
import {
  PhotoFacadeShell,
  DetailedUnitInterior3D,
  SiteContext3D,
  SiteAndFacadeModal,
  BatchedFloorArchitecture3D,
  BuildingRoofs3D,
} from "./ArchitecturalSceneElements";
import Blueprint2DView from "./Blueprint2DView";

function checkWebGLSupport() {
  if (typeof window === "undefined") return true;
  try {
    if (!window.WebGLRenderingContext && !window.WebGL2RenderingContext) return false;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    const isSupported = !!gl;
    if (gl) {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
    }
    return isSupported;
  } catch (e) {
    return true;
  }
}

// ─── Hardware performance profiling for mobile devices / iPad Air 2 standard ─
function checkDevicePerformance() {
  if (typeof window === "undefined") {
    return { isLowPower: false, dpr: 1.25, antialias: true, precision: "highp" };
  }
  const isTouch = "ontouchstart" in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const isApple = /iPad|iPhone|iPod|Macintosh/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  const isLowPower = isTouch && (cores <= 4 || memory <= 3 || (isApple && cores <= 6));

  return {
    isLowPower,
    dpr: isLowPower ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.35),
    antialias: !isLowPower,
    precision: isLowPower ? "mediump" : "highp",
  };
}

// ─── Colours ────────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  occupied: 0xd98a53,
  overdue:  0xe05c5c,
  vacant:   0x6e8592,
};
const UNIT_BODY_COLOR  = 0x5b6c7d;
const ROOF_COLOR       = 0x3d4e5e;
const WINDOW_COLOR     = 0xf9d392;
const DOOR_COLOR       = 0x479de9;
const GROUND_COLOR     = 0x121720;
const SLAB_COLOR       = 0x1a222c;

const STATUS_CSS = { occupied: '#d98a53', overdue: '#e05c5c', vacant: '#6e8592' };

// ─── Camera Controller for smooth auto-framing ───────────────────────────────
function CameraController({ selectedUnit, isEditMode, cameraPreset }) {
  const { camera, size, controls } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(0, 1.4, 0), []);

  useEffect(() => {
    if (!camera || !controls) return;
    if (cameraPreset === "top-down") {
      camera.position.set(0, 16, 0.05);
      controls.target.set(0, 0, 0);
    } else if (cameraPreset === "front") {
      camera.position.set(0, 4.0, 14);
      controls.target.set(0, 1.8, 0);
    } else if (cameraPreset === "isometric") {
      camera.position.set(11, 9.0, 13);
      controls.target.set(0, 1.6, 0);
    }
    controls.update();
  }, [cameraPreset, camera, controls]);

  useFrame((state, delta) => {
    if (!camera || !controls || !size || size.width <= 0 || size.height <= 0) return;
    const safeDelta = Math.min(delta, 0.1);

    if (selectedUnit && !isEditMode) {
      const isDesktop = size.width >= 768;
      const floorOffset = ((selectedUnit.floor || 1) - 1) * (UNIT_H + 0.11);
      const h = selectedUnit.height || 2.2;
      const y = floorOffset + h / 2;
      const panOffset = isDesktop ? -1.0 : 0;
      targetPos.set((selectedUnit.x || 0) + panOffset, y, selectedUnit.z || 0);
      if (controls.target.distanceToSquared(targetPos) > 0.0001) {
        controls.target.lerp(targetPos, 4 * safeDelta);
        controls.update();
      }
    }
  });

  return null;
}

function computeBuildingBounds(units, floorHeight = 2.6) {
  if (!units || units.length === 0) {
    return {
      minX: -6,
      maxX: 6,
      minZ: -4,
      maxZ: 4,
      width: 12,
      depth: 8,
      centerX: 0,
      centerZ: 0,
      totalHeight: floorHeight + 0.2,
    };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity,
    maxFloor = 1;
  units.forEach((rawU) => {
    const u = normalizeSpace(rawU);
    const bPad = u.has_balcony ? u.balcony_depth || 1.0 : 0;
    minX = Math.min(minX, u.x1 - bPad);
    maxX = Math.max(maxX, u.x2 + bPad);
    minZ = Math.min(minZ, u.z1 - bPad);
    maxZ = Math.max(maxZ, u.z2 + bPad);
    maxFloor = Math.max(maxFloor, u.floor || 1);
  });
  const width = Math.max(4, maxX - minX);
  const depth = Math.max(4, maxZ - minZ);
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const totalHeight = maxFloor * floorHeight + 0.2;
  return { minX, maxX, minZ, maxZ, width, depth, centerX, centerZ, totalHeight };
}

/**
 * Lightweight interactive hitbox & interior status renderer per rentable unit.
 * All heavy walls, windows, doors, slabs, railings, and staircases are rendered
 * by BatchedFloorArchitecture3D with raycast disabled for 60 FPS mobile speed.
 */
function UnitHitboxVolume3D({
  unit,
  floorHeight = 2.6,
  isSelected,
  onClick,
  activeFloor,
  searchQuery,
  statusFilter = "all",
  pinMode = "auto",
  hoveredUnitId,
  onHover,
  isEditMode,
  hasActiveTicket,
  isOrbiting,
  isLowPower,
  isCutaway,
}) {
  const norm = useMemo(() => normalizeSpace(unit), [unit]);
  const unitFloor = norm.floor || 1;
  const baseY = (unitFloor - 1) * floorHeight;
  const bw = Math.max(0.6, norm.width - 0.16);
  const bd = Math.max(0.6, norm.depth - 0.16);
  const bh = floorHeight - 0.18;

  const statusHex = STATUS_COLOR[norm.status] || STATUS_COLOR.vacant;
  const statusCss = STATUS_CSS[norm.status] || STATUS_CSS.vacant;
  const isGhosted = activeFloor !== "All" && unitFloor !== Number(activeFloor);

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch =
    q.length === 0 ||
    (norm.unit_label || "").toLowerCase().includes(q) ||
    (norm.tenant?.name || "").toLowerCase().includes(q);

  const unitStatus = norm.status || "vacant";
  const matchesStatusFilter =
    statusFilter === "all" ||
    (statusFilter === "maintenance"
      ? hasActiveTicket
      : unitStatus === statusFilter);

  const isDimmed = !isEditMode && (!matchesSearch || !matchesStatusFilter);
  const isFilterHighlighted =
    !isEditMode &&
    ((q.length > 0 && matchesSearch) ||
      (statusFilter !== "all" && matchesStatusFilter));

  const isHovered = hoveredUnitId === norm.id;
  const isCommonArea = norm.element_type === "common_area";

  // Pin Z offset: front units face South (+Z), rear units face North (-Z)
  const pinZ = isCutaway
    ? 0
    : norm.z < -0.1
      ? -norm.depth / 2 - 0.16
      : norm.depth / 2 + 0.16;

  // Adaptive pin visibility:
  // - "off": never show passive pins (hover card still works)
  // - "all": show all un-ghosted & un-dimmed units
  // - "auto" (default): show only if selected, filter/search match, floor isolated, or in edit mode
  const shouldShowPin = useMemo(() => {
    if (isGhosted || isHovered || (isOrbiting && isLowPower)) return false;
    if (pinMode === "off") return false;
    if (pinMode === "all") return !isDimmed;
    if (isSelected || isFilterHighlighted) return true;
    if (activeFloor !== "All" && !isDimmed) return true;
    if (isEditMode && !isDimmed) return true;
    return false;
  }, [
    isGhosted,
    isHovered,
    isOrbiting,
    isLowPower,
    pinMode,
    isDimmed,
    isSelected,
    isFilterHighlighted,
    activeFloor,
    isEditMode,
  ]);

  const handleSelect = (e) => {
    e.stopPropagation();
    if (onClick) onClick(unit);
  };

  const handlePointerOver = (e) => {
    if (e.pointerType === "mouse") {
      e.stopPropagation();
      if (onHover) onHover(norm.id);
    }
  };

  const handlePointerOut = (e) => {
    if (e.pointerType === "mouse") {
      e.stopPropagation();
      if (onHover) onHover(null);
    }
  };

  return (
    <group position={[norm.x, baseY, norm.z]}>
      {/* 1. Single BVH-Indexed Interactive Hitbox & Floor Status Plate */}
      <mesh
        position={[0, isCutaway ? 0.06 : bh / 2, 0]}
        onClick={handleSelect}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      >
        <boxGeometry args={[bw, isCutaway ? 0.12 : bh, bd]} />
        <meshStandardMaterial
          color={isCommonArea ? "#475569" : statusHex}
          roughness={0.5}
          emissive={
            isSelected
              ? "#38bdf8"
              : isHovered || isFilterHighlighted
                ? statusCss
                : "#000000"
          }
          emissiveIntensity={
            isSelected
              ? 0.45
              : isHovered
                ? 0.28
                : isFilterHighlighted
                  ? 0.32
                  : 0
          }
          transparent
          opacity={
            isGhosted
              ? 0.05
              : isDimmed
                ? 0.08
                : isCutaway
                  ? isCommonArea
                    ? 0.95
                    : isSelected
                      ? 0.35
                      : isHovered
                        ? 0.22
                        : isFilterHighlighted
                          ? 0.26
                          : 0
                  : isSelected || isHovered || isFilterHighlighted
                    ? 0.44
                    : 0.16
          }
          depthWrite={false}
          polygonOffset={isCutaway}
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
        {(isSelected || isHovered || isFilterHighlighted) && (
          <Edges
            scale={1.005}
            threshold={20}
            color={isSelected ? "#38bdf8" : isFilterHighlighted ? statusCss : "#ffffff"}
          />
        )}
      </mesh>

      {/* 2. Exterior Mode Base Status Glow Strip (Visible along unit perimeter) */}
      {!isCutaway && !isGhosted && !isCommonArea && (
        <mesh position={[0, 0.08, 0]} raycast={() => null}>
          <boxGeometry args={[norm.width + 0.05, 0.14, norm.depth + 0.05]} />
          <meshStandardMaterial
            color={statusHex}
            emissive={statusHex}
            emissiveIntensity={isSelected || isHovered || isFilterHighlighted ? 0.55 : 0.22}
            roughness={0.4}
            transparent={isDimmed}
            opacity={isDimmed ? 0.12 : 0.95}
          />
        </mesh>
      )}

      {/* 3. Cutaway Dollhouse Interior Furnishings (Bed, Mattress, Desk, Wardrobe, Ceramic Tile) */}
      {isCutaway && !isGhosted && !isDimmed && !isCommonArea && (
        <group position={[0, bh / 2, 0]}>
          <DetailedUnitInterior3D
            w={bw}
            d={bd}
            h={bh}
            statusColor={statusCss}
            isOccupied={norm.status === "occupied"}
          />
        </group>
      )}

      {/* 4. Floating Unit Status Pin */}
      {shouldShowPin && (
        <Html
          position={[
            0,
            isCutaway ? 0.95 : floorHeight * 0.62,
            pinZ,
          ]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: "none" }}
          occlude
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: isSelected ? "#0b3860" : "#141a21",
              border: isSelected
                ? "1.5px solid #479de9"
                : isFilterHighlighted
                  ? `1.5px solid ${statusCss}`
                  : "1px solid #262f38",
              borderRadius: "999px",
              padding: "2px 8px 2px 6px",
              fontSize: "11px",
              fontWeight: 700,
              fontFamily: "Manrope, sans-serif",
              fontVariantNumeric: "tabular-nums",
              color: "#f4f4f5",
              whiteSpace: "nowrap",
              boxShadow: "0 4px 12px rgba(0,0,0,0.45)",
              willChange: "transform",
            }}
          >
            <span
              style={{
                height: 6,
                width: 6,
                borderRadius: "50%",
                background: isCommonArea ? "#94a3b8" : statusCss,
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            {norm.unit_label || "?"}
          </div>
        </Html>
      )}

      {/* 5. Rich Desktop Hover Card */}
      {isHovered && !isGhosted && !isEditMode && (
        <Html
          center
          position={[0, floorHeight + 0.45, 0]}
          zIndexRange={[20, 11]}
          style={{ pointerEvents: "none" }}
          occlude={false}
        >
          <div
            style={{
              width: 204,
              background: "#141a21",
              border: "1px solid #262f38",
              borderRadius: 16,
              padding: "11px 13px",
              boxShadow: "0 16px 36px rgba(0,0,0,0.55)",
              fontFamily: "Manrope, sans-serif",
              fontVariantNumeric: "tabular-nums",
              color: "#f4f4f5",
              willChange: "transform",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {norm.unit_label}
              </span>
              <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>
                Floor {unitFloor}
              </span>
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "Sora, sans-serif",
                color: "#ffffff",
                marginBottom: 7,
                lineHeight: 1.25,
              }}
            >
              {isCommonArea
                ? "Shared Space"
                : norm.tenant?.name || "Vacant Unit"}
            </div>
            {!isCommonArea && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "Sora, sans-serif",
                    color: "#cbd5e1",
                  }}
                >
                  {norm.monthly_rent
                    ? `₱${Number(norm.monthly_rent).toLocaleString()}`
                    : "—"}
                </span>
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "2px 8px",
                    borderRadius: 999,
                    background:
                      norm.status === "occupied"
                        ? "#fef3c7"
                        : norm.status === "overdue"
                          ? "#fee2e2"
                          : "#27272a",
                    color:
                      norm.status === "occupied"
                        ? "#92400e"
                        : norm.status === "overdue"
                          ? "#991b1b"
                          : "#cbd5e1",
                  }}
                >
                  {norm.status || "vacant"}
                </span>
              </div>
            )}
            {hasActiveTicket && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid #262f38",
                  color: "#fbbf24",
                  fontSize: 10.5,
                  fontWeight: 700,
                }}
              >
                <Wrench size={12} />
                Active Repair Ticket
              </div>
            )}
          </div>
        </Html>
      )}

      {/* 6. Maintenance Wrench Badge */}
      {!isGhosted &&
        hasActiveTicket &&
        !isHovered &&
        !(isOrbiting && isLowPower) && (
          <Html
            center
            position={[0, floorHeight * 0.8, pinZ]}
            zIndexRange={[12, 1]}
            style={{ pointerEvents: "none" }}
            occlude
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f59e0b",
                color: "#fff",
                borderRadius: "50%",
                width: 20,
                height: 20,
                opacity: isDimmed ? 0.3 : 1,
                willChange: "transform",
              }}
            >
              <Wrench size={10} strokeWidth={3} />
            </div>
          </Html>
        )}
    </group>
  );
}

function Building({
  building,
  units,
  tickets = [],
  selectedUnitId,
  onSelectUnit,
  activeFloor,
  searchQuery,
  statusFilter = "all",
  pinMode = "auto",
  hoveredUnitId,
  onHover,
  isOrbiting,
  isLowPower,
  cutawayMode,
  wallFinish = "concrete",
  facadePhotos = {},
  facadeOpacity = 0.85,
  autoXRayOnSelect = true,
  siteContext = {},
  buildingAddress = "",
  isEditMode = false,
}) {
  const floorHeight = Number(building?.architecture?.floor_height) || 2.6;
  const bounds = useMemo(
    () => computeBuildingBounds(units, floorHeight),
    [units, floorHeight]
  );

  const effectiveArchitecture = useMemo(
    () => ({
      floor_height: floorHeight,
      wall_material:
        building?.architecture?.wall_material || wallFinish || "stucco",
      exterior_color: building?.architecture?.exterior_color || "#e5dacb",
      railing_style: building?.architecture?.railing_style || "steel_grill",
      roof_type: building?.architecture?.roof_type || "gable",
      roofs: building?.architecture?.roofs || null,
    }),
    [building?.architecture, floorHeight, wallFinish]
  );

  // Group spaces by floor and solve topological walls, doors, windows, slabs, and stairs per floor
  const { floorLevels, maxFloor, floorTopologies } = useMemo(() => {
    const levels = Array.from(
      new Set(units.map((u) => Number(u.floor) || 1))
    ).sort((a, b) => a - b);
    const maxF = levels.length > 0 ? Math.max(...levels) : 1;
    const topos = new Map();
    for (const f of levels) {
      const floorSpaces = units.filter((u) => (Number(u.floor) || 1) === f);
      topos.set(
        f,
        solveFloorTopology(floorSpaces, f, units, effectiveArchitecture)
      );
    }
    return { floorLevels: levels, maxFloor: maxF, floorTopologies: topos };
  }, [units, effectiveArchitecture]);

  const showUnifiedRoof = !cutawayMode && activeFloor === "All";

  return (
    <Bvh firstHitOnly>
      <group>
        {/* 1. Real-World Street, Sidewalk, Main Gate, Parking & Landmarks */}
        <SiteContext3D
          bounds={bounds}
          siteContext={siteContext}
          buildingAddress={buildingAddress}
        />

        {/* 2. Foundation Ground Plinth */}
        {units.length > 0 && (
          <group position={[bounds.centerX, 0.045, bounds.centerZ]}>
            <mesh receiveShadow={!isLowPower} raycast={() => null}>
              <boxGeometry
                args={[bounds.width + 0.9, 0.09, bounds.depth + 0.9]}
              />
              <meshStandardMaterial color={SLAB_COLOR} roughness={0.8} />
              {!isLowPower && (
                <Edges scale={1.001} threshold={20} color="#2b3947" />
              )}
            </mesh>
          </group>
        )}

        {/* 3. 4-Side Real Photo Facade Projection Shell (with Auto X-Ray Fade) */}
        <PhotoFacadeShell
          bounds={bounds}
          facadePhotos={facadePhotos}
          opacity={facadeOpacity}
          autoXRayActive={
            autoXRayOnSelect && Boolean(hoveredUnitId || selectedUnitId)
          }
          cutawayMode={cutawayMode}
        />

        {/* 4. Batched Floor-by-Floor BIM Architecture + Interactive Unit Hitboxes */}
        {floorLevels.map((f) => {
          // When isolating a specific floor (F1, F2...), hide floors above it so you look straight inside!
          if (activeFloor !== "All" && f > Number(activeFloor)) {
            return null;
          }
          const isGhosted =
            activeFloor !== "All" && f < Number(activeFloor);
          const isFloorCutaway =
            cutawayMode ||
            (activeFloor !== "All" && f === Number(activeFloor));
          const topo = floorTopologies.get(f);
          if (!topo) return null;

          return (
            <group key={`bim_floor_${f}`}>
              <BatchedFloorArchitecture3D
                topology={topo}
                floorNumber={f}
                floorHeight={floorHeight}
                isCutaway={isFloorCutaway}
                isGhosted={isGhosted}
                isLowPower={isLowPower}
                architecture={effectiveArchitecture}
              />

              {topo.spaces
                .filter(
                  (s) =>
                    !s.element_type ||
                    s.element_type === "unit" ||
                    s.element_type === "common_area" ||
                    isEditMode
                )
                .map((unit) => {
                  const hasActiveTicket = tickets.some(
                    (t) =>
                      (t.unit_id === unit.id || t.unitId === unit.id) &&
                      t.status !== "settled"
                  );
                  return (
                    <UnitHitboxVolume3D
                      key={unit.id}
                      unit={unit}
                      floorHeight={floorHeight}
                      isSelected={selectedUnitId === unit.id}
                      onClick={onSelectUnit}
                      activeFloor={activeFloor}
                      searchQuery={searchQuery}
                      statusFilter={statusFilter}
                      pinMode={pinMode}
                      hoveredUnitId={hoveredUnitId}
                      onHover={onHover}
                      isEditMode={isEditMode}
                      hasActiveTicket={hasActiveTicket}
                      isOrbiting={isOrbiting}
                      isLowPower={isLowPower}
                      isCutaway={isFloorCutaway}
                    />
                  );
                })}
            </group>
          );
        })}

        {/* 5. Unified Whole-Building Roofs (Gable, Hip, Shed, or Flat Parapet + Bulkhead) */}
        {showUnifiedRoof && units.length > 0 && (
          <BuildingRoofs3D
            building={{ ...building, architecture: effectiveArchitecture }}
            allSpaces={units}
            maxFloor={maxFloor}
            floorHeight={floorHeight}
            isGhosted={false}
            isLowPower={isLowPower}
          />
        )}
      </group>
    </Bvh>
  );
}

// Convert editorRooms into a shape that UnitBox/StructuralBox can render
function editorRoomsToUnits(editorRooms) {
  return editorRooms.map(r => ({
    ...r,
    element_type: r.element_type || 'unit',
    status: r.status || 'vacant',
    material_type: r.material_type || 'stucco',
    texture_url: r.texture_url || null,
    wall_color: r.wall_color || '#4a5a66',
    has_balcony: !!r.has_balcony,
    balcony_side: r.balcony_side || 'S',
    balcony_depth: r.balcony_depth || 1.0,
  }));
}

// ─── Ground + grid ───────────────────────────────────────────────────────────
function Ground({ onGroundClick }) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.01, 0]}
        onClick={(e) => {
          e.stopPropagation();
          if (onGroundClick) onGroundClick();
        }}
      >
        <planeGeometry args={[60, 60]} />
        <meshBasicMaterial color={GROUND_COLOR} />
      </mesh>
      <gridHelper args={[60, 30, 0x38bdf8, 0x223244]} position={[0, 0.005, 0]} />
    </group>
  );
}

// ─── Agent Blueprint Importer & Multi-Story Architectural Presets Modal ──────
function BlueprintImportModal({ building, editorRooms, onApplyRooms, onClose }) {
  const [tab, setTab] = useState("presets"); // "presets" | "json"
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleLoadPreset = (preset) => {
    const generated = preset.generateRooms();
    onApplyRooms(generated, preset.architecture || null);
    onClose();
  };

  const handleApplyJson = () => {
    setJsonError("");
    if (!jsonText.trim()) {
      setJsonError("Paste the Agent Blueprint JSON first.");
      return;
    }
    try {
      const { rooms, architecture } = parseAgentBlueprintJSON(jsonText);
      onApplyRooms(rooms, architecture || null);
      onClose();
    } catch (err) {
      setJsonError(err.message || "Invalid JSON format.");
    }
  };

  const handleCopyCurrent = async () => {
    try {
      const str = serializeBlueprintJSON(building, editorRooms);
      await navigator.clipboard.writeText(str);
      setJsonText(str);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy JSON:", e);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[105] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1117] border border-white/15 rounded-3xl shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#2270b8]/20 border border-[#2270b8]/40 flex items-center justify-center text-[#479de9]">
              <Sparkles size={19} />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-white font-['Sora']">
                Architectural Templates & Agent Blueprint Importer
              </h2>
              <p className="text-[12px] text-white/45 font-['Manrope']">
                Load a multi-story building with hallways & balconies, or paste a free Agent-drafted blueprint
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("presets")}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold font-['Manrope'] transition cursor-pointer ${
              tab === "presets"
                ? "bg-[#2270b8] text-white shadow-sm"
                : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            1-Click Complex Templates
          </button>
          <button
            type="button"
            onClick={() => setTab("json")}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold font-['Manrope'] transition cursor-pointer ${
              tab === "json"
                ? "bg-[#2270b8] text-white shadow-sm"
                : "bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10"
            }`}
          >
            Paste Agent Blueprint JSON (Free Photo-to-3D)
          </button>
        </div>

        {tab === "presets" ? (
          <div className="p-6 space-y-3.5">
            {ARCHITECTURAL_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#2270b8]/60 p-4 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-white font-['Sora']">{preset.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2270b8]/20 text-[#479de9] border border-[#2270b8]/30">
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11.5px] font-semibold text-zinc-300 font-['Manrope']">{preset.subtitle}</p>
                  <p className="text-[11.5px] text-zinc-400 font-['Manrope'] leading-relaxed">{preset.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadPreset(preset)}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12px] font-bold font-['Manrope'] transition shadow-md active:scale-95 cursor-pointer"
                >
                  Load Template →
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="rounded-2xl bg-[#2270b8]/10 border border-[#2270b8]/25 p-4 text-[12px] text-zinc-300 font-['Manrope'] space-y-1.5">
              <div className="font-bold text-white flex items-center gap-1.5">
                <Sparkles size={14} className="text-[#479de9]" />
                <span>How Free Agent-Side Photo-to-3D Works:</span>
              </div>
              <p className="text-white/70 leading-relaxed">
                1. Drop photos of your building&apos;s <strong>Front, Sides, Back</strong> (or a floorplan sketch) into the Antigravity chat.<br />
                2. The Agent analyzes the architecture for free and either injects it directly or gives you a Blueprint JSON.<br />
                3. Paste the JSON below and click <strong>Apply Blueprint</strong> to generate all floors, hallways, stairs, balconies, and clickable rooms!
              </p>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-['Manrope']">
                Blueprint JSON Payload
              </label>
              <button
                type="button"
                onClick={handleCopyCurrent}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-[#479de9] hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg transition cursor-pointer"
              >
                <Copy size={12} />
                <span>{copied ? "Copied Current Layout!" : "Export Current Layout JSON"}</span>
              </button>
            </div>

            <textarea
              rows={8}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder={'{\n  "name": "Sunset Residences",\n  "rooms": [\n    { "unit_label": "Unit 101", "floor": 1, "element_type": "unit", "x": -3, "z": 0, "width": 3, "depth": 3.2, "has_balcony": true, "balcony_side": "S" }\n  ]\n}'}
              className="w-full rounded-2xl bg-black/50 border border-white/15 focus:border-[#2270b8] p-3.5 text-[12px] font-mono text-emerald-300 placeholder-zinc-600 outline-none"
            />

            {jsonError && (
              <div className="text-[12px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3.5 py-2">
                {jsonError}
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 text-[12px] font-semibold font-['Manrope'] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyJson}
                className="px-5 py-2.5 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12px] font-bold font-['Manrope'] shadow-lg transition cursor-pointer"
              >
                Apply Blueprint to 3D Scene →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 3D Builder Guide Modal ──────────────────────────────────────────────────
function BuilderGuideModal({ onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const sections = [
    {
      icon: <Sparkles size={16} className="text-[#479de9]" />,
      title: "Agent Photo-to-3D & Complex Templates",
      tips: [
        'Click "AI Blueprint / Presets" in the bottom dock to load multi-story dorms/apartments with hallways, balconies & stairs',
        "Or drop Front, Side, and Back photos in your Antigravity chat to have the Agent generate a custom Blueprint JSON for free",
        'Toggle between "Exterior Shell" and "Cutaway Dollhouse" in the top bar anytime to see inside rooms and corridors',
      ],
    },
    {
      icon: <MousePointer size={16} className="text-[#479de9]" />,
      title: "Selecting & Moving Elements",
      tips: [
        "Click any room, hallway, or stairwell block in the 3D scene to select it",
        "Click and drag across the floor grid to reposition, or use the 0.5m nudge arrows in the right inspector",
        "Use Arrow Keys on your keyboard to resize width and depth",
      ],
    },
    {
      icon: <Plus size={16} className="text-[#479de9]" />,
      title: "Adding Rooms, Hallways, Balconies & Stairs",
      tips: [
        'Use "+ Room", "+ Hallway", and "+ Stairs" in the bottom toolbar to add architectural blocks',
        "In the right inspector, enable a Private Balcony (Front, Back, Left, or Right) on any rentable unit",
        "Hallways and Stairwells visually connect your building in 3D/2D without counting as rentable units in your ledger",
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1117] border border-white/10 rounded-3xl shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#2270b8]/20 border border-[#2270b8]/30 flex items-center justify-center">
              <HelpCircle size={18} className="text-[#479de9]" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-white font-['Sora']">3D Layout Builder — Guide</h2>
              <p className="text-[12px] text-white/40 font-['Manrope']">How to design cutaway rooms, hallways, balconies & stairs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mx-6 mt-5 bg-[#2270b8]/10 border border-[#2270b8]/20 rounded-2xl px-4 py-3 flex items-start gap-3">
          <Info size={14} className="text-[#479de9] shrink-0 mt-0.5" />
          <p className="text-[12px] text-white/60 font-['Manrope'] leading-relaxed">
            <span className="text-white font-semibold">Camera controls work anytime:</span> Left-drag to orbit · Right-drag to pan · Scroll wheel to zoom.
            Use the <span className="text-white font-semibold">Iso / Top / Front</span> presets in the bottom toolbar to quickly reset the angle.
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {sections.map((s, i) => (
            <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-7 w-7 rounded-lg bg-[#2270b8]/15 border border-[#2270b8]/20 flex items-center justify-center shrink-0">
                  {s.icon}
                </div>
                <span className="text-[13px] font-bold text-white font-['Sora']">{s.title}</span>
              </div>
              <ul className="space-y-1.5">
                {s.tips.map((tip, j) => (
                  <li key={j} className="flex items-start gap-2">
                    <span className="text-[#479de9] text-[10px] mt-[3px] shrink-0">▸</span>
                    <span className="text-[12px] text-white/55 font-['Manrope'] leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[13px] font-bold font-['Manrope'] transition shadow-lg"
          >
            Got it — start building!
          </button>
        </div>
      </div>
    </div>
  );
}

class WebGLErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("3D Canvas Error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0f13] text-white p-6 text-center z-10">
          <div className="max-w-md rounded-2xl bg-zinc-900 border border-white/15 p-6 shadow-2xl">
            <h3 className="text-[16px] font-bold font-['Sora'] text-white">3D Scene Issue</h3>
            <p className="mt-2 text-[12px] text-zinc-300 font-['Manrope']">
              {this.state.error?.message || "WebGL could not be initialized."}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              {this.props.onSwitchTo2D && (
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    this.props.onSwitchTo2D();
                  }}
                  className="px-4 py-2 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12px] font-bold transition cursor-pointer shadow-lg"
                >
                  Switch to 2D Blueprint
                </button>
              )}
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[12px] font-semibold border border-white/10 transition cursor-pointer"
              >
                Retry 3D Scene
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Visualizer3D({ building, units, selectedUnitId, onSelectUnit, onBack, onSaveLayout, onUpdateBuilding, onCancelNewBuilding }) {
  const [editMode, setEditMode] = useState(false);
  const [viewMode, setViewMode] = useState("3d"); // "3d" or "2d"
  const [cutawayMode, setCutawayMode] = useState(false); // false = Exterior Shell, true = Dollhouse Cutaway
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  useEffect(() => {
    const supported = checkWebGLSupport();
    setIsWebGLSupported(supported);
    if (!supported) {
      setViewMode("2d");
    }
  }, []);

  const [showBuilderGuide, setShowBuilderGuide] = useState(false);
  const [showBlueprintModal, setShowBlueprintModal] = useState(false);
  const [showSiteFacadeModal, setShowSiteFacadeModal] = useState(false);
  const [savingSiteFacade, setSavingSiteFacade] = useState(false);

  // ── Real-World Familiarity: Facade Photos, PBR Finish & Street/Landmark Context
  const [facadePhotos, setFacadePhotos] = useState(() => building?.facade_photos || {});
  const [facadeOpacity, setFacadeOpacity] = useState(() => building?.facade_opacity ?? 0.85);
  const [autoXRayOnSelect, setAutoXRayOnSelect] = useState(true);
  const [wallFinish, setWallFinish] = useState(() => building?.wall_finish || "concrete");
  const [siteContext, setSiteContext] = useState(() =>
    building?.site_context || {
      streetName: building?.address ? building.address.split(",")[0].trim() : "",
      streetSide: "front",
      showMainGate: true,
      parkingSide: "right",
      landmarks: [
        { id: "default_guard", label: "Main Gate / Guard", position: "front-left" },
      ],
    }
  );

  useEffect(() => {
    setFacadePhotos(building?.facade_photos || {});
    setFacadeOpacity(building?.facade_opacity ?? 0.85);
    setWallFinish(building?.wall_finish || "concrete");
    setSiteContext(
      building?.site_context || {
        streetName: building?.address ? building.address.split(",")[0].trim() : "",
        streetSide: "front",
        showMainGate: true,
        parkingSide: "right",
        landmarks: [
          { id: "default_guard", label: "Main Gate / Guard", position: "front-left" },
        ],
      }
    );
  }, [building?.id]);

  const handlePersistSiteAndFacade = async () => {
    if (!onUpdateBuilding) {
      setShowSiteFacadeModal(false);
      return;
    }
    setSavingSiteFacade(true);
    try {
      await onUpdateBuilding({
        facade_photos: facadePhotos,
        facade_opacity: facadeOpacity,
        wall_finish: wallFinish,
        site_context: siteContext,
      });
      setShowSiteFacadeModal(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (err) {
      console.error("Failed to save facade photos & street context:", err);
    } finally {
      setSavingSiteFacade(false);
    }
  };

  const hasAnyFacadePhoto = Boolean(
    facadePhotos?.front || facadePhotos?.back || facadePhotos?.left || facadePhotos?.right
  );

  const [showFirstEntryHint, setShowFirstEntryHint] = useState(false);
  const [navTipDismissed, setNavTipDismissed] = useState(false);
  const [mobileTipDismissed, setMobileTipDismissed] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const hasShownHint = useRef(false);
  const [editorRooms, setEditorRooms] = useState([]);
  const [editorArchitecture, setEditorArchitecture] = useState(() => building?.architecture || null);
  const [selectedEditorRoomId, setSelectedEditorRoomId] = useState(null);
  const [deletedRoomIds, setDeletedRoomIds] = useState([]);
  const [cameraPreset, setCameraPreset] = useState("isometric");
  const [isOrbiting, setIsOrbiting] = useState(false);
  const perfProfile = useMemo(() => checkDevicePerformance(), []);

  // ── Feature state: search, floor isolator, status filter, pin mode, hover, studio tab
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFloor, setActiveFloor] = useState('All');
  const [statusFilter, setStatusFilter] = useState("all");
  const [pinMode, setPinMode] = useState("auto"); // "auto" | "all" | "off"
  const [hoveredUnitId, setHoveredUnitId] = useState(null);
  const [studioTab, setStudioTab] = useState("space"); // "space" | "building"
  const [optimisticUnits, setOptimisticUnits] = useState(null);

  // Auto-focus the "space" tab when selecting a room in Studio mode
  useEffect(() => {
    if (selectedEditorRoomId) {
      setStudioTab("space");
    }
  }, [selectedEditorRoomId]);

  // ── Tickets for indicator
  const { tickets } = useMaintenanceTickets(building?.id, building?.user_id);

  // Count only rentable units for the HUD badge
  const rentableUnitsCount = useMemo(() => {
    return units.filter(u => !u.element_type || u.element_type === "unit").length;
  }, [units]);

  // Live status counts for interactive bottom dock filter pills
  const statusCounts = useMemo(() => {
    const rentable = (optimisticUnits || units).filter(
      (u) => !u.element_type || u.element_type === "unit"
    );
    let occupied = 0;
    let overdue = 0;
    let vacant = 0;
    let maintenance = 0;
    rentable.forEach((u) => {
      if (u.status === "occupied") occupied++;
      else if (u.status === "overdue") overdue++;
      else vacant++;
      const hasTicket = tickets.some(
        (t) => (t.unit_id === u.id || t.unitId === u.id) && t.status !== "settled"
      );
      if (hasTicket) maintenance++;
    });
    return { occupied, overdue, vacant, maintenance };
  }, [units, optimisticUnits, tickets]);

  // Live search match count
  const searchMatchCount = useMemo(() => {
    if (!searchQuery.trim()) return 0;
    const q = searchQuery.toLowerCase();
    return (optimisticUnits || units).filter(
      (u) =>
        (!u.element_type || u.element_type === "unit") &&
        (u.unit_label?.toLowerCase().includes(q) ||
          u.tenant?.name?.toLowerCase().includes(q))
    ).length;
  }, [units, optimisticUnits, searchQuery]);

  // Derive unique floor list from units
  const floorList = useMemo(() => {
    const source = editMode ? editorRooms : units;
    const floors = [...new Set(source.map(u => u.floor || 1))].sort((a, b) => a - b);
    return floors;
  }, [units, editorRooms, editMode]);

  // Setup card — shown for new buildings (no name) OR when user clicks edit info
  const isNewBuilding = !building?.name;
  const [showSetupCard, setShowSetupCard] = useState(isNewBuilding);
  const [setupIsNew, setSetupIsNew] = useState(isNewBuilding);
  const [setupName, setSetupName] = useState(building?.name || "");
  const [setupAddress, setSetupAddress] = useState(building?.address || "");
  const [setupSaving, setSetupSaving] = useState(false);

  const openEditInfo = () => {
    setSetupName(building?.name || "");
    setSetupAddress(building?.address || "");
    setSetupIsNew(false);
    setShowSetupCard(true);
  };

  const handleSetupSave = async (e) => {
    e.preventDefault();
    if (!setupName.trim()) return;
    setSetupSaving(true);
    await onUpdateBuilding?.({ name: setupName.trim(), address: setupAddress.trim(), is_new: false });
    setSetupSaving(false);
    setShowSetupCard(false);
  };

  const handleSetupCancel = async () => {
    if (setupIsNew) {
      await onCancelNewBuilding?.();
    } else {
      setShowSetupCard(false);
    }
  };

  // Clone the current building's units into local editor state
  const handleEnterEditMode = () => {
    if (onSelectUnit) onSelectUnit(null);
    setEditorArchitecture(
      building?.architecture || {
        floor_height: 2.6,
        wall_material: wallFinish || "stucco",
        exterior_color: "#e5dacb",
        railing_style: "steel_grill",
        roof_type: "gable",
      }
    );
    setEditorRooms(units.map(u => ({
      id: u.id,
      ref: u.ref,
      unit_label: u.unit_label,
      floor: u.floor || 1,
      element_type: u.element_type || "unit",
      status: u.status || "vacant",
      monthly_rent: u.monthly_rent || 0,
      x: u.x ?? 0,
      z: u.z ?? 0,
      width: u.width ?? 2.6,
      depth: u.depth ?? 3.2,
      bounds: u.bounds || null,
      height: u.height ?? 2.6,
      rotation: u.rotation || 0,
      door_wall: u.door_wall || null,
      window_style: u.window_style || "standard",
      roof_type: u.roof_type || 'gable',
      material_type: u.material_type || 'stucco',
      texture_url: u.texture_url || null,
      wall_color: u.wall_color || '#e5dacb',
      has_balcony: !!u.has_balcony,
      balcony_side: u.balcony_side || 'S',
      balcony_depth: u.balcony_depth || 1.0,
      tenant: u.tenant || null
    })));
    setDeletedRoomIds([]);
    setSelectedEditorRoomId(null);
    setEditMode(true);
    if (!hasShownHint.current) {
      hasShownHint.current = true;
      setShowFirstEntryHint(true);
      setTimeout(() => setShowFirstEntryHint(false), 5500);
    }
  };

  // Replace current editorRooms with a template or Agent Blueprint JSON
  const handleApplyBlueprintRooms = (newRooms, newArch = null) => {
    // Mark any existing persisted units for deletion on save
    const existingIds = editorRooms
      .filter(r => !String(r.id).startsWith("new-temp-"))
      .map(r => r.id);
    setDeletedRoomIds(prev => [...new Set([...prev, ...existingIds])]);
    setEditorRooms(newRooms);
    if (newArch) {
      setEditorArchitecture(newArch);
    }
    setSelectedEditorRoomId(newRooms[0]?.id || null);
  };

  const handleAddRoom = () => {
    const newId = `new-temp-${Date.now()}`;
    const targetFloor = activeFloor !== 'All' ? Number(activeFloor) : 1;
    const floorRooms = editorRooms.filter(r => r.floor === targetFloor && (!r.element_type || r.element_type === "unit"));

    let maxNum = 0;
    floorRooms.forEach(r => {
      const match = (r.unit_label || "").match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        const seq = num % 100;
        if (seq > maxNum) maxNum = seq;
      }
    });

    const labelNum = String(maxNum + 1).padStart(2, '0');
    const unitLabel = `Unit ${targetFloor}${labelNum}`;

    const lastRoom = floorRooms[floorRooms.length - 1];
    const W = 3.0, D = 3.0;
    const x = lastRoom ? lastRoom.x + lastRoom.width / 2 + W / 2 : 0;
    const z = lastRoom ? lastRoom.z : 0;

    const newRoom = {
      id: newId,
      unit_label: unitLabel,
      floor: targetFloor,
      element_type: "unit",
      status: "vacant",
      monthly_rent: 0,
      x, z,
      width: W,
      depth: D,
      height: 2.2,
      roof_type: 'flat',
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
      has_balcony: false,
      balcony_side: 'S',
      balcony_depth: 1.0,
      tenant: null
    };

    setEditorRooms([...editorRooms, newRoom]);
    setSelectedEditorRoomId(newId);
  };

  const handleAddHallway = () => {
    const newId = `new-temp-${Date.now()}`;
    const targetFloor = activeFloor !== 'All' ? Number(activeFloor) : 1;
    const newCorridor = {
      id: newId,
      unit_label: `F${targetFloor} Corridor`,
      floor: targetFloor,
      element_type: "balcony_walkway",
      status: "vacant",
      monthly_rent: 0,
      x: 0,
      z: 2.5,
      width: 9.0,
      depth: 1.5,
      height: 2.2,
      rotation: 0,
      roof_type: 'flat',
      material_type: 'concrete',
      texture_url: null,
      wall_color: '#334155',
      has_balcony: false,
      balcony_side: 'S',
      balcony_depth: 1.0,
      tenant: null
    };
    setEditorRooms([...editorRooms, newCorridor]);
    setSelectedEditorRoomId(newId);
  };

  const handleAddStairwell = () => {
    const newId = `new-temp-${Date.now()}`;
    const targetFloor = activeFloor !== 'All' ? Number(activeFloor) : 1;
    const newStairs = {
      id: newId,
      unit_label: `F${targetFloor} Stairs`,
      floor: targetFloor,
      element_type: "stairwell",
      status: "vacant",
      monthly_rent: 0,
      x: 6.0,
      z: 0,
      width: 2.5,
      depth: 3.5,
      height: 2.2,
      rotation: 0,
      roof_type: 'flat',
      material_type: 'concrete',
      texture_url: null,
      wall_color: '#475569',
      has_balcony: false,
      balcony_side: 'S',
      balcony_depth: 1.0,
      tenant: null
    };
    setEditorRooms([...editorRooms, newStairs]);
    setSelectedEditorRoomId(newId);
  };

  const handleAddLShape = () => {
    const baseId = `new-temp-${Date.now()}`;
    const wingId = `new-temp-${Date.now() + 1}`;
    const baseW = 3.0, baseD = 3.0;
    const wingW = 3.0, wingD = 1.5;

    const allRooms = editorRooms.filter(r => (r.floor || 1) === 1);
    const maxX = allRooms.length > 0 ? Math.max(...allRooms.map(r => r.x + r.width / 2)) : -baseW / 2;
    const originX = maxX + baseW / 2 + 0.5;
    const originZ = 0;

    const baseRoom = {
      id: baseId,
      unit_label: `A${editorRooms.length + 1}`,
      floor: 1,
      element_type: "unit",
      status: "vacant",
      monthly_rent: 0,
      x: originX,
      z: originZ,
      width: baseW,
      depth: baseD,
      height: 2.2,
      roof_type: 'flat',
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
      has_balcony: false,
      balcony_side: 'S',
      balcony_depth: 1.0,
      tenant: null
    };

    const wingRoom = {
      id: wingId,
      unit_label: `A${editorRooms.length + 2}`,
      floor: 1,
      element_type: "unit",
      status: "vacant",
      monthly_rent: 0,
      x: originX + baseW / 2 + wingW / 2,
      z: (originZ + baseD / 2) - wingD / 2,
      width: wingW,
      depth: wingD,
      height: 2.2,
      roof_type: 'flat',
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
      has_balcony: false,
      balcony_side: 'S',
      balcony_depth: 1.0,
      tenant: null
    };

    setEditorRooms([...editorRooms, baseRoom, wingRoom]);
    setSelectedEditorRoomId(baseId);
  };

  const handleDeleteRoom = () => {
    if (!selectedEditorRoomId) return;
    if (!selectedEditorRoomId.startsWith("new-temp-")) {
      setDeletedRoomIds([...deletedRoomIds, selectedEditorRoomId]);
    }
    setEditorRooms(editorRooms.filter(r => r.id !== selectedEditorRoomId));
    setSelectedEditorRoomId(null);
  };

  const handleNudge = (dx, dz) => {
    if (!selectedEditorRoomId) return;
    setEditorRooms((rooms) =>
      rooms.map((r) => {
        if (r.id !== selectedEditorRoomId) return r;
        const nx = Math.round(((r.x || 0) + dx) * 10) / 10;
        const nz = Math.round(((r.z || 0) + dz) * 10) / 10;
        return { ...r, x: nx, z: nz };
      })
    );
  };

  const handleSave = async () => {
    try {
      if (onSaveLayout) {
        await onSaveLayout(editorRooms, deletedRoomIds, editorArchitecture);
      }
      setOptimisticUnits(editorRoomsToUnits(editorRooms));
      setEditMode(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
      setTimeout(() => setOptimisticUnits(null), 4000);
    } catch (err) {
      console.error("Failed to save layout:", err);
      alert("Failed to save layout, check console.");
    }
  };

  const [uploadingTexture, setUploadingTexture] = useState(false);

  const handleTextureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedEditorRoomId) return;
    setUploadingTexture(true);
    try {
      const url = await uploadFile(`buildings/${building?.id}/textures/${selectedEditorRoomId}_${Date.now()}`, file);
      setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, texture_url: url, material_type: 'custom' } : r));
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload texture");
    } finally {
      setUploadingTexture(false);
      e.target.value = null;
    }
  };

  const selectedRoom = editorRooms.find(r => r.id === selectedEditorRoomId);

  return (
    <div className="w-full h-full bg-[#0b0f13] relative font-sans">
      {!building ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0f13]">
          <Building2 size={48} className="mb-4 text-zinc-600 stroke-1" />
          <div className="text-[15px] font-semibold text-zinc-300 tracking-[-0.01em]">
            No Building Selected
          </div>
          <p className="mt-1 text-[12px] text-zinc-500">Pick a building from the dashboard</p>
        </div>
      ) : (
        <>
          {/* ── BUILDER GUIDE MODAL ──────────────────────────────────────── */}
          {showBuilderGuide && <BuilderGuideModal onClose={() => setShowBuilderGuide(false)} />}

          {/* ── AGENT BLUEPRINT & PRESETS MODAL ──────────────────────────── */}
          {showBlueprintModal && (
            <BlueprintImportModal
              building={building}
              editorRooms={editorRooms}
              onApplyRooms={handleApplyBlueprintRooms}
              onClose={() => setShowBlueprintModal(false)}
            />
          )}

          {/* ── REAL PHOTO FACADE & STREET CONTEXT MODAL ─────────────────── */}
          <SiteAndFacadeModal
            isOpen={showSiteFacadeModal}
            onClose={() => setShowSiteFacadeModal(false)}
            facadePhotos={facadePhotos}
            setFacadePhotos={setFacadePhotos}
            facadeOpacity={facadeOpacity}
            setFacadeOpacity={setFacadeOpacity}
            autoXRayOnSelect={autoXRayOnSelect}
            setAutoXRayOnSelect={setAutoXRayOnSelect}
            wallFinish={wallFinish}
            setWallFinish={setWallFinish}
            siteContext={siteContext}
            setSiteContext={setSiteContext}
            onPersistSiteAndFacade={handlePersistSiteAndFacade}
            isSaving={savingSiteFacade}
          />

          {/* ── SAVE SUCCESS TOAST ────────────────────────────────────────── */}
          {saveToast && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none animate-fade-down">
              <div className="pointer-events-auto flex items-center gap-2.5 bg-emerald-700 border border-emerald-500 shadow-2xl text-white rounded-2xl px-5 py-2.5 text-[13px] font-bold font-['Manrope']">
                <Check size={15} className="text-white shrink-0" />
                <span>Layout saved successfully!</span>
              </div>
            </div>
          )}

          {/* ── FIRST-ENTRY STUDIO HINT BANNER ───────────────────────────── */}
          {editMode && showFirstEntryHint && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none animate-fade-down">
              <div className="pointer-events-auto flex items-center gap-3 hud-surface rounded-2xl px-4 py-2.5 border-[#2270b8]/60">
                <Info size={15} className="text-[#479de9] shrink-0" />
                <span className="text-[12.5px] text-[#f0f6fc] font-medium font-['Manrope']">
                  Click any room to edit · Drag or nudge to align · Try &quot;AI Blueprint&quot; in the top bar!
                </span>
                <button
                  onClick={() => { setShowFirstEntryHint(false); setShowBuilderGuide(true); }}
                  className="press-scale ml-1 text-[11.5px] font-bold text-[#479de9] bg-[#2270b8]/20 border border-[#2270b8]/40 hover:bg-[#2270b8] hover:text-white px-2.5 py-1 rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Full Guide →
                </button>
                <button
                  onClick={() => setShowFirstEntryHint(false)}
                  title="Dismiss hint"
                  className="press-scale text-white/40 hover:text-white p-1 hover:bg-white/10 rounded-lg ml-0.5 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ZONE 1: TOP ARCHITECTURAL HEADER BAR (Unified Wayfinding, Lens & Actions)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="absolute top-3 inset-x-3 sm:top-4 sm:inset-x-4 z-30 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* ── Left Cluster: Wayfinding + Building Identity + Mode Badge ── */}
            <div className="pointer-events-auto flex items-center gap-2 hud-surface rounded-2xl p-1.5 pl-2.5 shrink-0 max-w-full">
              {onBack && !editMode && (
                <>
                  <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back to property dashboard"
                    title="Back to property dashboard"
                    className="press-scale text-white/70 hover:text-white bg-white/[0.06] hover:bg-white/[0.12] p-2 rounded-xl cursor-pointer"
                  >
                    <ArrowLeft size={15} />
                  </button>
                  <div className="h-5 w-px bg-[#262f38]" />
                </>
              )}

              <div className="flex flex-col leading-none px-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-bold text-[#f0f6fc] tracking-[-0.02em] leading-none font-['Sora'] truncate max-w-[160px] sm:max-w-[220px]">
                    {building.name || "Untitled Building"}
                  </span>
                  {!editMode && (
                    <button
                      type="button"
                      onClick={openEditInfo}
                      aria-label="Edit building name and address"
                      title="Edit building name and address"
                      className="press-scale text-[#8b949e] hover:text-[#479de9] p-1 rounded-md cursor-pointer shrink-0"
                    >
                      <Pencil size={11.5} />
                    </button>
                  )}
                </div>
                <span className="mt-1 text-[10.5px] text-[#8b949e] font-['Manrope'] font-medium truncate max-w-[170px] sm:max-w-[230px]">
                  {editMode
                    ? "BIM v3.0 Architectural Studio"
                    : building.address || "No street address set"}
                </span>
              </div>

              <div className="h-5 w-px bg-[#262f38]" />

              {!editMode ? (
                <div className="rounded-xl border border-[#2270b8]/35 bg-[#2270b8]/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#479de9] font-['Sora'] tabular-nums whitespace-nowrap">
                  {rentableUnitsCount} Units
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/35 bg-amber-500/15 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-amber-300 font-['Sora'] whitespace-nowrap">
                  Studio Mode
                </div>
              )}
            </div>

            {/* ── Center Cluster: Unified 3-State Spatial Lens Switcher ── */}
            <div className="pointer-events-auto flex items-center hud-surface rounded-2xl p-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (isWebGLSupported) {
                    setViewMode("3d");
                    setCutawayMode(false);
                  }
                }}
                disabled={!isWebGLSupported}
                title="Exterior 3D Shell (Roofs, Facade Cladding, Balconies & Storefront)"
                className={`press-scale flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold font-['Manrope'] ${
                  viewMode === "3d" && !cutawayMode
                    ? "bg-[#2270b8] text-white shadow-sm"
                    : isWebGLSupported
                      ? "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06] cursor-pointer"
                      : "text-zinc-600 opacity-40 cursor-not-allowed"
                }`}
              >
                <Building2 size={13} />
                <span>Exterior 3D</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isWebGLSupported) {
                    setViewMode("3d");
                    setCutawayMode(true);
                  }
                }}
                disabled={!isWebGLSupported}
                title="Dollhouse Cutaway 3D (Open Roofs, Hollow Room Walls & Interior Furniture)"
                className={`press-scale flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold font-['Manrope'] ${
                  viewMode === "3d" && cutawayMode
                    ? "bg-[#2270b8] text-white shadow-sm"
                    : isWebGLSupported
                      ? "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06] cursor-pointer"
                      : "text-zinc-600 opacity-40 cursor-not-allowed"
                }`}
              >
                <Eye size={13} />
                <span>Cutaway 3D</span>
              </button>

              {!editMode && (
                <button
                  type="button"
                  onClick={() => setViewMode("2d")}
                  title="2D Interactive Floorplan Blueprint"
                  className={`press-scale flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11.5px] font-bold font-['Manrope'] cursor-pointer ${
                    viewMode === "2d"
                      ? "bg-[#2270b8] text-white shadow-sm"
                      : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06]"
                  }`}
                >
                  <Grid size={13} />
                  <span>2D Plan</span>
                </button>
              )}
            </div>

            {/* ── Right Cluster: Search, Photo X-Ray, Site Context & Studio Actions ── */}
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 shrink-0">
              {!editMode && (
                <div
                  className={`flex items-center gap-2 hud-surface rounded-2xl px-3 py-1.5 transition-colors ${
                    searchQuery
                      ? "border-[#2270b8] ring-2 ring-[#2270b8]/30"
                      : ""
                  }`}
                >
                  <Search size={13.5} className="text-[#8b949e] shrink-0" />
                  <input
                    type="text"
                    aria-label="Search tenant or unit"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Find unit or tenant..."
                    className="bg-transparent outline-none text-[12px] text-[#f0f6fc] placeholder-[#8b949e] w-32 sm:w-40 font-['Manrope']"
                  />
                  {searchQuery && (
                    <span className="text-[10px] font-bold font-['Sora'] tabular-nums px-1.5 py-0.5 rounded-md bg-[#2270b8]/25 text-[#479de9] border border-[#2270b8]/40">
                      {searchMatchCount}
                    </span>
                  )}
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      aria-label="Clear search"
                      className="press-scale text-[#8b949e] hover:text-white p-0.5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}

              {/* Quick Photo X-Ray Slider when facade photos exist */}
              {viewMode === "3d" && hasAnyFacadePhoto && !cutawayMode && (
                <div className="flex items-center gap-2 hud-surface rounded-2xl px-3 py-1.5 border-[#479de9]/35">
                  <span className="text-[10.5px] font-bold text-[#93c5fd] font-['Manrope']">
                    X-Ray
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={facadeOpacity}
                    onChange={(e) => setFacadeOpacity(parseFloat(e.target.value))}
                    title="Blend between Real Building Photo and 3D Status Rooms"
                    className="w-16 accent-[#479de9] cursor-pointer"
                  />
                  <span className="text-[10px] font-['Sora'] tabular-nums text-[#f0f6fc]/80 w-7 text-right">
                    {Math.round(facadeOpacity * 100)}%
                  </span>
                </div>
              )}

              {/* Real Photos & Site Context Modal Trigger */}
              {viewMode === "3d" && (
                <button
                  type="button"
                  onClick={() => setShowSiteFacadeModal(true)}
                  title="Configure Front/Back/Side Facade Photos, Wall Finish & Street Landmarks"
                  className="press-scale flex items-center gap-1.5 hud-surface hover:border-[#479de9]/50 text-[#f0f6fc] px-3 py-2 rounded-2xl text-[11.5px] font-bold font-['Manrope'] cursor-pointer"
                >
                  <Camera size={13} className="text-[#479de9]" />
                  <span className="hidden sm:inline">Photos &amp; Site</span>
                </button>
              )}

              {!editMode ? (
                <button
                  type="button"
                  onClick={handleEnterEditMode}
                  title="Open 3D Architectural Studio to edit rooms, hallways, roofs, or import an AI Blueprint"
                  className="press-scale flex items-center gap-1.5 bg-[#2270b8] hover:bg-[#3186d6] text-white px-3.5 py-2 rounded-2xl text-[12px] font-bold font-['Manrope'] shadow-lg cursor-pointer"
                >
                  <Layers size={13.5} />
                  <span>Design Layout</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 hud-surface rounded-2xl p-1">
                  <button
                    type="button"
                    onClick={() => setShowBlueprintModal(true)}
                    title="Load a multi-story architectural template or paste an Agent Blueprint JSON"
                    className="press-scale flex items-center gap-1.5 bg-[#0b3860] border border-[#479de9]/40 hover:bg-[#154e83] text-white px-3 py-1.5 rounded-xl text-[11.5px] font-bold font-['Manrope'] cursor-pointer"
                  >
                    <Sparkles size={13} className="text-[#479de9]" />
                    <span>AI Blueprint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBuilderGuide(true)}
                    title="Open 3D Builder Guide (Esc to close)"
                    className="press-scale flex items-center gap-1 text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06] px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold font-['Manrope'] cursor-pointer"
                  >
                    <HelpCircle size={13.5} />
                    <span className="hidden md:inline">Guide</span>
                  </button>
                  <div className="h-4 w-px bg-[#262f38]" />
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    title="Discard unsaved changes and return to viewing mode"
                    className="press-scale flex items-center gap-1 text-[#8b949e] hover:text-white hover:bg-white/[0.08] px-2.5 py-1.5 rounded-xl text-[11.5px] font-semibold font-['Manrope'] cursor-pointer"
                  >
                    <X size={13} />
                    <span>Discard</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    title="Save all layout & architectural changes"
                    className="press-scale flex items-center gap-1 bg-[#2270b8] hover:bg-[#3186d6] text-white px-3 py-1.5 rounded-xl text-[11.5px] font-bold font-['Manrope'] shadow-md cursor-pointer"
                  >
                    <Check size={13} />
                    <span>Save Layout</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile tip banner (No raw emoji, clean SVG icon) */}
          {!mobileTipDismissed && (
            <div className="md:hidden absolute top-20 inset-x-3 z-20 pointer-events-none flex justify-center animate-fade-down">
              <div className="pointer-events-auto hud-surface text-[#8b949e] text-[11px] font-medium px-3.5 py-1.5 rounded-full flex items-center gap-2">
                <Info size={12} className="text-[#479de9] shrink-0" />
                <span>Pinch to zoom · One finger to orbit · Tap any room</span>
                <button
                  type="button"
                  onClick={() => setMobileTipDismissed(true)}
                  className="text-white/40 hover:text-white p-0.5 rounded cursor-pointer"
                  aria-label="Dismiss tip"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── VIEW MODE NAVIGATION HINT (Bottom-Right, subtle) ────────────── */}
          {!editMode && viewMode === "3d" && !navTipDismissed && !selectedUnitId && (
            <div className="hidden lg:block absolute bottom-4 right-4 z-20 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2 hud-surface rounded-xl px-3 py-1.5 text-white">
                <div className="flex items-center gap-1.5 text-[10.5px] font-['Manrope'] text-[#8b949e]">
                  <span className="flex items-center gap-1 text-[#f0f6fc] font-semibold">
                    <MousePointer size={11} className="text-[#479de9]" /> Drag
                  </span>
                  <span>orbit</span>
                  <span className="text-white/20">·</span>
                  <span>Right-drag pan</span>
                  <span className="text-white/20">·</span>
                  <span>Scroll zoom</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNavTipDismissed(true)}
                  aria-label="Dismiss navigation tip"
                  title="Dismiss navigation tip"
                  className="press-scale ml-1 text-[#8b949e] hover:text-white p-0.5 rounded cursor-pointer"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ZONE 3: RIGHT CONTEXTUAL OBSIDIAN 2-TAB STUDIO INSPECTOR
              (Obeys DESIGN.md Dual-World Doctrine: #141a21 Obsidian Darkroom)
             ══════════════════════════════════════════════════════════════════ */}
          {editMode && (
            <div className="absolute top-20 right-3 sm:right-4 z-20 pointer-events-none w-[calc(100vw-1.5rem)] sm:w-80">
              <div className="pointer-events-auto hud-surface rounded-2xl overflow-hidden flex flex-col max-h-[calc(100vh-9.5rem)] text-[#f0f6fc]">
                {/* Persistent 2-Tab Header Switcher */}
                <div className="grid grid-cols-2 gap-1 p-1.5 bg-[#0b0f13]/60 border-b border-[#262f38]">
                  <button
                    type="button"
                    onClick={() => setStudioTab("space")}
                    className={`press-scale flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-[11px] font-bold font-['Manrope'] cursor-pointer ${
                      studioTab === "space"
                        ? "bg-[#2270b8] text-white shadow-sm"
                        : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.04]"
                    }`}
                  >
                    <Box size={12.5} />
                    <span>Space &amp; Room</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStudioTab("building")}
                    className={`press-scale flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl text-[11px] font-bold font-['Manrope'] cursor-pointer ${
                      studioTab === "building"
                        ? "bg-[#2270b8] text-white shadow-sm"
                        : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.04]"
                    }`}
                  >
                    <Building2 size={12.5} />
                    <span>Building &amp; Roof</span>
                  </button>
                </div>

                {/* Tab 1: Space & Room Inspector */}
                {studioTab === "space" ? (
                  <div className="p-3.5 overflow-y-auto space-y-3.5">
                    {/* Quick Space Selector Dropdown */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] font-['Manrope']">
                          Active Space ({editorRooms.length})
                        </label>
                        {selectedRoom && (
                          <span className="text-[10px] text-[#8b949e] font-['Sora'] tabular-nums">
                            F{selectedRoom.floor || 1}
                          </span>
                        )}
                      </div>
                      <select
                        value={selectedEditorRoomId || ""}
                        onChange={(e) => setSelectedEditorRoomId(e.target.value || null)}
                        className="w-full bg-[#0b0f13] border border-[#262f38] focus:border-[#2270b8] rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none cursor-pointer"
                      >
                        <option value="">— Click a 3D volume or choose here —</option>
                        {editorRooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            [F{r.floor || 1}] {r.unit_label || "Untitled"} ({r.element_type || "unit"})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedRoom ? (
                      <>
                        {/* Identity & Role */}
                        <div className="border-t border-[#262f38] pt-3 space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              aria-label="Unit label"
                              className="font-bold text-[#f0f6fc] font-['Sora'] text-[13.5px] bg-[#0b0f13] border border-[#262f38] rounded-xl px-2.5 py-1.5 outline-none focus:border-[#2270b8] flex-1 min-w-0"
                              value={selectedRoom.unit_label}
                              placeholder="e.g. Unit 101, F1 Corridor"
                              onChange={(e) =>
                                setEditorRooms(
                                  editorRooms.map((r) =>
                                    r.id === selectedEditorRoomId
                                      ? { ...r, unit_label: e.target.value }
                                      : r
                                  )
                                )
                              }
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="Rotate 90° clockwise"
                                onClick={() => {
                                  const cur = selectedRoom.rotation || 0;
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, rotation: (cur + 90) % 360 }
                                        : r
                                    )
                                  );
                                }}
                                className="press-scale text-[#479de9] bg-[#2270b8]/15 hover:bg-[#2270b8]/25 p-2 rounded-xl border border-[#2270b8]/30 cursor-pointer"
                              >
                                <RotateCw size={13.5} />
                              </button>
                              <button
                                type="button"
                                title="Delete space from layout"
                                onClick={handleDeleteRoom}
                                className="press-scale text-rose-400 bg-rose-500/15 hover:bg-rose-500/25 p-2 rounded-xl border border-rose-500/30 cursor-pointer"
                              >
                                <Trash2 size={13.5} />
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                              Architectural Role
                            </label>
                            <select
                              className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2.5 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                              value={selectedRoom.element_type || "unit"}
                              onChange={(e) =>
                                setEditorRooms(
                                  editorRooms.map((r) =>
                                    r.id === selectedEditorRoomId
                                      ? { ...r, element_type: e.target.value }
                                      : r
                                  )
                                )
                              }
                            >
                              <option value="unit">Rentable Room / Unit</option>
                              <option value="common_area">Lobby / Common Amenity</option>
                              <option value="balcony_walkway">Exterior Walk-Up Corridor</option>
                              <option value="hallway">Interior Hallway / Corridor</option>
                              <option value="stairwell">3D Stairwell Core</option>
                              <option value="elevator">Elevator Shaft Core</option>
                            </select>
                          </div>
                        </div>

                        {/* Position & 0.5m Nudge Controls */}
                        <div className="border-t border-[#262f38] pt-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] font-['Manrope']">
                              Coordinates
                            </span>
                            <span className="text-[11px] font-['Sora'] tabular-nums text-[#f0f6fc]/80 font-semibold">
                              X: {Number(selectedRoom.x || 0).toFixed(1)}m · Z: {Number(selectedRoom.z || 0).toFixed(1)}m
                            </span>
                          </div>
                          <div className="flex items-center justify-between bg-[#0b0f13] border border-[#262f38] rounded-xl p-1.5 px-2.5">
                            <span className="text-[11px] text-[#8b949e] font-['Manrope']">
                              0.5m Nudge
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleNudge(-0.5, 0)}
                                title="Nudge Left (-0.5m)"
                                className="press-scale h-7 w-7 rounded-lg bg-[#141a21] hover:bg-[#2270b8] text-[#f0f6fc] border border-[#262f38] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronLeft size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleNudge(0, -0.5)}
                                title="Nudge North (-0.5m)"
                                className="press-scale h-7 w-7 rounded-lg bg-[#141a21] hover:bg-[#2270b8] text-[#f0f6fc] border border-[#262f38] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronUp size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleNudge(0, 0.5)}
                                title="Nudge South (+0.5m)"
                                className="press-scale h-7 w-7 rounded-lg bg-[#141a21] hover:bg-[#2270b8] text-[#f0f6fc] border border-[#262f38] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronDown size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleNudge(0.5, 0)}
                                title="Nudge Right (+0.5m)"
                                className="press-scale h-7 w-7 rounded-lg bg-[#141a21] hover:bg-[#2270b8] text-[#f0f6fc] border border-[#262f38] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronRight size={13} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Floor, Dimensions, Doorway & Facade Style */}
                        <div className="border-t border-[#262f38] pt-3 space-y-2.5">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Floor Level
                              </label>
                              <select
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                                value={selectedRoom.floor}
                                onChange={(e) =>
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, floor: parseInt(e.target.value, 10) }
                                        : r
                                    )
                                  )
                                }
                              >
                                <option value={1}>Floor 1</option>
                                <option value={2}>Floor 2</option>
                                <option value={3}>Floor 3</option>
                                <option value={4}>Floor 4</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Doorway Wall
                              </label>
                              <select
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                                value={selectedRoom.door_wall || ""}
                                onChange={(e) =>
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, door_wall: e.target.value || null }
                                        : r
                                    )
                                  )
                                }
                              >
                                <option value="">Auto (Towards Hall)</option>
                                <option value="S">South (Front)</option>
                                <option value="N">North (Back)</option>
                                <option value="E">East (Right)</option>
                                <option value="W">West (Left)</option>
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Width (m)
                              </label>
                              <input
                                type="number"
                                step="0.2"
                                min="1.0"
                                max="24.0"
                                value={Number(selectedRoom.width || 3.0)}
                                onChange={(e) => {
                                  const w = Math.max(1.0, parseFloat(e.target.value) || 3.0);
                                  setEditorRooms(
                                    editorRooms.map((r) => {
                                      if (r.id !== selectedEditorRoomId) return r;
                                      const cx = Number(r.x || 0);
                                      const cz = Number(r.z || 0);
                                      const d = Number(r.depth || 3.4);
                                      return {
                                        ...r,
                                        width: w,
                                        bounds: [
                                          Number((cx - w / 2).toFixed(3)),
                                          Number((cz - d / 2).toFixed(3)),
                                          Number((cx + w / 2).toFixed(3)),
                                          Number((cz + d / 2).toFixed(3)),
                                        ],
                                      };
                                    })
                                  );
                                }}
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2.5 py-1.5 text-[12px] font-['Sora'] tabular-nums text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Depth (m)
                              </label>
                              <input
                                type="number"
                                step="0.2"
                                min="1.0"
                                max="24.0"
                                value={Number(selectedRoom.depth || 3.4)}
                                onChange={(e) => {
                                  const d = Math.max(1.0, parseFloat(e.target.value) || 3.4);
                                  setEditorRooms(
                                    editorRooms.map((r) => {
                                      if (r.id !== selectedEditorRoomId) return r;
                                      const cx = Number(r.x || 0);
                                      const cz = Number(r.z || 0);
                                      const w = Number(r.width || 3.0);
                                      return {
                                        ...r,
                                        depth: d,
                                        bounds: [
                                          Number((cx - w / 2).toFixed(3)),
                                          Number((cz - d / 2).toFixed(3)),
                                          Number((cx + w / 2).toFixed(3)),
                                          Number((cz + d / 2).toFixed(3)),
                                        ],
                                      };
                                    })
                                  );
                                }}
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2.5 py-1.5 text-[12px] font-['Sora'] tabular-nums text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Glazing Style
                              </label>
                              <select
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                                value={selectedRoom.window_style || "standard"}
                                onChange={(e) =>
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, window_style: e.target.value }
                                        : r
                                    )
                                  )
                                }
                              >
                                <option value="standard">Standard Casement</option>
                                <option value="wide">Floor-to-Ceiling Wide</option>
                                <option value="storefront">Lobby Storefront + Canopy</option>
                                <option value="high">High Transom</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                                Cladding Zone
                              </label>
                              <select
                                className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                                value={selectedRoom.material_type || "stucco"}
                                onChange={(e) =>
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, material_type: e.target.value }
                                        : r
                                    )
                                  )
                                }
                              >
                                <option value="stucco">Primary Facade</option>
                                <option value="dark_brick">Dark Brick Accent Pier</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Private Balcony Controls */}
                        {(!selectedRoom.element_type || selectedRoom.element_type === "unit") && (
                          <div className="border-t border-[#262f38] pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] font-['Manrope']">
                                Cantilevered Balcony
                              </span>
                              <input
                                type="checkbox"
                                checked={!!selectedRoom.has_balcony}
                                onChange={(e) =>
                                  setEditorRooms(
                                    editorRooms.map((r) =>
                                      r.id === selectedEditorRoomId
                                        ? { ...r, has_balcony: e.target.checked }
                                        : r
                                    )
                                  )
                                }
                                className="h-4 w-4 accent-[#2270b8] rounded cursor-pointer"
                              />
                            </div>
                            {selectedRoom.has_balcony && (
                              <div className="grid grid-cols-2 gap-2 bg-[#0b0f13] border border-[#262f38] rounded-xl p-2.5">
                                <div>
                                  <label className="block text-[10px] font-medium text-[#8b949e] mb-1">
                                    Facade Side
                                  </label>
                                  <select
                                    className="w-full bg-[#141a21] border border-[#262f38] rounded-lg px-2 py-1 text-[11.5px] text-[#f0f6fc] outline-none"
                                    value={selectedRoom.balcony_side || "S"}
                                    onChange={(e) =>
                                      setEditorRooms(
                                        editorRooms.map((r) =>
                                          r.id === selectedEditorRoomId
                                            ? { ...r, balcony_side: e.target.value }
                                            : r
                                        )
                                      )
                                    }
                                  >
                                    <option value="S">Front (South)</option>
                                    <option value="N">Back (North)</option>
                                    <option value="E">Right (East)</option>
                                    <option value="W">Left (West)</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] font-medium text-[#8b949e] mb-1 font-['Sora'] tabular-nums">
                                    Depth ({selectedRoom.balcony_depth || 1.0}m)
                                  </label>
                                  <input
                                    type="range"
                                    min="0.8"
                                    max="1.8"
                                    step="0.2"
                                    value={selectedRoom.balcony_depth || 1.0}
                                    onChange={(e) =>
                                      setEditorRooms(
                                        editorRooms.map((r) =>
                                          r.id === selectedEditorRoomId
                                            ? { ...r, balcony_depth: parseFloat(e.target.value) }
                                            : r
                                        )
                                      )
                                    }
                                    className="w-full accent-[#479de9] mt-1.5 cursor-pointer"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="rounded-xl bg-[#0b0f13]/70 border border-[#262f38] p-4 text-center space-y-2">
                        <MousePointer size={18} className="mx-auto text-[#479de9]" />
                        <div className="text-[12px] font-bold text-[#f0f6fc] font-['Sora']">
                          No Space Selected
                        </div>
                        <p className="text-[11px] text-[#8b949e] font-['Manrope'] leading-relaxed">
                          Click any room, hallway, or stairwell in the 3D scene (or choose from the dropdown above) to edit its dimensions, glazing, and balcony.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Tab 2: Building & Roof Studio */
                  <div className="p-3.5 overflow-y-auto space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#479de9] font-['Manrope']">
                          Whole-Building Envelope
                        </span>
                        <span className="text-[10px] font-semibold text-[#8b949e] font-['Sora']">
                          BIM v3.0
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8b949e] font-['Manrope'] mt-0.5">
                        Configure the overarching roof geometry, facade cladding, and balcony balustrade style.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 border-t border-[#262f38] pt-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                          Roof Profile
                        </label>
                        <select
                          className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                          value={editorArchitecture?.roof_type || "gable"}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setEditorArchitecture((prev) => ({
                              ...(prev || {}),
                              roof_type: newType,
                              roofs:
                                Array.isArray(prev?.roofs) && prev.roofs.length > 0
                                  ? prev.roofs.map((r, idx) =>
                                      idx === 0 ? { ...r, type: newType } : r
                                    )
                                  : undefined,
                            }));
                          }}
                        >
                          <option value="gable">Pitched Gable</option>
                          <option value="hip">Suburban Hip Roof</option>
                          <option value="shed">Modern Shed (Mono)</option>
                          <option value="flat_parapet">Flat Parapet + Penthouse</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                          Roof Finish
                        </label>
                        <select
                          className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                          value={editorArchitecture?.roof_material || "metal_rib"}
                          onChange={(e) => {
                            const newMat = e.target.value;
                            setEditorArchitecture((prev) => ({
                              ...(prev || {}),
                              roof_material: newMat,
                              roofs:
                                Array.isArray(prev?.roofs) && prev.roofs.length > 0
                                  ? prev.roofs.map((r, idx) =>
                                      idx === 0 ? { ...r, material: newMat } : r
                                    )
                                  : undefined,
                            }));
                          }}
                        >
                          <option value="metal_rib">Ribbed Metal</option>
                          <option value="clay_tile">Terracotta Clay</option>
                          <option value="concrete">Concrete Deck</option>
                          <option value="slate">Charcoal Slate</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 border-t border-[#262f38] pt-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                          Wall Texture
                        </label>
                        <select
                          className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                          value={editorArchitecture?.wall_material || wallFinish || "concrete"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setWallFinish(val);
                            setEditorArchitecture((prev) => ({
                              ...(prev || {}),
                              wall_material: val,
                            }));
                          }}
                        >
                          <option value="concrete">Plaster Concrete</option>
                          <option value="stucco">Warm Stucco</option>
                          <option value="brick">Exposed Brick</option>
                          <option value="wood">Timber Cladding</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-1 font-['Manrope']">
                          Balustrade
                        </label>
                        <select
                          className="w-full bg-[#0b0f13] border border-[#262f38] rounded-xl px-2 py-1.5 text-[12px] font-semibold text-[#f0f6fc] outline-none focus:border-[#2270b8]"
                          value={editorArchitecture?.railing_style || "glass"}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditorArchitecture((prev) => ({
                              ...(prev || {}),
                              railing_style: val,
                            }));
                          }}
                        >
                          <option value="glass">Tempered Glass</option>
                          <option value="steel_grill">Architectural Steel</option>
                        </select>
                      </div>
                    </div>

                    <div className="border-t border-[#262f38] pt-3">
                      <label className="block text-[10px] font-bold uppercase tracking-[0.06em] text-[#8b949e] mb-2 font-['Manrope']">
                        Primary Facade Tint
                      </label>
                      <div className="flex items-center gap-2">
                        {[
                          ["#d8dde2", "106 Maple Cool Grey"],
                          ["#e2e8f0", "Cool Plaster"],
                          ["#f3efe6", "Warm Cream"],
                          ["#cbd5e1", "Architectural Slate"],
                          ["#d9ccbc", "Sandstone"],
                        ].map(([hex, label]) => (
                          <button
                            key={hex}
                            type="button"
                            title={label}
                            onClick={() =>
                              setEditorArchitecture((prev) => ({
                                ...(prev || {}),
                                exterior_color: hex,
                              }))
                            }
                            className={`press-scale w-7 h-7 rounded-full border-2 cursor-pointer ${
                              (editorArchitecture?.exterior_color || "#e2e8f0") === hex
                                ? "border-[#479de9] scale-110 shadow-md"
                                : "border-[#262f38] hover:scale-105"
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              ZONE 2: BOTTOM SPATIAL COMMAND DOCK
              (Floor Isolator + Camera Presets + Interactive Tenancy Filter Pills / Builder Tools)
             ══════════════════════════════════════════════════════════════════ */}
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full max-w-[calc(100vw-1.5rem)] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 hud-surface rounded-2xl px-2.5 sm:px-3 py-1.5 text-[#f0f6fc] max-w-full overflow-x-auto no-scrollbar">
              {/* Camera Presets */}
              {viewMode === "3d" && (
                <>
                  <div className="flex items-center gap-0.5 rounded-xl bg-[#0b0f13]/70 p-0.5 border border-[#262f38]/80">
                    {[
                      ["isometric", "Iso", <Box size={12.5} key="box" />, "Isometric 3D perspective view"],
                      ["top-down", "Top", <Grid size={12.5} key="grid" />, "Top-down orthographic floorplan angle"],
                      ["front", "Front", <Square size={12.5} key="sq" />, "Front elevation view"],
                    ].map(([preset, label, icon, tip]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCameraPreset(preset)}
                        title={tip}
                        className={`press-scale flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold font-['Manrope'] cursor-pointer ${
                          cameraPreset === preset
                            ? "bg-[#2270b8] text-white shadow-sm"
                            : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06]"
                        }`}
                      >
                        {icon}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-[#262f38] shrink-0" />

                  {/* Pin Visibility Controls (Auto · All · Off) */}
                  <div className="flex items-center gap-0.5 rounded-xl bg-[#0b0f13]/70 p-0.5 border border-[#262f38]/80">
                    <div className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-[#8b949e] font-['Manrope'] hidden sm:flex items-center gap-1">
                      <Tag size={11} className="text-[#479de9]" />
                      <span>Pins</span>
                    </div>
                    {[
                      ["auto", "Auto", "Show pins on hover, selection, search/filter, or floor isolation"],
                      ["all", "All", "Show all unit pins across building"],
                      ["off", "Off", "Pristine view (labels on hover only)"],
                    ].map(([mode, label, tip]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPinMode(mode)}
                        title={tip}
                        className={`press-scale px-2 py-1.5 rounded-lg text-[10.5px] font-bold font-['Manrope'] cursor-pointer ${
                          pinMode === mode
                            ? "bg-[#2270b8] text-white shadow-sm"
                            : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-[#262f38] shrink-0" />
                </>
              )}

              {/* Floor Isolator */}
              {floorList.length > 1 && (
                <>
                  <div className="flex items-center gap-0.5 rounded-xl bg-[#0b0f13]/70 p-0.5 border border-[#262f38]/80">
                    {["All", ...floorList].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setActiveFloor(f)}
                        title={
                          f === "All"
                            ? "View all floors stacked"
                            : `Isolate Floor ${f} (opens cutaway interior)`
                        }
                        className={`press-scale px-2.5 py-1.5 rounded-lg text-[11px] font-bold font-['Sora'] tabular-nums cursor-pointer ${
                          activeFloor === f
                            ? "bg-[#2270b8] text-white shadow-sm"
                            : "text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.06]"
                        }`}
                      >
                        {f === "All" ? "All" : `F${f}`}
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-[#262f38] shrink-0" />
                </>
              )}

              {/* Studio Mode: Quick Add Primitives | View Mode: Interactive Status Filter Pills */}
              {editMode ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAddRoom}
                    title="Add a new rentable room unit"
                    className="press-scale flex items-center gap-1 bg-[#2270b8] hover:bg-[#3186d6] text-white px-2.5 py-1.5 rounded-xl text-[11px] font-bold font-['Manrope'] shadow-sm cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={12.5} /> Room
                  </button>
                  <button
                    type="button"
                    onClick={handleAddHallway}
                    title="Add a corridor or walk-up hallway segment"
                    className="press-scale flex items-center gap-1 bg-[#0b0f13] hover:bg-white/[0.08] border border-[#262f38] text-[#f0f6fc] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={12.5} /> Hallway
                  </button>
                  <button
                    type="button"
                    onClick={handleAddStairwell}
                    title="Add a 3D stairwell core connecting floors"
                    className="press-scale flex items-center gap-1 bg-[#0b0f13] hover:bg-white/[0.08] border border-[#262f38] text-[#f0f6fc] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] cursor-pointer whitespace-nowrap"
                  >
                    <Plus size={12.5} /> Stairs
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLShape}
                    title="Add two connected rooms in an L-shaped wing"
                    className="press-scale flex items-center gap-1 bg-[#0b0f13] hover:bg-white/[0.08] border border-[#262f38] text-[#f0f6fc] px-2.5 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] cursor-pointer whitespace-nowrap"
                  >
                    <CopyPlus size={12.5} /> L-Wing
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {[
                    {
                      key: "occupied",
                      label: "Occupied",
                      dot: "#d98a53",
                      count: statusCounts.occupied,
                      activeClass: "bg-[#d98a53]/20 border-[#d98a53] text-white",
                    },
                    {
                      key: "overdue",
                      label: "Overdue",
                      dot: "#e05c5c",
                      count: statusCounts.overdue,
                      activeClass: "bg-[#e05c5c]/20 border-[#e05c5c] text-white",
                    },
                    {
                      key: "vacant",
                      label: "Vacant",
                      dot: "#6e8592",
                      count: statusCounts.vacant,
                      activeClass: "bg-[#6e8592]/25 border-[#6e8592] text-white",
                    },
                    ...(statusCounts.maintenance > 0
                      ? [
                          {
                            key: "maintenance",
                            label: "Repairs",
                            dot: "#fbbf24",
                            count: statusCounts.maintenance,
                            activeClass: "bg-amber-500/20 border-amber-400 text-amber-200",
                          },
                        ]
                      : []),
                  ].map((item) => {
                    const isActive = statusFilter === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setStatusFilter((prev) => (prev === item.key ? "all" : item.key))
                        }
                        title={
                          isActive
                            ? `Showing only ${item.label} units (click to show all)`
                            : `Filter 3D/2D view to ${item.label} units (${item.count})`
                        }
                        className={`press-scale flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold font-['Manrope'] cursor-pointer whitespace-nowrap ${
                          isActive
                            ? item.activeClass
                            : "bg-transparent border-transparent text-[#8b949e] hover:text-[#f0f6fc] hover:bg-white/[0.05]"
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ background: item.dot }}
                        />
                        <span>{item.label}</span>
                        <span className="text-[10.5px] font-bold font-['Sora'] tabular-nums opacity-75">
                          {item.count}
                        </span>
                      </button>
                    );
                  })}

                  {statusFilter !== "all" && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter("all")}
                      title="Clear status filter"
                      className="press-scale ml-0.5 px-2 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-[10.5px] font-bold text-[#f0f6fc] cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {viewMode === "2d" && !editMode ? (
            <Blueprint2DView
              units={optimisticUnits || units}
              tickets={tickets}
              selectedUnitId={selectedUnitId}
              onSelectUnit={onSelectUnit}
              activeFloor={activeFloor}
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              hoveredUnitId={hoveredUnitId}
              onHover={setHoveredUnitId}
              onEnterEditMode={handleEnterEditMode}
              siteContext={siteContext}
              buildingAddress={building?.address || ""}
            />
          ) : (
            <WebGLErrorBoundary onSwitchTo2D={() => setViewMode("2d")}>
              <Canvas
                shadows={false}
                style={{ background: "#0b0f13", width: "100%", height: "100%" }}
                dpr={perfProfile.dpr}
                performance={{ min: 0.5 }}
                camera={{ position: [11, 9, 13], fov: 38 }}
                gl={{
                  antialias: perfProfile.antialias,
                  powerPreference: "high-performance",
                  preserveDrawingBuffer: false,
                  failIfMajorPerformanceCaveat: false,
                  precision: perfProfile.precision,
                  depth: true,
                  stencil: false,
                }}
                onCreated={({ gl }) => {
                  gl.setClearColor(0x0b0f13, 1);
                }}
                onPointerMissed={() => {
                  if (editMode) {
                    setSelectedEditorRoomId(null);
                  } else if (onSelectUnit) {
                    onSelectUnit(null);
                  }
                }}
              >
                <color attach="background" args={[0x0b0f13]} />
                <fog attach="fog" args={[0x0b0f13, 45, 110]} />

                <ambientLight intensity={perfProfile.isLowPower ? 1.25 : 1.1} color="#f0f6fc" />
                <hemisphereLight args={["#ffffff", "#243444", perfProfile.isLowPower ? 0.6 : 0.85]} />
                <directionalLight position={[12, 18, 10]} intensity={1.5} color="#fffaf5" />
                {!perfProfile.isLowPower && (
                  <directionalLight position={[-10, 12, -8]} intensity={0.8} color="#8ec5fc" />
                )}

                <Ground onGroundClick={() => {
                  if (editMode) {
                    setSelectedEditorRoomId(null);
                  } else if (onSelectUnit) {
                    onSelectUnit(null);
                  }
                }} />

                <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0, 16, 32]} />
                  <meshBasicMaterial color="#000000" opacity={0.25} transparent depthWrite={false} />
                </mesh>

                {!editMode ? (
                  <Building
                    building={building}
                    units={optimisticUnits || units}
                    tickets={tickets}
                    selectedUnitId={selectedUnitId}
                    onSelectUnit={onSelectUnit}
                    activeFloor={activeFloor}
                    searchQuery={searchQuery}
                    statusFilter={statusFilter}
                    pinMode={pinMode}
                    hoveredUnitId={hoveredUnitId}
                    onHover={setHoveredUnitId}
                    isOrbiting={isOrbiting}
                    isLowPower={perfProfile.isLowPower}
                    cutawayMode={cutawayMode}
                    wallFinish={wallFinish}
                    facadePhotos={facadePhotos}
                    facadeOpacity={facadeOpacity}
                    autoXRayOnSelect={autoXRayOnSelect}
                    siteContext={siteContext}
                    buildingAddress={building?.address || ""}
                    isEditMode={false}
                  />
                ) : (
                  <Building
                    building={{
                      ...(building || {}),
                      architecture: editorArchitecture,
                    }}
                    units={editorRooms}
                    tickets={tickets}
                    selectedUnitId={selectedEditorRoomId}
                    onSelectUnit={(u) => setSelectedEditorRoomId(u?.id || null)}
                    activeFloor={activeFloor}
                    searchQuery=""
                    statusFilter="all"
                    pinMode={pinMode}
                    hoveredUnitId={hoveredUnitId}
                    onHover={setHoveredUnitId}
                    isOrbiting={isOrbiting}
                    isLowPower={perfProfile.isLowPower}
                    cutawayMode={cutawayMode}
                    wallFinish={editorArchitecture?.wall_material || wallFinish}
                    facadePhotos={facadePhotos}
                    facadeOpacity={facadeOpacity}
                    autoXRayOnSelect={false}
                    siteContext={siteContext}
                    buildingAddress={building?.address || ""}
                    isEditMode={true}
                  />
                )}

                <CameraController
                  selectedUnit={
                    editMode
                      ? editorRooms.find((u) => u.id === selectedEditorRoomId)
                      : units.find((u) => u.id === selectedUnitId)
                  }
                  isEditMode={editMode}
                  cameraPreset={cameraPreset}
                />

                <OrbitControls
                  makeDefault
                  target={[0, 1.4, 0]}
                  minPolarAngle={0.02}
                  maxPolarAngle={Math.PI / 2 - 0.05}
                  minDistance={3}
                  maxDistance={45}
                  enableDamping
                  dampingFactor={perfProfile.isLowPower ? 0.12 : 0.09}
                  rotateSpeed={perfProfile.isLowPower ? 0.85 : 1.0}
                  touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
                  screenSpacePanning={false}
                  onStart={() => setIsOrbiting(true)}
                  onEnd={() => setIsOrbiting(false)}
                />
              </Canvas>
            </WebGLErrorBoundary>
          )}

          {/* ── Empty State Callout when 0 rooms created in 3D ── */}
          {units.length === 0 && !editMode && viewMode === "3d" && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
              <div className="pointer-events-auto max-w-md rounded-2xl bg-zinc-900 border border-white/10 p-6 shadow-2xl space-y-3">
                <div className="h-12 w-12 mx-auto rounded-2xl bg-[#2270b8]/20 border border-[#2270b8]/30 flex items-center justify-center text-[#479de9]">
                  <Box size={24} />
                </div>
                <h3 className="text-[16px] font-bold text-white font-['Sora']">No Rooms Added Yet</h3>
                <p className="text-[12px] text-zinc-400 font-['Manrope'] leading-relaxed">
                  Start from a multi-story template (with hallways, balconies &amp; stairs), paste a free Agent-drafted Blueprint JSON, or build room-by-room.
                </p>
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => {
                      handleEnterEditMode();
                      setShowBlueprintModal(true);
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#0b3860] hover:bg-[#154e83] border border-[#479de9]/40 text-white text-[12.5px] font-bold font-['Manrope'] transition shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles size={14} className="text-[#479de9]" /> AI Blueprint / Presets
                  </button>
                  <button
                    onClick={handleEnterEditMode}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[12.5px] font-bold font-['Manrope'] transition shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={15} /> Build Manually
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Floating Setup Card ─────────────────────────────────────────── */}
          {showSetupCard && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0b0f13]/80 p-4">
              <div className="relative w-[440px] max-w-full rounded-3xl border border-white/10 bg-[#161c22] p-8 shadow-2xl" style={{ boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-[#2270b8] opacity-20 blur-3xl" />

                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#2270b8]/20 text-[#2270b8]">
                      {setupIsNew ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      )}
                    </div>
                    <div>
                      <h2 className="text-[18px] font-bold text-white tracking-[-0.02em]">
                        {setupIsNew ? 'New Building' : 'Edit Building Info'}
                      </h2>
                      <p className="text-[12px] text-white/40">
                        {setupIsNew ? 'Set the details, then build in 3D' : 'Update your building name and address'}
                      </p>
                    </div>
                  </div>
                  {!setupIsNew && (
                    <button
                      onClick={handleSetupCancel}
                      className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 text-white/40 transition hover:border-white/20 hover:text-white"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                <div className="my-5 h-px bg-white/10" />

                <form onSubmit={handleSetupSave} className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">Building Name *</label>
                    <input
                      autoFocus
                      required
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-[14px] text-white placeholder-white/30 outline-none transition focus:border-[#2270b8]/60 focus:bg-white/15"
                      placeholder="e.g. North Tower"
                      value={setupName}
                      onChange={e => setSetupName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">Address</label>
                    <input
                      className="w-full rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-[14px] text-white placeholder-white/30 outline-none transition focus:border-[#2270b8]/60 focus:bg-white/15"
                      placeholder="e.g. 123 Rizal St., Manila"
                      value={setupAddress}
                      onChange={e => setSetupAddress(e.target.value)}
                    />
                  </div>

                  <div className="pt-2 flex gap-3">
                    <button
                      type="button"
                      onClick={handleSetupCancel}
                      disabled={setupSaving}
                      className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-[14px] font-semibold text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                      {setupIsNew ? '← Go Back' : 'Cancel'}
                    </button>
                    <button
                      type="submit"
                      disabled={setupSaving || !setupName.trim()}
                      className="flex-1 rounded-xl bg-[#2270b8] py-3 text-[14px] font-bold text-white shadow-lg transition hover:bg-[#479de9] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {setupSaving ? 'Saving…' : setupIsNew ? 'Start Building →' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
