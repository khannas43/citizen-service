import { useEffect, useMemo, useRef, useState } from 'react'

import type { CafPrefillAdapter, WidgetServicePorts } from '@dg20/form-widgets'

import {
  createCafSessionCoordinator,
  type CafSessionCoordinator,
} from './caf-session-coordinator.js'

interface CoordinatorEntry {
  readonly host: CafPrefillAdapter
  readonly coordinator: CafSessionCoordinator
}

/**
 * Wraps host `services.cafPrefill` with a session-scoped coordinator.
 *
 * Held in component state so StrictMode remount restores the same session
 * cache. Host adapter identity changes replace the coordinator during render
 * (React derived-state pattern); the previous instance is disposed after paint.
 */
export function useSessionCafServices(
  services: WidgetServicePorts | undefined,
): WidgetServicePorts | undefined {
  const hostCaf = services?.cafPrefill

  const [entry, setEntry] = useState<CoordinatorEntry | undefined>(() =>
    hostCaf ? { host: hostCaf, coordinator: createCafSessionCoordinator(hostCaf) } : undefined,
  )

  // Keep entry aligned with the current host adapter identity.
  if ((entry?.host ?? undefined) !== hostCaf) {
    setEntry(
      hostCaf ? { host: hostCaf, coordinator: createCafSessionCoordinator(hostCaf) } : undefined,
    )
  }

  const active = entry && hostCaf && entry.host === hostCaf ? entry : undefined
  const coordinator = active?.coordinator

  const prevEntryRef = useRef(entry)
  useEffect(() => {
    const previous = prevEntryRef.current
    prevEntryRef.current = entry
    if (previous && previous !== entry) {
      previous.coordinator.dispose()
    }
  }, [entry])

  const coordinatorRef = useRef<CafSessionCoordinator | undefined>(coordinator)
  const generationBox = useRef({ value: 0 })

  useEffect(() => {
    generationBox.current.value += 1
    const startedGeneration = generationBox.current.value
    coordinatorRef.current = coordinator
    return () => {
      const instance = coordinator
      queueMicrotask(() => {
        // Compare against the live generation box after StrictMode re-setup.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional late read
        if (generationBox.current.value !== startedGeneration) {
          if (instance && coordinatorRef.current !== instance) {
            instance.dispose()
          }
          return
        }
        instance?.dispose()
        if (coordinatorRef.current === instance) {
          coordinatorRef.current = undefined
        }
      })
    }
  }, [coordinator])

  return useMemo(() => {
    if (!coordinator) {
      return services
    }
    return {
      ...services,
      cafPrefill: coordinator,
    }
  }, [services, coordinator])
}
