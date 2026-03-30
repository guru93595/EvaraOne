const fs = require('fs');
const path = 'd:/MAIN/client/src/pages/EvaraTankAnalytics.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Wrap Tank Visualizer & Volume
// We look for "COLUMN 1: TANK & ESTIMATIONS" and wrap everything until "Estimation Cards"
const column1Match = /\/\* COLUMN 1: TANK & ESTIMATIONS \*\/[\s\S]*?<div className="flex flex-col gap-4 w-full">([\s\S]*?)\{\/\* Estimation Cards/;
if (column1Match.test(content)) {
    content = content.replace(column1Match, (match, p1) => {
        // p1 is the content of the column
        // We want to wrap the tank visualizer part
        const tankVisualizer = p1.replace(/\{? \/\* TANK VISUALIZER \*\/ \}?\s+<div className="apple-glass-card rounded-\[2\.5rem\] p-3 flex flex-col relative overflow-hidden">([\s\S]*?)<\/div>/,
            `{showWaterLevel && (
                                <div className="apple-glass-card rounded-[2.5rem] p-3 flex flex-col relative overflow-hidden">$1</div>
                            )}`);

        // Wrap volume card inside showWaterLevel
        const withVolume = tankVisualizer.replace(/(\{\/\* TANK VISUALIZER \*\/\}[\s\S]*?)\)\}\s+<div className="flex flex-col mt-4 pt-0 gap-2 z-10 w-full">([\s\S]*?)<\/div>/,
            `$1
                                {showWaterVolume && (
                                    <div className="flex flex-col mt-4 pt-0 gap-2 z-10 w-full">$2</div>
                                )}
                            )}`);

        return `/* COLUMN 1: TANK & ESTIMATIONS */
                        <div className="flex flex-col gap-4 w-full">

                            ${withVolume}

                            {/* Estimation Cards`;
    });
}

// 2. Wrap Estimations
const estimationsMatch = /\{\/\* Estimation Cards - Moved here below Tank Card \*\/\}[\s\S]*?<div className="grid grid-cols-2 gap-4 w-full">([\s\S]*?)<\/div>/;
if (estimationsMatch.test(content)) {
    content = content.replace(estimationsMatch, (match, p1) => {
        return `{/* Estimation Cards - Moved here below Tank Card */}
                            {showEstimations && (
                                <div className="grid grid-cols-2 gap-4 w-full">${p1}</div>
                            )}`;
    });
}

fs.writeFileSync(path, content);
console.log('Successfully wrapped Column 1 sections in EvaraTankAnalytics.tsx');
