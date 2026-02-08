import { spawn } from "child_process";
import { existsSync } from "fs";
import { resolve } from "path";

const DEFAULT_WORKER_URL = "http://localhost:3002";
let workerProcess: ReturnType<typeof spawn> | null = null;
let starting = false;

function parseWorkerUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isLocalWorkerTarget(workerUrl: string): boolean {
  const parsed = parseWorkerUrl(workerUrl);
  if (!parsed) return false;
  return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
}

async function isWorkerHealthy(workerUrl: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const res = await fetch(`${workerUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function resolvePythonBinary(projectRoot: string): string {
  if (process.env.WORKER_PYTHON?.trim()) return process.env.WORKER_PYTHON.trim();

  const venvPython = resolve(projectRoot, ".venv/bin/python3");
  if (existsSync(venvPython)) return venvPython;

  return "python3";
}

function wireShutdownHandlers() {
  const stopWorker = () => {
    if (workerProcess && !workerProcess.killed) workerProcess.kill("SIGTERM");
  };
  process.on("SIGINT", stopWorker);
  process.on("SIGTERM", stopWorker);
  process.on("exit", stopWorker);
}

function startWorkerProcess(projectRoot: string) {
  if (workerProcess && !workerProcess.killed) return;

  const python = resolvePythonBinary(projectRoot);
  workerProcess = spawn(python, ["-m", "worker.src.main"], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  workerProcess.stdout?.on("data", (chunk) => {
    process.stdout.write(`[worker] ${chunk.toString()}`);
  });
  workerProcess.stderr?.on("data", (chunk) => {
    process.stderr.write(`[worker] ${chunk.toString()}`);
  });
  workerProcess.on("exit", (code, signal) => {
    console.warn(`[worker] exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    workerProcess = null;
  });
}

export async function ensureWorkerRunning(projectRoot: string): Promise<void> {
  if (process.env.WORKER_AUTO_START === "0" || process.env.WORKER_AUTO_START === "false") return;
  if (starting) return;

  const workerUrl = process.env.WORKER_URL || DEFAULT_WORKER_URL;
  if (!isLocalWorkerTarget(workerUrl)) return;
  if (await isWorkerHealthy(workerUrl)) return;

  starting = true;
  try {
    startWorkerProcess(projectRoot);
    wireShutdownHandlers();
    console.log(`[worker] auto-start attempted for ${workerUrl}`);
  } finally {
    starting = false;
  }
}
