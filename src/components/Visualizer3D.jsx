"use client";
import React, { useRef, useMemo, useState, useEffect, Component } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Edges, Html } from "@react-three/drei";
import * as THREE from "three";
import { Building2, ArrowLeft, Pencil, Layers, X, Check, Plus, CopyPlus, RotateCw, Trash2, Info, Box, Grid, Square, Search, Upload, Wrench, HelpCircle, MousePointer, Move, Maximize2, Palette, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { getFootprint, cellToWorld, UNIT_W, UNIT_D, UNIT_H } from "@/lib/footprints";
import { uploadFile, useMaintenanceTickets } from "@/hooks/useFirestore";
import { applyMaterialToRef } from "@/lib/textureGenerator";
import FootprintEditor from "./FootprintEditor"; // keep if needed or replace
import RoomLayoutEditor from "./RoomLayoutEditor";
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
    return true; // Don't lock out 3D on simple check error
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

  // iPad Air 2: 3 cores, A8X GPU, 2GB RAM.
  // Any touch device with <= 4 cores, or <= 3GB memory, or iPad with <= 6 cores is classified low-power:
  const isLowPower = isTouch && (cores <= 4 || memory <= 3 || (isApple && cores <= 6));

  return {
    isLowPower,
    dpr: isLowPower ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.35),
    antialias: !isLowPower,
    precision: isLowPower ? "mediump" : "highp",
  };
}

// ─── Colours (matching building-mockup.html palette) ────────────────────────
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

// ─── Build a THREE.Shape from a list of {x,z} points ────────────────────────
function pointsToShape(pts) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].z);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].z);
  shape.closePath();
  return shape;
}

