const { PNG } = require('pngjs');
const { apcoFooterBase64 } = require('../dist/services/default-logo');

function main() {
  const matches = apcoFooterBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  if (!matches) {
    console.error('No base64 match');
    return;
  }
  const base64Data = matches[2];
  const buffer = Buffer.from(base64Data, 'base64');

  const png = PNG.sync.read(buffer);
  console.log(`Image size: ${png.width}x${png.height}`);

  let firstOpaqueRow = -1;
  let lastOpaqueRow = -1;

  for (let y = 0; y < png.height; y++) {
    let rowHasOpaque = false;
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      const alpha = png.data[idx + 3];
      if (alpha > 0) {
        rowHasOpaque = true;
        break;
      }
    }
    if (rowHasOpaque) {
      if (firstOpaqueRow === -1) {
        firstOpaqueRow = y;
      }
      lastOpaqueRow = y;
    }
  }

  console.log(`First opaque row (from top, 0-indexed): ${firstOpaqueRow}`);
  console.log(`Last opaque row (from top, 0-indexed): ${lastOpaqueRow}`);
  console.log(`Visible height in pixels: ${lastOpaqueRow - firstOpaqueRow + 1}`);
}

main();
