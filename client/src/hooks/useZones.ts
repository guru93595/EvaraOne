import { useQuery } from "@tanstack/react-query";
import api from "../services/api";

export interface Zone {
  id: string;
  zoneName: string;
  state: string | null;
  country?: string | null;
  zone_code?: string | null;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch all zones
 */
export const useZones = () => {
  const {
    data: zones = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Zone[]>({
    queryKey: ["zones"],
    queryFn: async () => {
      try {
        const response = await api.get("/admin/zones");
        return response.data as Zone[];
      } catch (error: any) {
        console.error("[useZones] Failed to fetch zones:", error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 10,
    retry: 2,
  });

  return {
    zones,
    isLoading,
    error,
    refetch,
  };
};
