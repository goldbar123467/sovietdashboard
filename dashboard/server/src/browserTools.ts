import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:os";

export interface BrowserLaunchResult {
  ok: boolean;
  message: string;
  command?: string;
}

const LINUX_CHROME_COMMANDS = [
  "google-chrome",
  "chromium",
  "chromium-browser",
  "microsoft-edge",
];

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "https://www.youtube.com";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("localhost:") || trimmed.startsWith("127.0.0.1:")) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function toEmbeddableUrl(input: string): string {
  const normalized = normalizeBrowserUrl(input);
  try {
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, "");
    let id: string | null = null;
    if (host === "youtube.com" && url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (id) {
      return `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    }
  } catch {
    return normalized;
  }
  return normalized;
}

function spawnDetached(command: string, args: string[]): BrowserLaunchResult {
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return { ok: true, message: `Launched ${command}`, command };
  } catch (err) {
    return { ok: false, message: String(err), command };
  }
}

function commandExists(command: string): boolean {
  if (command.endsWith(".exe")) {
    return spawnSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
  }
  return spawnSync("bash", ["-lc", `command -v ${command}`], { stdio: "ignore" }).status === 0;
}

export async function launchExternalBrowser(rawUrl: string): Promise<BrowserLaunchResult> {
  const url = normalizeBrowserUrl(rawUrl);
  const isWsl = process.platform === "linux" && Boolean(process.env.WSL_DISTRO_NAME);

  if (platform() === "darwin") {
    return spawnDetached("open", ["-a", "Google Chrome", url]);
  }

  if (isWsl) {
    if (commandExists("powershell.exe")) {
      return spawnDetached("powershell.exe", [
        "-NoProfile",
        "-Command",
        `Start-Process '${url.replaceAll("'", "''")}'`,
      ]);
    }
  }

  for (const command of LINUX_CHROME_COMMANDS) {
    if (!commandExists(command)) continue;
    const result = spawnDetached(command, [`--app=${url}`]);
    if (result.ok) return result;
  }

  return {
    ok: false,
    message: "No Chrome/Chromium launcher was available on PATH. Use the embedded tab or install chromium/google-chrome.",
  };
}
