const fs = require('fs');
const path = require('path');

const root = __dirname;
const output = path.join(root, 'www');
const files = ['index.html', 'app.js', 'styles.css', 'styles-overrides.css', 'features.css'];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(output, file));
console.log(`Prepared Capacitor web bundle in ${output}`);
