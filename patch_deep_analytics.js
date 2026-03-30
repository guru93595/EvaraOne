const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraDeepAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject feature flags extraction
const deviceInfoTarget = /const deviceInfo = \('data' in \(unifiedData\?\.info \?\? \{\}\)\s+\? \(unifiedData!\.info as \{ data: NodeInfoData \}\)\.data\s+: undefined\) as NodeInfoData \| undefined;/;
const deviceInfoReplacement = `const deviceInfo = ('data' in (unifiedData?.info ?? {})
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

if (deviceInfoTarget.test(content)) {
    content = content.replace(deviceInfoTarget, deviceInfoReplacement);
}

// 2. Wrap Sections
// Depth / Bore Visualizer
content = content.replace(
    /\{\/\* ── Depth \/ Bore Visualizer ── \*\/\}[\s\S]*?(<div[\s\S]*?<\/div>\s+<\/div>)\s+<\/div>\s+\{\/\* ── Depth Intelligence/,
    match => `{showWaterLevel && (${match})}`
);

// Depth Intelligence
content = content.replace(
    /\{\/\* ── Depth Intelligence ── \*\/\}[\s\S]*?(<div className="lg:col-span-4 apple-glass-card rounded-\[2\.5rem\] p-6 flex flex-col">[\s\S]*?<\/div>)\s+<\/div>/,
    match => `{showWaterLevel && (${match})}`
);

// Historical Analytics
content = content.replace(
    /\{\/\* ── Historical Analytics ── \*\/\}[\s\S]*?(<div className="apple-glass-card rounded-\[2\.5rem\] p-8">[\s\S]*?<\/div>)/,
    match => `{showConsumption && (${match})}`
);

fs.writeFileSync(path, content);
console.log('Successfully patched EvaraDeepAnalytics.tsx');
