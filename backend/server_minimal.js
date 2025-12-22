require('dotenv').config();
const express = require('express');
const cors = require('cors');
// const { initializeAllDatabases } = require('./config/init');

const app = express();
module.exports = app;

// Middleware
const logger = require('./middleware/logger');
app.use(logger);

app.use(cors());
app.use(express.json());
