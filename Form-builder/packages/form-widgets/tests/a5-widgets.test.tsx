import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { BilingualContent } from '@citizen/form-contract'

import {
  PHOTO_CAPTURE_MAX_DIMENSION,
  PHOTO_CAPTURE_MIN_DIMENSION,
  acceptCleanFileStorageResult,
  isSafeObjectStoreRef,
} from '../src/runtime/file-storage.js'
import type {
  DigiLockerAdapter,
  FileStorageAdapter,
  FileStorageResult,
} from '../src/runtime/service-ports.js'
import {
  renderDigiLockerFetchHarness,
  renderDocumentUploadHarness,
  renderPhotoCaptureHarness,
} from './widget-harness.js'

import '../src/styles/tokens.css'
import '../src/styles/widgets.css'

const bilingual: BilingualContent = {
  labels: {
    doc_upload: { en: 'Document', gu: 'દસ્તાવેજ' },
    digilocker_doc: { en: 'DigiLocker', gu: 'DigiLocker' },
    photo_capture: { en: 'Photo', gu: 'ફોટો' },
  },
  help: {},
  errors: {},
}

function syntheticFile(name: string, type: string, sizeBytes: number): File {
  const buffer = new Uint8Array(Math.min(sizeBytes, 64))
  const file = new File([buffer], name, { type })
  Object.defineProperty(file, 'size', { value: sizeBytes })
  return file
}

function selectFile(input: HTMLElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } })
}

describe('object-store ref validation', () => {
  it('rejects empty and content URL refs', () => {
    expect(isSafeObjectStoreRef('')).toBe(false)
    expect(isSafeObjectStoreRef('data:application/pdf;base64,xxx')).toBe(false)
    expect(isSafeObjectStoreRef('blob:https://example/1')).toBe(false)
    expect(isSafeObjectStoreRef('https://cdn.example/file')).toBe(false)
    expect(isSafeObjectStoreRef('obj-store://docs/abc')).toBe(true)
  })
})

