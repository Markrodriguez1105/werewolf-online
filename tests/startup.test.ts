import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import QRCode from 'qrcode';

// Catches missing terminal QR output or QR codes encoding localhost/the wrong port.
test('startup prints a terminal QR for each LAN URL using the assigned port', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], {
    cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { errors += chunk; });
  const closed = new Promise(resolve => child.once('close', resolve));
  t.after(async () => { child.kill('SIGTERM'); await closed; });
  const deadline = Date.now() + 5000;
  while (!/http:\/\/localhost:\d+/.test(output) && child.exitCode === null && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const port = output.match(/http:\/\/localhost:(\d+)/)?.[1];
  assert.ok(port, `Server did not start: ${errors}`);
  const network = await fetch(`http://127.0.0.1:${port}/api/network`).then(response => response.json()) as { urls: string[] };
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then(response => response.json());
  assert.deepEqual(health, { ok: true });
  // No network adapter is a valid environment; localhost must not be advertised to phones.
  if (!network.urls.length) return;
  while (!output.includes('Keep this terminal open') && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.match(output, /[▀▄█]/, 'Startup must render a QR code in the terminal');
  for (const url of network.urls) {
    assert.equal(new URL(url).port, port);
    assert.ok(output.includes(url), 'The scannable URL must also be printed as text');
    // Use the existing QR renderer as an oracle, checking our URL wiring, not QR encoding.
    const qr = await QRCode.toString(url, { type: 'terminal', small: true });
    assert.ok(output.includes(qr), `Terminal QR must encode the reachable URL ${url}`);
  }
  assert.equal(errors, '');
});
