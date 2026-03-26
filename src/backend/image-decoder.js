const fs = require('fs');
const path = require('path');

/**
 * Decode base64 image from a specimen JSON and return as a data URL.
 * imageType: 'collage' or 'original' (future)
 */
function getImage(folderPath, filename, imageType = 'collage') {
  const filePath = path.join(folderPath, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  let base64Data = null;
  let format = data.collage_image_format || 'jpeg';

  if (imageType === 'collage' && data.collage_info) {
    base64Data = data.collage_info.base64image_text_collage;
  } else if (imageType === 'original' && data.collage_info) {
    base64Data = data.collage_info.base64image_input_resized || null;
  }

  if (!base64Data) return null;

  // Return as data URL for direct use in <img src="...">
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mimeType};base64,${base64Data}`;
}

module.exports = { getImage };
