const express = require('express');
const path = require('path');
const { loadFileStorageConfig } = require('../utils/fileStorageConfig');
const localStorageProvider = require('../services/localStorageProvider');

const router = express.Router();

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

router.get(/.*/, async (req, res) => {
  try {
    const config = await loadFileStorageConfig();
    if (config.provider !== 'local') {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    const relativePath = String(req.url || req.path || '').split('?')[0].replace(/^\/+/, '');
    if (!relativePath) {
      return res.status(400).json({
        success: false,
        message: 'File path is required',
      });
    }

    const absolutePath = await localStorageProvider.resolveReadablePath(config.local, relativePath);
    if (!absolutePath) {
      return res.status(404).json({
        success: false,
        message: 'File not found',
      });
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.sendFile(absolutePath);
  } catch (error) {
    console.error('[File Serve] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to serve file',
      error: error.message,
    });
  }
});

module.exports = router;
