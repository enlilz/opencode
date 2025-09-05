import { FileIcon, Icon, IconButton, Tooltip } from "@/ui"
import { Tabs } from "@/ui/tabs"
import FileTree from "@/components/file-tree"
import { createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useLocal, useSDK } from "@/context"
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
import type { LocalFile, TextSelection } from "@/context/local"

export default function Page() {
  const sdk = useSDK()
  const local = useLocal()
  const [clickTimer, setClickTimer] = createSignal<number | undefined>()
  const [activeItem, setActiveItem] = createSignal<string | undefined>(undefined)
  const [inputValue, setInputValue] = createSignal("")
  const [isSelecting, setIsSelecting] = createSignal(false)

  // TODO: remove
  local.model.set({ providerID: "opencode", modelID: "grok-code" })

  let inputRef: HTMLInputElement | undefined = undefined

  const MOD = typeof navigator === "object" && /(Mac|iPod|iPhone|iPad)/.test(navigator.platform) ? "Meta" : "Control"

  onMount(() => {
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("mouseup", handleMouseUp)
    // Expose function globally for debugging/testing
    ;(window as any).openFileAndSelectLines = openFileAndSelectLines
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
    document.removeEventListener("mousedown", handleMouseDown)
    document.removeEventListener("mouseup", handleMouseUp)
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if (document.activeElement === inputRef) {
      if (e.key === "Escape") {
        inputRef?.blur()
      }
      return
    }

    if (local.file.active()) {
      if ((e.key === "a" || e.key === "A") && e.getModifierState(MOD)) {
        e.preventDefault()
        selectAllInActiveCode()
        return
      }
    }

    if (e.key.length === 1 && e.key !== "Unidentified") {
      inputRef?.focus()
    }
  }

  const handleMouseDown = (e: MouseEvent) => {
    const t = e.target as Element | null
    if (!t) return
    setIsSelecting(true)
  }

  const handleMouseUp = () => {
    if (!isSelecting()) return
    setIsSelecting(false)

    if (!local.file.active()) return

    const wselection = window.getSelection()
    if (!wselection || wselection.rangeCount === 0) return

    const range = wselection.getRangeAt(0)
    const startContainer = range.startContainer
    const endContainer = range.endContainer

    const getLineElement = (n: Node) =>
      (n.nodeType === Node.TEXT_NODE ? (n.parentElement as Element) : (n as Element))?.closest(".line")

    const startLineElement = getLineElement(startContainer)
    const endLineElement = getLineElement(endContainer)
    if (!startLineElement || !endLineElement) return

    const startRoot = startLineElement.closest("[data-source-file]") as HTMLElement | null
    const endRoot = endLineElement.closest("[data-source-file]") as HTMLElement | null
    if (!startRoot || startRoot !== endRoot) return

    const codeContainer = startRoot.querySelector("code") as HTMLElement | null
    if (!codeContainer) return

    const allLines = Array.from(codeContainer.querySelectorAll(".line"))
    const startLineIndex = allLines.indexOf(startLineElement)
    const endLineIndex = allLines.indexOf(endLineElement)
    if (startLineIndex === -1 || endLineIndex === -1) return

    const filePath = startRoot.getAttribute("data-source-file") || local.file.active()!.path
    const startLine = startLineIndex + 1
    const endLine = endLineIndex + 1
    const startChar = getCharacterOffsetInLine(startLineElement, startContainer, range.startOffset)
    const endChar = getCharacterOffsetInLine(endLineElement, endContainer, range.endOffset)

    const prev = local.file.node(filePath).selection
    if (
      prev &&
      prev.startLine === startLine &&
      prev.endLine === endLine &&
      prev.startChar === startChar &&
      prev.endChar === endChar
    ) {
      wselection.removeAllRanges()
      return
    }

    const selection = { startLine, startChar, endLine, endChar }
    local.file.select(filePath, selection)
    applySelectionToCode(codeContainer, selection)
    wselection.removeAllRanges()
  }

  function selectAllInActiveCode() {
    const active = local.file.active()
    if (!active) return

    const root = document.querySelector(`[data-source-file="${active.path}"]`) as HTMLElement | null
    if (!root) return
    const element = root.querySelector("code") as HTMLElement | null
    if (!element) return

    const lines = Array.from(element.querySelectorAll(".line"))
    if (!lines.length) return

    const r = document.createRange()
    const last = lines[lines.length - 1]
    r.selectNodeContents(last)
    const lastLen = r.toString().length

    const selection = { startLine: 1, startChar: 0, endLine: lines.length, endChar: lastLen }
    local.file.select(active.path, selection)
    applySelectionToCode(element, selection)
  }

  const getCharacterOffsetInLine = (lineElement: Element, targetNode: Node, offset: number): number => {
    const r = document.createRange()
    r.selectNodeContents(lineElement)
    r.setEnd(targetNode, offset)
    return r.toString().length
  }

  const getNodeOffsetInLine = (lineElement: Element, charIndex: number): { node: Node; offset: number } | null => {
    const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT, null)
    let remaining = Math.max(0, charIndex)
    let lastText: Node | null = null
    let lastLen = 0
    let node: Node | null
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length || 0
      lastText = node
      lastLen = len
      if (remaining <= len) return { node, offset: remaining }
      remaining -= len
    }
    if (lastText) return { node: lastText, offset: lastLen }
    if (lineElement.firstChild) return { node: lineElement.firstChild, offset: 0 }
    return null
  }

  const applySelectionToCode = (codeEl: HTMLElement, selection: TextSelection) => {
    const olds = Array.from(codeEl.querySelectorAll('span[data-custom-selection="true"]'))
    if (olds.length) {
      for (const s of olds) {
        const p = s.parentNode
        if (!p) continue
        while (s.firstChild) p.insertBefore(s.firstChild, s)
        p.removeChild(s)
      }
      codeEl.normalize()
      const emptySpaces = Array.from(codeEl.querySelectorAll(".space")).filter((s) => s.textContent === "")
      for (const s of emptySpaces) {
        s.remove()
      }
    }

    if (!selection) return

    const lines = Array.from(codeEl.querySelectorAll(".line"))
    if (lines.length === 0) return

    let sIdx = Math.max(0, selection.startLine - 1)
    let eIdx = Math.max(0, selection.endLine - 1)
    let sChar = Math.max(0, selection.startChar || 0)
    let eChar = Math.max(0, selection.endChar || 0)

    if (sIdx > eIdx || (sIdx === eIdx && sChar > eChar)) {
      const ti = sIdx
      sIdx = eIdx
      eIdx = ti
      const tc = sChar
      sChar = eChar
      eChar = tc
    }

    if (eChar === 0 && eIdx > sIdx) {
      eIdx = eIdx - 1
      eChar = Number.POSITIVE_INFINITY
    }

    if (sIdx >= lines.length) return
    if (eIdx >= lines.length) eIdx = lines.length - 1

    for (let i = sIdx; i <= eIdx; i++) {
      const lineEl = lines[i]
      const startInLine = i === sIdx ? sChar : 0
      const endInLine = i === eIdx ? eChar : Number.POSITIVE_INFINITY

      const s = getNodeOffsetInLine(lineEl, startInLine) ?? { node: lineEl, offset: 0 }
      const e = getNodeOffsetInLine(lineEl, endInLine) ?? { node: lineEl, offset: lineEl.childNodes.length }

      const r = document.createRange()
      r.setStart(s.node, s.offset)
      r.setEnd(e.node, e.offset)
      if (r.collapsed) continue

      const span = document.createElement("span")
      span.setAttribute("data-custom-selection", "true")

      const frag = r.extractContents()
      span.appendChild(frag)
      r.insertNode(span)
    }
  }

  const handleCodeReady = (file: LocalFile, element: HTMLElement) => {
    if (local.file.active()?.path !== file.path) return
    applySelectionToCode(element, file.selection)

    const parent = element.closest("[data-source-file]") as HTMLElement | null
    if (parent && file.scrollTop !== undefined) {
      parent.scrollTop = file.scrollTop
    }
  }

  const handleCodeScrollEnd = (file: LocalFile, element: HTMLElement) => {
    if (local.file.active()?.path !== file.path) return
    local.file.scroll(file.path, element.scrollTop)
  }

  const openFileAndSelectLines = async (pathWithLines: string) => {
    // Parse format like "src/file.tsx:L10-32"
    const match = pathWithLines.match(/^(.+):L(\d+)-(\d+)$/)
    if (!match) {
      console.error(`Invalid format: ${pathWithLines}. Expected format: <path>:L<start>-<end>`)
      return
    }

    const [, filePath, startLine, endLine] = match
    const selection = {
      startLine: parseInt(startLine, 10),
      startChar: 0,
      endLine: parseInt(endLine, 10) + 1,
      endChar: 0,
    }
    local.file.open(filePath)
    local.file.select(filePath, selection)

    const root = document.querySelector(`[data-source-file="${filePath}"]`) as HTMLElement | null
    if (!root) return
    const element = root.querySelector("code") as HTMLElement | null
    if (!element) return
    applySelectionToCode(element, selection)
  }

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

  const handleFileClick = async (file: LocalFile) => {
    if (clickTimer()) {
      resetClickTimer()
      local.file.update(file.path, { ...file, pinned: true })
    } else {
      local.file.open(file.path)
      startClickTimer()
    }
  }

  const handleTabChange = (path: string) => {
    local.file.open(path)
  }

  const handleTabClose = (file: LocalFile) => {
    local.file.close(file.path)
  }

  const onDragStart = (event: any) => {
    setActiveItem(event.draggable.id as string)
  }

  const onDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const currentFiles = local.file.opened().map((f) => f.path)
      const fromIndex = currentFiles.indexOf(draggable.id.toString())
      const toIndex = currentFiles.indexOf(droppable.id.toString())
      if (fromIndex !== toIndex) {
        local.file.move(draggable.id.toString(), toIndex)
      }
    }
  }

  const onDragEnd = () => {
    // local.file.update(activeItem()!, { ...local.file.node(activeItem()!), preview: false })
    setActiveItem(undefined)
  }

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    const prompt = inputValue()
    setInputValue("")
    inputRef?.blur()

    const session = await sdk.session.create()
    const response = await sdk.session.prompt({
      path: { id: session.data!.id },
      body: {
        agent: local.agent.current()!.name,
        model: local.model.current(),
        parts: [
          {
            type: "text",
            text: prompt,
          },
          ...local.file
            .opened()
            .filter((f) => f.selection || local.file.active()?.path === f.path)
            .flatMap((f) => [
              {
                type: "file" as const,
                mime: "text/plain",
                url: `file://${f.absolute}${f.selection ? `?start=${f.selection.startLine}&end=${f.selection.endLine}` : ""}`,
                filename: f.name,
                source: {
                  type: "file" as const,
                  text: {
                    value: "@" + f.name,
                    start: 0, // f.start,
                    end: 0, // f.end,
                  },
                  path: f.absolute,
                },
              },
            ]),
        ],
      },
    })

    console.log("response", response)
  }

  return (
    <div class="relative">
      <div class="fixed top-0 w-50 h-full py-2 border-r border-border-subtle/30 overflow-y-auto no-scrollbar">
        <FileTree path="" onFileClick={handleFileClick} />
      </div>
      <div
        class="fixed top-0 left-px w-[198px] h-4 pointer-events-none 
               bg-gradient-to-t from-transparent to-background"
      />
      <div
        class="fixed bottom-0 left-px w-[198px] h-4 pointer-events-none
               bg-gradient-to-b from-transparent to-background"
      />
      <div class="pl-50">
        <DragDropProvider
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          collisionDetector={closestCenter}
        >
          <DragDropSensors />
          <ConstrainDragYAxis />
          <Tabs
            class="relative grow w-full flex flex-col h-screen"
            value={local.file.active()?.path}
            onChange={handleTabChange}
          >
            <Tabs.List class="sticky top-0 shrink-0">
              <SortableProvider ids={local.file.opened().map((f) => f.path)}>
                <For each={local.file.opened()}>
                  {(file) => <SortableTab file={file} onTabClick={handleFileClick} onTabClose={handleTabClose} />}
                </For>
              </SortableProvider>
            </Tabs.List>
            <For each={local.file.opened()}>
              {(file) => (
                <Tabs.Content value={file.path} class="grow h-full pt-1 select-text">
                  <Code
                    data-source-file={file.path}
                    lang={getFileExtension(file.path)}
                    code={file.content?.content ?? ""}
                    onReady={(el) => handleCodeReady(file, el)}
                    onScrollEnd={(e) => handleCodeScrollEnd(file, e.currentTarget)}
                  />
                </Tabs.Content>
              )}
            </For>
          </Tabs>
          <DragOverlay>
            {activeItem() &&
              (() => {
                const draggedFile = local.file.node(activeItem()!)
                return (
                  <div
                    class="relative px-3 h-9 flex items-center 
                           text-sm font-medium text-text whitespace-nowrap
                           shrink-0 bg-background-panel 
                           border-x border-border-subtle/40 border-b border-b-transparent"
                  >
                    <TabVisual file={draggedFile} />
                  </div>
                )
              })()}
          </DragOverlay>
        </DragDropProvider>
        <form
          onSubmit={handleSubmit}
          class="peer/editor absolute left-60 right-10 bottom-8 z-50 flex items-center justify-center"
        >
          <div
            class="w-full max-w-2xl min-w-1/2 p-2 mx-auto rounded-lg isolate backdrop-blur-xs
                   flex flex-col gap-1
                   bg-gradient-to-b from-background-panel/90 to-background/90
                   ring-1 ring-border-active/50 border border-transparent
                   shadow-[0_0_33px_rgba(0,0,0,0.8)]
                   focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary"
          >
            <div class="flex flex-wrap gap-1">
              <Show when={local.file.active()}>
                <FileTag
                  default
                  file={local.file.active()!}
                  onClose={() => local.file.close(local.file.active()?.path ?? "")}
                />
              </Show>
              <For each={local.file.opened().filter((x) => x.selection)}>
                {(file) => <FileTag file={file} onClose={() => local.file.select(file.path, undefined)} />}
              </For>
            </div>
            <input
              ref={(el) => (inputRef = el)}
              type="text"
              value={inputValue()}
              onInput={(e) => setInputValue(e.currentTarget.value)}
              placeholder="It all starts with a prompt..."
              class="w-full p-1 pb-4 text-text font-light placeholder-text-muted/70 text-sm focus:outline-none"
            />
            <div class="px-1 flex justify-between items-center text-xs text-text-muted">
              <span>
                <span class="text-primary uppercase">{local.agent.current()?.name ?? "unknown"}</span> /{" "}
                {local.model.parsed().provider} / {local.model.parsed().model}
              </span>
              <div class="flex gap-1 items-center">
                <IconButton class="text-text-muted" size="xs" variant="ghost">
                  <Icon name="photo" size={16} />
                </IconButton>
                <IconButton class="text-background-panel! bg-primary rounded-full!" size="xs" variant="ghost">
                  <Icon name="arrow-up" size={14} />
                </IconButton>
              </div>
            </div>
          </div>
        </form>
        <div class="hidden peer-focus-within/editor:block z-30 fixed inset-0 bg-background/80 _backdrop-blur-xs isolate pointer-events-none" />
      </div>
    </div>
  )
}

