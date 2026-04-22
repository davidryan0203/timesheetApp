const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const authRoutes = require('./routes/authRoutes');
const timesheetRoutes = require('./routes/timesheetRoutes');

dotenv.config();

const app = express();

const normalizeOrigin = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '').toLowerCase();
};

const parseAllowedOrigins = () => {
  const configuredValues = [
    process.env.CLIENT_URL,
    process.env.CLIENT_URLS,
    process.env.FRONTEND_URL,
  ].filter(Boolean);

  const joined = configuredValues.length > 0
    ? configuredValues.join(',')
    : 'http://localhost:5173';

  return [...new Set(joined.split(',').map((origin) => normalizeOrigin(origin)).filter(Boolean))];
};

const allowedOrigins = parseAllowedOrigins();
const allowAllCors = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true';

app.use(
  cors({
    origin(origin, callback) {
      if (allowAllCors || !origin || allowedOrigins.includes(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
  })
);

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/timesheets', timesheetRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Server error' });
});

module.exports = app;
