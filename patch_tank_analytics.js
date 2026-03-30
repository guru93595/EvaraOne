const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

const target = `    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as NodeInfoData | undefined;`;

const replacement = `    const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as (NodeInfoData & { features?: Record<string, boolean> }) | undefined;

    // 🎯 Product Configuration Features
    const features = deviceInfo?.features || {};
    const showWaterLevel = features.showWaterLevel ?? true;
    const showWaterVolume = features.showWaterVolume ?? false;
    const showEstimations = features.showEstimations ?? false;
    const showFillRate = features.showFillRate ?? true;
    const showConsumption = features.showConsumption ?? true;
    const showAlerts = features.showAlerts ?? true;
    const showHealth = features.showHealth ?? true;
    const showMap = features.showMap ?? false;`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(path, content);
    console.log('Successfully patched EvaraTankAnalytics.tsx');
} else {
    // Try a more flexible match if direct match fails
    const flexibleTarget = /const deviceInfo = \('data' in \(unifiedData\?\.info \?\? \{\}\)\s+\? \(unifiedData!\.info as \{ data: NodeInfoData \}\)\.data\s+: undefined\) as NodeInfoData \| undefined;/;
    if (flexibleTarget.test(content)) {
        content = content.replace(flexibleTarget, replacement);
        fs.writeFileSync(path, content);
        console.log('Successfully patched EvaraTankAnalytics.tsx (flexible match)');
    } else {
        console.error('Target not found in EvaraTankAnalytics.tsx');
        process.exit(1);
    }
}
