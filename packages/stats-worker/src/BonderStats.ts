import path from 'path'
import BlockDater from 'ethereum-block-by-date'
import { BigNumber, providers, Contract, constants } from 'ethers'
import {
  formatUnits,
  parseEther,
  formatEther,
  parseUnits
} from 'ethers/lib/utils'
import { DateTime } from 'luxon'
import Db from './Db'
import {
  ethereumRpc,
  gnosisRpc,
  gnosisArchiveRpc,
  polygonRpc,
  optimismRpc,
  arbitrumRpc,
  etherscanApiKeys
} from './config'
import { mainnet as mainnetAddresses } from '@hop-protocol/core/addresses'
import { erc20Abi } from '@hop-protocol/core/abi'
import { createObjectCsvWriter } from 'csv-writer'
import { chunk } from 'lodash'

// DATA /////////////////////////////////////////////
const arbitrumAliases: Record<string, string> = {
  USDC: '0xc4D28710fE030A75A3a981A1AbaC0dB984E52964',
  USDT: '0xCA0A0E115499082747bA5DA94732863b12cB3036',
  DAI: '0x482BfCa8246806b8dc09091d40005b9317dC751D',
  ETH: '0xF8c59bA692773251E78AD50293Cf4d64B67cbb8B',
  WBTC: '0xa2cE9cceC64FC22475323a0E55d58F7786588a16'
}

const oldArbitrumAliases: Record<string, string> = {
  USDC: '0xBDaCAbf20ef2338D7F4A152aF43bedDC80c6BF3b',
  USDT: '0x81B872dDc3413E3456E5A3b2c30cB749c9578e30',
  DAI: '0x36B6a48C35e75bD2EFF53d94F0BB60D5a00e47fB',
  ETH: '0xFe0368be00308980b5B3FCd0975d47c4C8e1493b',
  WBTC: '0x22902F67Cd7570E0e8fd30264F96ca39Eebc2B6F'
}

const wethAddresses: Record<string, string> = {
  arbitrum: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
}

const totalBalances: Record<string, BigNumber> = {
  USDC: parseUnits('6026000', 6),
  USDT: parseUnits('1893247.79', 6),
  DAI: parseUnits('5000000', 18),
  ETH: parseEther('8339.00'),
  MATIC: parseUnits('731948.94', 18)
}

const initialAggregateBalancesInAssetToken: Record<string, BigNumber> = {
  USDC: parseUnits('0', 6),
  USDT: parseUnits('0', 6),
  DAI: parseUnits('0', 18),
  ETH: parseEther('0'),
  MATIC: parseUnits('0', 18),
  WBTC: parseUnits('0', 8)
}

const initialCanonicalAmounts: any = {
  USDC: {},
  USDT: {},
  DAI: {
    [1636617600]: parseUnits('8752.88', 18), // 11/11/2021 (2.98487439824493 * 2932.41)
    [1636617601]: parseUnits('23422.52', 18) // 11/11/2021
  },
  ETH: {},
  MATIC: {},
  WBTC: {}
}

const initialAggregateNativeBalances: any = {
  USDC: {
    // ethereum: parseUnits('14', 18)
  },
  USDT: {},
  DAI: {},
  ETH: {},
  MATIC: {},
  WBTC: {}
}

const unstakedEthAmounts: Record<string, any> = {
  USDT: {
    [1643011200]: parseEther('2.833318361'), // 01/24/2022 (2.833318361 * 2551.11 = 7228.11)
    // [1642492800]: parseEther('22.7886'), // 01/18/2022 (22.7886 ETH)
    // [1643011201]: parseEther('0.25') // 01/24/2022 (0.25 ETH)
  },
  DAI: {},
  ETH: {},
  MATIC: {},
  WBTC: {}
}

const unstakedAmounts: Record<string, any> = {
  // 0xa6a688F107851131F0E1dce493EbBebFAf99203e
  USDC: {
    [1625036400]: parseUnits('9955.84', 6), // 06/30/2021
    [1629788400]: parseUnits('100000', 6), // 08/24/2021
    [1629788401]: parseUnits('150000', 6), // 08/24/2021
    [1637395200]: parseUnits('580000', 6), // 11/20/2021
    [1643443200]: parseUnits('4886.96', 6), // 01/29/2022 // amount not staked
  },
  // 0x15ec4512516d980090050fe101de21832c8edfee
  USDT: {
    // [1643011200]: parseUnits('7228.11', 6), // 01/24/2022 (2.833318361 * 2551.11) // owed
    [1642147200]: parseUnits('10', 6), // 01/24/2022
    //[1642492800]: parseUnits('58043.34', 6), // 01/18/2022 (22.7886 ETH)
    //[1643011200]: parseUnits('7228.11', 6), // 01/24/2022
    //[1643011201]: parseUnits('610.57', 6), // 01/24/2022 (0.25 ETH)
    [1643356800]: parseUnits('0.87', 6), // 01/28/2022 // amount not staked
    [1657090800]: parseUnits('228406.00', 6), // 07/6/2022
  },
  // 0x305933e09871D4043b5036e09af794FACB3f6170
  DAI: {
    [1638950400]: parseUnits('350000.00', 18), // 12/8/2021
    [1656572400]: parseUnits('250000.00', 18), // 06/30/2022
    [1656572401]: parseUnits('250000.00', 18), // 06/30/2022
    [1656572402]: parseUnits('250000.00', 18), // 06/30/2022
    [1656572403]: parseUnits('750000.00', 18) // 06/30/2022
  },
  // 0x710bDa329b2a6224E4B44833DE30F38E7f81d564
  ETH: {
    [1639555200]: parseEther('6.07'), // 12/15/2021 // owed
    [1639555201]: parseEther('0.10'), // 12/15/2021 // withdrawn
    [1639555202]: parseEther('0.05'), // 12/15/2021 // not staked
    [1639641600]: parseEther('26'), // 12/16/2021
    [1656313200]: parseEther('10'), // 06/27/2022
    [1656486000]: parseEther('25'), // 06/29/2022
    [1656486001]: parseEther('25'), // 06/29/2022
    [1656572400]: parseEther('250'), // 06/30/2022
    //[1656572400]: parseEther('1400'), // 06/30/2022
    [1657436400]: parseEther('200') // 07/10/2022
  },
  // 0xd8781ca9163e9f132a4d8392332e64115688013a
  MATIC: {},
  // 0x2A6303e6b99d451Df3566068EBb110708335658f
  WBTC: {}
}

