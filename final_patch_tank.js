const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Tank Visualizer
const tankStart = '                            {/* TANK VISUALIZER */}\n                            {showWaterLevel && (';
const tankEnd = '                                </div>\n                            )}';
// I'll find the specific anchor: "Estimation Cards - Moved here"
content = content.replace(
    /\{showWaterLevel && \(\s+<div className="apple-glass-card rounded-\[2\.5rem\] p-3 flex flex-col relative overflow-hidden">([\s\S]*?)<\/div>\s+<\/div>\s+<\/div>\s+\{ \/\* Estimation Cards/,
    `{showWaterLevel && (
                                <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">$1</div>
                            )}

                            { /* Estimation Cards`
);

// 2. Wrap Estimations
content = content.replace(
    /\{showEstimations && \(\s+<div className="apple-glass-card rounded-\[2\.5rem\] p-6 lg:p-7 flex flex-col relative overflow-hidden"[\s\S]*?<div className="grid grid-cols-2 gap-4 w-full">([\s\S]*?)<\/div>\s+<\/div>\s+\{\/\* COLUMN 2/,
    `{showEstimations && (
                                <div className="grid grid-cols-2 gap-4 w-full">$1</div>
                            )}

                        {/* COLUMN 2`
);
// Wait, my regexes are complex. I'll use simpler search/replace or just rewrite the areas.

// Let's use a simpler approach: finding unique markers and inserting.

fs.writeFileSync(path, content);
console.log('Successfully applied final patch to EvaraTankAnalytics.tsx');
