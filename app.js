const express = require('express');
const promBundle = require('express-prom-bundle');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 2000;

// Structured JSON logger — logs go to stdout so Promtail/Docker logging driver can pick them up
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

// Prometheus metrics middleware
// Exposes /metrics automatically, tracks request count/duration/status by route
const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  metricType: 'histogram',
  promClient: {
    collectDefaultMetrics: {}, // also collects process/CPU/memory metrics
  },
});

app.use(metricsMiddleware);

// Log every request as structured JSON, with timing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration_ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]({
      route: req.path,
      method: req.method,
      status: res.statusCode,
      duration_ms,
    }, 'request completed');
  });
  next();
});

// Fast, always-healthy baseline route
app.get('/', (req, res) => {
  res.json({ message: 'ok' });
});

// Plain health check — kept separate so it doesn't pollute traffic metrics/logs
app.get('/health', (req, res) => {
  res.status(200).send('healthy');
});

// Artificially slow route — random 200ms to 2000ms delay
// This is what makes latency histogram/percentile panels in Grafana show real variation
app.get('/slow', (req, res) => {
  const delay = Math.floor(Math.random() * 1800) + 200;
  setTimeout(() => {
    res.json({ message: 'done', delay_ms: delay });
  }, delay);
});

// Randomly errors ~25% of the time — populates error-rate panels and Alertmanager rules
app.get('/error', (req, res) => {
  if (Math.random() < 0.25) {
    logger.error({ route: '/error' }, 'simulated failure');
    return res.status(500).json({ error: 'simulated internal server error' });
  }
  res.json({ message: 'no error this time' });
});

// Route with a path parameter — gives Grafana route-level breakdown instead of flat traffic
app.get('/users/:id', (req, res) => {
  res.json({ userId: req.params.id, name: `User ${req.params.id}` });
});

// Bind to 0.0.0.0, not localhost — required so Docker can expose this outside the container
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'server started');
});