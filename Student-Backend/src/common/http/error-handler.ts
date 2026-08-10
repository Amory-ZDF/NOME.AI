import type { FastifyInstance } from 'fastify'

import { AppError } from '../errors/app-error.js'
import { fail } from './envelope.js'

function isValidationError(error: unknown): error is { validation: unknown } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'validation' in error &&
    error.validation !== undefined
  )
}

export function installErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send(fail(error.code, error.message, error.data))
    }

    if (isValidationError(error)) {
      return reply.status(400).send(fail('INVALID_INPUT', 'Invalid request'))
    }

    request.log.error({ err: error }, 'Unhandled request error')
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Internal server error'))
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(fail('NOT_FOUND', 'Route not found'))
  })
}
