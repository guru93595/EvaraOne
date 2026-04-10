import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNodes } from "../hooks/useNodes";
import { adminService } from "../services/admin";
import { socket } from "../services/api";
import { computeDeviceStatus } from "../services/DeviceService";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";

// Operational Components
import KPIAuthoritativeCard from "../components/dashboard/KPIAuthoritativeCard";
import ProductPieChart from "../components/dashboard/ProductPieChart";
import AlertsActivityPanel from "../components/dashboard/AlertsActivityPanel";
import SharedMap from "../components/map/SharedMap";
import ErrorBoundary from "../components/ErrorBoundary";

// ─── System Health Card ───────────────────────────────────────────────────────
const SystemHealthCard = ({ systemStatus, healthPct }: { systemStatus: string; healthPct: number }) => (
  <div className="apple-glass-card px-[20px] py-[16px] rounded-[20px] h-full flex flex-col justify-between">
    <div className="flex justify-between items-start">
      <span className="text-[12px] font-[800] text-[var(--text-muted)] uppercase tracking-[0.1em]">System Health</span>
      <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-400/15 flex items-center justify-center border border-blue-500/20 dark:border-blue-400/20 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="icon-health-adaptive">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      </div>
    </div>
    <div className="flex items-baseline gap-2">
      <h2 className="text-[36px] font-[800] text-[var(--text-primary)] leading-none tracking-tight">{healthPct}</h2>
      <span className="text-[20px] font-[800] text-[var(--text-muted)] leading-none">%</span>
    </div>
    <div className="flex items-center gap-1.5">
      <span className={clsx(
        "w-2 h-2 rounded-full",
        systemStatus === "Optimal" ? "bg-[#16A34A] shadow-[0_0_8px_rgba(22,163,74,0.4)]" : "bg-[#F59E0B] shadow-[0_0_8px_rgba(245,158,11,0.4)]"
      )} />
      <span className="text-[10px] font-[800] text-[var(--text-muted)] uppercase tracking-tight">
        {systemStatus === "Optimal" ? "Active" : "Attention Required"}
      </span>
    </div>
  </div>
);



