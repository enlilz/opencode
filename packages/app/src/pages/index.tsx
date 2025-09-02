import { FileIcon, Icon, IconButton, Tooltip } from "@/ui"
import { Tabs } from "@/ui/tabs"
import FileTree from "@/components/file-tree"
import type { FileNode } from "@opencode-ai/sdk"
import { createSignal, For } from "solid-js"
import { createStore } from "solid-js/store"
import { useApi } from "@/providers"
import { Code } from "@/components/code"
import { getFileExtension } from "@/utils"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  createSortable,
  closestCenter,
  useDragDropContext,
} from "@thisbeyond/solid-dnd"
import type { DragEvent, Transformer } from "@thisbeyond/solid-dnd"

type FileNodeWithContent = FileNode & { content?: string; preview: boolean }

export default function Page() {
  const api = useApi()
  const [selected, setSelected] = createSignal<FileNode>()
  const [selectedTab, setSelectedTab] = createSignal<string>()
  const [state, setState] = createStore({
    files: [] as FileNodeWithContent[],
  })
  const [clickTimer, setClickTimer] = createSignal<number | undefined>()
  const [activeItem, setActiveItem] = createSignal<string | undefined>(undefined)

  const resetClickTimer = () => {
    if (!clickTimer()) return
    clearTimeout(clickTimer())
    setClickTimer(undefined)
  }

  const startClickTimer = () => {
    const newClickTimer = setTimeout(() => {
      setClickTimer(undefined)
    }, 300)
    setClickTimer(newClickTimer as unknown as number)
  }

  const handleFileClick = async (file: FileNode) => {
    if (clickTimer()) {
      resetClickTimer()
      const index = state.files.findIndex((f) => f.path === file.path)
      setState("files", index, "preview", false)
    } else {
      if (file.type === "file") {
        const index = state.files.findIndex((f) => f.path === file.path)
        if (index === -1) {
          const content = await api.file.read({ query: { path: file.path } }).then((res) => res.data?.content)
          setState("files", [...state.files.filter((f) => !f.preview), { ...file, content, preview: true }])
        }
        setSelectedTab(file.path)
      }
      setSelected(file)
      startClickTimer()
    }
  }

  const handleTabChange = (path: string) => {
    setSelectedTab(path)
    setSelected(state.files.find((f) => f.path === path))
  }

  const handleTabClick = (file: FileNodeWithContent) => {
    if (clickTimer()) {
      resetClickTimer()
      if (file.preview) {
        const index = state.files.findIndex((f) => f.path === selectedTab())
        setState("files", index, "preview", false)
      }
    } else {
      startClickTimer()
    }
  }

  const handleTabClose = (file: FileNode) => {
    if (selectedTab() === file.path) {
      const index = state.files.findIndex((f) => f.path === file.path)
      const previous = Math.max(0, index - 1)
      setSelectedTab(state.files[previous].path)
      setSelected(state.files[previous])
    }
    setState("files", (files) => files.filter((f) => f.path !== file.path))
  }

  const onDragStart = (event: any) => {
    setActiveItem(event.draggable.id as string)
  }

  const onDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const currentFiles = state.files.map((f) => f.path)
      const fromIndex = currentFiles.indexOf(draggable.id.toString())
      const toIndex = currentFiles.indexOf(droppable.id.toString())
      if (fromIndex !== toIndex) {
        const updatedFiles = state.files.slice()
        updatedFiles.splice(toIndex, 0, ...updatedFiles.splice(fromIndex, 1))
        setState("files", updatedFiles)
      }
    }
  }

  const onDragEnd = () => {
    setActiveItem(undefined)
  }

  return (
    <div class="relative">
      <div
        class="fixed top-0 w-50 h-full py-2 overflow-y-auto no-scrollbar 
               border-r border-border-subtle/30"
      >
        <FileTree path="/" selected={selected()} onFileClick={handleFileClick} />
      </div>
      <div
        class="fixed top-0 left-px w-[198px] h-4 pointer-events-none 
               bg-gradient-to-t from-transparent to-background"
      />
      <div
        class="fixed bottom-0 left-px w-[198px] h-4 pointer-events-none
               bg-gradient-to-b from-transparent to-background"
      />
      <div class="pl-50 flex">
        <DragDropProvider
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          collisionDetector={closestCenter}
        >
          <DragDropSensors />
          <ConstrainDragYAxis />
          <Tabs
            class="grow w-full flex flex-col h-screen overflow-x-auto"
            value={selectedTab()}
            onChange={handleTabChange}
          >
            <Tabs.List class="sticky top-0 shrink-0">
              <SortableProvider ids={state.files.map((f) => f.path)}>
                <For each={state.files}>
                  {(file) => <SortableTab file={file} onTabClick={handleTabClick} onTabClose={handleTabClose} />}
                </For>
              </SortableProvider>
            </Tabs.List>
            <For each={state.files}>
              {(file) => (
                <Tabs.Content value={file.path} class="grow h-full pt-1">
                  <Code lang={getFileExtension(file.path)} code={file.content ?? ""} />
                </Tabs.Content>
              )}
            </For>
          </Tabs>
          <DragOverlay>
            {activeItem() &&
              (() => {
                const draggedFile = state.files.find((f) => f.path === activeItem())!
                return (
                  <div
                    class="relative px-3 h-9 flex items-center 
                           text-sm font-medium text-text whitespace-nowrap
                           shrink-0 bg-background-panel shadow-lg
                           border-x border-border-subtle/40 border-b border-b-transparent"
                  >
                    <TabVisual file={draggedFile} />
                  </div>
                )
              })()}
          </DragOverlay>
        </DragDropProvider>
      </div>
    </div>
  )
}

