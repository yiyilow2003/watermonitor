// WaterMonitor — self-hosted server
// Receives readings from the ESP32 (POST /api/readings) and serves a
// dashboard that shows current levels and history. No third-party
// platform involved — you run this yourself.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;
const DATA_FILE = path.join(__dirname, 'readings.json');
const MAX_READINGS_PER_TANK = 3000; // keeps the data file from growing forever

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadReadings() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Could not read readings.json, starting fresh:', err.message);
    return [];
  }
}

function saveReadings(readings) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(readings, null, 2));
}

// --- ESP32 posts a new reading here ---
// Body: { "tank": "Tank 1", "level": 2.31 }
app.post('/api/readings', (req, res) => {
  const { tank, level } = req.body || {};

  if (typeof tank !== 'string' || !tank.trim() || typeof level !== 'number' || Number.isNaN(level)) {
    return res.status(400).json({ error: 'tank (string) and level (number) are required' });
  }

  const readings = loadReadings();
  readings.push({
    tank: tank.trim(),
    level,
    timestamp: new Date().toISOString(),
  });

  // Trim old readings for this tank if it's grown past the cap
  const countForTank = readings.filter((r) => r.tank === tank.trim()).length;
  if (countForTank > MAX_READINGS_PER_TANK) {
    let toRemove = countForTank - MAX_READINGS_PER_TANK;
    for (let i = 0; i < readings.length && toRemove > 0; i++) {
      if (readings[i].tank === tank.trim()) {
        readings.splice(i, 1);
        i--;
        toRemove--;
      }
    }
  }

  saveReadings(readings);
  console.log(`[reading] ${tank} -> ${level} m`);
  res.json({ status: 'ok' });
});

// --- Dashboard reads history here ---
// GET /api/readings?tank=Tank%201&limit=200
app.get('/api/readings', (req, res) => {
  const readings = loadReadings();
  const { tank, limit } = req.query;

  let filtered = tank ? readings.filter((r) => r.tank === tank) : readings;
  if (limit) filtered = filtered.slice(-parseInt(limit, 10));

  res.json(filtered);
});

// --- Dashboard reads the latest value per tank here ---
app.get('/api/latest', (req, res) => {
  const readings = loadReadings();
  const latestByTank = {};
  for (const r of readings) {
    latestByTank[r.tank] = r; // readings are appended in order, so last wins
  }
  res.json(Object.values(latestByTank));
});

// --- List every tank name that has ever reported in ---
app.get('/api/tanks', (req, res) => {
  const readings = loadReadings();
  const tanks = [...new Set(readings.map((r) => r.tank))];
  res.json(tanks);
});

app.listen(PORT, () => {
  console.log(`WaterMonitor server listening on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});
