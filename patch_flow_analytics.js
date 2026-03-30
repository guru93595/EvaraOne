const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraFlowAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject feature flags extraction
const deviceInfoTarget = /const deviceInfo = \('data' in \(unifiedData\?\.info \?\? \{\}\)\s+\? \(unifiedData!\.info as \{ data: NodeInfoData \}\)\.data\s+: undefined\) as NodeInfoData \| undefined;/;
const deviceInfoReplacement = `const deviceInfo = ('data' in (unifiedData?.info ?? {})
        ? (unifiedData!.info as { data: NodeInfoData }).data
        : undefined) as (NodeInfoData & { features?: Record<string, boolean> }) | undefined;

    // 🎯 Product Configuration Features
    const features = deviceInfo?.features || {};
    const showMap = features.showMap ?? false;
    const showWaterSecurity = features.showWaterSecurity ?? true;
    const showSystemDynamics = features.showSystemDynamics ?? true;
    const showAlerts = features.showAlerts ?? false;
    const showConsumptionPattern = features.showConsumptionPattern ?? true;`;

if (deviceInfoTarget.test(content)) {
    content = content.replace(deviceInfoTarget, deviceInfoReplacement);
}

// 2. Wrap Sections
// Water Security Card
content = content.replace(
    /(<WaterSecurityCard[\s\S]*?\/>)/,
    '{showWaterSecurity && ($1)}'
);

// System Dynamics Card
content = content.replace(
    /(<FlowKPICard[\s\S]*?\/>)/,
    '{showSystemDynamics && ($1)}'
);

// Alerts Card
content = content.replace(
    /(<AlertsCard[\s\S]*?\/>)/,
    '{showAlerts && ($1)}'
);

// Consumption Pattern (Chart)
content = content.replace(
    /(<EvaraFlowHistoryChart[\s\S]*?\/>)/,
    '{showConsumptionPattern && ($1)}'
);

fs.writeFileSync(path, content);
console.log('Successfully patched EvaraFlowAnalytics.tsx');
