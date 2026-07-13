import type { ExecutionTask } from "../contracts.ts"
import { readRequest } from "./shared.ts"
import { executeWriterContract } from "./writer-contract-runtime.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the writer-contract target executes systems; configure a separate judge target")
const task = request.task as ExecutionTask
console.log(JSON.stringify(await executeWriterContract(task, "writer-contract-v0.1")))
