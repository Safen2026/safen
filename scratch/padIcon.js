const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, '../assets/logo.png');
const outputPath = path.join(__dirname, '../assets/adaptive-icon.png');

sharp(inputPath)
  .resize(600, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer()
  .then(resizedLogo => {
    return sharp({
      create: {
        width: 1080,
        height: 1080,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
    .composite([
      {
        input: resizedLogo,
        gravity: 'center'
      }
    ])
    .toFile(outputPath);
  })
  .then(() => console.log('Adaptive icon created successfully!'))
  .catch(err => console.error('Error:', err));
