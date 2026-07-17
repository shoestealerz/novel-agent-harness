const writerCommands = new Set(["chat", "init", "run", "review", "commit", "state"])
const passthroughCommands = new Set(["providers", "auth", "models", "completion"])

const chatGPTBrowserMethod = "ChatGPT Pro/Plus (browser)"
const chatGPTDeviceMethod = "ChatGPT Pro/Plus (headless)"

export function chatGPTLoginMethod(device: boolean) {
  return device ? chatGPTDeviceMethod : chatGPTBrowserMethod
}

export function routeNovelArgs(input: string[]) {
  const first = input[0]
  if (first === "login") return loginArgs(input.slice(1))
  if (first && passthroughCommands.has(first)) return input
  if (first && writerCommands.has(first)) return ["writer", ...input]
  return ["writer", "chat", ...input]
}

function loginArgs(input: string[]) {
  const provider = input[0]
  if (provider?.toLowerCase() === "chatgpt") {
    const device = input.slice(1).some((arg) => arg === "--device-code" || arg === "--headless")
    const rest = input.slice(1).filter((arg) => arg !== "--device-code" && arg !== "--headless")
    return ["providers", "login", "--provider", "openai", "--method", chatGPTLoginMethod(device), ...rest]
  }
  if (provider && !provider.startsWith("-")) {
    return ["providers", "login", "--provider", provider, ...input.slice(1)]
  }
  return ["providers", "login", ...input]
}
