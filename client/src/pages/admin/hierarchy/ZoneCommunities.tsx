import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminService } from "../../../services/admin";
import { ChevronRight, Building, Wifi, ArrowLeft } from "lucide-react";
import type { Zone, Community } from "../../../types/entities";
import { Modal } from "../../../components/ui/Modal";
import { AddCommunityForm } from "../../../components/admin/forms/AddCommunityForm";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../components/ToastProvider";
import { Edit2, Trash2, Plus } from "lucide-react";

type CommunityWithCount = Community & { node_count?: number };

const RegionCommunities = () => {
  const { regionId } = useParams(); // regionId is actually the zone name here
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<CommunityWithCount[]>([]);
  const [regionData, setRegionData] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(
    null,
  );
  const { user } = useAuth();
  const { showToast } = useToast();

  useEffect(() => {
    const fetchCommunitiesAndRegion = async () => {
      if (!regionId) return;
      try {
        const [comms, zone] = await Promise.all([
          adminService.getCommunities(regionId),
          adminService.getRegion(regionId),
        ]);

        setCommunities(comms as CommunityWithCount[]);
        setRegionData(zone as Zone);
      } catch (error) {
        console.error("Failed to fetch communities:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCommunitiesAndRegion();
  }, [regionId]);

  const fetchData = async () => {
    if (!regionId) return;
    setLoading(true);
    try {
      const [comms, zone] = await Promise.all([
        adminService.getCommunities(regionId),
        adminService.getRegion(regionId),
      ]);
      setCommunities(comms as CommunityWithCount[]);
      setRegionData(zone as Zone);
    } catch (error) {
      console.error("Failed to fetch communities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCommunity = async (
    e: React.MouseEvent,
    communityId: string,
  ) => {
    e.stopPropagation();
    if (
      !window.confirm(
        "Are you sure you want to delete this community? This will impact all customers and devices assigned here.",
      )
    )
      return;

    try {
      await adminService.deleteCommunity(communityId);
      showToast("Community deleted successfully", "success");
      fetchData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete community", "error");
    }
  };

  // Non-blocking initial load
  const isInitialLoad = loading && communities.length === 0;

  return (
    <div className="glass-dashboard min-h-screen p-8">
      {/* Breadcrumb-ish Header */}
      <div className="flex items-center gap-[8px] text-[13px] text-[#1F2937] opacity-60 mb-[16px] tracking-wide font-[500]">
        <span
          onClick={() => navigate("/superadmin/zones")}
          className="hover:opacity-100 cursor-pointer transition-opacity"
        >
          Zones
        </span>
        <ChevronRight size={14} className="opacity-50" />
        <span className="font-[600] text-[#1F2937] opacity-100">
          {regionData?.zoneName || "Loading Zone..."}
        </span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-[24px]">
        <div>
          <h2 className="text-[28px] font-[600] tracking-[-0.5px] text-[#1F2937] leading-tight">
            {regionData?.zoneName || "Unknown Zone"} Communities
          </h2>
          <p className="glass-secondary mt-1">
            Select a community to manage customers and devices inside this
            precise zone.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === "superadmin" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-[8px] px-5 py-[12px] bg-[#1F2937] text-white text-[13px] font-[600] rounded-[12px] hover:bg-[#111827] shadow-md transition-all"
            >
              <Plus size={16} />
              Create Community
            </button>
          )}
          <button
            onClick={() => navigate("/superadmin/zones")}
            className="flex items-center gap-[8px] px-4 py-2 rounded-[12px] border border-[rgba(255,255,255,0.4)] bg-[rgba(255,255,255,0.3)] text-[#1F2937] opacity-80 hover:bg-[rgba(255,255,255,0.5)] text-[13px] font-[600] shadow-sm transition-all"
          >
            <ArrowLeft size={16} /> Back
          </button>
        </div>
      </div>

      <div className="apple-glass-card">
        <div className="apple-glass-content">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.1)] text-[11px] font-[600] text-[#1F2937] opacity-70 uppercase tracking-wider">
                <th className="px-6 py-5">Community Name</th>
                <th className="px-6 py-5">Zone / Area</th>
                <th className="px-6 py-5">Infrastructure Nodes</th>
                <th className="px-6 py-5">System Health</th>
                <th className="px-6 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(255,255,255,0.1)]">
              {communities.map((community) => (
                <tr
                  key={community.id}
                  onClick={() =>
                    navigate(`/superadmin/communities/${community.id}`)
                  }
                  className="group hover:bg-[rgba(255,255,255,0.2)] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-[12px] bg-[rgba(255,255,255,0.3)] flex items-center justify-center text-[#1F2937] opacity-80 border border-[rgba(255,255,255,0.4)] shadow-sm group-hover:scale-105 transition-transform">
                        <Building size={18} />
                      </div>
                      <div>
                        <span className="font-[600] text-slate-800 text-[14px] group-hover:text-[#3A7AFE] transition-colors block">
                          {community.name}
                        </span>
                        <span className="text-[11px] text-[#1F2937] opacity-50 font-mono tracking-tighter uppercase">
                          {community.id?.substring(0, 8)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-[13px] text-[#1F2937] font-[500] opacity-90">
                    {community.address || community.pincode || "N/A"}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[13px] text-[#1F2937] opacity-80">
                      <Wifi size={14} className="opacity-50" />
                      {community.node_count || 0} Nodes
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-[rgba(255,255,255,0.3)] overflow-hidden shadow-inner">
                        <div
                          className="h-full rounded-full bg-[#16A34A]"
                          style={{ width: "100%" }}
                        />
                      </div>
                      <span className="text-[12px] font-[600] text-[#16A34A]">
                        100%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {user?.role === "superadmin" && (
                        <div className="flex items-center gap-1 mr-2 invisible group-hover:visible">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCommunity(community);
                            }}
                            className="p-1.5 hover:bg-blue-50 rounded-lg text-blue-600 transition-colors"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={(e) =>
                              handleDeleteCommunity(e, community.id)
                            }
                            className="p-1.5 hover:bg-red-50 rounded-lg text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                      <ChevronRight
                        size={18}
                        className="text-[#1F2937] opacity-30 group-hover:text-[#3A7AFE] group-hover:opacity-100 transition-all inline-block"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {communities.length === 0 && (
            <div className="p-12 text-center text-[#1F2937] opacity-50 font-[500]">
              No communities found in this zone.
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Community Modal */}
      <Modal
        isOpen={showCreateModal || !!editingCommunity}
        onClose={() => {
          setShowCreateModal(false);
          setEditingCommunity(null);
        }}
        title={
          editingCommunity
            ? `Edit Community: ${editingCommunity.name}`
            : "Create New Community"
        }
      >
        <AddCommunityForm
          onSubmit={() => {
            setShowCreateModal(false);
            setEditingCommunity(null);
            fetchData();
          }}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingCommunity(null);
          }}
          initialData={editingCommunity}
        />
      </Modal>
    </div>
  );
};

export default RegionCommunities;
