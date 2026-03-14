/**
 * Home — Full-screen map page with device markers, pipeline overlays,
 * status panel, and system dashboard.
 */
import { useState } from "react";
import { Activity, Droplets, Waves, Database, Zap, ArrowDownCircle } from "lucide-react";
import clsx from "clsx";
import SharedMap from "../components/map/SharedMap";
import { useMapDevices } from "../hooks/useMapDevices";
import { useMapPipelines } from "../hooks/useMapPipelines";

// Extracted sub-components
import StatusOverlayPanel from "../components/map/StatusOverlayPanel";
import MapLegend from "../components/map/MapLegend";

export const Home = () => {
  const [showIndex, setShowIndex] = useState(false);
  const [showStatusOverview, setShowStatusOverview] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [activePipeline, setActivePipeline] = useState<string | null>(null);

  const { data: devices = [], isLoading: devicesLoading } = useMapDevices();
  const { pipelines, loading: pipelinesLoading } = useMapPipelines();

  const handleFilterClick = (filter: string) =>
    setActiveFilter((prev) => (prev === filter ? null : filter));
  const handlePipelineClick = (pipeline: string) =>
    setActivePipeline((prev) => (prev === pipeline ? null : pipeline));

  // Categories for StatusOverlayPanel
  const categories = [
    {
      name: "Pump Houses",
      devices: devices.filter((d: any) => d.asset_type === "pump"),
      color: "#9333ea",
      bg: "bg-purple-50",
      icon: <Zap size={12} className="text-purple-600" />,
    },
    {
      name: "Sumps",
      devices: devices.filter((d: any) => d.asset_type === "sump"),
      color: "#16a34a",
      bg: "bg-green-50",
      icon: <Droplets size={12} className="text-green-600" />,
    },
    {
      name: "Overhead Tanks",
      devices: devices.filter((d: any) => d.asset_type === "tank"),
      color: "#2563eb",
      bg: "bg-blue-50",
      icon: <Database size={12} className="text-blue-600" />,
    },
    {
      name: "Borewells (IIIT)",
      devices: devices.filter((d: any) => d.asset_type === "bore"),
      color: "#eab308",
      bg: "bg-yellow-50",
      icon: <Waves size={12} className="text-yellow-600" />,
    },
    {
      name: "Borewells (Govt)",
      devices: devices.filter((d: any) => d.asset_type === "govt"),
      color: "#1e293b",
      bg: "apple-glass-inner",
      icon: <ArrowDownCircle size={12} className="text-slate-600" />,
    },
  ];

  return (
    <div className="relative w-full h-screen flex flex-col">
      <div className="flex-1 relative z-0">
        <SharedMap
          devices={devices}
          pipelines={pipelines}
          activeFilter={activeFilter}
          activePipeline={activePipeline}
          height="100%"
          className="rounded-none border-none shadow-none"
          isRightPanelOpen={showStatusOverview}
        />

        {/* Overlay Buttons */}
        <div className="absolute top-[110px] lg:top-[120px] right-4 flex flex-col gap-3 z-[400]">
          <button
            onClick={() => {
              setShowStatusOverview(!showStatusOverview);
            }}
            className={clsx(
              "apple-glass-card backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200 hover:bg-white/40 transition-all group flex items-center gap-3",
              showStatusOverview &&
                "ring-2 ring-blue-400 shadow-[0_0_15px_rgba(58,122,254,0.5)]",
            )}
          >
            <div
              className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300",
                showStatusOverview
                  ? "bg-[var(--color-evara-blue)] text-white shadow-[0_0_15px_rgba(58,122,254,0.6)]"
                  : "bg-blue-50 text-[var(--color-evara-blue)] group-hover:bg-[var(--color-evara-blue)] group-hover:text-white",
              )}
            >
              <Activity size={20} />
            </div>
            <span className="font-semibold text-slate-700 pr-2">
              Status Overview
            </span>
          </button>
        </div>

        {/* Extracted Overlay Panels */}
        <StatusOverlayPanel
          visible={showStatusOverview}
          devices={devices}
          categories={categories}
        />

        {/* Subtle Loading Indicators */}
        {(devicesLoading || pipelinesLoading) && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[400] apple-glass-card backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-slate-200 flex items-center gap-3 animate-pulse">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              Syncing Live Data...
            </span>
          </div>
        )}
      </div>

      {/* Extracted Map Legend */}
      <MapLegend
        showIndex={showIndex}
        setShowIndex={setShowIndex}
        activeFilter={activeFilter}
        onFilterClick={handleFilterClick}
        activePipeline={activePipeline}
        onPipelineClick={handlePipelineClick}
      />
    </div>
  );
};

export default Home;
