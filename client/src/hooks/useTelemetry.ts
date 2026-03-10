import { useQuery } from '@tanstack/react-query';
import { telemetryService, type TelemetryData } from '../services/TelemetryService';

export const useTelemetry = (nodeId: string | undefined) => {
    const {
        data,
        isLoading: loading,
        error: queryError,
        refetch: refresh
    } = useQuery<TelemetryData | null>({
        queryKey: ['telemetry', nodeId],
        queryFn: () => {
            if (!nodeId) return Promise.resolve(null);
            return telemetryService.getLiveTelemetry(nodeId);
        },
        enabled: !!nodeId,
    });

    const error = queryError ? (queryError as Error).message : null;

    return { data, loading, error, refresh };
};