// ─── Level Trend 24H Chart ────────────────────────────────────────────────────
const LevelTrendChart = ({ nodes }: { nodes: any[] }) => {
  // Generate representative bar chart data across 24h
  const data = useMemo(() => {
    const hours = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "NOW"];
    return hours.map((h, i) => ({
      time: h,
      level: nodes.length > 0
        ? Math.max(20, Math.min(100, 40 + Math.sin(i * 0.9) * 30 + Math.random() * 15))
        : Math.max(15, 30 + Math.sin(i * 1.1) * 20),
    }));
  }, [nodes.length]);

  return (
    <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
      <span className="text-[12px] font-[800] text-[var(--text-muted)] uppercase tracking-[0.1em] mb-4 shrink-0">Level Trend (24H)</span>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fontWeight: 700, fill: "var(--text-muted)" }}
              interval="preserveStartEnd"
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                backdropFilter: "var(--card-blur)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                fontSize: 11,
                color: "var(--text-primary)"
              }}
              itemStyle={{ color: "var(--text-primary)" }}
              formatter={(v: any) => [`${Math.round(v)}%`, "Level"]}
            />
            <Bar dataKey="level" radius={[8, 8, 0, 0]}
              fill="rgba(10,132,255,0.7)"
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── Usage Peak Weekly Chart ──────────────────────────────────────────────────
const UsagePeakChart = ({ nodes }: { nodes: any[] }) => {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const today = new Date().getDay(); // 0=Sun, 1=Mon...
  const todayIdx = today === 0 ? 6 : today - 1;

  const data = useMemo(() => days.map((d, i) => ({
    day: d,
    usage: Math.max(30, Math.min(100, 50 + Math.sin(i * 0.8 + 1) * 30 + (nodes.length > 0 ? 10 : 0))),
    isToday: i === todayIdx,
  })), [nodes.length, todayIdx]);

  return (
    <div className="apple-glass-card p-[20px] rounded-[20px] h-full flex flex-col">
      <span className="text-[12px] font-[800] text-[var(--text-muted)] uppercase tracking-[0.1em] mb-4 shrink-0">Usage Peak (Weekly)</span>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="10%">
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 9, fontWeight: 700, fill: "var(--text-muted)" }}
              interval="preserveStartEnd"
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid var(--card-border)",
                background: "var(--card-bg)",
                backdropFilter: "var(--card-blur)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                fontSize: 11,
                color: "var(--text-primary)"
              }}
              itemStyle={{ color: "var(--text-primary)" }}
              formatter={(v: any) => [`${Math.round(v)}%`, "Usage"]}
            />
            <Bar dataKey="usage" radius={[8, 8, 0, 0]}
              fill="#22d3ee"
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard() {
  const { nodes } = useNodes() as { nodes: any[] };

  const [realtimeStatuses, setRealtimeStatuses] = useState<Record<string, "Online" | "Offline">>({});

  useEffect(() => {
    const handleUpdate = (data: any) => {
      const id = data.device_id || data.node_id;
      if (!id) return;
      const status = computeDeviceStatus(data.timestamp || data.created_at || data.last_seen);
      setRealtimeStatuses(prev => ({ ...prev, [id]: status }));
    };
    socket.on("telemetry_update", handleUpdate);
    return () => { socket.off("telemetry_update", handleUpdate); };
  }, []);

  // Removed legacy polling as useNodes handles it

  const { totalDevices, onlineDevices, offlineDevices, tankNodes, flowNodes, deepNodes } = useMemo(() => {
    const total = nodes.length;
    const online = nodes.filter(n => (realtimeStatuses[n.id] || n.status) === "Online").length;
    const tank = nodes.filter(n => ["evaratank", "EvaraTank", "tank", "sump"].includes(n.asset_type)).length;
    const flow = nodes.filter(n => ["evaraflow", "EvaraFlow", "flow", "flow_meter"].includes(n.asset_type)).length;
    const deep = nodes.filter(n => ["evaradeep", "EvaraDeep", "bore", "govt"].includes(n.asset_type)).length;
    return { totalDevices: total, onlineDevices: online, offlineDevices: total - online, tankNodes: tank, flowNodes: flow, deepNodes: deep };
  }, [nodes, realtimeStatuses]); const { data: auditLogs = [] } = useQuery({
    queryKey: ["dashboard_audit_logs"],
    queryFn: async () => {
      const logs = await adminService.getAuditLogs();
      return logs.map((l) => ({
        id: l.id,
        device_id: l.resource_id || "SYSTEM",
        event_type: l.action_type,
        timestamp: new Date(l.created_at).toLocaleTimeString(),
        severity: (l.action_type.toLowerCase().includes("critical")
          ? "critical"
          : l.action_type.toLowerCase().includes("warn")
            ? "warning"
            : "info") as "critical" | "warning" | "info",
      }));
    },
    staleTime: 1000 * 60 * 5,
  });
  const explorerNodes = useMemo(() => nodes.map((n) => {
    const isOnline = n.status === "Online";
    const nodeHardwareId = n.hardwareId || n.id;
    return {
      id: nodeHardwareId,
      firestore_id: n.firestore_id || n.id,
      name: n.displayName || n.name || nodeHardwareId || n.node_key || "Unknown Node",
      type: (["evaratank", "EvaraTank", "tank", "sump"].includes(n.asset_type)
        ? "tank"
        : ["evaraflow", "EvaraFlow", "flow", "flow_meter"].includes(n.asset_type)
          ? "flow"
          : "deep") as "tank" | "flow" | "deep",
      status: n.status as "Online" | "Offline",
      isStale: !isOnline,
      lastSeen: n.last_seen || n.updatedAt || undefined,
      metrics: n.last_telemetry || {},
      location: n.location_name || n.community_name || n.zone_name || (n.communityId || n.zoneId ? "Main Site" : "General Area"),
      device: n.assetType || n.asset_type || "Sensor",
    };
  }), [nodes]);

  const mapDevices = useMemo(() => nodes.map((n) => {
    const nodeHardwareId = n.hardwareId || n.id;
    return {
      id: nodeHardwareId,
      firestore_id: n.firestore_id || n.id,
      name: n.displayName || n.name || nodeHardwareId || n.node_key || "Unknown Node",
      status: n.status as "Online" | "Offline",
      latitude: n.latitude,
      longitude: n.longitude,
      asset_type: n.assetType || n.asset_type,
      analytics_template: n.analytics_template || n.analyticsTemplate,
      device_type: n.device_type || n.category,
    };
  }), [nodes]);

  const totalStale = explorerNodes.filter((n) => n.isStale).length;
  const systemStatus = totalStale > nodes.length * 0.2 ? "Attention" : "Optimal";
  const healthPct = systemStatus === "Optimal" ? 92 : 78;

  return (
    <div className="w-full min-h-screen flex flex-col bg-transparent relative pt-[85px] lg:pt-[95px] pb-6">

      {/* ── Top Header Bar ── */}
      <div className="px-4 lg:px-6 pt-3 pb-2 relative z-10">
        <header className="max-w-screen-2xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-[800] tracking-tight text-[var(--dashboard-heading)] leading-none mb-1.5">
              System Dashboard
            </h1>
            <p className="text-[11px] text-[var(--text-muted)] font-bold uppercase tracking-[0.15em] opacity-80 mb-0">
              Real-Time Network Intelligence
            </p>
          </div>
        </header>
      </div>

      {/* ── Top Row: 4-col grid (3 KPI cards + Map) ── */}
      <div className="grid grid-cols-4 gap-4 px-4 lg:px-6 mb-4 relative z-10">
        <KPIAuthoritativeCard
          total={totalDevices}
          online={onlineDevices}
          offline={offlineDevices}
          className="min-h-[140px]"
        />
        <AlertsActivityPanel
          total={auditLogs.length}
          critical={auditLogs.filter((l: any) => l.severity === "critical").length}
          warning={auditLogs.filter((l: any) => l.severity === "warning").length}
          className="min-h-[140px]"
        />
        <SystemHealthCard systemStatus={systemStatus} healthPct={healthPct} />
        {/* Map */}
        <div className="apple-glass-card min-h-[140px] relative group rounded-[20px] overflow-hidden">
          <SharedMap
            devices={mapDevices as any}
            pipelines={[]}
            height="100%"
            showZoom={false}
            className="h-full"
          />
          <div className="absolute top-3 right-3 z-[500]">
            <Link
              to="/map"
              className="px-4 py-1.5 rounded-[16px] bg-white dark:bg-white/10 text-[10px] font-[800] text-blue-600 dark:text-white shadow-xl border border-white dark:border-white/20 flex items-center gap-1.5 transition-all opacity-0 group-hover:opacity-100 uppercase tracking-widest"
            >
              Expand <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Bottom Row: 3 chart cards that scale with the screen ── */}
      <div className="grid grid-cols-3 gap-4 px-4 lg:px-6 flex-1 relative z-10">
        <div className="h-full min-h-[280px] max-h-[45vh]">
          <LevelTrendChart nodes={nodes} />
        </div>
        <div className="h-full min-h-[280px] max-h-[45vh]">
          <UsagePeakChart nodes={nodes} />
        </div>
        <div className="h-full min-h-[280px] max-h-[45vh]">
          <ProductPieChart
            tank={tankNodes}
            flow={flowNodes}
            deep={deepNodes}
            className="h-full"
          />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div className="text-center py-3 mt-auto relative z-10">
        <p className="text-[9px] font-[700] text-gray-400/60 uppercase tracking-[0.2em]">
          © 2025 System Intelligence. All Rights Reserved.
        </p>
      </div>

    </div>
  );
}

export default function DashboardWithBoundary() {
  return (
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  );
}
