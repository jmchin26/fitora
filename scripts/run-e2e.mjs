import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const workspace = process.cwd();
const healthUrl = "http://127.0.0.1:3000/api/health";
const nextCli = path.join(
  workspace,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const playwrightCli = path.join(
  workspace,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function isFitoraReady() {
  try {
    const response = await fetch(healthUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(1_000),
    });
    const body = await response.json();

    return response.ok && body?.status === "ok" && body?.service === "fitora";
  } catch {
    return false;
  }
}

async function waitForFitora(server) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`The Fitora test server exited with code ${server.exitCode}.`);
    }

    if (await isFitoraReady()) {
      return;
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Fitora test server.");
}

async function stopServer(server) {
  if (!server.pid || server.exitCode !== null) {
    return;
  }

  const exited = once(server, "exit").then(() => true);
  server.kill("SIGTERM");

  if (await Promise.race([exited, delay(5_000).then(() => false)])) {
    return;
  }

  const forcedExit = once(server, "exit");
  server.kill("SIGKILL");
  await forcedExit;
}

let server = null;

try {
  if (!(await isFitoraReady())) {
    server = spawn(process.execPath, [nextCli, "dev", "-H", "127.0.0.1"], {
      cwd: workspace,
      stdio: "inherit",
      windowsHide: true,
    });
    await waitForFitora(server);
  }

  const runner = spawn(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    {
      cwd: workspace,
      env: { ...process.env, FITORA_E2E_PRESTARTED: "1" },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  const [exitCode] = await once(runner, "exit");

  process.exitCode = typeof exitCode === "number" ? exitCode : 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`E2E runner failed: ${message}`);
  process.exitCode = 1;
} finally {
  if (server) {
    await stopServer(server);
  }
}