const restakedProfits: Record<string, any> = {
  // 0xa6a688F107851131F0E1dce493EbBebFAf99203e
  USDC: {
    [1627628400]: parseUnits('9000', 6), // 7/30/2021
    [1637395200]: parseUnits('1340.36', 6), // 11/20/2021
    [1643356800]: parseUnits('100.92', 6), // 01/28/2022
    [1643443200]: parseUnits('2998.70', 6) // 01/29/2022
  },
  // 0x15ec4512516d980090050fe101de21832c8edfee
  USDT: {
    [1643011200]: parseUnits('244.23', 6) // 01/24/2021 // idle (0.1 ETH)
  },
  // 0x305933e09871D4043b5036e09af794FACB3f6170
  DAI: {
    // [1644220800]: parseUnits('300000', 18), // 02/7/2022 // idle
    [1644480001]: parseUnits('23422.52', 18), // 02/11/2022 (2.98487439824493*2932.41)
    [1644652800]: parseUnits('8752.88', 18) // 02/12/2022
  },
  // 0x710bDa329b2a6224E4B44833DE30F38E7f81d564
  ETH: {
    [1640764800]: parseEther('6.07'), // 12/28/2021
    [1643184000]: parseEther('10'), // 01/26/2022
  },
  // 0xd8781ca9163e9f132a4d8392332e64115688013a
  MATIC: {},
  // 0x2A6303e6b99d451Df3566068EBb110708335658f
  WBTC: {}
}

const stakedAmounts: Record<string, any> = {
  USDC: {
    [1625986800]: parseUnits('500000', 6), // 07/11/2021
    [1625986801]: parseUnits('250000', 6), // 07/11/2021
    [1625986802]: parseUnits('250000', 6), // 07/11/2021
    [1627628400]: parseUnits('3000', 6), // 07/30/2021
    [1627628401]: parseUnits('3000', 6), // 07/30/2021
    [1627628402]: parseUnits('3000', 6), // 07/30/2021
    [1630911600]: parseUnits('747000', 6), // 09/06/2021
    [1631775600]: parseUnits('250000', 6), // 09/16/2021
    [1631775601]: parseUnits('250000', 6), // 09/16/2021
    [1637308800]: parseUnits('790000', 6), // 11/19/2021
    [1637308801]: parseUnits('100000', 6), // 11/19/2021
    [1637395200]: parseUnits('940000', 6), // 11/20/2021
    [1637395201]: parseUnits('250000', 6), // 11/20/2021
    [1637395202]: parseUnits('250000', 6), // 11/20/2021
    [1637395203]: parseUnits('250000', 6), // 11/20/2021
    [1643356800]: parseUnits('750000', 6), // 01/28/2022
    [1643443200]: parseUnits('1220000', 6), // 01/29/2022
    [1643443201]: parseUnits('50000', 6), // 01/29/2022
  },
  USDT: {
    [1642147200]: parseUnits('10', 6), // 01/24/2022
    [1643356800]: parseUnits('150000', 6), // 01/28/2022
    [1643356801]: parseUnits('350000', 6), // 01/28/2022
    [1643356802]: parseUnits('350000', 6), // 01/28/2022
    [1643356803]: parseUnits('350000', 6), // 01/28/2022
    [1643356804]: parseUnits('921836', 6), // 01/28/2022
  },
  DAI: {
    [1637222400]: parseUnits('1.00', 18), // 11/18/2021
    [1637222401]: parseUnits('1149999.00', 18), // 11/18/2021
    [1637222402]: parseUnits('100000.00', 18), // 11/18/2021
    [1637308800]: parseUnits('250000.00', 18), // 11/19/2021
    [1637308801]: parseUnits('250000.00', 18), // 11/19/2021
    [1637308802]: parseUnits('250000.00', 18), // 11/19/2021
    [1638950400]: parseUnits('100000.00', 18), // 12/8/2021
    [1638950401]: parseUnits('100000.00', 18), // 12/8/2021
    [1638950402]: parseUnits('100000.00', 18), // 12/8/2021
    [1638950403]: parseUnits('50000.00', 18), // 12/8/2021
    [1643356800]: parseUnits('500000.00', 18), // 1/28/2022
    [1643961601]: parseUnits('300000.00', 18), // 2/4/2022
    [1643961602]: parseUnits('300000.00', 18), // 2/4/2022
    [1643961603]: parseUnits('100000.00', 18), // 2/4/2022
    [1644048000]: parseUnits('1500000.00', 18), // 2/5/2022
    [1644220800]: parseUnits('300000.00', 18) // 2/7/2022
  },
  ETH: {
    [1639555200]: parseEther('0.15'), // 12/15/2021
    [1639641600]: parseEther('54'), // 12/16/2021
    [1639641601]: parseEther('250'), // 12/16/2021
    [1639641602]: parseEther('250'), // 12/16/2021
    [1639641603]: parseEther('250'), // 12/16/2021
    [1639641604]: parseEther('1670'), // 12/16/2021
    [1642060800]: parseEther('500'), // 01/13/2022
    [1643184000]: parseEther('510'), // 01/26/2022
    [1644220800]: parseEther('50'), // 02/07/2022
    [1644220801]: parseEther('200'), // 02/07/2022
    [1644220802]: parseEther('125'), // 02/07/2022
    [1644220803]: parseEther('125'), // 02/07/2022
    [1645689600]: parseEther('2250'), // 02/24/2022
    [1645689601]: parseEther('75'), // 02/24/2022
    [1645776000]: parseEther('225'), // 02/24/2022
    [1645776001]: parseEther('225'), // 02/24/2022
    [1645776002]: parseEther('225'), // 02/24/2022
    [1654153200]: parseEther('750'), // 06/03/2022
    [1656140400]: parseEther('305'), // 06/25/2022
    [1656399600]: parseEther('250'), // 06/28/2022
    [1656399601]: parseEther('50'), // 06/28/2022
    //[1656658800]: parseEther('1400'), // 07/01/2022 // restake unstaked
    [1656572400]: parseEther('250'), // 06/30/2022 // restake unstaked
    [1657436400]: parseEther('10'), // 07/10/2022 // restake unstaked
    [1657436401]: parseEther('200'), // 07/10/2022 // restake unstaked
    [1657436402]: parseEther('50'), // 07/10/2022 // restake unstaked
  },
  MATIC: {},
  WBTC: {}
}

