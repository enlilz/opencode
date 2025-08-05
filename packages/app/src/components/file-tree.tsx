import { useApi } from "@/providers"
import { Collapsible, FileIcon, Tooltip } from "@/ui"
import type { FileNode } from "@opencode-ai/sdk"
import { useQuery } from "@tanstack/solid-query"
import { For, Match, Switch, type ParentProps } from "solid-js"
import { createStore } from "solid-js/store"

export default function FileTree(props: {
  path: string
  class?: string
  nodeClass?: string
  level?: number
  selected?: FileNode
  onFileClick?: (file: FileNode) => void
}) {
  const api = useApi()
  const files = useQuery(() => ({
    queryKey: ["files", props.path],
    queryFn: () => api.file.list({ query: { path: props.path } }).then((res) => res.data),
  }))
  const [open, setOpen] = createStore<string[]>([])
  const level = props.level ?? 0

  const updateOpenDirectories = (value: boolean, path: string) => {
    if (value) {
      setOpen((open) => {
        if (open.includes(path)) return open
        return [...open, path]
      })
    } else {
      setOpen((open) => {
        if (!open.includes(path)) return open
        return open.filter((p) => p !== path)
      })
    }
  }

  const handleClick = (node: FileNode) => {
    if (props.onFileClick) {
      props.onFileClick(node)
    }
  }

  const NodeButton = (p: ParentProps & { node: FileNode }) => (
    <button
      classList={{
        "p-0.5 w-full flex items-center gap-x-2 hover:bg-background-panel cursor-pointer": true,
        "bg-background-element": props.selected?.path === p.node.path,
        [props.nodeClass ?? ""]: !!props.nodeClass,
      }}
      style={`padding-left: ${level * 10}px`}
      onClick={() => handleClick(p.node)}
    >
      {p.children}
      <span
        classList={{
          "text-xs whitespace-nowrap truncate": true,
          "text-text-muted/40": p.node.ignored,
          "text-text-muted/80": !p.node.ignored,
          "!text-text": props.selected?.path === p.node.path,
        }}
      >
        {p.node.name}
      </span>
    </button>
  )

  return (
    <div class={`flex flex-col ${props.class}`}>
      <For each={files.data}>
        {(node) => (
          <Tooltip forceMount={false} openDelay={2000} value={node.path} placement="right">
            <Switch>
              <Match when={node.type === "directory"}>
                <Collapsible forceMount={false} onOpenChange={(open) => updateOpenDirectories(open, node.path)}>
                  <Collapsible.Trigger>
                    <NodeButton node={node}>
                      <Collapsible.Arrow size={16} class="text-text-muted/60 ml-1" />
                      <FileIcon node={node} expanded={open.includes(node.path)} class="text-text-muted/60 -ml-1" />
                    </NodeButton>
                  </Collapsible.Trigger>
                  <Collapsible.Content>
                    <FileTree
                      path={node.path}
                      level={level + 1}
                      selected={props.selected}
                      onFileClick={props.onFileClick}
                    />
                  </Collapsible.Content>
                </Collapsible>
              </Match>
              <Match when={node.type === "file"}>
                <NodeButton node={node}>
                  <div class="w-4 shrink-0" />
                  <FileIcon node={node} class="text-primary" />
                </NodeButton>
              </Match>
            </Switch>
          </Tooltip>
        )}
      </For>
    </div>
  )
}
