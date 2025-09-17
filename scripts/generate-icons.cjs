#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

(async () => {
  try {
    const root = process.cwd();
    const src = path.join(root, 'public', 'icons', 'app-icon.svg');
    const outDir = path.join(root, 'public', 'icons');
    if (!fs.existsSync(src)) {
      console.error('Source SVG not found at:', src);
      process.exit(1);
    }
    fs.mkdirSync(outDir, { recursive: true });

    const tasks = [
      { name: 'icon-192.png', size: 192 },
      { name: 'icon-512.png', size: 512 },
      // Maskable: add padding (safe zone) to avoid cropping under mask
      { name: 'maskable-192.png', size: 192, maskable: true },
      { name: 'maskable-512.png', size: 512, maskable: true },
    ];

    for (const t of tasks) {
      const out = path.join(outDir, t.name);
      if (t.maskable) {
        // Render larger art to apply padding for maskable assets
        const padding = Math.round(t.size * 0.1); // 10% padding safe zone
        const canvas = sharp({ create: { width: t.size, height: t.size, channels: 4, background: '#0b1220' } });
        const rendered = await sharp(src).resize(t.size - padding * 2, t.size - padding * 2, { fit: 'contain' }).png().toBuffer();
        await canvas
          .composite([{ input: rendered, left: padding, top: padding }])
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toFile(out);
      } else {
        await sharp(src)
          .resize(t.size, t.size, { fit: 'cover' })
          .png({ compressionLevel: 9, adaptiveFiltering: true })
          .toFile(out);
      }
      console.log('Generated', t.name);
    }
    console.log('All icons generated into', outDir);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
