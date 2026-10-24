import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject } from 'react'

import type { AuthoringAction, AuthoringUiState } from '../authoring/index.js'
import { isAuthoringInteractionBlocked } from '../validation/is-authoring-interaction-blocked.js'
import type { DraftPersistenceSnapshot } from '../persistence/form-definition-draft-persistence-adapter.js'
import type { DefinitionPersistenceViewState } from '../persistence/use-definition-persistence.js'
import { admitActorId } from '../lifecycle/admit-actor-id.js'

import { DEFAULT_VERSION_LIST_LIMIT } from './admit-version-pagination.js'
import {
  VersionManagementError,
  type CloneSourceReference,
  type FormDefinitionVersionManagementAdapter,
  type VersionListItem,
} from './form-definition-version-management-adapter.js'

export type DefinitionVersionsPhase =
  | 'idle'
  | 'listing'
  | 'listed'
  | 'preparing_clone'
  | 'confirming_clone'
  | 'cloning'
  | 'cloned'
  | 'failed'
  | 'stale'
  | 'discarded'

export interface UseDefinitionVersionsArgs {
  readonly adapter: FormDefinitionVersionManagementAdapter | null
  readonly actorId: string | null
  readonly sessionEpochRef: { current: number }
  readonly currentServiceId: string
  readonly uiState: AuthoringUiState
  readonly persistence: DefinitionPersistenceViewState
  readonly requestLoad: (serviceId: string, versionText: string) => void
  readonly confirmDiscard: () => void
  readonly cancelDiscard: () => void
  readonly dispatch: Dispatch<AuthoringAction>
  readonly onAdoptClonedDraft: (snapshot: DraftPersistenceSnapshot) => void
}

function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

