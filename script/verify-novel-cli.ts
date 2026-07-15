import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import packageJson from "../package.json"

const root = path.resolve(import.meta.dir, "..")
const install = mkdtempSync(path.join(tmpdir(), "novel-cli-install-"))
const env = { ...process.env, BUN_INSTALL: install }

try {
  run(process.execPath, ["link"], root, env)

  const executable = path.join(install, "bin", process.platform === "win32" ? "novel.exe" : "novel")
  const version = run(executable, ["--version"], root, env)
  if (version.trim() !== packageJson.version) {
    throw new Error(
      `Expected novel --version to print ${packageJson.version}, received ${JSON.stringify(version.trim())}`,
    )
  }

  const help = run(executable, ["--help"], root, env)
  if (!help.includes("interactive Writer agent")) throw new Error("Installed novel command did not render its help")

  console.log(`Verified global novel command ${packageJson.version} at ${executable}`)
} finally {
  rmSync(install, { recursive: true, force: true })
}

function run(command: string, args: string[], cwd: string, environment: NodeJS.ProcessEnv) {
  const result = spawnSync(command, args, { cwd, env: environment, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    )
  }
  return result.stdout ?? ""
}
