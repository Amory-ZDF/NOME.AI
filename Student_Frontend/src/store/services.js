import * as api from '../api'

export const createAppServices = ({
  apiClient = api,
  now = () => new Date(),
  createId = () => crypto.randomUUID(),
} = {}) => ({ api: apiClient, now, createId })

export const defaultAppServices = createAppServices()