describe('DocumentUploadWidget', () => {
  it('excludes File from native FormData because input has no name', () => {
    const adapter: FileStorageAdapter = {
      async storeFile() {
        return {
          status: 'CLEAN',
          objectRef: 'obj-doc-1',
          mimeType: 'application/pdf',
          sizeBytes: 12,
        }
      },
    }
    const { container } = render(
      <form data-testid="native-form">
        {renderDocumentUploadHarness({ bilingual, services: { fileStorage: adapter } })}
      </form>,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.getAttribute('name')).toBeNull()
    selectFile(input, syntheticFile('a.pdf', 'application/pdf', 12))
    const fd = new FormData(container.querySelector('form') as HTMLFormElement)
    expect([...fd.keys()]).toHaveLength(0)
  })

  it('rejects MIME/size before calling adapter', async () => {
    const storeFile = vi.fn()
    const adapter: FileStorageAdapter = { storeFile }
    render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        allowedMimeTypes: ['application/pdf'],
        maxFileSizeBytes: 100,
      }),
    )
    const input = screen.getByLabelText(/Document/i)
    selectFile(input, syntheticFile('x.png', 'image/png', 10))
    expect(screen.getByText(/file type is not allowed/i)).toBeInTheDocument()
    selectFile(input, syntheticFile('big.pdf', 'application/pdf', 500))
    expect(screen.getByText(/file is too large/i)).toBeInTheDocument()
    expect(storeFile).not.toHaveBeenCalled()
  })

  it('emits CLEAN reference metadata only', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'obj-doc-clean',
          mimeType: 'application/pdf',
          sizeBytes: file.size,
        }
      },
    }
    render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('id.pdf', 'application/pdf', 40))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        objectRef: 'obj-doc-clean',
        fileName: 'id.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 40,
        scanStatus: 'CLEAN',
      })
    })
    const emitted = JSON.stringify(onChange.mock.calls.at(-1)?.[0])
    expect(emitted).not.toMatch(/base64|data:|blob:|File|Uint8Array/)
  })

  it('emits nothing on REJECTED or malformed CLEAN result', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const rejected: FileStorageAdapter = {
      async storeFile() {
        return { status: 'REJECTED' }
      },
    }
    const { unmount } = render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: rejected },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('id.pdf', 'application/pdf', 40))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be accepted/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    const badRef: FileStorageAdapter = {
      async storeFile() {
        return {
          status: 'CLEAN',
          objectRef: 'https://evil.example/file',
          mimeType: 'application/pdf',
          sizeBytes: 40,
        }
      },
    }
    render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: badRef },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('id.pdf', 'application/pdf', 40))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed|could not be accepted/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores stale upload after unmount', async () => {
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: FileStorageAdapter = {
      async storeFile({ signal }) {
        await gate
        if (signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        return {
          status: 'CLEAN',
          objectRef: 'stale-ref',
          mimeType: 'application/pdf',
          sizeBytes: 10,
        }
      },
    }
    const user = userEvent.setup()
    const { unmount } = render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('id.pdf', 'application/pdf', 10))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    unmount()
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('supports missing adapter, disabled, readonly, and Gujarati', () => {
    const { unmount } = render(renderDocumentUploadHarness({ bilingual }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    unmount()

    render(
      renderDocumentUploadHarness({
        bilingual,
        locale: 'gu',
        services: {
          fileStorage: {
            async storeFile() {
              return {
                status: 'CLEAN',
                objectRef: 'r',
                mimeType: 'application/pdf',
                sizeBytes: 1,
              }
            },
          },
        },
        formData: {
          objectRef: 'r',
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          scanStatus: 'CLEAN',
        },
        readonly: true,
      }),
    )
    expect(screen.getByText(/અપલોડ થયું/i)).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('DigiLockerFetchWidget', () => {
  it('stores only issuer-signed ref and matching type code', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: DigiLockerAdapter = {
      async fetchIssuedDocument({ documentTypeCode }) {
        return {
          issuerSignedRef: 'issuer-ref-1',
          documentTypeCode,
        }
      },
    }
    render(
      renderDigiLockerFetchHarness({
        bilingual,
        services: { digiLocker: adapter },
        digiLockerDocumentTypeCode: 'PAN',
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Fetch from DigiLocker/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        issuerSignedRef: 'issuer-ref-1',
        documentTypeCode: 'PAN',
      })
    })
    const emitted = JSON.stringify(onChange.mock.calls.at(-1)?.[0])
    expect(emitted).not.toMatch(/token|authorization|oauth|access/i)
  })

  it('rejects mismatched type code and content URL refs', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: DigiLockerAdapter = {
      async fetchIssuedDocument() {
        return {
          issuerSignedRef: 'https://digilocker.gov.in/doc',
          documentTypeCode: 'OTHER',
        }
      },
    }
    render(
      renderDigiLockerFetchHarness({
        bilingual,
        services: { digiLocker: adapter },
        digiLockerDocumentTypeCode: 'PAN',
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Fetch from DigiLocker/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('handles missing adapter and invalid config', () => {
    const { unmount } = render(renderDigiLockerFetchHarness({ bilingual }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()
    unmount()

    render(
      renderDigiLockerFetchHarness({
        bilingual,
        digiLockerDocumentTypeCode: '   ',
        services: {
          digiLocker: {
            async fetchIssuedDocument() {
              return { issuerSignedRef: 'x', documentTypeCode: 'PAN' }
            },
          },
        },
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/configuration is invalid/i)
  })
})

describe('PhotoCaptureWidget', () => {
  it('excludes File from native FormData and emits reference-only CLEAN photo', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: FileStorageAdapter = {
      async storeFile({ purpose, file }) {
        expect(purpose).toBe('PHOTO')
        return {
          status: 'CLEAN',
          objectRef: 'obj-photo-1',
          mimeType: 'image/jpeg',
          sizeBytes: file.size,
          width: 640,
          height: 480,
        }
      },
    }
    const { container } = render(
      <form>
        {renderPhotoCaptureHarness({
          bilingual,
          services: { fileStorage: adapter },
          onChange,
        })}
      </form>,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.getAttribute('name')).toBeNull()
    expect(input.getAttribute('capture')).toBe('environment')
    selectFile(input, syntheticFile('face.jpg', 'image/jpeg', 1200))
    expect([...new FormData(container.querySelector('form')!).keys()]).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        objectRef: 'obj-photo-1',
        mimeType: 'image/jpeg',
        sizeBytes: 1200,
        width: 640,
        height: 480,
        scanStatus: 'CLEAN',
      })
    })
  })

  it('rejects MIME before adapter and out-of-bound dimensions after adapter', async () => {
    const user = userEvent.setup()
    const storeFile = vi.fn(async (): Promise<FileStorageResult> => ({
      status: 'CLEAN',
      objectRef: 'obj-photo-small',
      mimeType: 'image/jpeg',
      sizeBytes: 500,
      width: PHOTO_CAPTURE_MIN_DIMENSION - 1,
      height: PHOTO_CAPTURE_MIN_DIMENSION - 1,
    }))
    const adapter: FileStorageAdapter = { storeFile }
    const onChange = vi.fn()
    render(renderPhotoCaptureHarness({ bilingual, services: { fileStorage: adapter }, onChange }))
    const input = screen.getByLabelText(/Photo/i)
    selectFile(input, syntheticFile('x.gif', 'image/gif', 100))
    expect(screen.getByText(/Only JPEG and PNG/i)).toBeInTheDocument()
    expect(storeFile).not.toHaveBeenCalled()

    selectFile(input, syntheticFile('face.jpg', 'image/jpeg', 500))
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed|could not be accepted/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts boundary dimensions and rejects above max', () => {
    const minOk = acceptCleanFileStorageResult(
      {
        status: 'CLEAN',
        objectRef: 'r',
        mimeType: 'image/png',
        sizeBytes: 10,
        width: PHOTO_CAPTURE_MIN_DIMENSION,
        height: PHOTO_CAPTURE_MIN_DIMENSION,
      },
      {
        allowedMimeTypes: ['image/png'],
        maxFileSizeBytes: 1000,
        requireDimensions: true,
      },
    )
    expect(minOk?.width).toBe(PHOTO_CAPTURE_MIN_DIMENSION)

    const tooBig = acceptCleanFileStorageResult(
      {
        status: 'CLEAN',
        objectRef: 'r',
        mimeType: 'image/png',
        sizeBytes: 10,
        width: PHOTO_CAPTURE_MAX_DIMENSION + 1,
        height: PHOTO_CAPTURE_MAX_DIMENSION,
      },
      {
        allowedMimeTypes: ['image/png'],
        maxFileSizeBytes: 1000,
        requireDimensions: true,
      },
    )
    expect(tooBig).toBeNull()
  })

  it('shows unavailable without adapter', () => {
    render(renderPhotoCaptureHarness({ bilingual }))
    expect(screen.getByText(/Photo capture is temporarily unavailable/i)).toBeInTheDocument()
  })
})

describe('FB-A5.1 async integrity', () => {
  it('keeps document file B selected when stale A resolves after ignoring AbortSignal', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const adapter: FileStorageAdapter = {
      async storeFile({ file }) {
        if (file.name === 'a.pdf') {
          await gateA
          // Deliberately ignore AbortSignal — simulates late host completion.
          return {
            status: 'CLEAN',
            objectRef: 'ref-a',
            mimeType: file.type,
            sizeBytes: file.size,
          }
        }
        return {
          status: 'CLEAN',
          objectRef: 'ref-b',
          mimeType: file.type,
          sizeBytes: file.size,
        }
      },
    }
    render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Document/i)
    selectFile(input, syntheticFile('a.pdf', 'application/pdf', 40))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    selectFile(input, syntheticFile('b.pdf', 'application/pdf', 50))
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Upload$/i })).toBeEnabled()
    releaseA()
    await new Promise((r) => setTimeout(r, 30))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('b.pdf')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ objectRef: 'ref-b', fileName: 'b.pdf', sizeBytes: 50 }),
      )
    })
  })

  it('keeps photo file B selected when stale A resolves after ignoring AbortSignal', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseA!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const adapter: FileStorageAdapter = {
      async storeFile({ file }) {
        if (file.name === 'a.jpg') {
          await gateA
          return {
            status: 'CLEAN',
            objectRef: 'photo-a',
            mimeType: file.type,
            sizeBytes: file.size,
            width: 640,
            height: 480,
          }
        }
        return {
          status: 'CLEAN',
          objectRef: 'photo-b',
          mimeType: file.type,
          sizeBytes: file.size,
          width: 800,
          height: 600,
        }
      },
    }
    render(
      renderPhotoCaptureHarness({
        bilingual,
        services: { fileStorage: adapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Photo/i)
    selectFile(input, syntheticFile('a.jpg', 'image/jpeg', 400))
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    selectFile(input, syntheticFile('b.jpg', 'image/jpeg', 500))
    expect(screen.getByRole('button', { name: /Upload photo/i })).toBeEnabled()
    releaseA()
    await new Promise((r) => setTimeout(r, 30))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ objectRef: 'photo-b', sizeBytes: 500, width: 800 }),
      )
    })
  })

  it('recovers document upload when adapter becomes available and rejects prior adapter result', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let releaseStale!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseStale = resolve
    })
    const staleAdapter: FileStorageAdapter = {
      async storeFile({ file }) {
        await gate
        return {
          status: 'CLEAN',
          objectRef: 'stale-adapter',
          mimeType: file.type,
          sizeBytes: file.size,
        }
      },
    }
    const liveAdapter: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'live-adapter',
          mimeType: file.type,
          sizeBytes: file.size,
        }
      },
    }
    const { rerender } = render(renderDocumentUploadHarness({ bilingual, onChange }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()

    rerender(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: staleAdapter },
        onChange,
      }),
    )
    const input = screen.getByLabelText(/Document/i)
    selectFile(input, syntheticFile('a.pdf', 'application/pdf', 20))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))

    rerender(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: liveAdapter },
        onChange,
      }),
    )
    releaseStale()
    await new Promise((r) => setTimeout(r, 20))
    expect(onChange).not.toHaveBeenCalled()

    selectFile(screen.getByLabelText(/Document/i), syntheticFile('b.pdf', 'application/pdf', 30))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ objectRef: 'live-adapter' }))
    })
  })

  it('recovers document upload when invalid config becomes valid', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const adapter: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'after-config',
          mimeType: file.type,
          sizeBytes: file.size,
        }
      },
    }
    const { rerender } = render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        allowedMimeTypes: [],
        maxFileSizeBytes: 1024,
        onChange,
      }),
    )
    expect(
      screen.getAllByText(/temporarily unavailable because its configuration is invalid/i).length,
    ).toBeGreaterThan(0)

    rerender(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: adapter },
        allowedMimeTypes: ['application/pdf'],
        maxFileSizeBytes: 1024 * 1024,
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('ok.pdf', 'application/pdf', 25))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ objectRef: 'after-config', fileName: 'ok.pdf' }),
      )
    })
  })

  it('recovers photo capture when adapter becomes available', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const liveAdapter: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'photo-live',
          mimeType: file.type,
          sizeBytes: file.size,
          width: 640,
          height: 480,
        }
      },
    }
    const { rerender } = render(renderPhotoCaptureHarness({ bilingual, onChange }))
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument()

    rerender(
      renderPhotoCaptureHarness({
        bilingual,
        services: { fileStorage: liveAdapter },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Photo/i), syntheticFile('face.jpg', 'image/jpeg', 300))
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ objectRef: 'photo-live' }))
    })
  })

  it('recovers DigiLocker when type code becomes valid and ignores stale type result', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter: DigiLockerAdapter = {
      async fetchIssuedDocument({ documentTypeCode }) {
        if (documentTypeCode === 'OLD') {
          await gate
          return { issuerSignedRef: 'ref-old', documentTypeCode: 'OLD' }
        }
        return { issuerSignedRef: 'ref-new', documentTypeCode }
      },
    }
    const { rerender } = render(
      renderDigiLockerFetchHarness({
        bilingual,
        digiLockerDocumentTypeCode: 'OLD',
        services: { digiLocker: adapter },
        onChange,
      }),
    )
    await user.click(screen.getByRole('button', { name: /Fetch from DigiLocker/i }))
    rerender(
      renderDigiLockerFetchHarness({
        bilingual,
        digiLockerDocumentTypeCode: 'PAN',
        services: { digiLocker: adapter },
        onChange,
      }),
    )
    release()
    await new Promise((r) => setTimeout(r, 20))
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Fetch from DigiLocker/i }))
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        issuerSignedRef: 'ref-new',
        documentTypeCode: 'PAN',
      })
    })
  })

  it('rejects document/photo CLEAN results whose MIME or size differs from the selected File', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const mismatchMime: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'obj',
          mimeType: 'image/jpeg',
          sizeBytes: file.size,
        }
      },
    }
    const { unmount } = render(
      renderDocumentUploadHarness({
        bilingual,
        services: { fileStorage: mismatchMime },
        allowedMimeTypes: ['application/pdf', 'image/jpeg'],
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Document/i), syntheticFile('id.pdf', 'application/pdf', 40))
    await user.click(screen.getByRole('button', { name: /^Upload$/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed|could not be accepted/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
    unmount()

    const mismatchSize: FileStorageAdapter = {
      async storeFile({ file }) {
        return {
          status: 'CLEAN',
          objectRef: 'obj',
          mimeType: file.type,
          sizeBytes: file.size + 1,
          width: 640,
          height: 480,
        }
      },
    }
    render(
      renderPhotoCaptureHarness({
        bilingual,
        services: { fileStorage: mismatchSize },
        onChange,
      }),
    )
    selectFile(screen.getByLabelText(/Photo/i), syntheticFile('face.jpg', 'image/jpeg', 500))
    await user.click(screen.getByRole('button', { name: /Upload photo/i }))
    await waitFor(() => {
      expect(screen.getByText(/could not be completed|could not be accepted/i)).toBeInTheDocument()
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not present malformed incoming formData as a stored reference', () => {
    render(
      renderDocumentUploadHarness({
        bilingual,
        services: {
          fileStorage: {
            async storeFile() {
              return {
                status: 'CLEAN',
                objectRef: 'x',
                mimeType: 'application/pdf',
                sizeBytes: 1,
              }
            },
          },
        },
        formData: {
          objectRef: 'https://evil.example/doc',
          fileName: 'a.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
          scanStatus: 'CLEAN',
        },
      }),
    )
    expect(screen.queryByText(/Uploaded:/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Document/i)).toBeInTheDocument()

    render(
      renderDigiLockerFetchHarness({
        bilingual,
        digiLockerDocumentTypeCode: 'PAN',
        services: {
          digiLocker: {
            async fetchIssuedDocument() {
              return { issuerSignedRef: 'r', documentTypeCode: 'PAN' }
            },
          },
        },
        formData: {
          issuerSignedRef: 'issuer-ok',
          documentTypeCode: 'AADHAAR',
        },
      }),
    )
    expect(screen.queryByText(/Document reference received/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Fetch from DigiLocker/i })).toBeInTheDocument()
  })
})
