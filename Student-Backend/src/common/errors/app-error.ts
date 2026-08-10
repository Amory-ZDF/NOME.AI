export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly data: unknown = null,
  ) {
    super(message)
  }
}
