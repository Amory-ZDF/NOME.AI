import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'

describe('Swagger UI dependency compatibility', () => {
  it('serves generated documentation with Fastify 5 and Swagger 9', async () => {
    const app = Fastify()

    try {
      await app.register(swagger, {
        openapi: {
          info: {
            title: 'Compatibility smoke test',
            version: '1.0.0',
          },
        },
      })
      await app.register(swaggerUi, { routePrefix: '/documentation' })
      await app.ready()

      const response = await app.inject({
        method: 'GET',
        url: '/documentation/json',
      })

      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.json()).toMatchObject({
        openapi: '3.0.3',
        info: {
          title: 'Compatibility smoke test',
          version: '1.0.0',
        },
      })
    } finally {
      await app.close()
    }
  })
})