// ─── Camera Controller for smooth auto-framing ───────────────────────────────
function CameraController({ selectedUnit, isEditMode, cameraPreset }) {
  const { camera, size, controls } = useThree();
  const targetPos = useMemo(() => new THREE.Vector3(0, 1.4, 0), []);

  // Handle camera presets
  useEffect(() => {
    if (!camera || !controls) return;
    if (cameraPreset === "top-down") {
      camera.position.set(0, 14, 0.05);
      controls.target.set(0, 0, 0);
    } else if (cameraPreset === "front") {
      camera.position.set(0, 3.5, 11);
      controls.target.set(0, 1.4, 0);
    } else if (cameraPreset === "isometric") {
      camera.position.set(9, 7.5, 11);
      controls.target.set(0, 1.4, 0);
    }
    controls.update();
  }, [cameraPreset, camera, controls]);

  useFrame((state, delta) => {
    if (!camera || !controls || !size || size.width <= 0 || size.height <= 0) return;

    const safeDelta = Math.min(delta, 0.1);

    // Smoothly pan OrbitControls target to center selected unit
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
// Status colour as CSS hex for Html pins
const STATUS_CSS = { occupied: '#d98a53', overdue: '#e05c5c', vacant: '#6e8592' };

function UnitBox({ 
  unit, 
  isSelected, 
  onClick, 
  activeFloor, 
  searchQuery, 
  hoveredUnitId, 
  onHover, 
  isEditMode, 
  hasActiveTicket,
  isOrbiting,
  isLowPower
}) {
  const x = unit.x || 0;
  const floorOffset = ((unit.floor || 1) - 1) * (UNIT_H + 0.11);
  const h = unit.height || 2.2;
  const y = floorOffset + h / 2;
  const z = unit.z || 0;
  const w = unit.width || 2.6;
  const d = unit.depth || 3.2;

  const rot = unit.rotation || 0;
  const rad = (rot * Math.PI) / 180;
  const isRotated = rot === 90 || rot === 270;
  const localW = isRotated ? d : w;
  const localD = isRotated ? w : d;

  const bw = localW - 0.05, bh = h - 0.05, bd = localD - 0.05;
  const statusHex = STATUS_COLOR[unit.status] || STATUS_COLOR.vacant;
  const statusCss = STATUS_CSS[unit.status] || STATUS_CSS.vacant;

  // ── Floor Isolator: ghost upper floors when a specific floor is isolated
  const unitFloor = unit.floor || 1;
  const isGhosted = activeFloor !== 'All' && unitFloor !== activeFloor;

  // ── Tenant Spotlight: dim units that don't match search
  const q = searchQuery.trim().toLowerCase();
  const isDimmed = q.length > 0 && (
    !(unit.unit_label || '').toLowerCase().includes(q) &&
    !(unit.tenant?.name || '').toLowerCase().includes(q)
  );

  const isHovered = hoveredUnitId === unit.id && !isEditMode;

  // ── Material & Skinning
  const matRef = useRef();

  useEffect(() => {
    const repeatX = Math.max(1, (unit.width || 2.6) / 1.6);
    const repeatY = Math.max(1, (unit.height || 2.2) / 1.6);
    applyMaterialToRef(matRef.current, unit.material_type, unit.texture_url, repeatX, repeatY, unit.wall_color);
  }, [unit.texture_url, unit.material_type, unit.width, unit.height, unit.wall_color]);

  const isDefaultColor = !unit.wall_color || unit.wall_color === '#4a5a66';
  const baseColor = isDefaultColor ? UNIT_BODY_COLOR : (unit.wall_color || UNIT_BODY_COLOR);

  return (
    <group position={[x, y, z]} rotation={[0, rad, 0]}>
      {/* Main body */}
      <mesh
        castShadow={!isLowPower}
        receiveShadow={!isLowPower}
        onClick={(e) => { e.stopPropagation(); onClick(unit); }}
        onPointerOver={(e) => { if (!isEditMode && e.pointerType === 'mouse') { e.stopPropagation(); onHover(unit.id); } }}
        onPointerOut={(e) => { if (!isEditMode && e.pointerType === 'mouse') { e.stopPropagation(); onHover(null); } }}
        userData={unit}
      >
        <boxGeometry args={[bw, bh, bd]} />
        <meshStandardMaterial
          ref={matRef}
          color={baseColor}
          roughness={0.55}
          emissive={isSelected ? "#2270b8" : "#000000"}
          emissiveIntensity={isSelected ? 0.2 : 0}
          transparent={isGhosted || isDimmed}
          opacity={isGhosted ? 0.12 : isDimmed ? 0.18 : 1}
        />
        {/* Outlines: vibrant blue when selected */}
        {isSelected && <Edges scale={1.001} threshold={20} color="#38bdf8" />}
        {!isLowPower && !isSelected && <Edges scale={1.001} threshold={20} color="#243242" />}
      </mesh>

      {/* Status strip at base */}
      <mesh position={[0, -h / 2 + 0.07, 0]} castShadow={!isLowPower}>
        <boxGeometry args={[localW - 0.02, 0.14, localD - 0.02]} />
        <meshStandardMaterial
          color={statusHex} roughness={0.6}
          transparent={isGhosted || isDimmed}
          opacity={isGhosted ? 0.12 : isDimmed ? 0.18 : 1}
        />
      </mesh>

      {/* Window left */}
      {!isGhosted && (
        <mesh position={[-bw / 4, 0.15, bd / 2 + 0.03]}>
          <planeGeometry args={[0.5, 0.6]} />
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={unit.status === 'vacant' ? 0.02 : 0.35}
            roughness={0.4}
            side={THREE.DoubleSide}
            transparent={isDimmed}
            opacity={isDimmed ? 0.18 : 1}
          />
        </mesh>
      )}
      {/* Window right */}
      {!isGhosted && (
        <mesh position={[bw / 4, 0.15, bd / 2 + 0.03]}>
          <planeGeometry args={[0.5, 0.6]} />
          <meshStandardMaterial
            color={WINDOW_COLOR}
            emissive={WINDOW_COLOR}
            emissiveIntensity={unit.status === 'vacant' ? 0.02 : 0.35}
            roughness={0.4}
            side={THREE.DoubleSide}
            transparent={isDimmed}
            opacity={isDimmed ? 0.18 : 1}
          />
        </mesh>
      )}

      {/* Door */}
      {!isGhosted && (
        <mesh position={[0, -h / 2 + 0.5, bd / 2 + 0.03]}>
          <planeGeometry args={[0.55, 1.0]} />
          <meshStandardMaterial color={DOOR_COLOR} roughness={0.5} side={THREE.DoubleSide}
            transparent={isDimmed} opacity={isDimmed ? 0.18 : 1}
          />
        </mesh>
      )}

      {/* ── Facade-mounted pin (omitted during active orbit on low-power devices for 60fps) */}
      {!isGhosted && !isHovered && !isDimmed && !(isOrbiting && isLowPower) && (
        <Html
          position={[0, h / 2 + 0.22, bd / 2 + 0.12]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
          occlude={false}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: '#111822',
            border: '1px solid rgba(255,255,255,0.22)',
            borderRadius: '999px', padding: '2px 8px 2px 6px',
            fontSize: '11px', fontWeight: 700,
            fontFamily: 'Manrope, sans-serif', color: '#f4f4f5',
            whiteSpace: 'nowrap',
            willChange: 'transform',
          }}>
            <span style={{ height: 6, width: 6, borderRadius: '50%', background: statusCss, flexShrink: 0, display: 'inline-block' }} />
            {unit.unit_label || '?'}
          </div>
        </Html>
      )}

      {/* ── Rich hover card (desktop pointer only) */}
      {isHovered && !isGhosted && (
        <Html center position={[0, h / 2 + 0.6, 0]} zIndexRange={[20, 11]} style={{ pointerEvents: 'none' }} occlude={false}>
          <div style={{
            width: 192, background: '#ffffff',
            border: '1px solid #d4d4d8',
            borderRadius: 16, padding: '10px 12px', boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
            fontFamily: 'Manrope, sans-serif', color: '#18181b',
            willChange: 'transform',
          }}>
            {/* Top row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {unit.unit_label}
              </span>
              <span style={{ fontSize: 10, color: '#a1a1aa', fontWeight: 500 }}>Floor {unitFloor}</span>
            </div>
            {/* Tenant name */}
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Sora, sans-serif', color: '#0b3860', marginBottom: 6, lineHeight: 1.2 }}>
              {unit.tenant?.name || 'Vacant'}
            </div>
            {/* Bottom row: rent + status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#3f3f46' }}>
                {unit.monthly_rent ? `₱${Number(unit.monthly_rent).toLocaleString()}` : '—'}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '2px 7px', borderRadius: 999,
                background: unit.status === 'occupied' ? '#fef3c7' : unit.status === 'overdue' ? '#fee2e2' : '#f4f4f5',
                color: unit.status === 'occupied' ? '#92400e' : unit.status === 'overdue' ? '#991b1b' : '#52525b',
              }}>
                {unit.status || 'vacant'}
              </span>
            </div>
            {/* Active Ticket Warning */}
            {hasActiveTicket && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '1px solid #f4f4f5', color: '#d97706', fontSize: 10, fontWeight: 700 }}>
                <Wrench size={12} />
                Needs Maintenance
              </div>
            )}
          </div>
        </Html>
      )}

      {/* ── Maintenance Wrench Icon ── */}
      {!isGhosted && hasActiveTicket && !isHovered && !(isOrbiting && isLowPower) && (
        <Html center position={[0, h / 2 + 0.45, bd / 2 + 0.12]} zIndexRange={[12, 1]} style={{ pointerEvents: 'none' }} occlude={false}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f59e0b', color: '#fff', borderRadius: '50%',
            width: 20, height: 20,
            opacity: isDimmed ? 0.3 : 1,
            willChange: 'transform',
          }}>
            <Wrench size={10} strokeWidth={3} />
          </div>
        </Html>
      )}

      {unit.roof_type === 'triangle' ? (
        <group position={[0, h / 2, 0]}>
          <mesh position={[0, 0.055, 0]} castShadow={!isLowPower} receiveShadow={!isLowPower}>
            <boxGeometry args={[localW + 0.2, 0.11, localD + 0.2]} />
            <meshStandardMaterial color={ROOF_COLOR} roughness={0.6}
              transparent={isGhosted || isDimmed} opacity={isGhosted ? 0.12 : isDimmed ? 0.18 : 1}
            />
            {isSelected && <Edges scale={1.001} threshold={20} color="#38bdf8" />}
            {!isLowPower && !isSelected && <Edges scale={1.001} threshold={20} color="#283747" />}
          </mesh>
          <mesh position={[0, 0.11 + 0.5, 0]} castShadow={!isLowPower} receiveShadow={!isLowPower} rotation={[0, Math.PI / 4, 0]} scale={[(localW + 0.2) / Math.SQRT2, 1, (localD + 0.2) / Math.SQRT2]}>
            <coneGeometry args={[1, 1, 4]} />
            <meshStandardMaterial color={ROOF_COLOR} roughness={0.6}
              transparent={isGhosted || isDimmed} opacity={isGhosted ? 0.12 : isDimmed ? 0.18 : 1}
            />
            {isSelected && <Edges scale={1.001} threshold={20} color="#38bdf8" />}
          </mesh>
        </group>
      ) : (
        <group position={[0, h / 2 + 0.055, 0]}>
          <mesh castShadow={!isLowPower} receiveShadow={!isLowPower}>
            <boxGeometry args={[localW + 0.2, 0.11, localD + 0.2]} />
            <meshStandardMaterial color={ROOF_COLOR} roughness={0.6}
              transparent={isGhosted || isDimmed} opacity={isGhosted ? 0.12 : isDimmed ? 0.18 : 1}
            />
            {isSelected && <Edges scale={1.001} threshold={20} color="#38bdf8" />}
            {!isLowPower && !isSelected && <Edges scale={1.001} threshold={20} color="#2c3b4a" />}
          </mesh>
          {/* Architectural roof cap trim for high visibility in top-down view */}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[localW + 0.04, 0.02, localD + 0.04]} />
            <meshStandardMaterial color="#2d3c4a" roughness={0.5} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Building({ 
  units, 
  tickets = [], 
  selectedUnitId, 
  onSelectUnit, 
  activeFloor, 
  searchQuery, 
  hoveredUnitId, 
  onHover,
  isOrbiting,
  isLowPower
}) {
  // Foundation footprint for Floor 1 units
  const baseUnits = useMemo(() => units.filter(u => (u.floor || 1) === 1), [units]);
  const foundation = useMemo(() => {
    if (baseUnits.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    baseUnits.forEach(u => {
      const rot = u.rotation || 0;
      const isRot = rot === 90 || rot === 270;
      const w = isRot ? (u.depth || 3.2) : (u.width || 2.6);
      const d = isRot ? (u.width || 2.6) : (u.depth || 3.2);
      minX = Math.min(minX, (u.x || 0) - w / 2);
      maxX = Math.max(maxX, (u.x || 0) + w / 2);
      minZ = Math.min(minZ, (u.z || 0) - d / 2);
      maxZ = Math.max(maxZ, (u.z || 0) + d / 2);
    });
    const fw = (maxX - minX) + 0.8;
    const fd = (maxZ - minZ) + 0.8;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    return { fw, fd, cx, cz };
  }, [baseUnits]);

  return (
    <group>
      {/* Foundation plinth */}
      {foundation && (
        <group position={[foundation.cx, 0.035, foundation.cz]}>
          <mesh receiveShadow={!isLowPower} position={[0, 0, 0]}>
            <boxGeometry args={[foundation.fw, 0.07, foundation.fd]} />
            <meshStandardMaterial color={SLAB_COLOR} roughness={0.8} />
            {!isLowPower && <Edges scale={1.001} threshold={20} color="#2b3947" />}
          </mesh>
        </group>
      )}

      {units.map((unit) => {
        const hasActiveTicket = tickets.some(t => (t.unit_id === unit.id || t.unitId === unit.id) && t.status !== "settled");
        return (
          <UnitBox
            key={unit.id}
            unit={unit}
            isSelected={selectedUnitId === unit.id}
            onClick={onSelectUnit}
            activeFloor={activeFloor}
            searchQuery={searchQuery}
            hoveredUnitId={hoveredUnitId}
            onHover={onHover}
            isEditMode={false}
            hasActiveTicket={hasActiveTicket}
            isOrbiting={isOrbiting}
            isLowPower={isLowPower}
          />
        );
      })}
    </group>
  );
}

// Convert editorRooms into a shape that UnitBox can render (optimistic view after save)
function editorRoomsToUnits(editorRooms) {
  return editorRooms.map(r => ({
    ...r,
    // ensure all fields UnitBox needs are present
    status: r.status || 'vacant',
    material_type: r.material_type || 'stucco',
    texture_url: r.texture_url || null,
    wall_color: r.wall_color || '#4a5a66',
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
      {/* Crisp architectural grid floor */}
      <gridHelper args={[60, 30, 0x38bdf8, 0x223244]} position={[0, 0.005, 0]} />
    </group>
  );
}

// ─── Export ──────────────────────────────────────────────────────────────────
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
      icon: <MousePointer size={16} className="text-[#479de9]" />,
      title: "Selecting a Room",
      tips: [
        "Click any room block in the 3D scene to select it",
        "The selected room highlights with a blue outline and opens its inspector",
        "Click empty ground space to deselect",
      ],
    },
    {
      icon: <Move size={16} className="text-[#479de9]" />,
      title: "Moving & Nudging Rooms",
      tips: [
        "Click and drag a selected room across the floor grid to move freely",
        "Use the arrow nudge buttons (▲ ▼ ◀ ▶) in the inspector for easy step-by-step alignment (0.5m increments)",
        "Rooms automatically snap to a 0.5 m grid and align to adjacent rooms",
        "Use the coloured arrow handles on room walls to slide along a single axis",
      ],
    },
    {
      icon: <Maximize2 size={16} className="text-[#479de9]" />,
      title: "Resizing Rooms",
      tips: [
        "Select a room, then use Arrow Keys on your keyboard to resize it",
        "← → keys adjust width   |   ↑ ↓ keys adjust depth",
        "Minimum room size is 1 m × 1 m",
        "Use the Ceiling Height slider in the inspector panel to adjust room height",
      ],
    },
    {
      icon: <Plus size={16} className="text-[#479de9]" />,
      title: "Adding Rooms",
      tips: [
        'Click "+ Room" in the bottom toolbar to add a single rectangular room',
        'Click "L-Shaped Room" to add two pre-connected rooms in an L layout',
        "New rooms appear beside existing ones and auto-select for editing",
        "You can place rooms on different floors using the Floor dropdown in the inspector",
      ],
    },
    {
      icon: <Palette size={16} className="text-[#479de9]" />,
      title: "Styling Rooms",
      tips: [
        "Select a room to access Material & Skin options in the right panel",
        "Choose from Stucco, Brick, Wood, Concrete, Metal — or upload a custom texture",
        "Wall Tint lets you pick a base colour overlay for each room",
        "Use the Rotate button (↻) to spin the room 90° clockwise",
      ],
    },
    {
      icon: <Check size={16} className="text-[#479de9]" />,
      title: "Saving Your Layout",
      tips: [
        'Click "Save" in the bottom-left bar when you\'re done editing',
        "All room positions, sizes, floors, and materials are saved to the cloud",
        'Click "Cancel" to discard all unsaved changes and return to view mode',
        "Deleting a room here also removes it from the Units Directory",
      ],
    },
  ];

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0d1117] border border-white/10 rounded-3xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#2270b8]/20 border border-[#2270b8]/30 flex items-center justify-center">
              <HelpCircle size={18} className="text-[#479de9]" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold text-white font-['Sora']">3D Layout Builder — Guide</h2>
              <p className="text-[12px] text-white/40 font-['Manrope']">How to design and edit your building layout</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Camera tip callout */}
        <div className="mx-6 mt-5 bg-[#2270b8]/10 border border-[#2270b8]/20 rounded-2xl px-4 py-3 flex items-start gap-3">
          <Info size={14} className="text-[#479de9] shrink-0 mt-0.5" />
          <p className="text-[12px] text-white/60 font-['Manrope'] leading-relaxed">
            <span className="text-white font-semibold">Camera controls work anytime:</span> Left-drag to orbit · Right-drag to pan · Scroll wheel to zoom.
            Use the <span className="text-white font-semibold">Iso / Top / Front</span> presets in the bottom toolbar to quickly reset the angle.
          </p>
        </div>

        {/* Sections */}
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

        {/* Footer */}
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
  const [isWebGLSupported, setIsWebGLSupported] = useState(true);

  useEffect(() => {
    const supported = checkWebGLSupport();
    setIsWebGLSupported(supported);
    if (!supported) {
      setViewMode("2d");
    }
  }, []);

  const [showBuilderGuide, setShowBuilderGuide] = useState(false);
  const [showFirstEntryHint, setShowFirstEntryHint] = useState(false);
  const [navTipDismissed, setNavTipDismissed] = useState(false);
  const [mobileTipDismissed, setMobileTipDismissed] = useState(false);
  const [saveToast, setSaveToast] = useState(false);
  const hasShownHint = useRef(false);
  const [editorRooms, setEditorRooms] = useState([]);
  const [selectedEditorRoomId, setSelectedEditorRoomId] = useState(null);
  const [deletedRoomIds, setDeletedRoomIds] = useState([]);
  const [cameraPreset, setCameraPreset] = useState("isometric");
  const [isOrbiting, setIsOrbiting] = useState(false);
  const perfProfile = useMemo(() => checkDevicePerformance(), []);

  // ── Feature state: search, floor isolator, hover
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFloor, setActiveFloor] = useState('All');
  const [hoveredUnitId, setHoveredUnitId] = useState(null);

  // ── Tickets for indicator
  const { tickets } = useMaintenanceTickets(building?.id, building?.user_id);

  // Derive unique floor list from units
  const floorList = useMemo(() => {
    const floors = [...new Set(units.map(u => u.floor || 1))].sort((a, b) => a - b);
    return floors;
  }, [units]);

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
      // New building — delete it and go back to dashboard
      await onCancelNewBuilding?.();
    } else {
      setShowSetupCard(false);
    }
  };

  // When entering edit mode, clone the current building's units into local state
  const handleEnterEditMode = () => {
    if (onSelectUnit) onSelectUnit(null);
    setEditorRooms(units.map(u => ({
      id: u.id,
      ref: u.ref,
      unit_label: u.unit_label,
      floor: u.floor || 1,
      status: u.status || "vacant",
      monthly_rent: u.monthly_rent || 0,
      x: u.x ?? 0,
      z: u.z ?? 0,
      width: u.width ?? 2.6,
      depth: u.depth ?? 3.2,
      height: u.height ?? 2.2,
      rotation: u.rotation || 0,
      roof_type: u.roof_type || 'flat',
      material_type: u.material_type || 'stucco',
      texture_url: u.texture_url || null,
      wall_color: u.wall_color || '#4a5a66',
      tenant: u.tenant || null
    })));
    setDeletedRoomIds([]);
    setSelectedEditorRoomId(null);
    setEditMode(true);
    // Show first-entry hint once per session
    if (!hasShownHint.current) {
      hasShownHint.current = true;
      setShowFirstEntryHint(true);
      setTimeout(() => setShowFirstEntryHint(false), 5500);
    }
  };

  const handleAddRoom = () => {
    const newId = `new-temp-${Date.now()}`;
    const targetFloor = 1;
    const floorRooms = editorRooms.filter(r => r.floor === targetFloor);
    
    let maxNum = 0;
    floorRooms.forEach(r => {
      const match = r.unit_label.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        const seq = num % 100;
        if (seq > maxNum) maxNum = seq;
      }
    });
    
    const labelNum = String(maxNum + 1).padStart(2, '0');
    const unitLabel = `Unit ${targetFloor}${labelNum}`;

    // Place new room beside the last room if any, otherwise at origin
    const lastRoom = floorRooms[floorRooms.length - 1];
    const W = 3.0, D = 3.0;
    const x = lastRoom ? lastRoom.x + lastRoom.width / 2 + W / 2 : 0;
    const z = lastRoom ? lastRoom.z : 0;

    const newRoom = {
      id: newId,
      unit_label: unitLabel,
      floor: targetFloor,
      status: "vacant",
      monthly_rent: 0,
      x, z,
      width: W,
      depth: D,
      height: 2.2,
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
      tenant: null
    };

    setEditorRooms([...editorRooms, newRoom]);
    setSelectedEditorRoomId(newId);
  };

  const handleAddLShape = () => {
    const baseId = `new-temp-${Date.now()}`;
    const wingId = `new-temp-${Date.now() + 1}`;
    const baseW = 3.0, baseD = 3.0;
    const wingW = 3.0, wingD = 1.5;

    // Find a free spot: offset past any existing rooms
    const allRooms = editorRooms.filter(r => (r.floor || 1) === 1);
    const maxX = allRooms.length > 0 ? Math.max(...allRooms.map(r => r.x + r.width / 2)) : -baseW / 2;
    const originX = maxX + baseW / 2 + 0.5; // half-width offset + gap
    const originZ = 0;

    // Base room
    const baseRoom = {
      id: baseId,
      unit_label: `A${editorRooms.length + 1}`,
      floor: 1,
      status: "vacant",
      monthly_rent: 0,
      x: originX,
      z: originZ,
      width: baseW,
      depth: baseD,
      height: 2.2,
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
      tenant: null
    };

    // Wing attached to east wall of base, south-edge (high-Z) aligned
    // base south edge: originZ + baseD/2
    // wing center Z: (originZ + baseD/2) - wingD/2
    const wingRoom = {
      id: wingId,
      unit_label: `A${editorRooms.length + 2}`,
      floor: 1,
      status: "vacant",
      monthly_rent: 0,
      x: originX + baseW / 2 + wingW / 2,
      z: (originZ + baseD / 2) - wingD / 2,
      width: wingW,
      depth: wingD,
      height: 2.2,
      material_type: 'stucco',
      texture_url: null,
      wall_color: '#4a5a66',
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

  const [optimisticUnits, setOptimisticUnits] = useState(null);

  const handleSave = async () => {
    try {
      if (onSaveLayout) {
        await onSaveLayout(editorRooms, deletedRoomIds);
      }
      // Immediately show saved state using editorRooms while Firestore catches up
      setOptimisticUnits(editorRoomsToUnits(editorRooms));
      setEditMode(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
      // Clear optimistic state after Firestore listener should have updated
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

          {/* ── SAVE SUCCESS TOAST ────────────────────────────────────────── */}
          {saveToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2.5 bg-emerald-700 border border-emerald-500 shadow-2xl text-white rounded-2xl px-5 py-2.5 text-[13.5px] font-bold font-['Manrope']">
                <Check size={16} className="text-white shrink-0" />
                <span>Layout saved successfully!</span>
              </div>
            </div>
          )}

          {/* ── FIRST-ENTRY HINT BANNER ──────────────────────────────────── */}
          {editMode && showFirstEntryHint && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-3 bg-[#141a21] border border-[#2270b8]/60 shadow-2xl rounded-2xl px-5 py-3">
                <Info size={16} className="text-[#479de9] shrink-0" />
                <span className="text-[13.5px] text-white/95 font-medium font-['Manrope']">
                  Click a room to select · Drag or nudge to move · Arrow keys to resize
                </span>
                <button
                  onClick={() => { setShowFirstEntryHint(false); setShowBuilderGuide(true); }}
                  className="ml-1 text-[12px] font-bold text-[#479de9] bg-[#2270b8]/20 border border-[#2270b8]/40 hover:bg-[#2270b8] hover:text-white px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer"
                >
                  Full Guide →
                </button>
                <button 
                  onClick={() => setShowFirstEntryHint(false)} 
                  title="Dismiss hint"
                  className="text-white/40 hover:text-white p-1 hover:bg-white/10 rounded-lg transition ml-0.5 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* ── TOP-RIGHT: Help button in edit mode ──────────────────────── */}
          {editMode && (
            <div className="absolute top-4 right-4 z-30">
              <button
                onClick={() => setShowBuilderGuide(true)}
                title="Open 3D Builder Guide and shortcuts (Esc to close)"
                className="flex items-center gap-1.5 bg-zinc-900 border border-white/10 hover:border-[#2270b8]/60 text-white/70 hover:text-[#479de9] px-3.5 py-2 rounded-xl text-[12px] font-semibold font-['Manrope'] transition shadow-lg active:scale-95 cursor-pointer"
              >
                <HelpCircle size={15} />
                <span>Help & Guide</span>
              </button>
            </div>
          )}

          {/* ── VIEW MODE NAVIGATION HINT (Bottom-Right) ─────────────────── */}
          {!editMode && viewMode === "3d" && !navTipDismissed && (
            <div className="absolute bottom-6 right-6 z-20 pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-2.5 bg-zinc-900 border border-white/10 shadow-xl rounded-2xl px-3.5 py-2 text-white">
                <div className="flex items-center gap-1.5 text-[11px] font-['Manrope'] text-white/70">
                  <span className="flex items-center gap-1 text-white font-semibold">
                    <MousePointer size={12} className="text-[#479de9]" /> Drag
                  </span>
                  <span>to orbit</span>
                  <span className="text-white/20">·</span>
                  <span>Right-drag to pan</span>
                  <span className="text-white/20">·</span>
                  <span>Scroll to zoom</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNavTipDismissed(true)}
                  aria-label="Dismiss navigation tip"
                  title="Dismiss navigation tip"
                  className="ml-1 text-white/40 hover:text-white p-1 rounded transition cursor-pointer relative after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {/* ── TOP-LEFT HUD: Search & 3D/2D View Mode Switcher ─────────────────── */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2.5 pointer-events-none">
            {/* TENANT SPOTLIGHT SEARCH */}
            {!editMode && (
              <div className={`pointer-events-auto flex items-center gap-2 bg-zinc-900 border rounded-2xl px-3 py-2 shadow-2xl transition-all shrink-0 ${
                searchQuery ? 'border-[#2270b8] ring-2 ring-[#2270b8]/30' : 'border-white/10'
              }`}>
                <Search size={14} className="text-white/40 shrink-0" />
                <input
                  type="text"
                  aria-label="Search tenant or unit"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tenant or unit..."
                  className="bg-transparent outline-none text-[12px] sm:text-[14px] text-white placeholder-white/40 w-36 sm:w-44 font-['Manrope']"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    title="Clear search"
                    className="text-white/40 hover:text-white transition cursor-pointer p-1 relative after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )}

            {/* ── 3D / 2D BLUEPRINT VIEW SWITCHER ── */}
            {!editMode && (
              <div className="pointer-events-auto flex items-center bg-zinc-900 border border-white/10 rounded-2xl p-1 shadow-2xl shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (isWebGLSupported) setViewMode("3d");
                  }}
                  disabled={!isWebGLSupported}
                  aria-label="Switch to 3D Perspective Model"
                  title={isWebGLSupported ? "Switch to 3D Perspective Model" : "WebGL 2 is not supported on this device"}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold font-['Manrope'] transition ${
                    viewMode === "3d"
                      ? "bg-[#2270b8] text-white shadow-sm"
                      : isWebGLSupported
                        ? "text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                        : "text-zinc-600 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <Box size={13} />
                  <span>3D Model</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("2d")}
                  aria-label="Switch to 2D Architectural Blueprint"
                  title="Switch to 2D Architectural Blueprint (fast, smooth on all devices)"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold font-['Manrope'] transition cursor-pointer ${
                    viewMode === "2d"
                      ? "bg-[#2270b8] text-white shadow-sm"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Grid size={13} />
                  <span>2D Blueprint</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile tip banner */}
          {!mobileTipDismissed && (
            <div className="md:hidden absolute top-16 inset-x-3 z-30 pointer-events-none flex justify-center animate-fade-down">
              <div className="pointer-events-auto bg-zinc-900/90 backdrop-blur-sm text-zinc-300 text-[11px] font-medium px-3.5 py-1.5 rounded-full border border-white/10 shadow-lg flex items-center gap-2">
                <span>💡 3D view is best experienced on iPad or desktop</span>
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

          {/* ── BOTTOM-LEFT HUD: Building Meta & Edit Controls ─────────────────────────── */}
          <div className="absolute bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:bottom-6 left-3 sm:left-6 z-20 flex items-center gap-2 pointer-events-none flex-wrap max-w-[calc(100vw-1.5rem)] sm:max-w-[60vw]">
            <div className="pointer-events-auto flex items-center gap-2.5 bg-zinc-900 border border-white/10 rounded-2xl p-1.5 pl-3 shadow-2xl shrink-0">
              {onBack && !editMode && (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back to property dashboard"
                  title="Back to property dashboard"
                  className="text-white/60 hover:text-white bg-white/10 hover:bg-white/20 p-2 rounded-xl transition cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              {onBack && !editMode && <div className="h-5 w-px bg-white/15" />}
              <div className="flex flex-col leading-none pr-1">
                <span className="text-[14px] font-bold text-white tracking-tight leading-none font-['Sora']">
                  {editMode ? "Layout Editor" : (building.name || "Untitled Building")}
                </span>
                <span className="mt-0.5 text-[11px] text-white/40 font-['Manrope'] font-medium truncate max-w-[180px]">
                  {editMode ? "Sims-Style 3D Builder" : (building.address || "No address set")}
                </span>
              </div>
              {!editMode && (
                <button
                  type="button"
                  onClick={openEditInfo}
                  aria-label="Edit building name and address"
                  title="Edit building name and address"
                  className="text-white/40 hover:text-[#479de9] p-1.5 rounded-lg transition cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                >
                  <Pencil size={13} />
                </button>
              )}
              <div className="h-5 w-px bg-white/15" />
              {!editMode ? (
                <div className="rounded-full border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#479de9] font-['Manrope'] whitespace-nowrap">
                  {units.length} Units
                </div>
              ) : (
                <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400 font-['Manrope'] whitespace-nowrap">
                  Edit Mode
                </div>
              )}
              <div className="h-5 w-px bg-white/15" />
              {!editMode ? (
                <button
                  type="button"
                  onClick={handleEnterEditMode}
                  title="Open 3D layout builder to add, move, or customize rooms"
                  className="flex items-center gap-1.5 bg-[#2270b8] hover:bg-[#3186d6] text-white px-3.5 py-2 rounded-xl text-[14px] font-semibold font-['Manrope'] shadow-md transition active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Layers size={14} />
                  Design Layout
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    title="Discard unsaved changes and return to viewing mode"
                    className="flex items-center gap-1 bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white px-3 py-2 rounded-xl text-[14px] font-semibold font-['Manrope'] transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <X size={13} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    title="Save all layout changes to the cloud"
                    className="flex items-center gap-1 bg-[#2270b8] hover:bg-[#3186d6] text-white px-3.5 py-2 rounded-xl text-[14px] font-semibold font-['Manrope'] shadow-lg transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <Check size={13} />
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT SIDE CONTEXTUAL INSPECTOR ─────────────────────────────── */}
          <div className="absolute top-20 right-4 z-20 pointer-events-none">
            {editMode ? (
              selectedRoom ? (
                <div className="pointer-events-auto w-76 max-h-[82vh] overflow-y-auto bg-white border border-zinc-200 text-zinc-800 rounded-2xl p-4 shadow-2xl space-y-3.5">
                  {/* Section 1: Room Identity */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-['Manrope']">Room Identity</span>
                      <span className="text-[10px] text-zinc-400 font-mono">ID: {selectedRoom.id.slice(-6)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        aria-label="Unit label"
                        className="font-bold text-zinc-900 font-['Sora'] text-[14px] bg-zinc-100 border border-zinc-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#2270b8] flex-1 min-w-0 transition"
                        value={selectedRoom.unit_label}
                        placeholder="e.g. 101, A-1, Studio"
                        onChange={(e) => setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, unit_label: e.target.value } : r))}
                      />
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label="Rotate 90 degrees clockwise"
                          title="Rotate 90° clockwise"
                          onClick={() => {
                            const cur = selectedRoom.rotation || 0;
                            setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, rotation: (cur + 90) % 360 } : r));
                          }}
                          className="text-[#2270b8] hover:bg-blue-50 p-1.5 rounded-lg border border-blue-100 transition active:scale-95 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          <RotateCw size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete room from layout"
                          title="Delete room from layout"
                          onClick={handleDeleteRoom}
                          className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg border border-red-100 transition active:scale-95 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Position & Nudge Controls (Senior UX) */}
                  <div className="border-t border-zinc-100 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-['Manrope']">Position & Alignment</span>
                      <span className="text-[11px] font-mono text-zinc-500 font-medium">
                        X: {Number(selectedRoom.x || 0).toFixed(1)}m · Z: {Number(selectedRoom.z || 0).toFixed(1)}m
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200/80 rounded-xl p-2">
                      <span className="text-[11px] text-zinc-500 font-['Manrope'] pl-1">0.5m Nudge:</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleNudge(-0.5, 0)}
                          aria-label="Nudge room left"
                          title="Nudge Left (-0.5m)"
                          className="h-7 w-7 rounded-lg bg-white hover:bg-blue-50 hover:text-[#2270b8] border border-zinc-200 text-zinc-600 flex items-center justify-center transition shadow-xs active:scale-90 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudge(0, -0.5)}
                          aria-label="Nudge room backward"
                          title="Nudge Backward / Away (-0.5m)"
                          className="h-7 w-7 rounded-lg bg-white hover:bg-blue-50 hover:text-[#2270b8] border border-zinc-200 text-zinc-600 flex items-center justify-center transition shadow-xs active:scale-90 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudge(0, 0.5)}
                          aria-label="Nudge room forward"
                          title="Nudge Forward / Toward (+0.5m)"
                          className="h-7 w-7 rounded-lg bg-white hover:bg-blue-50 hover:text-[#2270b8] border border-zinc-200 text-zinc-600 flex items-center justify-center transition shadow-xs active:scale-90 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNudge(0.5, 0)}
                          aria-label="Nudge room right"
                          title="Nudge Right (+0.5m)"
                          className="h-7 w-7 rounded-lg bg-white hover:bg-blue-50 hover:text-[#2270b8] border border-zinc-200 text-zinc-600 flex items-center justify-center transition shadow-xs active:scale-90 relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Floor & Architecture */}
                  <div className="border-t border-zinc-100 pt-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-['Manrope']">Floor & Architecture</span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500 mb-1 font-['Manrope']">Floor Level</label>
                        <select
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-[#2270b8] transition"
                          value={selectedRoom.floor}
                          onChange={(e) => setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, floor: parseInt(e.target.value, 10) } : r))}
                        >
                          <option value={1}>Floor 1</option>
                          <option value={2}>Floor 2</option>
                          <option value={3}>Floor 3</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-zinc-500 mb-1 font-['Manrope']">Roof Style</label>
                        <select
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-[#2270b8] transition"
                          value={selectedRoom.roof_type || 'flat'}
                          onChange={(e) => setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, roof_type: e.target.value } : r))}
                        >
                          <option value="flat">Flat Roof</option>
                          <option value="triangle">Gabled / Triangle</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Ceiling Height */}
                  <div className="border-t border-zinc-100 pt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-['Manrope']">Ceiling Height</span>
                      <span className="text-[11px] font-bold text-[#2270b8]">{selectedRoom.height} m</span>
                    </div>
                    <input
                      type="range" min="1" max="4" step="0.2"
                      className="w-full accent-[#2270b8] cursor-pointer"
                      value={selectedRoom.height}
                      onChange={(e) => setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, height: parseFloat(e.target.value) } : r))}
                    />
                    <div className="flex justify-between text-[9px] text-zinc-400 mt-0.5">
                      <span>1m (Low)</span>
                      <span>2.4m (Standard)</span>
                      <span>4m (Loft)</span>
                    </div>
                  </div>

                  {/* Section 5: Material & Style */}
                  <div className="border-t border-zinc-100 pt-3 space-y-2.5">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-['Manrope']">Material & Styling</span>
                    <div>
                      <select
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-[#2270b8] transition"
                        value={selectedRoom.material_type || 'stucco'}
                        onChange={(e) => {
                          const val = e.target.value;
                          const isTextured = ['brick', 'wood', 'concrete', 'metal'].includes(val);
                          setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { 
                            ...r, 
                            material_type: val,
                            texture_url: val !== 'custom' ? null : r.texture_url,
                            wall_color: isTextured ? '#ffffff' : (val === 'stucco' ? '#4a5a66' : r.wall_color)
                          } : r));
                        }}
                      >
                        <option value="stucco">Stucco (Smooth)</option>
                        <option value="brick">Exposed Brick</option>
                        <option value="wood">Natural Wood Planks</option>
                        <option value="concrete">Architectural Concrete</option>
                        <option value="metal">Corrugated Metal</option>
                        <option value="custom">Custom Image Texture</option>
                      </select>
                    </div>

                    {selectedRoom.material_type === 'custom' && (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center justify-center gap-2 cursor-pointer w-full border border-dashed border-[#2270b8]/40 bg-blue-50/50 hover:bg-blue-50 text-[#2270b8] rounded-lg px-2 py-2 text-[11px] font-semibold transition">
                          {uploadingTexture ? 'Uploading...' : <><Upload size={14} /> Upload Texture</>}
                          <input type="file" accept="image/*" className="hidden" onChange={handleTextureUpload} disabled={uploadingTexture} />
                        </label>
                        {selectedRoom.texture_url && (
                          <div className="h-10 w-full rounded-md border border-zinc-200 overflow-hidden bg-zinc-100">
                            <img src={selectedRoom.texture_url} alt="Texture Preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-medium text-zinc-500 mb-1 font-['Manrope']">Wall Color Tint</label>
                      <div className="flex items-center gap-2">
                        {[
                          ['#ffffff', 'White'],
                          ['#4a5a66', 'Slate Blue'],
                          ['#d9ccbc', 'Sand Dune'],
                          ['#2c3238', 'Charcoal']
                        ].map(([hex, name]) => (
                          <button
                            key={hex}
                            title={`Set tint: ${name}`}
                            onClick={() => setEditorRooms(editorRooms.map(r => r.id === selectedEditorRoomId ? { ...r, wall_color: hex } : r))}
                            className={`w-6 h-6 rounded-full border-2 transition ${
                              (selectedRoom.wall_color || '#4a5a66') === hex ? 'border-[#2270b8] scale-110 shadow-sm' : 'border-zinc-200 hover:scale-105'
                            }`}
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pointer-events-auto bg-zinc-900 border border-white/10 text-zinc-300 text-[11px] font-['Manrope'] px-3.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5">
                  <Info size={12} className="text-[#479de9] shrink-0" />
                  Click a room to inspect · Drag or nudge to move · Arrow keys to resize
                </div>
              )
            ) : null}
          </div>

          {/* ── BOTTOM CONTROL DOCK ──────────────────────────────────────────── */}
          <div className="absolute bottom-20 sm:bottom-5 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-full max-w-[calc(100vw-1.5rem)] flex justify-center">
            <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-zinc-900 border border-white/10 shadow-2xl rounded-2xl px-2.5 sm:px-3 py-2 text-white max-w-full overflow-x-auto no-scrollbar">

              {/* Camera Presets — Segmented pill with icons (3D mode only) */}
              {viewMode === "3d" && (
                <>
                  <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-0.5">
                    {[
                      ["isometric", "Iso", <Box size={13} key="box" />, "Isometric 3D perspective view"],
                      ["top-down",  "Top", <Grid size={13} key="grid" />, "Top-down 2D floorplan view"],
                      ["front",     "Front", <Square size={13} key="sq" />, "Front elevation view"]
                    ].map(([preset, label, icon, tip]) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setCameraPreset(preset)}
                        aria-label={tip}
                        title={tip}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] transition cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] ${
                          cameraPreset === preset
                            ? 'bg-[#0F4C81] text-white shadow-sm border border-blue-400/30'
                            : 'text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {icon}{label}
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-white/15" />
                </>
              )}

              {/* Floor Isolator (View Mode only) */}
              {!editMode && floorList.length > 1 && (
                <>
                  <div className="flex items-center gap-0.5 rounded-xl bg-white/5 p-0.5">
                    {['All', ...floorList].map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setActiveFloor(f)}
                        aria-label={f === 'All' ? 'View all floors simultaneously' : `Isolate Floor ${f} only`}
                        title={f === 'All' ? 'View all floors simultaneously' : `Isolate Floor ${f} only`}
                        className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] transition cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8] ${
                          activeFloor === f
                            ? 'bg-[#2270b8] text-white shadow-sm'
                            : 'text-zinc-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {f === 'All' ? 'All' : `F${f}`}
                      </button>
                    ))}
                  </div>
                  <div className="h-5 w-px bg-white/15" />
                </>
              )}

              {/* Edit Mode: Builder tools | View Mode: Legend */}
              {editMode ? (
                <>
                  <button
                    type="button"
                    onClick={handleAddRoom}
                    aria-label="Add a new room to the layout"
                    title="Add a new rectangular room unit to the layout"
                    className="flex items-center gap-1 bg-[#0b3860] hover:bg-[#154e83] border border-[#2270b8]/40 text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] transition shadow-sm active:scale-95 cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                  >
                    <Plus size={13} /> Room
                  </button>
                  <button
                    type="button"
                    onClick={handleAddLShape}
                    aria-label="Add an L-shaped room to the layout"
                    className="flex items-center gap-1.5 bg-[#2d5a72] hover:bg-[#3a7290] border border-[#3a7290] text-white px-3 py-1.5 rounded-xl text-[11px] font-semibold font-['Manrope'] transition shadow-sm active:scale-95 cursor-pointer relative after:absolute after:-inset-1 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                    title="Add two connected rooms in an L-shaped layout (2 units)"
                  >
                    <CopyPlus size={13} /> L-Shaped Room
                  </button>
                </>
              ) : (
                <>
                  {[['#d98a53','Occupied'],['#e05c5c','Overdue'],['#6e8592','Vacant']].map(([color, label]) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="text-[11px] font-medium text-zinc-300 font-['Manrope']">{label}</span>
                    </div>
                  ))}
                </>
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
              hoveredUnitId={hoveredUnitId}
              onHover={setHoveredUnitId}
              onEnterEditMode={handleEnterEditMode}
            />
          ) : (
            <WebGLErrorBoundary onSwitchTo2D={() => setViewMode("2d")}>
              <Canvas
                shadows={false}
                dpr={perfProfile.dpr}
                performance={{ min: 0.5 }}
                camera={{ position: [9, 7.5, 11], fov: 38 }}
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
                  if (!editMode && onSelectUnit) onSelectUnit(null);
                }}
              >
                <color attach="background" args={[0x0b0f13]} />
                {/* Soft horizon fog at 45m-110m distance */}
                <fog attach="fog" args={[0x0b0f13, 45, 110]} />

                {/* Lighting system tuned for architectural fidelity and GPU efficiency */}
                <ambientLight intensity={perfProfile.isLowPower ? 1.25 : 1.1} color="#f0f6fc" />
                <hemisphereLight args={["#ffffff", "#243444", perfProfile.isLowPower ? 0.6 : 0.85]} />
                <directionalLight
                  position={[12, 18, 10]}
                  intensity={1.5}
                  color="#fffaf5"
                />
                {!perfProfile.isLowPower && (
                  <directionalLight position={[-10, 12, -8]} intensity={0.8} color="#8ec5fc" />
                )}

                <Ground onGroundClick={() => {
                  if (!editMode && onSelectUnit) onSelectUnit(null);
                }} />

                {/* Subtle soft ground contact shadow disc */}
                <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0, 16, 32]} />
                  <meshBasicMaterial color="#000000" opacity={0.25} transparent depthWrite={false} />
                </mesh>

                {!editMode ? (
                  <Building
                    units={optimisticUnits || units}
                    tickets={tickets}
                    selectedUnitId={selectedUnitId}
                    onSelectUnit={onSelectUnit}
                    activeFloor={activeFloor}
                    searchQuery={searchQuery}
                    hoveredUnitId={hoveredUnitId}
                    onHover={setHoveredUnitId}
                    isOrbiting={isOrbiting}
                    isLowPower={perfProfile.isLowPower}
                  />
                ) : (
                  <RoomLayoutEditor 
                    rooms={editorRooms}
                    onChange={setEditorRooms}
                    selectedRoomId={selectedEditorRoomId}
                    onSelectRoom={setSelectedEditorRoomId}
                  />
                )}

                <CameraController 
                  selectedUnit={units.find(u => u.id === selectedUnitId)} 
                  isEditMode={editMode} 
                  cameraPreset={cameraPreset}
                />

                <OrbitControls
                  makeDefault
                  target={[0, 1.4, 0]}
                  minPolarAngle={0.02}
                  maxPolarAngle={Math.PI / 2 - 0.05}
                  minDistance={3}
                  maxDistance={40}
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
              <div className="pointer-events-auto max-w-sm rounded-2xl bg-zinc-900 border border-white/10 p-6 shadow-2xl">
                <div className="h-12 w-12 mx-auto rounded-2xl bg-[#2270b8]/20 border border-[#2270b8]/30 flex items-center justify-center text-[#479de9] mb-3">
                  <Box size={24} />
                </div>
                <h3 className="text-[16px] font-bold text-white font-['Sora']">No Rooms Added Yet</h3>
                <p className="text-[12px] text-zinc-400 mt-1.5 font-['Manrope']">
                  Design your building layout by adding rooms, setting floor levels, and customizing finishes.
                </p>
                <button
                  onClick={handleEnterEditMode}
                  className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#2270b8] hover:bg-[#3186d6] text-white text-[13px] font-bold font-['Manrope'] transition shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus size={15} /> Start Building Layout
                </button>
              </div>
            </div>
          )}

          {/* ── Floating Setup Card ─────────────────────────────────────────── */}
          {showSetupCard && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#0b0f13]/80 p-4">
              <div className="relative w-[440px] max-w-full rounded-3xl border border-white/10 bg-[#161c22] p-8 shadow-2xl" style={{ boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
                {/* Glow accent */}
                <div className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full bg-[#2270b8] opacity-20 blur-3xl" />

                {/* Header */}
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
                  {/* X close button — only for edit mode, not new */}
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
