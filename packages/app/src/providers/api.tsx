import { createContext, useContext, type ParentProps } from "solid-js"
import { createOpencodeClient } from "@opencode-ai/sdk/client"

export type ApiContext = ReturnType<typeof createOpencodeClient>

const ApiContext = createContext<ApiContext>(
  createOpencodeClient({
    baseUrl: "http://127.0.0.1:4096",
  }),
)

export function ApiProvider(props: ParentProps) {
  return <ApiContext.Provider value={ApiContext.defaultValue}>{props.children}</ApiContext.Provider>
}

export function useApi() {
  return useContext(ApiContext)
}
