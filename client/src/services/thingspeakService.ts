import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../lib/firebase'; // Assuming firebase is exported

export interface ThingSpeakFeed {
    created_at: string;
    entry_id: number;
    field1?: string;
    field2?: string;
    field3?: string;
    field4?: string;
    field5?: string;
    field6?: string;
    field7?: string;
    field8?: string;
}

export async function fetchThingSpeakData(nodeId: string, results = 100): Promise<ThingSpeakFeed[]> {
    if (!nodeId) return [];

    try {
        const functions = getFunctions(app);
        const getTelemetryData = httpsCallable(functions, 'getTelemetry');

        const response: any = await getTelemetryData({ nodeId, results });

        if (response.data && response.data.success) {
            return response.data.feeds as ThingSpeakFeed[];
        }
        return [];
    } catch (err: any) {
        console.error('Failed to fetch telemetry via Cloud Function:', err.message);
        throw new Error('Telemetry fetch failed');
    }
}

export function transformFeeds(feeds: ThingSpeakFeed[]) {
    return feeds.map(f => ({
        time: formatTime(f.created_at),
        fullTime: new Date(f.created_at).toLocaleString(),
        level: parseFloat(f.field1 || '0'),
        temperature: parseFloat(f.field2 || '0'),
        battery: parseFloat(f.field3 || '0'),
        raw: f
    }));
}

function formatTime(isoString: string) {
    const d = new Date(isoString);
    return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
}
