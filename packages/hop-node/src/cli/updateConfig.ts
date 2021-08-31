import {
  FileConfig,
  getEnabledNetworks,
  isValidNetwork,
  isValidToken,
  parseConfigFile,
  setGlobalConfigFromConfigFile,
  writeConfigFile
} from 'src/config'
import { logger, program } from './shared'
import { utils } from 'ethers'

program
  .command('update-config')
  .description('Update config file')
  .option('--config <string>', 'Config file to use.')
  .option('--env <string>', 'Environment variables file')
  .option('--chain <string>', 'Chain')
  .option('--destination-chain <string>', 'Destination chain')
  .option('--token <string>', 'Token symbol')
  .option('--set-enabled [boolean]', 'Token to set enabled/disabled')
  .option('--commit-transfers-min-threshold <string>', 'Min threshold amount for committing transfers')
  .option('--bond-withdrawals-min <string>', 'Min amount for bonding withdrawals')
  .option('--bond-withdrawals-max <string>', 'Max amount for bonding withdrawals')
  .option('--state-update-address <string>', 'Address of StateUpdater contract')
  .action(async source => {
    try {
      const configPath = source?.config || source?.parent?.config
      const config: FileConfig = await parseConfigFile(configPath)
      if (configPath) {
        await setGlobalConfigFromConfigFile(config)
      }
      const chain = source.chain
      const destinationChain = source.destinationChain
      const token = source.token
      const commitTransfersMinThresholdAmount = Number(source.commitTransfersMinThreshold || 0)
      const bondWithdrawalsMin = Number(source.bondWithdrawalsMin || 0)
      const bondWithdrawalsMax = Number(source.bondWithdrawalsMax || 0)

      const newConfig = JSON.parse(JSON.stringify(config)) // deep clone
      const oldConfig = JSON.parse(JSON.stringify(config)) // deep clone

      if (source.commitTransfersMinThreshold !== undefined) {
        if (!chain) {
          throw new Error('chain is required')
        }
        if (!isValidNetwork(chain)) {
          throw new Error('chain is invalid')
        }
        if (!destinationChain) {
          throw new Error('destination chain is required')
        }
        if (!isValidNetwork(destinationChain)) {
          throw new Error('destination chain is invalid')
        }
        if (!token) {
          throw new Error('token is required')
        }
        if (!isValidToken(token)) {
          throw new Error('token is invalid')
        }
        if (!(newConfig.commitTransfers instanceof Object)) {
          newConfig.commitTransfers = {
            minThresholdAmount: {}
          }
        }
        if (!(newConfig.commitTransfers.minThresholdAmount instanceof Object)) {
          newConfig.commitTransfers = {
            minThresholdAmount: {}
          }
        }
        let isOldConfigType = false
        if (!(newConfig.commitTransfers.minThresholdAmount[token] instanceof Object)) {
          newConfig.commitTransfers = {
            minThresholdAmount: {
              [token]: {}
            }
          }
        }
        if (!(newConfig.commitTransfers.minThresholdAmount[token][chain] instanceof Object)) {
          newConfig.commitTransfers = {
            minThresholdAmount: {
              [token]: {
                [chain]: {}
              }
            }
          }
        }
        if (!(newConfig.commitTransfers.minThresholdAmount[token][chain][destinationChain] instanceof Object)) {
          newConfig.commitTransfers = {
            minThresholdAmount: {
              [token]: {
                [chain]: {
                  [destinationChain]: {}
                }
              }
            }
          }
          isOldConfigType = true
        }

        // convert old config type to new config type
        if (isOldConfigType) {
          const allChains = getEnabledNetworks()
          if (oldConfig?.commitTransfers?.minThresholdAmount) {
            for (const _chain in oldConfig.commitTransfers.minThresholdAmount) {
              if (!isValidNetwork(_chain)) {
                continue
              }
              for (const _token in oldConfig.commitTransfers.minThresholdAmount[_chain]) {
                if (!isValidToken(_token)) {
                  continue
                }
                for (const _destinationChain of allChains) {
                  if (!newConfig.commitTransfers.minThresholdAmount[_token]) {
                    newConfig.commitTransfers.minThresholdAmount[_token] = {}
                  }
                  if (!newConfig.commitTransfers.minThresholdAmount[_token][_chain]) {
                    newConfig.commitTransfers.minThresholdAmount[_token][_chain] = {}
                  }
                  if (oldConfig.commitTransfers.minThresholdAmount[_chain][_token]) {
                    newConfig.commitTransfers.minThresholdAmount[_token][_chain][_destinationChain] = oldConfig.commitTransfers.minThresholdAmount[_chain][_token]
                  }
                }
              }
            }
          }
        }

        newConfig.commitTransfers.minThresholdAmount[token][chain][destinationChain] = commitTransfersMinThresholdAmount
        logger.debug(`updating commitTransfers.minThresholdAmount to ${commitTransfersMinThresholdAmount} for ${token} ${chain}→${destinationChain}`)
      } else if (
        source.bondWithdrawalsMin !== undefined ||
        source.bondWithdrawalsMax !== undefined
      ) {
        if (!chain) {
          throw new Error('chain is required')
        }
        if (!token) {
          throw new Error('token is required')
        }
        if (!(newConfig.bondWithdrawals instanceof Object)) {
          newConfig.bondWithdrawals = {}
        }
        if (!(newConfig.bondWithdrawals[chain] instanceof Object)) {
          newConfig.bondWithdrawals[chain] = {}
        }
        if (!(newConfig.bondWithdrawals[chain][token] instanceof Object)) {
          newConfig.bondWithdrawals[chain][token] = {}
        }
        if (source.bondWithdrawalsMin !== undefined) {
          newConfig.bondWithdrawals[chain][token].min = bondWithdrawalsMin
          logger.debug(`updating bondWithdrawals min to ${bondWithdrawalsMin} for ${chain}.${token}`)
        }
        if (source.bondWithdrawalsMax !== undefined) {
          newConfig.bondWithdrawals[chain][token].max = bondWithdrawalsMax
          logger.debug(`updating bondWithdrawals max to ${bondWithdrawalsMax} for ${chain}.${token}`)
        }
      } else if (source.setEnabled) {
        let setEnabled = !!source.setEnabled
        if (typeof source.setEnabled === 'string') {
          setEnabled = source.setEnabled !== 'false'
        }
        if (!token) {
          throw new Error('token is required')
        }
        if (!(newConfig.tokens instanceof Object)) {
          newConfig.tokens = {}
        }
        newConfig.tokens[token] = setEnabled
        logger.debug(`updating ${token} as ${setEnabled ? 'enabled' : 'disabled'}`)
      } else if (source.stateUpdateAddress) {
        const stateUpdateAddress = utils.getAddress(source.stateUpdateAddress)
        newConfig.stateUpdateAddress = stateUpdateAddress
        logger.debug(`updating StateUpdate address to ${stateUpdateAddress}`)
      } else {
        throw new Error('action is required')
      }

      await writeConfigFile(newConfig, configPath)

      process.exit(0)
    } catch (err) {
      logger.error(err.message)
      process.exit(1)
    }
  })