/** Coordinates listing and immutable-version cloning without placing ETags in UI state. */
export function useDefinitionVersions({
  adapter,
  actorId,
  sessionEpochRef,
  currentServiceId,
  uiState,
  persistence: _persistence,
  requestLoad,
  confirmDiscard: _confirmDiscard,
  cancelDiscard: _cancelDiscard,
  dispatch: _dispatch,
  onAdoptClonedDraft,
}: UseDefinitionVersionsArgs): {
  readonly view: {
    readonly phase: DefinitionVersionsPhase
    readonly panelOpen: boolean
    readonly serviceIdInput: string
    readonly items: readonly VersionListItem[]
    readonly nextAfterVersion?: number
    readonly canLoadMore: boolean
    readonly listBusy: boolean
    readonly cloneBusy: boolean
    readonly showCloneConfirmation: boolean
    readonly canConfirmClone: boolean
    readonly cloneSource: {
      readonly serviceId: string
      readonly version: number
      readonly status: 'published' | 'retired'
    } | null
    readonly canRetry: boolean
    readonly failureKind?: string
    readonly missingActorGuidance: boolean
  }
  readonly openPanel: () => void
  readonly closePanel: () => void
  readonly setServiceIdInput: (value: string) => void
  readonly loadVersions: () => void
  readonly loadMore: () => void
  readonly openDraftVersion: (version: number) => void
  readonly beginClone: (version: number) => void
  readonly confirmClone: () => void
  readonly cancelCloneConfirmation: () => void
  readonly retryLastFailure: () => void
  readonly summaryRef: RefObject<HTMLDivElement | null>
} {
  const [phase, setPhase] = useState<DefinitionVersionsPhase>('idle')
  const [panelOpen, setPanelOpen] = useState(false)
  const [serviceIdInput, setServiceIdInput] = useState(currentServiceId)
  const [items, setItems] = useState<readonly VersionListItem[]>([])
  const [nextAfterVersion, setNextAfterVersion] = useState<number | undefined>()
  const [failureKind, setFailureKind] = useState<string | undefined>()
  const [cloneSourceView, setCloneSourceView] = useState<{
    readonly serviceId: string
    readonly version: number
    readonly status: 'published' | 'retired'
  } | null>(null)
  const summaryRef = useRef<HTMLDivElement | null>(null)
  const sourceRef = useRef<CloneSourceReference | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0)
  const lastActionRef = useRef<'list' | 'more' | 'prepare' | 'clone' | null>(null)
  const adapterRef = useRef(adapter)
  const actorRef = useRef(actorId)
  adapterRef.current = adapter
  actorRef.current = actorId

  const authoringInteractionBlocked = isAuthoringInteractionBlocked(uiState)

  const invalidate = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    sequenceRef.current += 1
    sourceRef.current = null
    setCloneSourceView(null)
  }, [])
  useEffect(() => () => invalidate(), [invalidate])
  useEffect(() => {
    invalidate()
    setPhase('idle')
    setItems([])
    setNextAfterVersion(undefined)
  }, [adapter, actorId, invalidate])

  const updateServiceIdInput = useCallback(
    (value: string) => {
      setServiceIdInput(value)
      setItems([])
      setNextAfterVersion(undefined)
      sourceRef.current = null
      setCloneSourceView(null)
      if (phase === 'confirming_clone' || phase === 'preparing_clone' || phase === 'cloning') {
        abortRef.current?.abort()
        setPhase('idle')
      } else if (phase === 'listed' || phase === 'failed' || phase === 'stale') {
        setPhase('idle')
      }
    },
    [phase],
  )

  const runList = useCallback(
    (more: boolean) => {
      const activeAdapter = adapterRef.current
      if (activeAdapter === null) return
      const cursor = more ? nextAfterVersion : undefined
      if (more && cursor === undefined) return
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      const seq = ++sequenceRef.current
      const epoch = sessionEpochRef.current
      lastActionRef.current = more ? 'more' : 'list'
      setFailureKind(undefined)
      setPhase('listing')
      void activeAdapter
        .listVersions({
          serviceId: serviceIdInput,
          afterVersion: cursor,
          limit: DEFAULT_VERSION_LIST_LIMIT,
          signal: controller.signal,
        })
        .then((page) => {
          if (seq !== sequenceRef.current || controller.signal.aborted) return
          if (sessionEpochRef.current !== epoch) {
            setPhase('discarded')
            return
          }
          setItems((old) => (more ? [...old, ...page.items] : page.items))
          setNextAfterVersion(page.nextAfterVersion)
          setPhase('listed')
        })
        .catch((error: unknown) => {
          if (seq !== sequenceRef.current || controller.signal.aborted || isAbortError(error))
            return
          setFailureKind(error instanceof VersionManagementError ? error.code : 'failed')
          setPhase('failed')
        })
    },
    [nextAfterVersion, serviceIdInput, sessionEpochRef],
  )

  const openPanel = useCallback(() => {
    if (authoringInteractionBlocked) return
    setPanelOpen(true)
    setServiceIdInput(currentServiceId)
    setItems([])
    setNextAfterVersion(undefined)
    setPhase('idle')
  }, [authoringInteractionBlocked, currentServiceId])
  const closePanel = useCallback(() => {
    invalidate()
    setPanelOpen(false)
    setPhase('idle')
    setItems([])
    setNextAfterVersion(undefined)
  }, [invalidate])
  const loadVersions = useCallback(() => runList(false), [runList])
  const loadMore = useCallback(() => runList(true), [runList])
  const openDraftVersion = useCallback(
    (version: number) => {
      requestLoad(serviceIdInput, String(version))
      setPanelOpen(false)
    },
    [requestLoad, serviceIdInput],
  )

  const beginClone = useCallback(
    (version: number) => {
      if (authoringInteractionBlocked) return
      const activeAdapter = adapterRef.current
      if (activeAdapter === null) return
      // Actor is optional: OIDC HTTP clone uses JWT sub; lifecycleActorId is only for
      // injected technical/non-OIDC acceptance adapters (FB-E5.4.2B).
      const controller = new AbortController()
      abortRef.current?.abort()
      abortRef.current = controller
      const seq = ++sequenceRef.current
      const epoch = sessionEpochRef.current
      lastActionRef.current = 'prepare'
      setFailureKind(undefined)
      setPhase('preparing_clone')
      void activeAdapter
        .prepareCloneSource({
          serviceId: serviceIdInput,
          sourceVersion: version,
          signal: controller.signal,
        })
        .then((source) => {
          if (seq !== sequenceRef.current || controller.signal.aborted) return
          if (sessionEpochRef.current !== epoch) {
            setPhase('discarded')
            return
          }
          sourceRef.current = source
          setCloneSourceView({
            serviceId: source.serviceId,
            version: source.version,
            status: source.status,
          })
          setPhase('confirming_clone')
        })
        .catch((error: unknown) => {
          if (seq !== sequenceRef.current || controller.signal.aborted || isAbortError(error))
            return
          setFailureKind(error instanceof VersionManagementError ? error.code : 'failed')
          setPhase(
            error instanceof VersionManagementError && error.code === 'stale_revision'
              ? 'stale'
              : 'failed',
          )
        })
    },
    [authoringInteractionBlocked, serviceIdInput, sessionEpochRef],
  )

  const canConfirmClone =
    phase === 'confirming_clone' &&
    !authoringInteractionBlocked &&
    adapter !== null &&
    cloneSourceView !== null

  const confirmClone = useCallback(() => {
    if (authoringInteractionBlocked) return
    const source = sourceRef.current
    const activeAdapter = adapterRef.current
    const actor =
      actorRef.current === null ? { ok: false as const } : admitActorId(actorRef.current)
    if (phase !== 'confirming_clone' || source === null || activeAdapter === null) {
      return
    }
    const controller = new AbortController()
    abortRef.current?.abort()
    abortRef.current = controller
    const seq = ++sequenceRef.current
    const epoch = sessionEpochRef.current
    lastActionRef.current = 'clone'
    setFailureKind(undefined)
    setPhase('cloning')
    void activeAdapter
      .cloneDraft({
        serviceId: source.serviceId,
        sourceVersion: source.version,
        sourceEtag: source.etag,
        ...(actor.ok ? { createdBy: actor.actorId } : {}),
        signal: controller.signal,
      })
      .then((snapshot) => {
        if (seq !== sequenceRef.current || controller.signal.aborted) return
        if (sessionEpochRef.current !== epoch) {
          sourceRef.current = null
          setCloneSourceView(null)
          setPhase('discarded')
          return
        }
        sourceRef.current = null
        setCloneSourceView(null)
        onAdoptClonedDraft(snapshot)
        setPhase('cloned')
        setPanelOpen(false)
      })
      .catch((error: unknown) => {
        if (seq !== sequenceRef.current || controller.signal.aborted || isAbortError(error)) return
        setFailureKind(error instanceof VersionManagementError ? error.code : 'failed')
        if (error instanceof VersionManagementError && error.code === 'stale_revision') {
          sourceRef.current = null
          setCloneSourceView(null)
          setPhase('stale')
          return
        }
        setPhase('failed')
      })
  }, [authoringInteractionBlocked, onAdoptClonedDraft, phase, sessionEpochRef])

  const cancelCloneConfirmation = useCallback(() => {
    if (phase === 'confirming_clone') {
      sourceRef.current = null
      setCloneSourceView(null)
      setPhase('listed')
    }
  }, [phase])
  const retryLastFailure = useCallback(() => {
    if (phase !== 'failed' && phase !== 'stale' && phase !== 'discarded') return
    if (lastActionRef.current === 'list') runList(false)
    else if (lastActionRef.current === 'more') runList(true)
    else if (lastActionRef.current === 'clone' && sourceRef.current !== null) {
      setPhase('confirming_clone')
    } else if (lastActionRef.current === 'prepare') setPhase('listed')
  }, [phase, runList])

  return {
    view: {
      phase,
      panelOpen,
      serviceIdInput,
      items,
      nextAfterVersion,
      canLoadMore: phase !== 'listing' && nextAfterVersion !== undefined,
      listBusy: phase === 'listing',
      cloneBusy: phase === 'preparing_clone' || phase === 'cloning',
      showCloneConfirmation: phase === 'confirming_clone',
      canConfirmClone,
      cloneSource: cloneSourceView,
      canRetry:
        (phase === 'failed' || phase === 'stale' || phase === 'discarded') &&
        lastActionRef.current !== null,
      failureKind,
      missingActorGuidance: false,
    },
    openPanel,
    closePanel,
    setServiceIdInput: updateServiceIdInput,
    loadVersions,
    loadMore,
    openDraftVersion,
    beginClone,
    confirmClone,
    cancelCloneConfirmation,
    retryLastFailure,
    summaryRef,
  }
}
