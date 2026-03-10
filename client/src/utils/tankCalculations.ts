export type TankShape = 'rectangular' | 'sump' | 'cylindrical';

interface TankDimensions {
    tankShape: TankShape;
    heightM: number;
    lengthM: number;
    breadthM: number;
    radiusM: number;
    capacityOverrideLitres: number | null;
}

export const computeCapacityLitres = (dims: TankDimensions): number => {
    if (dims.capacityOverrideLitres && dims.capacityOverrideLitres > 0) {
        return dims.capacityOverrideLitres;
    }

    let volumeM3 = 0;
    if (dims.tankShape === 'rectangular' || dims.tankShape === 'sump') {
        volumeM3 = dims.lengthM * dims.breadthM * dims.heightM;
    } else if (dims.tankShape === 'cylindrical') {
        volumeM3 = Math.PI * Math.pow(dims.radiusM, 2) * dims.heightM;
    }

    return volumeM3 * 1000; // 1 m3 = 1000 Litres
};

export const percentageToVolume = (percentage: number, capacityLitres: number): number => {
    return (percentage / 100) * capacityLitres;
};

export const formatVolume = (litres: number): string => {
    if (litres >= 1000) {
        return `${(litres / 1000).toFixed(1)} KL`;
    }
    return `${Math.round(litres)} L`;
};

interface MetricOptions {
    sensorReadingCm: number | null;
    dims: TankDimensions;
}

export const computeTankMetrics = ({ sensorReadingCm, dims }: MetricOptions) => {
    const capacityLitres = computeCapacityLitres(dims);
    const tankHeightCm = dims.heightM * 100;

    if (sensorReadingCm === null || sensorReadingCm < 0) {
        return {
            waterHeightCm: 0,
            percentage: 0,
            volumeLitres: 0,
            capacityLitres,
            isDataValid: false,
        };
    }

    // sensorReadingCm is usually the distance from the top of the tank to the water surface
    const waterHeightCm = Math.max(0, Math.min(tankHeightCm, tankHeightCm - sensorReadingCm));
    const percentage = (waterHeightCm / tankHeightCm) * 100;
    const volumeLitres = percentageToVolume(percentage, capacityLitres);

    return {
        waterHeightCm,
        percentage,
        volumeLitres,
        capacityLitres,
        isDataValid: true,
    };
};
