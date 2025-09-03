import { createContext, useContext, type ParentProps } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/client"

export type ApiContext = ReturnType<typeof createOpencodeClient>

const host = import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "127.0.0.1"
const port = import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"

const ApiContext = createContext<ApiContext>(
  createOpencodeClient({
    baseUrl: `http://${host}:${port}`,
  }),
)

export function ApiProvider(props: ParentProps) {
  return <ApiContext.Provider value={ApiContext.defaultValue}>{props.children}</ApiContext.Provider>
}

export function useApi() {
  return useContext(ApiContext)
}
