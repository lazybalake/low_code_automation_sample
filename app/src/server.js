'use strict';

const { loadConfig } = require('./config');
const { buildServer } = require('./app');

const config = loadConfig();
if (!config.apiKey) {
  console.error('API_KEY is not set. Copy .env.example to .env and give it a long random value.');
  process.exit(1);
}

const { app, bus, logger } = buildServer(config);
const server = app.listen(config.port, config.host, () => {
  logger.info(`${config.storeName} inventory API listening on http://localhost:${config.port}`);
  if (config.subscriptions.length) {
    logger.info(`Static webhook subscriptions: ${config.subscriptions.map((s) => `${s.events.join('|')} -> ${s.targetUrl}`).join(', ')}`);
  }
  if (!config.webhookSecret) logger.warn('WEBHOOK_SECRET is empty, so static webhook deliveries are not signed.');
});

async function shutdown(signal) {
  logger.info(`${signal} received, finishing webhook deliveries...`);
  server.close();
  await Promise.race([bus.flush(), new Promise((r) => setTimeout(r, 5000))]);
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
