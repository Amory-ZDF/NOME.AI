import { describe, expect, it } from 'vitest'

import { parseEnv } from '../../src/config/env.js'

const BASE_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'file:./test.db',
}

describe('parseEnv', () => {
  it('applies development defaults', () => {
    expect(parseEnv(BASE_ENV)).toMatchObject({
      NODE_ENV: 'test',
      PORT: 3001,
      HOST: '127.0.0.1',
      STUDENT_ID: 'stu-001',
      CORS_ORIGINS: ['http://localhost:5173'],
      AGENT_BASE_URL: 'http://127.0.0.1:8000',
      AGENT_TIMEOUT_MS: 10_000,
    })
  })

  it('rejects an invalid port when the database URL is valid', () => {
    expect(() => parseEnv({ ...BASE_ENV, PORT: '0' })).toThrow(/^Invalid environment/)
  })

  it('rejects a missing database URL when the other values are valid', () => {
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(/^Invalid environment/)
  })

  it.each([
    ['missing', { NODE_ENV: 'production', DATABASE_URL: 'file:./production.db' }],
    [
      'empty',
      { NODE_ENV: 'production', DATABASE_URL: 'file:./production.db', STUDENT_ID: '' },
    ],
    [
      'whitespace-only',
      { NODE_ENV: 'production', DATABASE_URL: 'file:./production.db', STUDENT_ID: '   ' },
    ],
  ])('rejects a %s production student id', (_case, input) => {
    expect(() => parseEnv(input)).toThrow(/^Invalid environment/)
  })

  it('requires an explicit production Agent origin', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'file:./production.db',
        STUDENT_ID: 'stu-production',
      }),
    ).toThrow(/AGENT_BASE_URL/)
  })

  it('accepts explicit production student and Agent configuration', () => {
    expect(
      parseEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'file:./production.db',
        STUDENT_ID: 'stu-production',
        AGENT_BASE_URL: 'https://agent.example.com',
        AGENT_TIMEOUT_MS: '2500',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      STUDENT_ID: 'stu-production',
      AGENT_BASE_URL: 'https://agent.example.com',
      AGENT_TIMEOUT_MS: 2500,
    })
  })

  it('parses and normalizes multiple HTTP origins', () => {
    expect(
      parseEnv({
        ...BASE_ENV,
        CORS_ORIGINS: ' https://EXAMPLE.com:443/, http://localhost:3000 ',
      }).CORS_ORIGINS,
    ).toEqual(['https://example.com', 'http://localhost:3000'])
  })

  it('tolerates unrelated process environment keys', () => {
    expect(
      parseEnv({
        ...BASE_ENV,
        UNRELATED_PROCESS_SETTING: 'ignored',
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
    })
  })

  it.each([
    ['an invalid NODE_ENV', { ...BASE_ENV, NODE_ENV: 'staging' }],
    ['a blank HOST', { ...BASE_ENV, HOST: '' }],
    ['a whitespace-only HOST', { ...BASE_ENV, HOST: '   ' }],
    ['an out-of-range PORT', { ...BASE_ENV, PORT: '65536' }],
    ['a non-integral PORT', { ...BASE_ENV, PORT: '3001.5' }],
    ['a blank DATABASE_URL', { ...BASE_ENV, DATABASE_URL: '' }],
    ['a whitespace-only DATABASE_URL', { ...BASE_ENV, DATABASE_URL: '   ' }],
    ['a PostgreSQL DATABASE_URL', { ...BASE_ENV, DATABASE_URL: 'postgresql://db' }],
    ['an HTTP DATABASE_URL', { ...BASE_ENV, DATABASE_URL: 'https://db.example' }],
    ['a bare database path', { ...BASE_ENV, DATABASE_URL: './student.db' }],
    ['an empty SQLite URL', { ...BASE_ENV, DATABASE_URL: 'file:' }],
    ['a whitespace SQLite URL', { ...BASE_ENV, DATABASE_URL: 'file:   ' }],
    ['an invalid CORS origin', { ...BASE_ENV, CORS_ORIGINS: 'not a URL' }],
    ['a non-HTTP CORS origin', { ...BASE_ENV, CORS_ORIGINS: 'ftp://example.com' }],
    [
      'a CORS origin containing a path',
      { ...BASE_ENV, CORS_ORIGINS: 'https://example.com/path' },
    ],
    [
      'an empty CORS origin member',
      { ...BASE_ENV, CORS_ORIGINS: 'https://example.com,' },
    ],
    ['an invalid LOG_LEVEL', { ...BASE_ENV, LOG_LEVEL: 'verbose' }],
    ['a non-HTTP Agent URL', { ...BASE_ENV, AGENT_BASE_URL: 'file:///agent' }],
    ['an Agent URL with credentials', { ...BASE_ENV, AGENT_BASE_URL: 'https://user:secret@example.com' }],
    ['an Agent URL with a path', { ...BASE_ENV, AGENT_BASE_URL: 'https://example.com/internal' }],
    ['a zero Agent timeout', { ...BASE_ENV, AGENT_TIMEOUT_MS: '0' }],
    ['an excessive Agent timeout', { ...BASE_ENV, AGENT_TIMEOUT_MS: '60001' }],
    ['a non-integral Agent timeout', { ...BASE_ENV, AGENT_TIMEOUT_MS: '10.5' }],
  ])('rejects %s in isolation', (_case, input) => {
    expect(() => parseEnv(input)).toThrow(/^Invalid environment/)
  })

  it('normalizes the supported SQLite in-memory URL', () => {
    expect(parseEnv({ ...BASE_ENV, DATABASE_URL: ' file::memory: ' }).DATABASE_URL).toBe(
      'file::memory:',
    )
  })

  it('does not expose the database URL when reporting another invalid value', () => {
    const databaseSentinel = 'file:./DO-NOT-LEAK-DATABASE-SENTINEL.db'
    let thrown: unknown

    try {
      parseEnv({ ...BASE_ENV, DATABASE_URL: databaseSentinel, PORT: '0' })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    const message = thrown instanceof Error ? thrown.message : ''
    expect(message).toMatch(/^Invalid environment/)
    expect(message).not.toContain(databaseSentinel)
  })
})
