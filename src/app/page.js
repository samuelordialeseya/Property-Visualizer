"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/context/AuthContext";
import { useBuildings, useAllUnits } from "@/hooks/useFirestore";

import Login from "@/components/Login";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";

import DashboardOverview from "@/components/views/DashboardOverview";
import PropertiesList from "@/components/views/PropertiesList";
import PropertyDetail from "@/components/views/PropertyDetail";
import UnitPanel from "@/components/UnitPanel";
import SettingsTab from "@/components/views/SettingsTab";

const Visualizer3D = dynamic(() => import("@/components/Visualizer3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#0b0f13] text-zinc-400 font-sans text-[13px]">
      Loading 3D Visualizer…
    </div>
  ),
});

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const { buildings, addBuilding, updateBuilding, deleteBuilding } = useBuildings(user?.uid);
  const { units, updateUnit, addUnit, deleteUnit } = useAllUnits(user?.uid);

  const [activeView, setActiveView] = useState("dashboard");
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedUnit3D, setSelectedUnit3D] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [optimisticBuilding, setOptimisticBuilding] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarCollapsed(true);
    }
  }, []);

  const handleSetActiveView = (view) => {
    setActiveView(view);
    // Auto-collapse sidebar when entering 3D view, re-expand when leaving (if on desktop)
    if (view === "3d_view") {
      setSidebarCollapsed(true);
    } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setSidebarCollapsed(false);
    }
  };

  const [authTimedOut, setAuthTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAuthTimedOut(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  if (authLoading && !authTimedOut) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-100 font-sans text-zinc-500 p-4">
        <div className="h-9 w-9 animate-spin rounded-full border-3 border-zinc-300 border-t-[#0b3860]" />
        <p className="mt-4 text-[13px] font-semibold text-zinc-600 font-['Manrope']">Loading PropViz…</p>
        <button
          onClick={() => setAuthTimedOut(true)}
          className="mt-6 rounded-lg px-3 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 border border-zinc-300 bg-white shadow-sm cursor-pointer"
        >
          Taking long? Tap to continue →
        </button>
      </div>
    );
  }

  if (!user) return <Login />;

  const handleSelectProperty = (id) => {
    setSelectedBuildingId(id);
    handleSetActiveView("property_detail");
  };

  const handleCreateBuilding = async (buildingData) => {
    const newId = await addBuilding(buildingData);
    setSelectedBuildingId(newId);
    handleSetActiveView("3d_view");
  };

  // Called from dashboard with no args — creates blank building and enters 3D setup
  const handleNewBuildingFromDashboard = async () => {
    const tempId = `new-bldg-${Date.now()}`;
    const initialData = {
      id: tempId,
      name: "",
      address: "",
      floors: 1,
      units_per_floor: 1,
      advanced_build_mode: true,
      is_new: true,
      user_id: user?.uid,
    };
    setOptimisticBuilding(initialData);
    setSelectedBuildingId(tempId);
    handleSetActiveView("3d_view");

    try {
      const newId = await addBuilding({
        name: "",
        address: "",
        floors: 1,
        units_per_floor: 1,
        advanced_build_mode: true,
        is_new: true,
      });
      if (newId) {
        setOptimisticBuilding({ ...initialData, id: newId });
        setSelectedBuildingId(newId);
      }
    } catch (e) {
      console.error("Failed to add building:", e);
    }
  };

  const handleOpen3D = (id) => {
    setSelectedBuildingId(id);
    handleSetActiveView("3d_view");
  };

  const handleCancelNewBuilding = async () => {
    // Delete the blank building and go back to dashboard
    if (selectedBuildingId) {
      await deleteBuilding(selectedBuildingId);
    }
    setOptimisticBuilding(null);
    setSelectedBuildingId(null);
    handleSetActiveView("dashboard");
  };

  const selectedBuilding =
    buildings.find((b) => b.id === selectedBuildingId) ||
    (optimisticBuilding?.id === selectedBuildingId ? optimisticBuilding : null) ||
    (buildings.length > 0 && activeView === "3d_view" ? buildings[0] : null);
  const buildingUnits = units.filter((u) => u.buildingId === selectedBuilding?.id);
  const rentableUnits = units.filter((u) => !u.element_type || u.element_type === "unit");
  const rentableBuildingUnits = buildingUnits.filter((u) => !u.element_type || u.element_type === "unit");

  return (
    <main className={`flex h-[100dvh] w-full max-w-full overflow-hidden font-sans ${activeView === "3d_view" ? "bg-[#0b0f13]" : "bg-zinc-100"}`}>
      <Sidebar
        user={user}
        activeView={activeView}
        setActiveView={handleSetActiveView}
        onLogout={logout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div className={`flex-1 h-full min-h-0 flex flex-col overflow-hidden relative ${activeView !== "3d_view" ? "pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0" : "bg-[#0b0f13]"}`}>
        {activeView === "dashboard" && (
          <div key="dashboard" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <DashboardOverview
              buildings={buildings}
              units={rentableUnits}
              onAddBuilding={handleNewBuildingFromDashboard}
              onSelectProperty={handleSelectProperty}
              onOpen3D={handleOpen3D}
            />
          </div>
        )}

        {activeView === "properties" && (
          <div key="properties" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <PropertiesList
              buildings={buildings}
              units={rentableUnits}
              onSelectProperty={handleSelectProperty}
              onAddBuilding={handleNewBuildingFromDashboard}
              onOpen3D={handleOpen3D}
            />
          </div>
        )}

        {activeView === "settings" && (
          <div key="settings" className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <SettingsTab user={user} buildings={buildings} units={rentableUnits} />
          </div>
        )}

        {activeView === "property_detail" && selectedBuilding && (
          <div key={`property_detail_${selectedBuilding.id}`} className="flex-1 flex flex-col overflow-hidden animate-fade-in">
            <PropertyDetail
              building={selectedBuilding}
              units={rentableBuildingUnits}
              buildings={buildings}
              userId={user?.uid}
              updateUnit={updateUnit}
              updateBuilding={(data) => updateBuilding(selectedBuilding.id, data)}
              onLaunch3D={() => handleSetActiveView("3d_view")}
              onDeleteProperty={async () => {
                await deleteBuilding(selectedBuilding.id);
                handleSetActiveView("properties");
              }}
              onBack={() => handleSetActiveView("properties")}
            />
          </div>
        )}

        {activeView === "3d_view" && (
          selectedBuilding ? (
            <div key={`3d_view_${selectedBuilding.id}`} className="absolute inset-0 bg-[#0b0f13] overflow-hidden">
              <Visualizer3D
                building={selectedBuilding}
                onUpdateBuilding={(data) => updateBuilding(selectedBuilding.id, data)}
                onCancelNewBuilding={handleCancelNewBuilding}
                units={buildingUnits}
                selectedUnitId={selectedUnit3D?.id}
                onSelectUnit={(unit) => {
                  if (unit && unit.element_type && unit.element_type !== "unit") return;
                  setSelectedUnit3D(unit);
                }}
                onSaveLayout={async (editorRooms, deletedRoomIds) => {
                  // 1. Process deletions
                  for (const dId of deletedRoomIds) {
                    const toDel = buildingUnits.find(u => u.id === dId);
                    if (toDel && toDel.ref) {
                      await deleteUnit(toDel.ref);
                    }
                  }

                  // 2. Process updates and additions
                  for (const room of editorRooms) {
                    const unitData = {
                      unit_label: room.unit_label,
                      floor: room.floor,
                      status: room.status || "vacant",
                      monthly_rent: room.monthly_rent || 0,
                      x: room.x,
                      z: room.z,
                      width: room.width,
                      depth: room.depth,
                      height: room.height,
                      rotation: room.rotation || 0,
                      roof_type: room.roof_type || 'flat',
                      material_type: room.material_type || 'stucco',
                      texture_url: room.texture_url || null,
                      wall_color: room.wall_color || '#4a5a66',
                      element_type: room.element_type || 'unit',
                      has_balcony: !!room.has_balcony,
                      balcony_side: room.balcony_side || 'S',
                      balcony_depth: room.balcony_depth || 1.0,
                      tenant: room.tenant || null,
                      buildingId: selectedBuilding.id
                    };

                    if (room.id.startsWith("new-temp-")) {
                      await addUnit(selectedBuilding.id, unitData);
                    } else {
                      const existingRef = buildingUnits.find(u => u.id === room.id)?.ref;
                      if (existingRef) {
                        await updateUnit(existingRef, unitData);
                      }
                    }
                  }
                }}
                onBack={() => {
                  handleSetActiveView(selectedBuilding?.is_new ? "dashboard" : "property_detail");
                  setSelectedUnit3D(null);
                }}
              />
              {selectedUnit3D && (
                <UnitPanel unit={selectedUnit3D} onClose={() => setSelectedUnit3D(null)} />
              )}
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-[#0b0f13] text-white p-6 font-sans text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-white/20 border-t-[#479de9] mb-4" />
              <p className="text-[14px] font-semibold text-zinc-300 font-['Manrope']">Loading 3D Visualizer…</p>
              <button
                onClick={() => handleSetActiveView("dashboard")}
                className="mt-6 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[12px] font-bold border border-white/10 transition cursor-pointer"
              >
                ← Return to Dashboard
              </button>
            </div>
          )
        )}

        {/* Mobile Bottom Navigation */}
        {activeView !== "3d_view" && (
          <BottomNav activeView={activeView} setActiveView={handleSetActiveView} />
        )}
      </div>
    </main>
  );
}
