import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { adminService } from "../services/admin";
import { useAuth } from "../context/AuthContext";

export interface DashboardSummary {
  total_nodes: number;
  online_nodes: number;
  alerts_active: number;
  total_customers: number;
  total_communities: number;
  total_zones: number;
  system_health: number;
}

export const useDashboardSummary = () => {
  const { isAuthenticated } = useAuth();

  return useQuery<DashboardSummary>({
    queryKey: ["dashboard_summary"],
    queryFn: async () => {
      if (!isAuthenticated) {
        throw new Error("Not authenticated");
      }
      return await adminService.getDashboardSummary();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes stale
    gcTime: 1000 * 60 * 10, // 10 minutes cache
    refetchInterval: 1000 * 60 * 5, // refresh every 5 minutes (saves ~17K reads/day)
    retry: 0,
    enabled: isAuthenticated,
    placeholderData: keepPreviousData,
  });
};
