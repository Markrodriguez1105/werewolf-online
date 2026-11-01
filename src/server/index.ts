import { createAppServer } from './app.ts';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535');
const server = createAppServer({ port, host: '0.0.0.0', dev: process.argv.includes('--dev') });
try {
  const actualPort = await server.listen();
  console.log(`Werewolf is running at http://localhost:${actualPort}`);
  const network = await fetch(`http://127.0.0.1:${actualPort}/api/network`).then(response => response.json()) as { urls: string[] };
  for (const url of network.urls) console.log(`Join from phones on the same Wi-Fi: ${url}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await server.close(); process.exitCode = 1;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close().then(() => process.exit()); });
