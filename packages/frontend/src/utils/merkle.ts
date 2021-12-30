import { utils, BigNumber } from 'ethers'
import { MerkleTree } from 'merkletreejs'
import keccak256 from 'keccak256'
import rootFile from 'src/assets/airdrops/localhost/root.json'
const { root, shardNybbles, total } = rootFile

function hashLeaf([address, entry]) {
  return utils.solidityKeccak256(['address', 'uint256'], [address, entry.balance])
}

export function getEntryProofIndex(address, entry, proof) {
  let index = 0
  let computedHash = hashLeaf([address, entry])

  for (let i = 0; i < proof.length; i++) {
    index *= 2
    const proofElement = proof[i]

    if (computedHash <= proofElement) {
      // Hash(current computed hash + current element of the proof)
      computedHash = utils.solidityKeccak256(['bytes32', 'bytes32'], [computedHash, proofElement])
    } else {
      // Hash(current element of the proof + current computed hash)
      computedHash = utils.solidityKeccak256(['bytes32', 'bytes32'], [proofElement, computedHash])
      index += 1
    }
  }
  return index
}

class ShardedMerkleTree {
  fetcher: any
  shardNybbles: any
  root: any
  total: any
  shards: any
  trees: any

  constructor(fetcher, shardNybbles, root, total) {
    this.fetcher = fetcher
    this.shardNybbles = shardNybbles
    this.root = root
    this.total = total
    this.shards = {}
    this.trees = {}
  }

  async getProof(address) {
    console.log(`address:`, address)
    const shardid = address.slice(2, 2 + this.shardNybbles).toLowerCase()
    console.log(`shardid:`, shardid)

    let shard = this.shards[shardid]

    if (shard === undefined) {
      shard = this.shards[shardid] = await this.fetcher(shardid)
      this.trees[shardid] = new MerkleTree(Object.entries(shard.entries).map(hashLeaf), keccak256, {
        sort: true,
      })
      console.log(`this.trees[${shardid} (shardid)]:`, this.trees[shardid])
    }
    console.log(`shard:`, shard)

    const entry = shard.entries[address]
    console.log(`entry:`, entry)
    if (!entry) {
      throw new Error('Invalid Entry')
    }

    const leaf = hashLeaf([address, entry])
    console.log(`leaf:`, leaf)

    const proof = this.trees[shardid].getProof(leaf).map(entry => '0x' + entry.data.toString('hex'))
    console.log(`proof:`, proof)

    return [entry, proof.concat(shard.proof)]
  }

  async fetchProof(address) {
    console.log(`address:`, address)
    const shardid = address.slice(2, 2 + this.shardNybbles).toLowerCase()
    console.log(`shardid:`, shardid)
    let shard = this.shards[shardid]

    if (shard === undefined) {
      shard = this.shards[shardid] = await this.fetcher(shardid)
      this.trees[shardid] = new MerkleTree(Object.entries(shard.entries).map(hashLeaf), keccak256, {
        sort: true,
      })
      console.log(`this.trees[${shardid} (shardid)]:`, this.trees[shardid])
    }
    console.log(`shard:`, shard)

    const entry = shard.entries[address]
    console.log(`entry:`, entry)

    if (!entry) {
      throw new Error('Invalid Entry')
    }
    const leaf = hashLeaf([address, entry])
    console.log(`leaf:`, leaf)

    const proof = this.trees[shardid].getProof(leaf).map(entry => '0x' + entry.data.toString('hex'))
    console.log(`proof:`, proof)

    return [entry, proof.concat(shard.proof)]
  }

  static build(entries, shardNybbles, directory) {
    const shards = {}
    let total = BigNumber.from(0)
    for (const [address, entry] of entries) {
      const shard = address.slice(2, 2 + shardNybbles).toLowerCase()
      if (shards[shard] === undefined) {
        shards[shard] = []
      }
      shards[shard].push([address, entry])
      total = total.add(entry.balance)
    }
    const roots = Object.fromEntries(
      Object.entries(shards).map(([shard, entries]: any) => [
        shard,
        new MerkleTree(entries.map(hashLeaf), keccak256, { sort: true }).getRoot(),
      ])
    )
    const tree = new MerkleTree(Object.values(roots), keccak256, { sort: true })
    console.log(`tree:`, tree)
  }

  // Production
  static fetchTree() {
    return new ShardedMerkleTree(
      async shard => {
        const res = await fetch(
          `https://raw.githubusercontent.com/hop-protocol/merkle-drop-data-chunks/main/chunks/${shard}.json`,
          {
            headers: {
              'Content-Type': `application/json`,
            },
          }
        )
        return res.json()
      },
      shardNybbles,
      root,
      BigNumber.from(total)
    )
  }

  // Localhost / testnet
  static fromFiles() {
    const { root, shardNybbles, total } = rootFile
    return new ShardedMerkleTree(
      shard => require(`src/assets/airdrops/localhost/${shard}.json`),
      shardNybbles,
      root,
      BigNumber.from(total)
    )
  }
}

export { ShardedMerkleTree }
