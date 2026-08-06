import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import App from './App'
import { renderStudentApp } from './test/renderApp'

test('renders the existing student home without changing navigation', async () => {
  renderStudentApp(<App />)

  expect(await screen.findByRole('heading', { name: /Good morning/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/student/tasks')
})
