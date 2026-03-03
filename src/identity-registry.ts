import { BigDecimal, BigInt, Bytes, crypto, ByteArray } from "@graphprotocol/graph-ts"
import {
  Registered,
  URIUpdated,
  Transfer,
  MetadataSet,
} from "../../generated/IdentityRegistry/IdentityRegistry"
import { Agent } from "../../generated/schema"

const ZERO_BD = BigDecimal.zero()
const ZERO_ADDRESS = Bytes.fromHexString("0x0000000000000000000000000000000000000000")

// keccak256("agentWallet")
const AGENT_WALLET_KEY_HASH = crypto.keccak256(
  ByteArray.fromUTF8("agentWallet"),
)

// ---------------------------------------------------------------------------
// URI type classification
// ---------------------------------------------------------------------------

function classifyURIType(uri: string): string {
  if (uri.startsWith("ipfs://") || uri.startsWith("/ipfs/")) return "ipfs"
  if (uri.startsWith("https://")) return "https"
  if (uri.startsWith("http://")) return "http"
  if (uri.startsWith("data:")) return "data"
  if (uri.startsWith("ar://")) return "arweave"
  if (uri.length == 0) return "none"
  return "unknown"
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

function getOrCreateAgent(agentId: BigInt, block: BigInt, timestamp: BigInt): Agent {
  let id = agentId.toString()
  let agent = Agent.load(id)
  if (agent == null) {
    agent = new Agent(id)
    agent.agentId = agentId
    agent.owner = ZERO_ADDRESS
    agent.agentURI = ""
    agent.agentURIType = "none"
    agent.agentWallet = null
    agent.registeredAt = timestamp
    agent.registeredBlock = block
    agent.updatedAt = timestamp
    agent.totalFeedbackCount = 0
    agent.activeFeedbackCount = 0
    agent.feedbackValueSum = ZERO_BD
    agent.averageRating = ZERO_BD
  }
  return agent
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

export function handleRegistered(event: Registered): void {
  let agent = getOrCreateAgent(
    event.params.agentId,
    event.block.number,
    event.block.timestamp,
  )
  agent.owner = event.params.owner
  agent.agentURI = event.params.agentURI
  agent.agentURIType = classifyURIType(event.params.agentURI)
  agent.registeredAt = event.block.timestamp
  agent.registeredBlock = event.block.number
  agent.updatedAt = event.block.timestamp
  agent.save()
}

export function handleURIUpdated(event: URIUpdated): void {
  let agent = Agent.load(event.params.agentId.toString())
  if (agent == null) return
  agent.agentURI = event.params.newURI
  agent.agentURIType = classifyURIType(event.params.newURI)
  agent.updatedAt = event.block.timestamp
  agent.save()
}

export function handleTransfer(event: Transfer): void {
  let agent = Agent.load(event.params.tokenId.toString())
  if (agent == null) return
  agent.owner = event.params.to
  // ERC-8004 clears agentWallet on transfer
  agent.agentWallet = null
  agent.updatedAt = event.block.timestamp
  agent.save()
}

export function handleMetadataSet(event: MetadataSet): void {
  // We only care about the "agentWallet" key
  let keyHash = crypto.keccak256(ByteArray.fromUTF8(event.params.metadataKey))
  if (keyHash != AGENT_WALLET_KEY_HASH) return

  let agent = Agent.load(event.params.agentId.toString())
  if (agent == null) return

  let raw = event.params.metadataValue
  if (raw.length == 0) {
    agent.agentWallet = null
  } else if (raw.length == 20) {
    // Raw 20-byte address
    agent.agentWallet = Bytes.fromUint8Array(raw)
  } else if (raw.length >= 32) {
    // ABI-encoded address (32 bytes, left-padded with zeroes).
    // Take the last 20 bytes.
    let addrBytes = new Bytes(20)
    let offset = raw.length - 20
    for (let i = 0; i < 20; i++) {
      addrBytes[i] = raw[offset + i]
    }
    agent.agentWallet = addrBytes
  } else {
    // Unexpected length — store raw bytes as-is
    agent.agentWallet = Bytes.fromUint8Array(raw)
  }
  agent.updatedAt = event.block.timestamp
  agent.save()
}
