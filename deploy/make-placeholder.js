// One-off: regenerate public/images/placeholder.jpg as a REAL JPEG.
// The previous file was an SVG saved with a .jpg extension, so the Next
// image optimizer rejected every /_next/image request for it with 400
// ("image type is not allowed") and cards without a cover/landmark rendered
// broken images. Run: node deploy/make-placeholder.js
const sharp = require('sharp')
const path = require('path')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750">
  <rect width="1200" height="750" fill="#0F1A2C"/>
  <path d="M 460 385 L 460 300 A 140 140 0 0 1 740 300 L 740 385"
        fill="none" stroke="#D4A843" stroke-width="9"/>
</svg>`

sharp(Buffer.from(svg), { density: 96 })
  .jpeg({ quality: 82 })
  .toFile(path.join('public', 'images', 'placeholder.jpg'))
  .then((info) => console.log('written', JSON.stringify(info)))
  .catch((e) => { console.error(e); process.exit(1) })
