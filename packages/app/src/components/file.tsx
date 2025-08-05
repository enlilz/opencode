import { getFileExtension } from "@/utils"
import { Code } from "./code"
import Markdown from "./markdown"

export function File(props: { filePath: string; content: string }) {
  const extension = getFileExtension(props.filePath)
  if (extension === "md" || extension === "mdx") {
    return <Markdown text={props.content} />
  }
  return <Code code={props.content} lang={extension} />
}
