import { buildApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = await buildApp({ config });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
