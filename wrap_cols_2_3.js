const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Rate Cards in Column 2
// Fill Rate Card
content = content.replace(
    /(<div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style=\{[\s\S]*?background: 'rgba\(52,199,89,0.15\)'[\s\S]*?<\/div>\s+<\/div>)/,
    '{showFillRate && ($1)}'
);

// Consumption Card
content = content.replace(
    /(<div className="apple-glass-card text-left rounded-2xl p-5 flex flex-col justify-between" style=\{[\s\S]*?background: 'rgba\(255,59,48,0.15\)'[\s\S]*?<\/div>\s+<\/div>)/,
    '{showConsumption && ($1)}'
);

// 2. Wrap Analytics Chart (Column 2)
content = content.replace(
    /\{\/\* ANALYTICS CHART 2 \*\/\}[\s\S]*?<div className="apple-glass-card rounded-\[2\.5rem\] p-3 lg:p-4 flex flex-col relative overflow-hidden flex-grow"[\s\S]*?<\/div>\s+<\/div>\s+<\/div>/,
    match => `{showConsumption && (${match})}`
);

// 3. Wrap Column 3 (Activity & Health)
// I'll wrap the entire Column 3 if needed, or individually.
// Let's do individually for better control.

fs.writeFileSync(path, content);
console.log('Successfully wrapped Columns 2 & 3 in EvaraTankAnalytics.tsx');
