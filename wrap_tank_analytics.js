const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Tank Visualizer
const tankTarget = '                            {/* TANK VISUALIZER */}\n                            <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">';
const tankReplacement = '                            {/* TANK VISUALIZER */}\n                            {showWaterLevel && (\n                                <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">';

if (content.includes(tankTarget)) {
    content = content.replace(tankTarget, tankReplacement);
    // Find matching closing div for the tank visualizer
    // This is tricky, but I'll search for the next column start or similar anchor
}

// 2. Wrap Estimations
const estimationsTarget = '                            {/* ESTIMATIONS */}\n                            <div className="apple-glass-card rounded-[2.5rem] p-6 lg:p-7 flex flex-col relative overflow-hidden"';
const estimationsReplacement = '                            {/* ESTIMATIONS */}\n                            {showEstimations && (\n                                <div className="apple-glass-card rounded-[2.5rem] p-6 lg:p-7 flex flex-col relative overflow-hidden"';

if (content.includes(estimationsTarget)) {
    content = content.replace(estimationsTarget, estimationsReplacement);
}

fs.writeFileSync(path, content);
console.log('Successfully wrapped sections in EvaraTankAnalytics.tsx');
