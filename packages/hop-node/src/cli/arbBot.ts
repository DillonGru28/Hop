import arbbots from 'src/arb-bot/bots'
import { logger, program } from './shared'
import {
  setGlobalConfigFromConfigFile,
  parseConfigFile,
  Config
} from './shared/config'

program
  .command('arb-bot')
  .description('Start the arbitrage bot')
  .option('--config <string>', 'Config file to use.')
  .option('--env <string>', 'Environment variables file')
  .option('--max-trade-amount <number>', 'Max trade amount')
  .option('--min-threshold <number>', 'Min threshold')
  .action(async (source: any) => {
    try {
      const configPath = source?.config || source?.parent?.config
      if (configPath) {
        const config: Config = await parseConfigFile(configPath)
        await setGlobalConfigFromConfigFile(config)
      }
      const maxTradeAmount = Number(source.maxTradeAmount) || 0
      const minThreshold = Number(source.minThreshold) || 0
      arbbots.start({
        maxTradeAmount,
        minThreshold
      })
    } catch (err) {
      logger.error(err.message)
      process.exit(1)
    }
  })
