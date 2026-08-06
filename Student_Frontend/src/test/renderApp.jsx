import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

export function renderStudentApp(ui, { route = '/' } = {}) {
  const routePath = route.startsWith('/') ? route : `/${route}`
  const initialRoute = routePath === '/' ? '/student/' : `/student${routePath}`

  return render(
    <MemoryRouter
      basename="/student"
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[initialRoute]}
    >
      {ui}
    </MemoryRouter>,
  )
}