const depositAmounts: Record<string, any> = {
  USDC: {
    [1625036400]: parseUnits('9955.84', 6), // 06/30/2021
    [1625986800]: parseUnits('1000', 6), // 07/11/2021
    [1625986801]: parseUnits('999000', 6), // 07/11/2021
    [1630911600]: parseUnits('997000', 6), // 09/06/2021
    [1637308800]: parseUnits('799988', 6), // 11/19/2021 // transfer
    [1637395200]: parseUnits('948654.05', 6), // 11/20/2021 // transfer
    [1637395201]: parseUnits('250017.59', 6), // 11/20/2021 // transfer
    [1643356800]: parseUnits('749899.08', 6), // 01/28/2022
    [1643443200]: parseUnits('1224886.96', 6), // 01/29/2022
    [1643443201]: parseUnits('47001.30', 6), // 01/29/2022
  },
  USDT: {
    [1643011200]: parseUnits('21', 6), // 01/24/2022
    [1643356800]: parseUnits('2081815.87', 6), // 01/28/2022
    [1643356801]: parseUnits('1000', 6), // 01/28/2022
    [1643356802]: parseUnits('39000', 6), // 01/28/2022
  },
  DAI: {
    [1636617600]: parseUnits('2000000', 18), // 11/11/2021
    [1643356800]: parseUnits('500000', 18), // 01/28/2022
    [1643961600]: parseUnits('1000000', 18), // 02/04/2022
    [1644048000]: parseUnits('1500000', 18) // 02/05/2022
  },
  ETH: {
    [1639555200]: parseEther('0.15'), // 12/15/2021
    [1639641600]: parseEther('1'), // 12/16/2021
    [1639641601]: parseEther('2499'), // 12/16/2021
    [1642060800]: parseEther('500'), // 01/13/2022
    [1643184000]: parseEther('500'), // 01/26/2022
    [1644220800]: parseEther('500'), // 02/07/2022
    [1645689600]: parseEther('3000'), // 02/24/2022
    [1654153200]: parseEther('750'), // 06/01/2022
    [1656140400]: parseEther('305'), // 06/25/2022
    [1656313200]: parseEther('300') // 06/27/2022
  },
  WBTC: {}
}

const withdrawnAmounts: Record<string, any> = {
  USDC: {},
  USDT: {
    [1657090801]: parseUnits('228588.20', 6) // 07/6/2022 // withdrawn
  },
  DAI: {},
  ETH: {},
  WBTC: {},
}

const bonderAddresses: Record<string, string> = {
  USDC: '0xa6a688F107851131F0E1dce493EbBebFAf99203e',
  USDT: '0x15ec4512516d980090050fe101de21832c8edfee',
  DAI: '0x305933e09871D4043b5036e09af794FACB3f6170',
  ETH: '0x710bDa329b2a6224E4B44833DE30F38E7f81d564',
  MATIC: '0xd8781ca9163e9f132a4d8392332e64115688013a'
}

const etherscanUrls: Record<string, string> = {
  ethereum: 'https://api.etherscan.io',
  polygon: 'https://api.polygonscan.com',
  optimism: 'https://api-optimistic.etherscan.io',
  arbitrum: 'https://api.arbiscan.io',
  gnosis: 'https://blockscout.com/poa/xdai'
}

/////////////////////////////////////////////////////

const wait = (t: number) =>
  new Promise(resolve => setTimeout(() => resolve(null), t))

const allProviders: Record<string, any> = {
  ethereum: new providers.StaticJsonRpcProvider(ethereumRpc),
  gnosis: new providers.StaticJsonRpcProvider(gnosisRpc),
  polygon: new providers.StaticJsonRpcProvider(polygonRpc),
  optimism: new providers.StaticJsonRpcProvider(optimismRpc),
  arbitrum: new providers.StaticJsonRpcProvider(arbitrumRpc)
}

const allArchiveProviders: Record<string, any> = {
  gnosis: gnosisArchiveRpc
    ? new providers.StaticJsonRpcProvider(gnosisArchiveRpc)
    : undefined
}

type Options = {
  days?: number
  offsetDays?: number
  tokens?: string[]
  trackBonderProfit?: boolean
  trackBonderFees?: boolean
  trackBonderTxFees?: boolean
}

class BonderStats {
  db = new Db()
  days: number = 1
  offsetDays: number = 0
  tokens: string[] = ['ETH', 'USDC', 'USDT', 'DAI', 'MATIC', 'WBTC']
  chains = ['ethereum', 'polygon', 'gnosis', 'optimism', 'arbitrum']
  trackOnlyProfit = false
  trackOnlyTxFees = false
  trackOnlyFees = false

  tokenDecimals: Record<string, number> = {
    USDC: 6,
    USDT: 6,
    DAI: 18,
    MATIC: 18,
    ETH: 18,
    WBTC: 8
  }

  constructor (options: Options = {}) {
    if (options.days) {
      this.days = options.days
    }
    if (options.offsetDays) {
      this.offsetDays = options.offsetDays
    }
    if (options.tokens) {
      this.tokens = options.tokens
    }

    this.trackOnlyProfit = !!options.trackBonderProfit
    this.trackOnlyTxFees = !!options.trackBonderTxFees
    this.trackOnlyFees = !!options.trackBonderFees

    console.log(
      `trackOnlyProfit: ${this.trackOnlyProfit}, trackOnlyTxFees: ${this.trackOnlyTxFees}, trackOnlyFees: ${this.trackOnlyFees}`
    )

    process.once('uncaughtException', async err => {
      console.error('uncaughtException:', err)
      this.cleanUp()
      process.exit(0)
    })

    process.once('SIGINT', () => {
      this.cleanUp()
    })
  }

  cleanUp () {
    // console.log('closing db')
    // this.db.close()
  }

  async trackBonderFee () {
    for (const token of this.tokens) {
      const days = Array(this.days)
        .fill(0)
        .map((n, i) => n + i)
      const chunkSize = 10
      const allChunks = chunk(days, chunkSize)
      const csv: any[] = []
      for (const chunks of allChunks) {
        csv.push(
          ...(await Promise.all(
            chunks.map(async (day: number) => {
              return this.trackBonderFeeDay(day, token)
            })
          ))
        )
      }
    }
  }

