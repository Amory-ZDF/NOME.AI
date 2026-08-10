import { describe, expect, it } from 'vitest'

import { parseEnv } from '../../src/config/env.js'

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./test.db' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3001,
      HOST: '127.0.0.1',
      STUDENT_ID: 'stu-001',
      CORS_ORIGINS: ['http://localhost:5173'],
    })
  })

  it('rejects an invalid port and missing database URL', () => {
    expect(() => parseEnv({ NODE_ENV: 'test', PORT: '0' })).toThrow(/environment/i)
  })
})
