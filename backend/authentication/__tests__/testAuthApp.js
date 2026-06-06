/**
 * Minimal Express app for auth integration tests (avoids full server.js side effects).
 */
require('dotenv').config();
const express = require('express');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/auth', require('../index'));

module.exports = app;
