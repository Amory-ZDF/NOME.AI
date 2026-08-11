import { AppError } from '../../common/errors/app-error.js'
import {
  defaultSettings,
  settingsSchema,
  type Settings,
  type SettingsPatch,
} from '../../contracts/student-contracts.js'
import type { StudentPrisma } from '../../db/client.js'
import { toInputJson } from '../../db/json.js'

function parseStoredSettings(value: unknown): Settings {
  try {
    return settingsSchema.parse(value)
  } catch (cause) {
    throw new AppError(
      'Stored student data is invalid',
      500,
      'STORED_DATA_INVALID',
      null,
      { cause: new Error('Invalid stored settings', { cause }) },
    )
  }
}

export class SettingsService {
  constructor(
    private readonly prisma: StudentPrisma,
    private readonly studentId: string,
  ) {}

  async patch(patch: SettingsPatch): Promise<Settings> {
    return this.prisma.$transaction(async (transaction) => {
      const student = await transaction.student.findUnique({
        where: { id: this.studentId },
        select: { id: true },
      })
      if (student === null) {
        throw new AppError('Student not found', 404, 'NOT_FOUND')
      }

      const currentRow = await transaction.studentSettings.findUnique({
        where: { studentId: this.studentId },
      })
      const current =
        currentRow === null ? defaultSettings : parseStoredSettings(currentRow.payload)
      const next = settingsSchema.parse({ ...current, ...patch })

      await transaction.studentSettings.upsert({
        where: { studentId: this.studentId },
        update: { payload: toInputJson(next) },
        create: { studentId: this.studentId, payload: toInputJson(next) },
      })

      return next
    })
  }
}
