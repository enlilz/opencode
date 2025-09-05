import type { Message, Agent, Provider, Session, Part, Config, Path, FileNode } from "@opencode-ai/sdk"
import { createStore, produce, reconcile } from "solid-js/store"
import { useSDK } from "./sdk"
import { createContext, Show, useContext, type ParentProps } from "solid-js"

function init() {
  const [store, setStore] = createStore<{
    ready: boolean
    provider: Provider[]
    agent: Agent[]
    config: Config
    path: Path
    session: {
      [sessionID: string]: Session
    }
    message: {
      [sessionID: string]: {
        [messageID: string]: Message
      }
    }
    part: {
      [sessionID: string]: {
        [messageID: string]: {
          [partID: string]: Part
        }
      }
    }
    file: FileNode[]
  }>({
    config: {},
    path: { state: "", config: "", worktree: "", directory: "" },
    ready: false,
    agent: [],
    provider: [],
    session: {},
    message: {},
    part: {},
    file: [],
  })

  const sdk = useSDK()

  sdk.event.subscribe().then(async (events) => {
    for await (const event of events.stream) {
      switch (event.type) {
        case "session.updated":
          setStore("session", event.properties.info.id, reconcile(event.properties.info))
          break
        case "message.updated":
          setStore(
            "message",
            produce((message) => {
              message[event.properties.info.sessionID] ??= {}
              message[event.properties.info.sessionID][event.properties.info.id] = event.properties.info
            }),
          )
          break
        case "message.part.updated":
          setStore(
            "part",
            produce((part) => {
              part[event.properties.part.sessionID] ??= {}
              part[event.properties.part.sessionID][event.properties.part.messageID] ??= {}
              part[event.properties.part.sessionID][event.properties.part.messageID][event.properties.part.id] =
                event.properties.part
            }),
          )
          break
      }
    }
  })

  Promise.all([
    sdk.config.providers().then((x) => setStore("provider", x.data!.providers)),
    sdk.path.get().then((x) => setStore("path", x.data!)),
    sdk.app.agents().then((x) => setStore("agent", x.data ?? [])),
    sdk.session.list().then((x) =>
      setStore(
        "session",
        x.data!.reduce(
          (acc, item) => {
            acc[item.id] = item
            return acc
          },
          {} as Record<string, Session>,
        ),
      ),
    ),
    sdk.config.get().then((x) => setStore("config", x.data!)),
    sdk.file.list({ query: { path: "/" } }).then((x) => setStore("file", x.data!)),
  ]).then(() => setStore("ready", true))

  return {
    data: store,
    set: setStore,
  }
}

type SyncContext = ReturnType<typeof init>

const ctx = createContext<SyncContext>()

export function SyncProvider(props: ParentProps) {
  const value = init()
  return (
    <Show when={value.data.ready}>
      <ctx.Provider value={value}>{props.children}</ctx.Provider>
    </Show>
  )
}

export function useSync() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useSync must be used within a SyncProvider")
  }
  return value
}
