import Logger from 'src/logger'
import { Command } from 'commander'
import {
  parseConfigFile,
  setGlobalConfigFromConfigFile
} from 'src/config'

export const logger = new Logger('config')
export const program = new Command()

export const root = program
  .option(
    '--config <path>',
    'Config file path to use. Config file must be in JSON format',
    parseString
  )
  .option('--env <path>', 'Environment variables file', parseString)

export function actionHandler (fn: Function) {
  return async (source: any = {}) => {
    try {
      const configFilePath = source.config || source?.parent?.config
      const config = await parseConfigFile(configFilePath)
      await setGlobalConfigFromConfigFile(config, source.passwordFile)
      source.configFilePath = configFilePath
      source.config = config

      await fn(source)
      process.exit(0)
    } catch (err) {
      logger.error(`program error: ${err.message}\ntrace: ${err.stack}`)
      process.exit(1)
    }
  }
}

export function parseNumber (value: string) {
  return Number(value)
}

export function parseString (value: string) {
  return value ?? ''
}

export function parseBool (value: string) {
  return !!value
}
