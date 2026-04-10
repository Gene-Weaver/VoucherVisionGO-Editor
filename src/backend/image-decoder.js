const fs = require('fs');
const path = require('path');
const { nativeImage } = require('electron');

const IMG_CACHE_DIR = '._img_cache';
const MAIN_JPEG_QUALITY = 50;
const THUMB_JPEG_QUALITY = 70;
const THUMB_MAX_DIM = 256;

// LRU image cache — keeps recently accessed images in memory
let IMAGE_CACHE_MAX = 2000;
const imageCache = new Map(); // key -> dataUrl | null
let warmGeneration = 0;

function setMaxCacheSize(size) {
  IMAGE_CACHE_MAX = Math.max(1, Math.min(6000, size));
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    imageCache.delete(oldest);
  }
}

function imageCacheKey(folderPath, filename, imageType, variant) {
  return `${folderPath}|${filename}|${imageType}|${variant}`;
}

function touchCacheEntry(key, value) {
  if (imageCache.has(key)) imageCache.delete(key);
  imageCache.set(key, value);
  while (imageCache.size > IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    imageCache.delete(oldest);
  }
}

function ensureCacheDirs(folderPath) {
  const root = path.join(folderPath, IMG_CACHE_DIR);
  const fullDir = path.join(root, 'full');
  const thumbDir = path.join(root, 'thumbs');
  if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
  if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
  return { root, fullDir, thumbDir };
}

function getCachedImagePath(folderPath, filename, imageType, variant) {
  const { fullDir, thumbDir } = ensureCacheDirs(folderPath);
  const base = filename.replace(/\.json$/i, '');
  const dir = variant === 'thumb' ? thumbDir : fullDir;
  return path.join(dir, `${base}__${imageType}_${variant}.jpg`);
}

function readSourceImageData(folderPath, filename, imageType) {
  const filePath = path.join(folderPath, filename);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const collageInfo = data.collage_info || {};

  if (imageType === 'collage') {
    return collageInfo.base64image_text_collage || null;
  }

  return collageInfo.base64image_original
    || collageInfo.base64image_input_resized
    || null;
}

function resizeToLongDim(nativeImg, maxDim) {
  const size = nativeImg.getSize();
  if (!size.width || !size.height) return nativeImg;
  const longDim = Math.max(size.width, size.height);
  if (longDim <= maxDim) return nativeImg;

  if (size.width >= size.height) {
    return nativeImg.resize({
      width: maxDim,
      height: Math.max(1, Math.round((size.height / size.width) * maxDim)),
      quality: 'good',
    });
  }

  return nativeImg.resize({
    width: Math.max(1, Math.round((size.width / size.height) * maxDim)),
    height: maxDim,
    quality: 'good',
  });
}

function buildCachedImage(folderPath, filename, imageType, variant) {
  const cachePath = getCachedImagePath(folderPath, filename, imageType, variant);
  const base64Data = readSourceImageData(folderPath, filename, imageType);
  if (!base64Data) return null;

  const img = nativeImage.createFromBuffer(Buffer.from(base64Data, 'base64'));
  if (img.isEmpty()) return null;

  const processed = variant === 'thumb'
    ? resizeToLongDim(img, THUMB_MAX_DIM)
    : img;
  const jpegQuality = variant === 'thumb' ? THUMB_JPEG_QUALITY : MAIN_JPEG_QUALITY;
  fs.writeFileSync(cachePath, processed.toJPEG(jpegQuality));
  return cachePath;
}

function ensureCachedImage(folderPath, filename, imageType = 'collage', variant = 'full') {
  const sourcePath = path.join(folderPath, filename);
  const cachePath = getCachedImagePath(folderPath, filename, imageType, variant);
  const sourceStat = fs.statSync(sourcePath);

  if (fs.existsSync(cachePath)) {
    const cacheStat = fs.statSync(cachePath);
    if (cacheStat.mtimeMs >= sourceStat.mtimeMs) {
      return cachePath;
    }
  }

  return buildCachedImage(folderPath, filename, imageType, variant);
}

function readCachedImageAsDataUrl(cachePath) {
  const jpgBuffer = fs.readFileSync(cachePath);
  return `data:image/jpeg;base64,${jpgBuffer.toString('base64')}`;
}

/**
 * Get a cached image as a data URL.
 * imageType: 'collage' or 'original'
 * variant: 'full' or 'thumb'
 */
function getImage(folderPath, filename, imageType = 'collage', variant = 'full') {
  const cacheKey = imageCacheKey(folderPath, filename, imageType, variant);
  if (imageCache.has(cacheKey)) {
    const val = imageCache.get(cacheKey);
    touchCacheEntry(cacheKey, val);
    return val;
  }

  const cachePath = ensureCachedImage(folderPath, filename, imageType, variant);
  if (!cachePath) {
    return null;
  }

  const dataUrl = readCachedImageAsDataUrl(cachePath);
  touchCacheEntry(cacheKey, dataUrl);
  return dataUrl;
}

/**
 * Warm thumbnail cache in the background after a folder is opened.
 * This prebuilds thumbs on disk and keeps recent ones hot in memory
 * for the focus carousel without blocking project load.
 */
function warmThumbnailCache(folderPath, filenames, imageTypes = ['collage', 'original']) {
  if (!folderPath || !Array.isArray(filenames) || filenames.length === 0) return;
  warmGeneration += 1;
  const runId = warmGeneration;
  const work = [];

  for (const imageType of imageTypes) {
    for (const filename of filenames) {
      work.push({ filename, imageType });
    }
  }

  let index = 0;
  const step = () => {
    if (runId !== warmGeneration || index >= work.length) return;
    const item = work[index++];
    try {
      getImage(folderPath, item.filename, item.imageType, 'thumb');
    } catch (e) {
      console.warn(`Thumbnail warm failed for ${item.filename} (${item.imageType}):`, e.message);
    }
    setImmediate(step);
  };

  setImmediate(step);
}

module.exports = { getImage, setMaxCacheSize, warmThumbnailCache };
