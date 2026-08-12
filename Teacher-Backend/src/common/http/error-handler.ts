import { errorCodes, type FastifyInstance } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'

import { AppError } from '../errors/app-error.js'
import { fail } from './envelope.js'

export function installErrorHandlers(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.status >= 500) {
        request.log.error({ err: error }, 'Application error')
      }

      return reply.status(error.status).send(fail(error.code, error.message, error.data))
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send(fail('INVALID_INPUT', 'Invalid request'))
    }

    if (
      error instanceof errorCodes.FST_ERR_CTP_EMPTY_JSON_BODY ||
      error instanceof errorCodes.FST_ERR_CTP_INVALID_JSON_BODY ||
      error instanceof errorCodes.FST_ERR_CTP_INVALID_CONTENT_LENGTH
    ) {
      return reply.status(400).send(fail('INVALID_INPUT', 'Invalid request'))
    }

    if (error instanceof errorCodes.FST_ERR_CTP_BODY_TOO_LARGE) {
      return reply.status(413).send(fail('PAYLOAD_TOO_LARGE', 'Payload too large'))
    }

    if (error instanceof errorCodes.FST_ERR_CTP_INVALID_MEDIA_TYPE) {
      return reply
        .status(415)
        .send(fail('UNSUPPORTED_MEDIA_TYPE', 'Unsupported media type'))
    }

    request.log.error({ err: error }, 'Unhandled request error')
    return reply.status(500).send(fail('INTERNAL_ERROR', 'Internal server error'))
  })

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(fail('NOT_FOUND', 'Route not found'))
  })
}
