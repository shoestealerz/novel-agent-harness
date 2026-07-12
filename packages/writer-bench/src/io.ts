import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown
}

export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2) + "\n")
}

export async function readJsonl(path: string) {
  return (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as unknown
      } catch (error) {
        throw new Error(`${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
      }
    })
}

export async function writeJsonl(path: string, values: unknown[]) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, values.map((value) => JSON.stringify(value)).join("\n") + "\n")
}
