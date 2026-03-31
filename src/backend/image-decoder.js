const fs = require('fs');
const path = require('path');

// LRU image cache — keeps recently accessed images in memory
let IMAGE_CACHE_MAX = 100;
const imageCache = new Map(); // key → dataUrl

function setMaxCacheSize(size) {
  IMAGE_CACHE_MAX = Math.max(1, Math.min(2000, size));
  // Evict if current cache exceeds new limit
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    imageCache.delete(oldest);
  }
}

function imageCacheKey(folderPath, filename, imageType) {
  return `${folderPath}|${filename}|${imageType}`;
}

/**
 * Decode base64 image from a specimen JSON and return as a data URL.
 * imageType: 'collage' or 'original'
 */
function getImage(folderPath, filename, imageType = 'collage') {
  const cacheKey = imageCacheKey(folderPath, filename, imageType);

  // Check cache
  if (imageCache.has(cacheKey)) {
    const val = imageCache.get(cacheKey);
    // Move to end (most recent)
    imageCache.delete(cacheKey);
    imageCache.set(cacheKey, val);
    return val;
  }

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

  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const dataUrl = `data:${mimeType};base64,${base64Data}`;

  // Store in cache, evict oldest if full
  imageCache.set(cacheKey, dataUrl);
  if (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    imageCache.delete(oldest);
  }

  return dataUrl;
}

module.exports = { getImage, setMaxCacheSize };
