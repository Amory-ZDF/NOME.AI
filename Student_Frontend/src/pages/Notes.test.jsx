import { act, fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { expect, test } from 'vitest'
import Notes from './Notes'
import { AppProvider } from '../store/AppStore'
import { createAppServices } from '../store/services'
import { renderStudentApp } from '../test/renderApp'

const existingNote = {
  id: 'existing-note', title: 'Existing note', folderId: 'f-other', folderPath: 'Other subject',
  tags: [], linkedTopics: [], linkedErrors: [], source: 'typed', createdAt: '2026-08-01', updatedAt: '2026-08-01',
  content: [{ t: 'p', v: 'Existing content' }], aiSuggestions: [],
}

function createApi(createNote) {
  return {
    bootstrap: () => Promise.resolve({
      tasks: [], errors: [], notes: [existingNote],
      noteFolders: [{ id: 'f-other', name: 'Other subject', noteCount: 1 }], settings: {},
    }),
    completeTask: () => Promise.resolve({}), reportTaskAdjustment: () => Promise.resolve({}), createTask: () => Promise.resolve({}),
    addErrors: () => Promise.resolve({}), markErrorMastered: () => Promise.resolve({}), submitRedo: () => Promise.resolve({}),
    createNote, updateNote: () => Promise.resolve({}), submitSession: () => Promise.resolve({}), updateSettings: () => Promise.resolve({}),
  }
}

test('selects a newly created note after its asynchronous id resolves outside the active filter', async () => {
  // Catches a Promise stored as activeId, which falls back to an unrelated filtered note instead of the new note.
  let resolveCreate
  const services = createAppServices({
    apiClient: createApi(() => new Promise((resolve) => { resolveCreate = resolve })),
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'local-optimistic-id',
  })

  renderStudentApp(
    <AppProvider services={services}>
      <Routes><Route path="/notes" element={<Notes />} /></Routes>
    </AppProvider>,
    { route: '/notes' },
  )
  expect(await screen.findByDisplayValue('Existing note')).toBeInTheDocument()

  fireEvent.click(screen.getAllByRole('button', { name: /Other subject/i })[0])
  fireEvent.click(screen.getByRole('button', { name: /New note/i }))
  expect(screen.getByDisplayValue('Existing note')).toBeInTheDocument()

  await act(async () => {
    resolveCreate({ note: { id: 'server-note', title: 'Persisted note' } })
  })
  expect(await screen.findByDisplayValue('Persisted note')).toBeInTheDocument()
})
