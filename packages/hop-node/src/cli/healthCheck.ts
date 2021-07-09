import { logger, program } from './shared'
import {
  setGlobalConfigFromConfigFile,
  Config,
  parseConfigFile
} from './shared/config'
import db from 'src/db'
import HealthCheck from 'src/health/HealthCheck'
import { db as dbConfig } from 'src/config'

program
  .command('health-check')
  .option('--config <string>', 'Config file to use.')
  .option('--env <string>', 'Environment variables file')
  .option(
    '--bond-withdrawal-time-limit <number>',
    'Number of minutes a transfer should be bonded before alerting'
  )
  .option(
    '--bond-transfer-root-time-limit <number>',
    'Number of minutes a transfer root should be bonded before alerting'
  )
  .option(
    '--commit-transfers-min-threshold-amount <number>',
    'Minimum threshold amount that triggers alert if commit transfers has not occurred'
  )
  .option(
    '--poll-interval-seconds <number>',
    'Number of seconds to wait between each poll'
  )
  .description('Start health check')
  .action(async (source: any) => {
    const configPath = source?.config || source?.parent?.config
    if (configPath) {
      const config: Config = await parseConfigFile(configPath)
      await setGlobalConfigFromConfigFile(config)
    }
    const bondWithdrawalTimeLimitMinutes = Number(
      source.bondWithdrawalTimeLimit
    )
    const bondTransferRootTimeLimitMinutes = Number(
      source.bondTransferRootTimeLimitMinutes
    )
    const commitTransfersMinThresholdAmount = Number(
      source.commitTransfersMinThresholdAmount
    )
    const pollIntervalSeconds = Number(source.pollIntervalSeconds)

    try {
      new HealthCheck({
        bondWithdrawalTimeLimitMinutes,
        bondTransferRootTimeLimitMinutes,
        commitTransfersMinThresholdAmount,
        pollIntervalSeconds
      }).start()
    } catch (err) {
      logger.error(err.message)
      process.exit(1)
    }
  })