const TabVisual = (props: { file: LocalFile }) => (
  <div class="flex items-center gap-x-1.5">
    <FileIcon node={props.file} class="" />
    <span classList={{ "text-xs": true, italic: !props.file.pinned }}>{props.file.name}</span>
  </div>
)

const SortableTab = (props: {
  file: LocalFile
  onTabClick: (file: LocalFile) => void
  onTabClose: (file: LocalFile) => void
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
            class="absolute right-1 top-2 opacity-0 text-text-muted/60
                   peer-data-[selected]/tab:opacity-100 peer-data-[selected]/tab:text-text
                   peer-data-[selected]/tab:hover:bg-border-subtle
                   hover:opacity-100 peer-hover/tab:opacity-100"
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

const FileTag = (props: { file: LocalFile; default?: boolean; onClose: () => void }) => (
  <div
    class="flex items-center bg-background group/tag
           border border-border-subtle/60 border-dashed
           rounded-md text-xs text-text-muted"
  >
    <IconButton class="text-text-muted" size="xs" variant="ghost" onClick={props.onClose}>
      <Switch fallback={<FileIcon node={props.file} class="group-hover/tag:hidden size-3!" />}>
        <Match when={props.default}>
          <Icon name="file" class="group-hover/tag:hidden" size={12} />
        </Match>
      </Switch>
      <Icon name="close" class="hidden group-hover/tag:block" size={12} />
    </IconButton>
    <div class="pr-1 flex gap-1 items-center">
      <span>{props.file.name}</span>
      <Show when={!props.default && props.file.selection}>
        <span class="">
          ({props.file.selection!.startLine}-{props.file.selection!.endLine})
        </span>
      </Show>
    </div>
  </div>
)

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
