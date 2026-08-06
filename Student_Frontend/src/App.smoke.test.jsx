import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'
import { createAppServices } from './store/services'
import { renderStudentApp } from './test/renderApp'

test('renders the existing student home without changing navigation', async () => {
  renderStudentApp(<App />)

  expect(await screen.findByRole('heading', { name: /Good /i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/student/tasks')
})

test('keeps the student shell available with a retry card when boot fails', async () => {
  // Catches boot-error rendering that replaces the navigation shell with a blank page.
  const services = createAppServices({
    apiClient: { bootstrap: () => Promise.reject(new Error('offline')) },
    now: () => new Date('2026-08-06T00:00:00.000Z'),
    createId: () => 'generated-id',
  })
  renderStudentApp(<App services={services} />)

  expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/student/tasks')
})
