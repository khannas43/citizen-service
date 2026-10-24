import { useCallback, useEffect, useRef, useState } from 'react'

import { validateMasterDataOptions } from './master-data.js'
import type { MasterDataAdapter, MasterDataOption } from './service-ports.js'

export type MasterDataLoadStatus =
  'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'invalid-config' | 'failed'

export interface MasterDataLoadState {
  readonly status: MasterDataLoadStatus
  readonly options: readonly MasterDataOption[]
  readonly reload: () => void
}

/**
 * Shared master-list loader for dropdown-master, radio, multiselect, and cascading.
 * Aborts and bumps sequence on adapter / list / parentCode / enabled / fieldId change.
 * Locale is intentionally excluded — callers re-label from cached options.
 */
export function useMasterDataOptions(input: {
  readonly fieldId: string
  readonly masterListId: string | undefined
  readonly listIdOk: boolean
  readonly adapter: MasterDataAdapter | undefined
  /** When false, stay idle with no request and no retained options (cascading child). */
  readonly enabled?: boolean
  /** Optional parent code for dependent list requests. */
  readonly parentCode?: string
}): MasterDataLoadState {
  const { fieldId, masterListId, listIdOk, adapter, enabled = true, parentCode } = input
  const abortRef = useRef<AbortController | null>(null)
  const requestSeq = useRef(0)
  const [status, setStatus] = useState<MasterDataLoadStatus>(() => {
    if (!enabled) {
      return 'idle'
    }
    if (!listIdOk) {
      return 'invalid-config'
    }
    return adapter ? 'loading' : 'unavailable'
  })
  const [options, setOptions] = useState<readonly MasterDataOption[]>([])
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const seq = ++requestSeq.current

    if (!enabled) {
      setOptions([])
      setStatus('idle')
      return
    }
    if (!listIdOk || !masterListId) {
      setOptions([])
      setStatus('invalid-config')
      return
    }
    if (!adapter) {
      setOptions([])
      setStatus('unavailable')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setOptions([])
    setStatus('loading')

    void (async () => {
      try {
        const raw = await adapter.listOptions({
          fieldId,
          masterListId,
          signal: controller.signal,
          ...(parentCode !== undefined ? { parentCode } : {}),
        })
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        const validated = validateMasterDataOptions(raw)
        if (!validated.ok) {
          setOptions([])
          setStatus('failed')
          return
        }
        if (validated.options.length === 0) {
          setOptions([])
          setStatus('empty')
          return
        }
        setOptions(validated.options)
        setStatus('ready')
      } catch {
        if (seq !== requestSeq.current || controller.signal.aborted) {
          return
        }
        setOptions([])
        setStatus('failed')
      }
    })()
  }, [adapter, enabled, fieldId, listIdOk, masterListId, parentCode, reloadToken])

  return { status, options, reload }
}
