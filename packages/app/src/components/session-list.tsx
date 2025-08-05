import { Switch, Match, For } from "solid-js"
import { useQuery } from "@tanstack/solid-query"
import { useApi } from "@/providers/api"
import { Icon, Link, Tooltip } from "@/ui"
import { useLocation } from "@solidjs/router"

export default function SessionList() {
  const location = useLocation()
  const api = useApi()
  const sessions = useQuery(() => ({
    queryKey: ["sessions"],
    queryFn: () => api.session.list().then((res) => res.data),
  }))

  return (
    <nav class="p-2">
      <Switch>
        <Match when={sessions.isPending}>
          <></>
        </Match>
        <Match when={sessions.isError}>
          <p>Error: {sessions.error?.message}</p>
        </Match>
        <Match when={sessions.isSuccess}>
          <Link
            href="/sessions/new"
            variant="ghost"
            size="sm"
            class="text-xs text-text-muted/60 hover:text-text justify-start"
          >
            <Icon name="plus" class="mr-1" size={12} />
            Create New Session
          </Link>
          <For each={sessions.data}>
            {(session) => (
              <Tooltip placement="right" value={session.title} class="w-full min-w-0">
                <Link
                  href={`/sessions/${session.id}`}
                  variant="ghost"
                  size="sm"
                  classList={{
                    "w-full min-w-0 justify-start text-text-muted text-xs": true,
                    "text-text!": location.pathname.endsWith(session.id),
                  }}
                >
                  <span class="truncate">{session.title}</span>
                </Link>
              </Tooltip>
            )}
          </For>
        </Match>
      </Switch>
    </nav>
  )
}
