import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { readRequest } from "./shared.ts"
import { executeProductionWriter } from "./production-writer-runtime.ts"

const request = await readRequest()
if (request.protocolVersion !== protocolVersion || request.kind !== "execute") {
  throw new Error("the production Writer target only executes benchmark systems")
}
console.log(JSON.stringify(await executeProductionWriter(request.task as ExecutionTask)))
