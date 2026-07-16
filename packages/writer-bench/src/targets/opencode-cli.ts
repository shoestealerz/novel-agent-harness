import { protocolVersion, type ExecutionTask } from "../contracts.ts"
import { readRequest } from "./shared.ts"
import { executeStockOpenCode } from "./stock-opencode-runtime.ts"

const request = await readRequest()
if (request.kind !== "execute") throw new Error("the OpenCode CLI target executes systems; configure a separate judge target")
if (request.protocolVersion !== protocolVersion) throw new Error("stock OpenCode protocol version mismatch")
console.log(JSON.stringify(await executeStockOpenCode(request.task as ExecutionTask)))

