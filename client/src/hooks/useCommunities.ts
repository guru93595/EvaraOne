import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import { adminService } from "../services/admin";
import type { Community } from "../types/entities";

export interface CommunityCreate {
  name: string;
  zone_id: string;
  address?: string;
  contact_email?: string;
  contact_phone?: string;
}

/**
 * Hook to fetch communities, optionally filtered by zone
 */
export const useCommunities = (regionId?: string) => {
  const {
    data: communities = [],
    isLoading,
    error,
    refetch,
  } = useQuery<Community[]>({
    queryKey: ["communities", regionId],
    queryFn: async () => {
      try {
        return await adminService.getCommunities(regionId);
      } catch (error: any) {
        console.error("[useCommunities] Failed to fetch communities:", error);
        throw error;
      }
    },
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return {
    communities,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Hook to create a new community
 */
export const useCreateCommunity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (communityData: CommunityCreate) => {
      try {
        const response = await api.post("/admin/communities", communityData);
        return { id: response.data.id, ...communityData };
      } catch (error: any) {
        console.error(
          "[useCreateCommunity] Failed to create community:",
          error,
        );
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
  });
};

/**
 * Hook to fetch a single community by ID
 */
export const useCommunity = (communityId: string) => {
  const {
    data: community,
    isLoading,
    error,
  } = useQuery<Community>({
    queryKey: ["community", communityId],
    queryFn: async () => {
      try {
        const response = await api.get(`/admin/communities/${communityId}`);
        return response.data as Community;
      } catch (error: any) {
        console.error("[useCommunity] Failed to fetch community:", error);
        throw error;
      }
    },
    enabled: !!communityId,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return {
    community,
    isLoading,
    error,
  };
};
