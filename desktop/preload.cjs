'use strict';

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('CondomitDesktop', Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || '0.71.2'
}));
