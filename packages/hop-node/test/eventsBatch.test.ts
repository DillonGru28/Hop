import { config } from 'src/config'
import { wait } from 'src/utils'
import Bridge from 'src/watchers/classes/Bridge'
import { Chain, Token } from 'src/constants'
import contracts from 'src/contracts'

describe('eventsBatch', () => {
  it(
    'eventsBatch',
    async () => {
      const { l2Bridge } = contracts.get(Token.USDC, Chain.xDai)
      const bridge = new Bridge(l2Bridge)
      const { totalBlocks, batchBlocks } = config.sync[Chain.xDai]
      const maxIterations = Math.ceil(totalBlocks / batchBlocks)
      const remainder = totalBlocks % batchBlocks
      let iterations = 0

      expect(totalBlocks).toBeGreaterThanOrEqual(100000)
      expect(totalBlocks).toBeLessThan(500000)
      expect(batchBlocks).toBe(1000)

      await bridge.eventsBatch(
        async (start: number, end: number, i: number) => {
          iterations++
          if (iterations < maxIterations) {
            expect(end - start).toBe(batchBlocks)
          } else {
            expect(end - start).toBe(remainder - i)
          }
        }
      )

      expect(iterations).toBe(maxIterations)
    },
    60 * 1000
  )

  it(
    'eventsBatch with defined start and end block numbers',
    async () => {
      const { l2Bridge } = contracts.get(Token.USDC, Chain.xDai)
      const bridge = new Bridge(l2Bridge)
      const { batchBlocks } = config.sync[Chain.xDai]
      const endBlockNumber = 21519734
      const startBlockNumber = endBlockNumber - 123456
      const totalBlocks = endBlockNumber - startBlockNumber
      const maxIterations = Math.ceil(totalBlocks / batchBlocks)
      const remainder = totalBlocks % batchBlocks
      let iterations = 0

      expect(batchBlocks).toBe(1000)

      await bridge.eventsBatch(
        async (start: number, end: number, i: number) => {
          iterations++
          if (iterations === 1) {
            expect(end).toBe(endBlockNumber)
          }
          if (iterations < maxIterations) {
            expect(end - start).toBe(batchBlocks)
          } else {
            expect(end - start).toBe(remainder - i)
            expect(start).toBe(startBlockNumber)
          }
        },
        { startBlockNumber, endBlockNumber }
      )

      expect(iterations).toBe(maxIterations)
    },
    60 * 1000
  )

  it(
    'eventsBatch with cacheKey',
    async () => {
      const { l2Bridge } = contracts.get(Token.USDC, Chain.xDai)
      const bridge = new Bridge(l2Bridge)
      const { totalBlocks, batchBlocks } = config.sync[Chain.xDai]
      const maxIterations = Math.floor(totalBlocks / batchBlocks)
      const remainder = totalBlocks % batchBlocks
      const halfway = Math.floor(maxIterations / 2)
      const cacheKey = `${Date.now()}`
      let iterations = 0

      expect(batchBlocks).toBe(1000)

      let firstStart = 0
      let firstEnd = 0

      let lastStart = 0
      let lastEnd = 0

      await bridge.eventsBatch(
        async (start: number, end: number, i: number) => {
          iterations++
          if (iterations === 1) {
            firstStart = start
            firstEnd = end
          }
          // exit halfway through
          if (iterations === halfway) {
            lastStart = start
            lastEnd = end
            return false
          }
          return true
        },
        { cacheKey }
      )

      expect(iterations).toBe(halfway)

      await bridge.eventsBatch(
        async (start: number, end: number, i: number) => {
          // eventsBatch resets when it enounters an error in process
          if (iterations === halfway) {
            expect(start).toBeGreaterThanOrEqual(firstStart)
            expect(end).toBeGreaterThanOrEqual(firstEnd)
          }
          iterations++
        },
        { cacheKey }
      )

      expect(iterations).toBeGreaterThanOrEqual(halfway + maxIterations)
      expect(iterations).toBeLessThanOrEqual(halfway + maxIterations + 1)
    },
    60 * 1000
  )
})
