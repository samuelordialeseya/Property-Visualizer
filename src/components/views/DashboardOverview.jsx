"use client";
import { useMemo } from "react";
import { Plus, Home, AlertCircle, Building2, ArrowUp, ArrowDown, CheckCircle2, TrendingUp, Sparkles, Users, CalendarClock, ChevronRight } from "lucide-react";

/* ── Stat Card ─────────────────────────────────────────────────────────── */
function StatCard({ label, value, subLabel, icon: Icon, iconColor, iconBg, accentGradient }) {
  return (
    <div className="group relative rounded-2xl bg-white p-3.5 sm:p-5 shadow-[var(--shadow-card)] border border-zinc-200/70 overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-1">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-[0.08em] sm:tracking-[0.1em] font-['Manrope'] truncate">{label}</div>
        {Icon && (
          <div className={`rounded-xl p-2 sm:p-2.5 ${iconBg} ${iconColor} transition-transform group-hover:scale-110 duration-300 shadow-sm shrink-0`}>
            <Icon size={14} className="sm:w-4 sm:h-4" strokeWidth={2.5} />
          </div>
        )}
      </div>
      <div className="mt-2.5 sm:mt-3">
        <div className="text-[22px] sm:text-[30px] font-[800] leading-none text-zinc-900 tracking-tight font-['Sora']">{value}</div>
        {subLabel && (
          <div className="mt-2.5 sm:mt-3 text-[10px] sm:text-[11px] font-semibold font-['Manrope'] truncate">
            {subLabel}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Avatar with solid background ───────────────────────────────────── */
const AVATAR_COLORS = [
  "bg-[#0b3860]",
  "bg-[#0F4C81]",
  "bg-indigo-600",
  "bg-teal-600",
  "bg-purple-600",
];

function PropertyAvatar({ name }) {
  const idx = (name || "").charCodeAt(0) % AVATAR_COLORS.length;
  return (
    <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${AVATAR_COLORS[idx]} text-white font-bold text-[16px] font-['Sora'] shadow-sm`}>
      {name ? name.charAt(0).toUpperCase() : "B"}
    </div>
  );
}

/* ── Main Dashboard ────────────────────────────────────────────────────── */
export default function DashboardOverview({ buildings = [], units = [], onAddBuilding, onSelectProperty, onOpen3D }) {
  const stats = useMemo(() => {
    const totalUnits = units.length;
    const occupied = units.filter((u) => u.status === "occupied").length;
    
    let overdue = 0;
    let overdueAmount = 0;
    let vacant = 0;
    let expiringCount = 0;
    
    const today = new Date();
    
    units.forEach((u) => {
      if (u.status === "overdue") {
        overdue++;
        overdueAmount += Number(u.monthly_rent) || 0;
      }
      if (u.status === "vacant") {
        vacant++;
      }
      if (u.tenant?.lease_end) {
        const endDate = new Date(u.tenant.lease_end);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          expiringCount++;
        }
      }
    });

    const pct = totalUnits > 0 ? Math.round((occupied / totalUnits) * 100) : 0;
    
    const collectedRevenue = units
      .filter((u) => u.status === "occupied")
      .reduce((sum, u) => sum + (Number(u.monthly_rent) || 0), 0);
      
    const billedRevenue = units
      .filter((u) => u.status === "occupied" || u.status === "overdue")
      .reduce((sum, u) => sum + (Number(u.monthly_rent) || 0), 0);
      
    const potentialRevenue = units.reduce((sum, u) => sum + (Number(u.monthly_rent) || 0), 0);
    
    const collectionRate = billedRevenue > 0 ? Math.round((collectedRevenue / billedRevenue) * 100) : 0;
      
    return { totalUnits, occupied, overdue, overdueAmount, vacant, pct, revenue: billedRevenue, collectedRevenue, billedRevenue, potentialRevenue, collectionRate, expiringCount };
  }, [units]);

  const actionItems = useMemo(() => {
    const items = [];
    const today = new Date();
    
    units.forEach(u => {
      if (u.status === 'overdue') {
        items.push({
          id: `overdue-${u.id}`,
          type: 'overdue',
          buildingId: u.buildingId,
          label: `${u.unit_label || u.label || 'Unit'} • ${u.tenant?.name || 'Unknown'} — ₱${u.monthly_rent || 0} Overdue`
        });
      }
      if (u.tenant?.lease_end) {
        const endDate = new Date(u.tenant.lease_end);
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 30) {
          items.push({
            id: `expiring-${u.id}`,
            type: 'expiring',
            buildingId: u.buildingId,
            days: diffDays,
            label: `${u.unit_label || u.label || 'Unit'} • ${u.tenant?.name || 'Unknown'} — Ends in ${diffDays} days`
          });
        }
      }
      if (u.status === 'vacant') {
        const b = buildings.find(b => b.id === u.buildingId);
        items.push({
          id: `vacant-${u.id}`,
          type: 'vacant',
          buildingId: u.buildingId,
          label: `${u.unit_label || u.label || 'Unit'} in ${b?.name || 'Building'} is vacant`
        });
      }
    });

    const overdueItems = items.filter(i => i.type === 'overdue');
    const expiringItems = items.filter(i => i.type === 'expiring').sort((a,b) => a.days - b.days);
    const vacantItems = items.filter(i => i.type === 'vacant').slice(0, 3);

    return [...overdueItems, ...expiringItems, ...vacantItems];
  }, [units, buildings]);

  const ACCENT_COLORS = {
    overdue:  { bg: "bg-red-50/60",    badge: "bg-red-50 text-red-600 border border-red-200" },
    expiring: { bg: "bg-amber-50/60",  badge: "bg-amber-50 text-amber-600 border border-amber-200" },
    vacant:   { bg: "bg-zinc-50/60",   badge: "bg-zinc-100 text-zinc-600" },
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f4f4f5] font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 sm:px-8 md:px-12 pt-6 md:pt-12 pb-4 md:pb-6 shrink-0 animate-fade-down">
        <div>
          <h1 className="text-[26px] sm:text-[32px] md:text-[36px] font-[800] text-[#0b3860] tracking-[-0.03em] font-['Sora'] leading-tight">Portfolio Overview</h1>
          <p className="text-[13px] sm:text-[14px] text-zinc-400 mt-1 font-['Manrope'] font-medium">Manage properties, track tenants, and monitor revenue</p>
        </div>
        <button
          onClick={onAddBuilding}
          className="self-start sm:self-auto flex items-center gap-2 rounded-xl bg-[#0b3860] px-5 sm:px-6 py-2.5 sm:py-3 text-[12px] sm:text-[13px] font-[700] tracking-wide text-white transition hover:bg-[#051b30] shadow-md hover:shadow-lg active:scale-[0.97] font-['Manrope'] cursor-pointer shrink-0"
        >
          <Plus size={16} strokeWidth={3} />
          NEW BUILDING
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 md:px-12 pb-6 md:pb-12 space-y-5 sm:space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="animate-fade-up delay-50">
            <StatCard 
              label="TOTAL PROPERTIES" 
              value={buildings.length}
              subLabel={<span className="text-zinc-400 font-medium">{stats.totalUnits} Total Units</span>}
              icon={Building2} 
              iconColor="text-[#0F4C81]" 
              iconBg="bg-[#e1ebf4]" 
              accentGradient="bg-gradient-to-r from-[#0b3860] to-[#2270b8]"
            />
          </div>
          <div className="animate-fade-up delay-100">
            <StatCard 
              label="ACTIVE TENANTS" 
              value={`${stats.occupied}`}
              subLabel={
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">of {stats.totalUnits}</span>
                  <span className="text-[11px] font-bold text-[#0F4C81] bg-[#e1ebf4] px-2 py-0.5 rounded-full">{stats.pct}%</span>
                </div>
              }
              icon={Users} 
              iconColor="text-[#0F4C81]" 
              iconBg="bg-[#e1ebf4]" 
              accentGradient="bg-gradient-to-r from-[#2270b8] to-[#479de9]"
            />
          </div>
          <div className="animate-fade-up delay-150">
            <StatCard 
              label="OVERDUE RENT" 
              value={stats.overdue} 
              subLabel={
                stats.overdue === 0 ? (
                  <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1 text-[11px]"><CheckCircle2 size={12} /> All Paid</span>
                ) : (
                  <span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded-full inline-block text-[11px]">₱{stats.overdueAmount.toLocaleString()} overdue</span>
                )
              }
              icon={AlertCircle} 
              iconColor={stats.overdue > 0 ? "text-red-600" : "text-emerald-600"} 
              iconBg={stats.overdue > 0 ? "bg-red-100" : "bg-emerald-100"} 
              accentGradient={stats.overdue > 0 ? "bg-gradient-to-r from-red-500 to-red-400" : "bg-gradient-to-r from-emerald-500 to-emerald-400"}
            />
          </div>
          <div className="animate-fade-up delay-200">
            <StatCard 
              label="EXPIRING LEASES" 
              value={stats.expiringCount} 
              subLabel={<span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full inline-block text-[11px]">Next 30 days</span>}
              icon={CalendarClock} 
              iconColor="text-amber-600" 
              iconBg="bg-amber-100" 
              accentGradient="bg-gradient-to-r from-amber-500 to-amber-400"
            />
          </div>
        </div>

        {/* Content Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left panel: My Properties */}
          <div className="col-span-1 rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] border border-zinc-200/70 flex flex-col animate-fade-up delay-150">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[15px] font-[700] text-[#0b3860] tracking-[-0.01em] font-['Sora']">My Properties</h2>
              <span className="text-[11px] font-semibold text-zinc-400 bg-zinc-100 px-2.5 py-1 rounded-full font-['Manrope']">{buildings.length} total</span>
            </div>

            {buildings.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-16 text-center animate-scale-in">
                <div className="mb-4 rounded-2xl bg-white p-4 text-zinc-400 shadow-sm"><Building2 size={32} /></div>
                <p className="text-[15px] font-bold text-zinc-700">No properties yet</p>
                <p className="mt-1 text-[13px] text-zinc-500 font-medium">Click "New Building" to design your first property in 3D</p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1 scrollbar-hide">
                {buildings.map((b, idx) => {
                  const bUnits = units.filter(u => u.buildingId === b.id);
                  const occ = bUnits.filter(u => u.status === "occupied").length;
                  const bRev = bUnits
                    .filter((u) => u.status === "occupied" || u.status === "overdue")
                    .reduce((sum, u) => sum + (Number(u.monthly_rent) || 0), 0);
                    
                  return (
                    <div key={b.id} 
                      role="button"
                      tabIndex={0}
                      aria-label={`View property ${b.name || "Untitled Building"}`}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectProperty(b.id); } }}
                      onClick={() => onSelectProperty(b.id)}
                      style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}
                      className="flex items-center justify-between py-3.5 px-3 -mx-1 rounded-xl cursor-pointer transition-all duration-200 hover:bg-zinc-50 group animate-fade-up focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]">
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <PropertyAvatar name={b.name} />
                        <div className="min-w-0">
                          <p className="text-[14px] font-[700] text-zinc-800 truncate font-['Manrope']">{b.name || "Untitled Building"}</p>
                          <div className="mt-1 flex items-center gap-2.5 text-[11px] font-medium text-zinc-400">
                            <span className="flex items-center gap-1 text-[#0F4C81] bg-[#e1ebf4] px-2 py-0.5 rounded-full font-[600]">
                              <CheckCircle2 size={11} strokeWidth={3} />
                              {occ}/{bUnits.length}
                            </span>
                            <span className="text-zinc-500 font-[600]">₱{bRev.toLocaleString()}/mo</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpen3D(b.id); }}
                          aria-label={`Open 3D layout view for ${b.name || "building"}`}
                          className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white text-[11px] font-[700] text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition shadow-sm font-['Manrope'] cursor-pointer relative after:absolute after:-inset-1.5 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2270b8]"
                        >
                          3D View
                        </button>
                        <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right panel: Revenue and Attention */}
          <div className="col-span-1 space-y-5">
            {/* Revenue Card */}
            <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] border border-zinc-200/70 relative overflow-hidden animate-fade-up delay-150">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[11px] font-[700] text-zinc-400 uppercase tracking-[0.1em] font-['Manrope']">Est. Monthly Revenue</h2>
                <div className="rounded-xl bg-[#e1ebf4] p-2 text-[#0F4C81]"><TrendingUp size={14} /></div>
              </div>
              <div className="text-[32px] font-[800] text-zinc-900 tracking-tight font-['Sora'] mb-4">
                ₱{stats.revenue.toLocaleString()}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold font-['Manrope']">
                  <span className="text-zinc-400">Collection Rate</span>
                  <span className="text-[#0F4C81]">{stats.collectionRate}% · ₱{stats.collectedRevenue.toLocaleString()} / ₱{stats.billedRevenue.toLocaleString()}</span>
                </div>
                <div className="h-2.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#2270b8] rounded-full transition-all duration-700 ease-out" style={{ width: `${stats.collectionRate}%` }} />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-zinc-100">
                {[
                  { label: "Occupied", value: stats.occupied, color: "text-[#0F4C81]" },
                  { label: "Vacant", value: stats.vacant, color: "text-zinc-500" },
                  { label: "Overdue", value: stats.overdue, color: stats.overdue > 0 ? "text-red-600" : "text-emerald-600" },
                ].map(item => (
                  <div key={item.label} className="text-center">
                    <div className={`text-[18px] font-[800] font-['Sora'] ${item.color}`}>{item.value}</div>
                    <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-['Manrope']">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Attention Needed Card */}
            <div className="rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] border border-zinc-200/70 flex flex-col max-h-[340px] relative overflow-hidden animate-fade-up delay-200">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <h2 className="text-[11px] font-[700] text-zinc-400 uppercase tracking-[0.1em] font-['Manrope']">Attention Needed</h2>
                <div className={`rounded-xl p-2 shadow-sm ${actionItems.length > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"}`}>
                  {actionItems.length > 0 ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
                </div>
              </div>
              
              <div className="overflow-y-auto pr-1 space-y-1.5 scrollbar-hide">
                {actionItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center animate-scale-in">
                    <div className="mb-3 rounded-full bg-emerald-50 p-3.5 text-emerald-500"><Sparkles size={22} /></div>
                    <p className="text-[14px] font-semibold text-zinc-600 font-['Manrope']">All Clear!</p>
                    <p className="text-[12px] text-zinc-400 mt-0.5 font-['Manrope']">No pending issues or overdue payments</p>
                  </div>
                ) : (
                  actionItems.map((item, idx) => {
                    const accent = ACCENT_COLORS[item.type];
                    return (
                      <div 
                        key={item.id}
                        onClick={() => onSelectProperty(item.buildingId)}
                        style={{ animationDelay: `${Math.min(idx * 40, 300)}ms` }}
                        className={`flex items-center justify-between py-2.5 px-3 ${accent.bg} rounded-xl cursor-pointer hover:bg-zinc-50 transition-colors animate-fade-up`}
                      >
                        <span className="text-[12px] font-medium text-zinc-700 font-['Manrope'] pr-3 truncate">{item.label}</span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ${accent.badge}`}>
                          {item.type === 'overdue' ? 'OVERDUE' : item.type === 'expiring' ? 'EXPIRING' : 'VACANT'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
