import { createContext, useContext, type ParentProps } from "solid-js"
import { type Project } from "@opencode-ai/sdk/client"
import { useApi } from "./api"
import { useQuery, type UseQueryResult } from "@tanstack/solid-query"

export type ProjectContext = UseQueryResult<Project | undefined, Error>
const ProjectContext = createContext<ProjectContext>()

export function ProjectProvider(props: ParentProps) {
  const api = useApi()
  const project = useQuery(() => ({
    queryKey: ["project"],
    queryFn: () => api.project.current().then((res) => res.data),
  }))
  return <ProjectContext.Provider value={project}>{props.children}</ProjectContext.Provider>
}

export function useProject() {
  return useContext(ProjectContext)
}
