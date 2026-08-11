import { env as seedEnvironment } from 'node:process'

import { runStudentSeed } from './seed-runner.js'

runStudentSeed(seedEnvironment).catch(() => {
  console.error('Student seed failed')
  process.exitCode = 1
})