  async trackBonderFeeDay (day: number, token: string) {
    const now = DateTime.utc()
    const date = now.minus({ days: day }).startOf('day')
    const startDate = Math.floor(date.toSeconds())
    const endDate = Math.floor(date.endOf('day').toSeconds())
    const isoDate = date.toISO()

    const dbData: Record<string, any> = {}
    let totalFees = BigNumber.from(0)
    for (const chain of this.chains) {
      let chainFees = BigNumber.from(0)
      if (chain === 'ethereum') {
        continue
      }
      const items = await this.fetchTransferSents(
        chain,
        token,
        startDate,
        endDate
      )
      for (const { bonderFee } of items) {
        chainFees = chainFees.add(BigNumber.from(bonderFee))
      }
      totalFees = totalFees.add(chainFees)
      const chainFeesFormatted = Number(
        formatUnits(chainFees, this.tokenDecimals[token])
      )
      dbData[`${chain}FeesAmount`] = chainFeesFormatted
      console.log(day, 'chain bonder fees', isoDate, chain, chainFeesFormatted)
    }
    const totalFeesFormatted = Number(
      formatUnits(totalFees, this.tokenDecimals[token])
    )
    dbData.totalFeesAmount = totalFeesFormatted
    console.log(day, 'total bonder fees', isoDate, totalFeesFormatted)

    try {
      await this.db.upsertBonderFees(
        token,
        dbData.polygonFeesAmount,
        dbData.gnosisFeesAmount,
        dbData.arbitrumFeesAmount,
        dbData.optimismFeesAmount,
        dbData.ethereumFeesAmount,
        dbData.totalFeesAmount,
        startDate
      )
      console.log(
        day,
        'upserted',
        token,
        startDate,
        DateTime.fromSeconds(startDate).toISO()
      )
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed')) {
        throw err
      }
    }
  }

  async run () {
    while (true) {
      try {
        if (this.trackOnlyProfit) {
          await this.trackProfit()
        } else if (this.trackOnlyTxFees) {
          await this.trackBonderTxFees()
        } else if (this.trackOnlyFees) {
          await this.trackBonderFee()
        } else {
          await Promise.all([
            this.trackProfit(),
            this.trackBonderFee(),
            this.trackBonderTxFees()
          ])
        }
        break
      } catch (err) {
        console.error(err)
      }
    }
  }

  async trackBonderTxFeeDay (day: number, token: string) {
    const now = DateTime.utc()
    const date = now.minus({ days: day }).startOf('day')
    const startDate = Math.floor(date.toSeconds())
    const endDate = Math.floor(date.endOf('day').toSeconds())
    const isoDate = date.toISO()
    const address = bonderAddresses[token]
    if (!address) {
      throw new Error(`no address found for token "${token}"`)
    }

    const prices = await this.getTokenPrices()
    const priceMap: any = {}
    for (const _token in prices) {
      const dates = prices[_token].reverse().map((x: any) => x[0])
      const nearest = this.nearestDate(dates, startDate)
      const price = prices[_token][nearest][1]
      priceMap[_token] = price
    }

    const dbData: Record<string, any> = {}
    await Promise.all(
      this.chains.map(async (chain: string) => {
        let chainFees = BigNumber.from(0)
        const gasFees = await this.fetchBonderTxFees(
          address,
          chain,
          startDate,
          endDate
        )
        const chainFeesFormatted = Number(formatEther(gasFees))
        dbData[`${chain}TxFees`] = chainFeesFormatted
        console.log(chain, chainFeesFormatted)
      })
    )

    const ethPrice = priceMap.ETH
    const maticPrice = priceMap.MATIC
    const xdaiPrice = 1
    dbData.ethPrice = ethPrice
    dbData.maticPrice = maticPrice
    dbData.xdaiPrice = xdaiPrice
    dbData.totalFees =
      Number(dbData.polygonTxFees || 0) * maticPrice +
      Number(dbData.gnosisTxFees || 0) * xdaiPrice +
      (Number(dbData.arbitrumTxFees || 0) +
        Number(dbData.optimismTxFees || 0) +
        Number(dbData.ethereumTxFees || 0)) *
        ethPrice
    console.log(dbData.totalFees)

    try {
      await this.db.upsertBonderTxFees(
        token,
        dbData.polygonTxFees,
        dbData.gnosisTxFees,
        dbData.arbitrumTxFees,
        dbData.optimismTxFees,
        dbData.ethereumTxFees,
        dbData.totalFees,
        dbData.ethPrice,
        dbData.maticPrice,
        dbData.xdaiPrice,
        startDate
      )
      console.log(day, 'upserted', token, startDate)
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed')) {
        throw err
      }
    }
  }

  async trackBonderTxFees () {
    for (const token of this.tokens) {
      console.log('tracking bonder tx fees', token)
      const days = Array(this.days)
        .fill(0)
        .map((n, i) => n + i)
      for (const day of days) {
        await this.trackBonderTxFeeDay(day, token)
      }
    }
  }

  async getTokenPrices () {
    const priceDays = 365
    const pricesArr = await Promise.all([
      this.getPriceHistory('usd-coin', priceDays),
      this.getPriceHistory('tether', priceDays),
      this.getPriceHistory('dai', priceDays),
      this.getPriceHistory('ethereum', priceDays),
      this.getPriceHistory('matic-network', priceDays),
      this.getPriceHistory('wrapped-bitcoin', priceDays)
    ])
    const prices: Record<string, any> = {
      USDC: pricesArr[0],
      USDT: pricesArr[1],
      DAI: pricesArr[2],
      ETH: pricesArr[3],
      MATIC: pricesArr[4],
      WBTC: pricesArr[5]
    }

    return prices
  }

  async trackProfitDay (day: number, token: string, prices: any) {
    console.log('day:', day)
    const now = DateTime.utc()
    const date = now.minus({ days: day + this.offsetDays }).startOf('day')
    console.log('date:', date.toISO())
    const timestamp = Math.floor(date.toSeconds())
    const isoDate = date.toISO()
    console.log('date:', isoDate)

    const priceMap: any = {}
    for (const _token in prices) {
      const dates = prices[_token].reverse().map((x: any) => x[0])
      const nearest = this.nearestDate(dates, timestamp)
      const price = prices[_token][nearest][1]
      priceMap[_token] = price
    }

    const { bonderBalances, dbData } = await this.fetchBonderBalances(
      token,
      timestamp,
      priceMap
    )

    const initialAggregateBalanceInAssetToken =
      initialAggregateBalancesInAssetToken?.[token]
    const initialAggregateNativeBalance =
      initialAggregateNativeBalances?.[token]

    let unstakedAmount = BigNumber.from(0)
    for (const ts in unstakedAmounts[token]) {
      if (Number(ts) <= timestamp) {
        unstakedAmount = unstakedAmount.add(unstakedAmounts[token][ts])
        console.log(
          ts,
          'subtract unstaked amount',
          unstakedAmounts[token][ts].toString()
        )
      }
    }

    let unstakedEthAmount = BigNumber.from(0)
    for (const ts in unstakedEthAmounts[token]) {
      if (Number(ts) <= timestamp) {
        unstakedEthAmount = unstakedEthAmount.add(unstakedEthAmounts[token][ts])
        console.log(
          ts,
          'subtract unstaked amount ETH',
          unstakedEthAmounts[token][ts].toString()
        )
      }
    }

    let restakedAmount = BigNumber.from(0)
    for (const ts in restakedProfits[token]) {
      if (Number(ts) <= timestamp) {
        restakedAmount = restakedAmount.add(restakedProfits[token][ts])
        console.log(
          ts,
          'add restaked amount',
          restakedProfits[token][ts].toString()
        )
      }
    }

    let depositAmount = BigNumber.from(0)
    for (const ts in depositAmounts[token]) {
      if (Number(ts) <= timestamp) {
        depositAmount = depositAmount.add(depositAmounts[token][ts])
        console.log(
          ts,
          'subtract deposit amount',
          depositAmounts[token][ts].toString()
        )
      }
    }

    let withdrawnAmount = BigNumber.from(0)
    for (const ts in withdrawnAmounts[token]) {
      if (Number(ts) <= timestamp) {
        withdrawnAmount = withdrawnAmount.add(withdrawnAmounts[token][ts])
        console.log(
          ts,
          'subtract withdrawn amount',
          withdrawnAmounts[token][ts].toString()
        )
      }
    }

    let stakedAmount = BigNumber.from(0)
    for (const ts in stakedAmounts[token]) {
      if (Number(ts) <= timestamp) {
        stakedAmount = stakedAmount.add(stakedAmounts[token][ts])
        console.log(
          ts,
          'subtract staked amount',
          stakedAmounts[token][ts].toString()
        )
      }
    }

    let initialCanonicalAmount = BigNumber.from(0)
    for (const ts in initialCanonicalAmounts[token]) {
      if (Number(ts) <= timestamp) {
        initialCanonicalAmount = initialCanonicalAmount.add(
          initialCanonicalAmounts[token][ts]
        )
        console.log(
          ts,
          'subtract initial canonical amount',
          initialCanonicalAmounts[token][ts].toString()
        )
      }
    }

    const { resultFormatted } = await this.computeResult({
      token,
      initialAggregateBalanceInAssetToken,
      initialAggregateNativeBalance,
      restakedAmount,
      unstakedAmount,
      bonderBalances,
      priceMap
    })

    const {
      resultFormatted: result2Formatted,
      ethAmountsFormatted
    } = await this.computeResult2({
      token,
      initialAggregateBalanceInAssetToken,
      initialAggregateNativeBalance,
      restakedAmount,
      unstakedAmount,
      unstakedEthAmount,
      bonderBalances,
      priceMap
    })

    dbData.unstakedAmount = Number(
      formatUnits(unstakedAmount, this.tokenDecimals[token])
    )

    dbData.unstakedEthAmount = Number(
      formatEther(unstakedEthAmount)
    )

    dbData.restakedAmount = Number(
      formatUnits(restakedAmount, this.tokenDecimals[token])
    )

    dbData.depositAmount = Number(
      formatUnits(depositAmount, this.tokenDecimals[token])
    )

    dbData.withdrawnAmount = Number(
      formatUnits(withdrawnAmount, this.tokenDecimals[token])
    )

    dbData.stakedAmount = Number(
      formatUnits(stakedAmount, this.tokenDecimals[token])
    )

    dbData.initialCanonicalAmount = Number(
      formatUnits(initialCanonicalAmount, this.tokenDecimals[token])
    )

    console.log('results', token, timestamp, resultFormatted)

    dbData.xdaiPriceUsd = 1

    const { resultFormatted: result3Formatted } = await this.computeResult3({
      token,
      dbData
    })

    console.log('result3', token, timestamp, result3Formatted)

    try {
      await this.db.upsertBonderBalances(
        token,
        dbData.polygonBlockNumber,
        dbData.polygonCanonicalAmount,
        dbData.polygonHTokenAmount,
        dbData.polygonNativeAmount,
        dbData.gnosisBlockNumber,
        dbData.gnosisCanonicalAmount,
        dbData.gnosisHTokenAmount,
        dbData.gnosisNativeAmount,
        dbData.arbitrumBlockNumber,
        dbData.arbitrumCanonicalAmount,
        dbData.arbitrumHTokenAmount,
        dbData.arbitrumNativeAmount,
        dbData.arbitrumAliasAmount,
        dbData.optimismBlockNumber,
        dbData.optimismCanonicalAmount,
        dbData.optimismHTokenAmount,
        dbData.optimismNativeAmount,
        dbData.ethereumBlockNumber,
        dbData.ethereumCanonicalAmount,
        dbData.ethereumNativeAmount,
        dbData.unstakedAmount,
        dbData.restakedAmount,
        dbData.ethPriceUsd,
        dbData.maticPriceUsd,
        resultFormatted,
        timestamp,
        result2Formatted,
        ethAmountsFormatted,
        dbData.xdaiPriceUsd,
        dbData.depositAmount,
        dbData.stakedAmount,
        dbData.initialCanonicalAmount,
        result3Formatted,
        dbData.arbitrumWethAmount,
        dbData.withdrawnAmount,
        dbData.unstakedEthAmount,
      )
      console.log(
        day,
        'upserted bonder balance',
        token,
        timestamp,
        DateTime.fromSeconds(timestamp).toISO(),
        result3Formatted
      )
    } catch (err) {
      if (!err.message.includes('UNIQUE constraint failed')) {
        throw err
      }
    }

    return dbData
  }

  async trackProfit () {
    console.log('days:', this.days)
    console.log('chains:', this.chains)
    console.log('tokens:', this.tokens)

    const prices = await this.getTokenPrices()

    for (const token of this.tokens) {
      const days = Array(this.days)
        .fill(0)
        .map((n, i) => n + i)
      const chunkSize = 10
      const allChunks = chunk(days, chunkSize)
      const csv: any[] = []
      for (const chunks of allChunks) {
        csv.push(
          ...(await Promise.all(
            chunks.map(async (day: number) => {
              return this.trackProfitDay(day, token, prices)
            })
          ))
        )
      }

      const data = Object.values(csv)
      const headers = Object.keys(data[0])
      const rows = Object.values(data)
      const csvPath = path.resolve(__dirname, '../', `${token}.csv`)
      const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: headers.map(id => {
          return { id, title: id }
        })
      })

      await csvWriter.writeRecords(rows)
      console.log(`wrote ${csvPath}`)
    }
  }

  async fetchBonderBalances (token: string, timestamp: number, priceMap: any) {
    let retries = 0
    while (true) {
      try {
        const bonders = (mainnetAddresses as any).bonders
        const bonderMap = bonders[token]
        const bonderBalances: any = {}
        const dbData: any = {}
        const chainPromises: any[] = []

        for (const sourceChain in bonderMap) {
          for (const destinationChain in bonderMap[sourceChain]) {
            chainPromises.push(
              new Promise(async (resolve, reject) => {
                try {
                  const chain = destinationChain
                  let provider = allProviders[chain]
                  const archiveProvider = allArchiveProviders[chain] || provider
                  const bonder = bonderMap[sourceChain][destinationChain]
                  if (bonderBalances[chain]) {
                    resolve(null)
                    return
                  }
                  if (!bonderBalances[chain]) {
                    bonderBalances[chain] = {
                      canonical: BigNumber.from(0),
                      hToken: BigNumber.from(0),
                      native: BigNumber.from(0),
                      alias: BigNumber.from(0)
                    }
                  }
                  const bridgeMap = (mainnetAddresses as any).bridges[token][
                    chain
                  ]
                  const tokenAddress =
                    bridgeMap.l2CanonicalToken ?? bridgeMap.l1CanonicalToken
                  const hTokenAddress = bridgeMap.l2HopBridgeToken
                  const tokenContract = new Contract(
                    tokenAddress,
                    erc20Abi,
                    archiveProvider
                  )
                  const hTokenContract = hTokenAddress
                    ? new Contract(hTokenAddress, erc20Abi, archiveProvider)
                    : null

                  console.log(
                    `fetching daily bonder balance stat, chain: ${chain}, token: ${token}, timestamp: ${timestamp}`
                  )

                  const blockDater = new BlockDater(provider)
                  const date = DateTime.fromSeconds(timestamp).toJSDate()
                  const info = await blockDater.getDate(date)
                  if (!info) {
                    throw new Error('no info')
                  }
                  const blockTag = info.block
                  const balancePromises: Promise<any>[] = []

                  if (tokenAddress !== constants.AddressZero) {
                    balancePromises.push(
                      tokenContract.balanceOf(bonder, {
                        blockTag
                      })
                    )
                  } else {
                    balancePromises.push(Promise.resolve(0))
                  }

                  if (hTokenContract) {
                    balancePromises.push(
                      hTokenContract.balanceOf(bonder, {
                        blockTag
                      })
                    )
                  } else {
                    balancePromises.push(Promise.resolve(0))
                  }

                  balancePromises.push(
                    archiveProvider.getBalance(bonder, blockTag)
                  )

                  if (chain === 'arbitrum') {
                    let aliasAddress = arbitrumAliases[token]
                    if (token === 'DAI' && timestamp < 1650092400) {
                      aliasAddress = oldArbitrumAliases[token]
                    }
                    balancePromises.push(
                      archiveProvider.getBalance(aliasAddress, blockTag)
                    )
                  } else {
                    balancePromises.push(Promise.resolve(0))
                  }

                  const [
                    balance,
                    hBalance,
                    native,
                    aliasBalance
                  ] = await Promise.all(balancePromises)

                  bonderBalances[chain].canonical = balance
                  bonderBalances[chain].hToken = hBalance
                  bonderBalances[chain].native = native
                  bonderBalances[chain].alias = aliasBalance

                  dbData[`${chain}BlockNumber`] = blockTag
                  dbData[`${chain}CanonicalAmount`] = balance
                    ? Number(
                        formatUnits(
                          balance.toString(),
                          this.tokenDecimals[token]
                        )
                      )
                    : 0
                  dbData[`${chain}NativeAmount`] = native
                    ? Number(formatEther(native.toString()))
                    : 0

                  dbData.ethPriceUsd = Number(priceMap['ETH'])
                  dbData.maticPriceUsd = Number(priceMap['MATIC'])
                  if (chain !== 'ethereum') {
                    dbData[`${chain}HTokenAmount`] = hBalance
                      ? Number(
                          formatUnits(
                            hBalance.toString(),
                            this.tokenDecimals[token]
                          )
                        )
                      : 0
                  }
                  if (chain === 'arbitrum') {
                    dbData[`${chain}AliasAmount`] = aliasBalance
                      ? Number(formatEther(aliasBalance.toString()))
                      : 0
                    console.log(
                      `${chain} ${token} alias balance`,
                      Number(formatEther(aliasBalance.toString()))
                    )
                  }

                  if (chain === 'arbitrum') {
                    const wethAddress = wethAddresses[chain]
                    const wethContract = new Contract(
                      wethAddress,
                      erc20Abi,
                      provider
                    )

                    const wethBalance = await wethContract.balanceOf(bonder, {
                      blockTag
                    })

                    console.log('weth bal', wethBalance.toString())

                    dbData[`${chain}WethAmount`] = Number(formatEther(wethBalance.toString()))
                  }

                  // NOTE: this is to account for offset issue with unstake/stake timestamps
                  if (
                    token === 'ETH' &&
                    timestamp > 1656486000 &&
                    timestamp < 1656658800 &&
                    dbData.ethereumNativeAmount > 1400
                  ) {
                    dbData.ethereumNativeAmount =
                      dbData.ethereumNativeAmount - 1400
                  }

                  // NOTE: this is to account for offset issue with unstake/stake timestamps
                  if (
                    token === 'USDT' &&
                    timestamp > 1657177200 &&
                    timestamp < 1657350000 &&
                    dbData.ethereumCanonicalAmount > 228588.20
                  ) {
                    dbData.ethereumCanonicalAmount =
                      dbData.ethereumCanonicalAmount - 228588.20
                  }

                  // NOTE: this is to account for offset issue with unstake/stake timestamps
                  if (
                    token === 'USDC' &&
                    timestamp > 1654239600 &&
                    timestamp < 1654412400 &&
                    dbData.ethereumCanonicalAmount > 1998270.56
                  ) {
                    dbData.ethereumCanonicalAmount =
                      dbData.ethereumCanonicalAmount - 1998270.56
                  }

                  console.log(
                    `done fetching daily bonder fee stat, chain: ${chain}`
                  )

                  resolve(null)
                } catch (err) {
                  reject(err)
                }
              })
            )
          }
        }

        await Promise.all(chainPromises)

        console.log('done fetching timestamp balances')
        return { bonderBalances, dbData }
      } catch (err) {
        console.error('fetch balances error', err.message)
        const shouldRetry = this.shouldRetry(err.message)
        if (!shouldRetry) {
          throw err
        }
        if (retries > 10) {
          throw new Error('max retries reached')
        }
        console.log('retrying')
        await wait(2 * 1000)
      }
      retries++
    }
  }

  async computeResult (data: any = {}) {
    const {
      token,
      initialAggregateBalanceInAssetToken,
      initialAggregateNativeBalance,
      restakedAmount,
      unstakedAmount,
      bonderBalances,
      priceMap
    } = data
    let aggregateBalance = initialAggregateBalanceInAssetToken
      .sub(unstakedAmount)
      .add(restakedAmount)
    const nativeBalances: Record<string, any> = {}
    for (const chain of this.chains) {
      nativeBalances[chain] = BigNumber.from(0)
    }

    for (const chain in bonderBalances) {
      const { canonical, hToken, native, alias } = bonderBalances[chain]
      aggregateBalance = aggregateBalance.add(canonical).add(hToken)
      nativeBalances[chain] = native.add(alias)
    }
    const nativeTokenDiffs: Record<string, any> = {}
    for (const chain of this.chains) {
      nativeTokenDiffs[chain] = nativeBalances[chain].sub(
        initialAggregateNativeBalance?.[chain] ?? 0
      )
    }
    const nativeTokenDiffsInToken: Record<string, any> = {}
    for (const chain of this.chains) {
      const multiplier = parseEther('1')
      const nativeSymbol = this.getChainNativeTokenSymbol(chain)
      const nativeTokenPriceUsdWei = parseEther(
        priceMap[nativeSymbol].toString()
      )
      const tokenPriceUsdWei = parseEther(priceMap[token].toString())
      const nativeTokenDecimals = this.tokenDecimals[nativeSymbol]
      const rate = nativeTokenPriceUsdWei.mul(multiplier).div(tokenPriceUsdWei)
      const exponent = nativeTokenDecimals - this.tokenDecimals[token]

      const diff = nativeTokenDiffs[chain]
      const resultInTokenWei = diff.mul(rate).div(multiplier)
      const resultInToken = resultInTokenWei.div(
        BigNumber.from(10).pow(exponent)
      )
      nativeTokenDiffsInToken[chain] = resultInToken.sub(
        initialAggregateNativeBalance?.[chain] ?? 0
      )
    }
    let nativeTokenDiffSum = BigNumber.from(0)
    for (const chain of this.chains) {
      nativeTokenDiffSum = nativeTokenDiffSum.add(
        nativeTokenDiffsInToken[chain]
      )
    }
    let result = aggregateBalance.add(nativeTokenDiffSum)
    if (result.lt(0)) {
      result = BigNumber.from(0)
    }
    const resultFormatted = Number(
      formatUnits(result.toString(), this.tokenDecimals[token])
    )

    return {
      result,
      resultFormatted
    }
  }

  async computeResult2 (data: any = {}) {
    const {
      token,
      initialAggregateBalanceInAssetToken,
      initialAggregateNativeBalance,
      restakedAmount,
      unstakedAmount,
      unstakedEthAmount,
      bonderBalances,
      priceMap
    } = data
    let aggregateBalanceToken = initialAggregateBalanceInAssetToken
      .sub(unstakedAmount)
      .add(restakedAmount)
    const nativeBalances: Record<string, any> = {}
    for (const chain of this.chains) {
      nativeBalances[chain] = BigNumber.from(0)
    }

    for (const chain in bonderBalances) {
      const { canonical, hToken, native, alias } = bonderBalances[chain]
      aggregateBalanceToken = aggregateBalanceToken.add(canonical).add(hToken)
      nativeBalances[chain] = native.add(alias)
    }
    const nativeTokenDiffs: Record<string, any> = {}
    for (const chain of this.chains) {
      nativeTokenDiffs[chain] = nativeBalances[chain].sub(
        initialAggregateNativeBalance?.[chain] ?? 0
      )
    }

    let ethAmounts = BigNumber.from(0).sub(unstakedEthAmount)

    const nonEthNativeTokenDiffsInToken: Record<string, any> = {}
    for (const chain of this.chains) {
      const multiplier = parseEther('1')
      const nativeSymbol = this.getChainNativeTokenSymbol(chain)
      if (nativeSymbol === 'ETH') {
        ethAmounts = ethAmounts.add(nativeTokenDiffs[chain])
        continue
      }
      const nativeTokenPriceUsdWei = parseEther(
        priceMap[nativeSymbol].toString()
      )
      const tokenPriceUsdWei = parseEther(priceMap[token].toString())
      const nativeTokenDecimals = this.tokenDecimals[nativeSymbol]
      const rate = nativeTokenPriceUsdWei.mul(multiplier).div(tokenPriceUsdWei)
      const exponent = nativeTokenDecimals - this.tokenDecimals[token]

      const diff = nativeTokenDiffs[chain]
      const resultInTokenWei = diff.mul(rate).div(multiplier)
      const resultInToken = resultInTokenWei.div(
        BigNumber.from(10).pow(exponent)
      )
      nonEthNativeTokenDiffsInToken[chain] = resultInToken.sub(
        initialAggregateNativeBalance?.[chain] ?? 0
      )
    }

    let nonEthNativeTokenDiffSum = BigNumber.from(0)
    for (const chain of this.chains) {
      nonEthNativeTokenDiffSum = nonEthNativeTokenDiffSum.add(
        nonEthNativeTokenDiffsInToken[chain] ?? BigNumber.from(0)
      )
    }

    let result = aggregateBalanceToken.add(nonEthNativeTokenDiffSum)
    if (result.lt(0)) {
      result = BigNumber.from(0)
    }
    const resultFormatted = Number(
      formatUnits(result.toString(), this.tokenDecimals[token])
    )

    const ethAmountsFormatted = Number(formatUnits(ethAmounts.toString(), 18))

    return {
      result,
      resultFormatted,
      ethAmounts,
      ethAmountsFormatted
    }
  }

  async computeResult3 (data: any = {}) {
    const { token, dbData } = data

    const totalBalances =
      dbData.restakedAmount +
      dbData.polygonCanonicalAmount +
      dbData.polygonHTokenAmount +
      dbData.gnosisCanonicalAmount +
      dbData.gnosisHTokenAmount +
      dbData.arbitrumCanonicalAmount +
      dbData.arbitrumHTokenAmount +
      dbData.optimismCanonicalAmount +
      dbData.optimismHTokenAmount +
      dbData.ethereumCanonicalAmount +
      (dbData.stakedAmount - dbData.unstakedAmount) -
      dbData.initialCanonicalAmount -
      (dbData.unstakedEthAmount * dbData.ethPriceUsd)
    const totalDeposits = dbData.depositAmount - dbData.withdrawnAmount

    let nativeStartingTokenAmount = 0
    if (token === 'DAI') {
      nativeStartingTokenAmount = 10.58487 * dbData.ethPriceUsd
    }
    let nativeTokenDebt =
      dbData.polygonNativeAmount * dbData.maticPriceUsd +
      dbData.gnosisNativeAmount * dbData.xdaiPriceUsd +
      (dbData.ethereumNativeAmount +
        dbData.optimismNativeAmount +
        dbData.arbitrumNativeAmount +
        dbData.arbitrumAliasAmount) *
        dbData.ethPriceUsd

    if (token === 'ETH') {
      nativeTokenDebt =
        ((dbData.polygonNativeAmount * dbData.maticPriceUsd) / dbData.ethPriceUsd) +
        ((dbData.gnosisNativeAmount * 1) / dbData.ethPriceUsd) +
        ((dbData.ethereumNativeAmount + dbData.optimismNativeAmount + dbData.arbitrumNativeAmount + dbData.arbitrumAliasAmount))
    }

    nativeTokenDebt = nativeStartingTokenAmount - nativeTokenDebt
    const result = totalBalances - totalDeposits - nativeTokenDebt
    const resultFormatted = result

    return {
      resultFormatted
    }
  }

  async getPriceHistory (coinId: string, days: number) {
    const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
    return fetch(url)
      .then(res => res.json())
      .then(json => {
        if (!json.prices) {
          console.log(json)
        }
        return json.prices.map((data: any[]) => {
          data[0] = Math.floor(data[0] / 1000)
          return data
        })
      })
  }

  getChainNativeTokenSymbol (chain: string) {
    if (chain === 'polygon') {
      return 'MATIC'
    } else if (chain === 'gnosis') {
      return 'DAI'
    }

    return 'ETH'
  }

  nearestDate (dates: any[], target: any) {
    if (!target) {
      target = Date.now()
    } else if (target instanceof Date) {
      target = target.getTime()
    }

    var nearest = Infinity
    var winner = -1

    dates.forEach(function (date, index) {
      if (date instanceof Date) date = date.getTime()
      var distance = Math.abs(date - target)
      if (distance < nearest) {
        nearest = distance
        winner = index
      }
    })

    return winner
  }

  getGraphUrl (chain: string) {
    if (chain == 'gnosis') {
      chain = 'xdai'
    }

    return `https://api.thegraph.com/subgraphs/name/hop-protocol/hop-${chain}`
  }

  async queryFetch (url: string, query: string, variables?: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: variables || {}
      })
    })
    const jsonRes = await res.json()
    if (!jsonRes.data) {
      throw new Error(jsonRes.errors[0].message)
    }
    return jsonRes.data
  }

  async fetchTransferSents (
    chain: string,
    token: string,
    startDate: number,
    endDate: number
  ) {
    const query = `
      query TransferSents($token: String, $startDate: Int, $endDate: Int) {
        transferSents(
          where: {
            token: $token,
            timestamp_gte: $startDate,
            timestamp_lt: $endDate
          },
          orderBy: timestamp,
          orderDirection: desc,
          first: 1000
        ) {
          id
          token
          bonderFee
        }
      }
    `
    const url = this.getGraphUrl(chain)
    const data = await this.queryFetch(url, query, {
      token,
      startDate,
      endDate
    })

    if (!data) {
      return []
    }

    return data.transferSents
  }

  async fetchBonderTxFees (
    address: string,
    chain: string,
    startDate: number,
    endDate: number
  ) {
    const provider = allProviders[chain]
    const blockDater = new BlockDater(provider)
    const date = DateTime.fromSeconds(startDate - 86400).toJSDate()
    let retries = 0
    while (true) {
      try {
        const info = await blockDater.getDate(date)
        if (!info) {
          throw new Error('no info')
        }
        const startBlock = info.block
        const endBlock = 99999999
        const url = this.getEtherscanUrl(chain, address, startBlock, endBlock)

        const res = await fetch(url)
        const json = await res.json()
        if (json.message === 'NOTOK') {
          throw new Error(json.result)
        }

        let totalGasCost = BigNumber.from(0)
        for (const key in json.result) {
          const tx = json.result[key]
          const timestamp = Number(tx.timeStamp)
          if (!(timestamp >= startDate && timestamp < endDate)) {
            continue
          }
          if (tx.from.toLowerCase() !== address.toLowerCase()) {
            continue
          }
          const gasCost = BigNumber.from(tx.gasUsed).mul(tx.gasPrice)
          totalGasCost = totalGasCost.add(gasCost)
        }
        return totalGasCost
      } catch (err) {
        console.error('fetch error', err.message)
        const shouldRetry = this.shouldRetry(err.message)
        if (!shouldRetry) {
          throw err
        }
        if (retries > 10) {
          throw new Error('max retries reached')
        }
        console.log('retrying')
        await wait(2 * 1000)
      }
      retries++
    }
  }

  shouldRetry (errMsg: string) {
    const rateLimitErrorRegex = /(rate limit|too many concurrent requests|exceeded|socket hang up)/i
    const timeoutErrorRegex = /(timeout|time-out|time out|timedout|timed out)/i
    const connectionErrorRegex = /(ETIMEDOUT|ENETUNREACH|ECONNRESET|ECONNREFUSED|SERVER_ERROR)/i
    const badResponseErrorRegex = /(bad response|response error|missing response|processing response error|invalid json response body)/i
    const revertErrorRegex = /revert/i

    const isRateLimitError = rateLimitErrorRegex.test(errMsg)
    const isTimeoutError = timeoutErrorRegex.test(errMsg)
    const isConnectionError = connectionErrorRegex.test(errMsg)
    const isBadResponseError = badResponseErrorRegex.test(errMsg)

    // a connection error, such as 'ECONNREFUSED', will cause ethers to return a "missing revert data in call exception" error,
    // so we want to exclude server connection errors from actual contract call revert errors.
    const isRevertError =
      revertErrorRegex.test(errMsg) && !isConnectionError && !isTimeoutError

    const shouldRetry =
      (isRateLimitError ||
        isTimeoutError ||
        isConnectionError ||
        isBadResponseError) &&
      !isRevertError

    return shouldRetry
  }

  getEtherscanUrl (
    chain: string,
    address: string,
    startBlock: number,
    endBlock: number
  ) {
    const baseUrl = etherscanUrls[chain]
    const url = `${baseUrl}/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlock}&sort=asc&apikey=${etherscanApiKeys[
      chain
    ] || ''}`
    return url
  }
}

export default BonderStats
