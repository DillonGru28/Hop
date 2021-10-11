import L2Bridge from 'src/watchers/classes/L2Bridge'
import contracts from 'src/contracts'
import getCanonicalTokenSymbol from 'src/utils/getCanonicalTokenSymbol'
import isHToken from 'src/utils/isHToken'
import { BigNumber } from 'ethers'
import { Chain, TokenIndex } from 'src/constants'
import {
  FileConfig,
  parseConfigFile,
  setGlobalConfigFromConfigFile
} from 'src/config'
import { logger, program } from './shared'
import { swap as uniswapSwap } from 'src/uniswap'

program
  .command('swap')
  .description('Swap tokens on Uniswap or via Hop AMM')
  .option('--config <string>', 'Config file to use.')
  .option('--env <string>', 'Environment variables file')
  .option('--chain <string>', 'Chain')
  .option('--from <string>', 'From token')
  .option('--to <string>', 'To token')
  .option('--amount <string>', 'From token amount')
  .option('--max', 'Use max tokens instead of specific amount')
  .option('--deadline <string>', 'Deadline in seconds')
  .option('--slippage <string>', 'Slippage tolerance. E.g. 0.5')
  .option('--recipient <string>', 'Recipient')
  .action(async source => {
    try {
      const configPath = source?.config || source?.parent?.config
      if (configPath) {
        const config: FileConfig = await parseConfigFile(configPath)
        await setGlobalConfigFromConfigFile(config)
      }
      const chain = source.chain
      const fromToken = source.from
      const toToken = source.to
      const amount = Number(source.args[0] || source.amount)
      const max = source.max !== undefined && source.max
      const deadline = Number(source.deadline)
      const slippage = Number(source.slippage)
      const recipient = source.recipient
      if (!chain) {
        throw new Error('chain is required')
      }
      if (!fromToken) {
        throw new Error('"from" token is required')
      }
      if (!toToken) {
        throw new Error('"to" token is required')
      }
      if (!max && !amount) {
        throw new Error('"from" token amount is required')
      }
      if (fromToken === toToken) {
        throw new Error('from-token and to-token cannot be the same')
      }
      const fromTokenIsHToken = isHToken(fromToken)
      const toTokenIsHToken = isHToken(toToken)
      const isAmmSwap = fromTokenIsHToken || toTokenIsHToken
      let tx : any
      if (isAmmSwap) {
        logger.debug('L2 AMM swap')
        if (fromTokenIsHToken && toTokenIsHToken) {
          throw new Error('both from-token and to-token cannot be hTokens')
        }
        const fromTokenCanonicalSymbol = getCanonicalTokenSymbol(fromToken)
        const toTokenCanonicalSymbol = getCanonicalTokenSymbol(toToken)
        if (fromTokenCanonicalSymbol !== toTokenCanonicalSymbol) {
          throw new Error('both from-token and to-token must be the same asset type')
        }
        if (chain === Chain.Ethereum) {
          throw new Error('no AMM on Ethereum chain')
        }
        const token = fromTokenIsHToken ? toToken : fromToken
        const l2BridgeContract = contracts.get(token, chain)?.l2Bridge
        const l2Bridge = new L2Bridge(l2BridgeContract)
        const amm = l2Bridge.amm
        const ammWrapper = l2Bridge.ammWrapper
        const amountIn = l2Bridge.parseUnits(amount)
        let amountOut : BigNumber
        if (fromTokenIsHToken) {
          amountOut = await amm.calculateToHTokensAmount(amountIn)
        } else {
          amountOut = await amm.calculateFromHTokensAmount(amountIn)
        }

        let fromTokenIndex : number
        let toTokenIndex : number
        if (fromTokenIsHToken) {
          fromTokenIndex = TokenIndex.HopBridgeToken
          toTokenIndex = TokenIndex.CanonicalToken
        } else {
          fromTokenIndex = TokenIndex.CanonicalToken
          toTokenIndex = TokenIndex.HopBridgeToken
        }

        const slippageToleranceBps = (slippage || 0.5) * 100
        const minBps = Math.ceil(10000 - slippageToleranceBps)
        const minAmountOut = amountOut.mul(minBps).div(10000)

        logger.debug(`attempting to swap ${amount} ${fromToken} for at least ${minAmountOut} ${toToken}`)
        tx = await amm.swap(fromTokenIndex, toTokenIndex, amountIn, minAmountOut)
      } else {
        logger.debug('uniswap swap')
        tx = await uniswapSwap({
          chain,
          fromToken,
          toToken,
          amount,
          max,
          deadline,
          slippage,
          recipient
        })
      }
      if (!tx) {
        throw new Error('tx object not received')
      }
      logger.info(`swap tx: ${tx.hash}`)
      logger.log('waiting for receipt')
      const receipt = await tx.wait()
      const success = receipt.status === 1
      if (!success) {
        throw new Error('status not successful')
      }
      logger.log('success')

      process.exit(0)
    } catch (err) {
      logger.error(err)
      process.exit(1)
    }
  })