const TabVisual = (props: { file: FileNodeWithContent }) => (
  <div class="flex items-center gap-x-1.5">
    <FileIcon node={props.file} class="" />
    <span classList={{ "text-xs": true, italic: props.file.preview }}>{props.file.name}</span>
  </div>
)

const SortableTab = (props: {
  file: FileNodeWithContent
  onTabClick: (file: FileNodeWithContent) => void
  onTabClose: (file: FileNode) => void
}) => {
  const sortable = createSortable(props.file.path)

  return (
    // @ts-ignore
    <div use:sortable classList={{ "opacity-0": sortable.isActiveDraggable }}>
      <Tooltip value={props.file.path} placement="bottom">
        <div class="relative">
          <Tabs.Trigger value={props.file.path} class="peer/tab pr-7" onClick={() => props.onTabClick(props.file)}>
            <TabVisual file={props.file} />
          </Tabs.Trigger>
          <IconButton
            classList={{
              "absolute right-1 top-2": true,
              "opacity-0 text-text-muted/60": true,
              "peer-data-[selected]/tab:opacity-100 peer-data-[selected]/tab:text-text": true,
              "peer-data-[selected]/tab:hover:bg-border-subtle": true,
              "hover:opacity-100 peer-hover/tab:opacity-100": true,
            }}
            size="xs"
            variant="ghost"
            onClick={() => props.onTabClose(props.file)}
          >
            <Icon name="close" size={16} />
          </IconButton>
        </div>
      </Tooltip>
    </div>
  )
}

const ConstrainDragYAxis = () => {
  const context = useDragDropContext()
  if (!context) return <></>
  const [, { onDragStart, onDragEnd, addTransformer, removeTransformer }] = context
  const transformer: Transformer = {
    id: "constrain-y-axis",
    order: 100,
    callback: (transform) => ({ ...transform, y: 0 }),
  }
  onDragStart((event: any) => {
    addTransformer("draggables", event.draggable.id, transformer)
  })
  onDragEnd((event: any) => {
    removeTransformer("draggables", event.draggable.id, transformer.id)
  })
  return <></>
}
