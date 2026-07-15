#!/usr/bin/env bun

import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { readFileSync } from "node:fs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const entry = path.join(root, "packages", "opencode", "src", "index.ts")
const input = process.argv.slice(2)
const first = input[0]

if (first === "--help" || first === "-h") {
  process.stdout.write(`Novel Agent Harness

Usage:
  novel [prompt]                 open the interactive Writer agent
  novel --continue              resume the newest conversation in this novel
  novel --session <id>          resume a specific conversation
  novel init [options]          initialize the current Git-backed novel
  novel run <prompt> [options]  run one headless Writer task
  novel review <proposal-id>    show a stale-safe proposal diff
  novel commit <proposal-id>    commit an explicitly confirmed proposal
  novel state [--init]          inspect or initialize typed story state
  novel login [provider]        add a provider credential (for example, deepseek)
  novel providers login         configure an AI provider credential
  novel providers list          show configured credentials
  novel models [provider]       list available models

Inside the interactive agent, type /help for Writer commands.
`)
  process.exit(0)
}

if (first === "--version" || first === "-v") {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
  process.stdout.write(String(pkg.version) + "\n")
  process.exit(0)
}

const writerCommands = new Set(["chat", "init", "run", "review", "commit", "state"])
const passthroughCommands = new Set(["providers", "auth", "models", "completion"])
let args
if (first === "login") {
  const provider = input[1]
  args =
    provider && !provider.startsWith("-")
      ? ["providers", "login", "--provider", provider, ...input.slice(2)]
      : ["providers", "login", ...input.slice(1)]
} else if (first && passthroughCommands.has(first)) args = input
else if (first && writerCommands.has(first)) args = ["writer", ...input]
else args = ["writer", "chat", ...input]

const child = spawn(process.execPath, ["run", "--conditions=browser", entry, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
  windowsHide: false,
})

child.on("error", (error) => {
  if (error.code === "ENOENT") {
    process.stderr.write("Novel Agent Harness requires Bun 1.3.14 or newer: https://bun.sh\n")
  } else {
    process.stderr.write(error.message + "\n")
  }
  process.exit(1)
})

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    try {
      child.kill(signal)
    } catch {
      // The child has already exited.
    }
  })
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
