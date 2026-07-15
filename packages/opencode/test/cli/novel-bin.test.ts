import { describe, expect, test } from "bun:test"
import path from "node:path"

const root = path.resolve(import.meta.dir, "../../../../")
const bin = path.join(root, "bin", "novel.mjs")

function run(...args: string[]) {
  return Bun.spawnSync(["bun", bin, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" })
}

describe("novel command shim", () => {
  test("shows Writer-oriented help and the harness release version", () => {
    const help = run("--help")
    expect(help.exitCode).toBe(0)
    expect(help.stdout.toString()).toContain("novel [prompt]")
    expect(help.stdout.toString()).toContain("novel providers login")

    const version = run("--version")
    expect(version.exitCode).toBe(0)
    expect(version.stdout.toString().trim()).toMatch(/^0\.1\.0-alpha\.\d+$/)
  })

  test("routes Writer and provider subcommands through the retained runtime", () => {
    const init = run("init", "--help")
    expect(init.exitCode).toBe(0)
    expect(init.stdout.toString() + init.stderr.toString()).toContain("opencode writer init")

    const providers = run("providers", "--help")
    expect(providers.exitCode).toBe(0)
    expect(providers.stdout.toString() + providers.stderr.toString()).toContain("opencode providers")
  })
})
