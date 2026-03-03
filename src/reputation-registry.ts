import { BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  NewFeedback,
  FeedbackRevoked,
  ResponseAppended,
} from "../../generated/ReputationRegistry/ReputationRegistry"
import { Agent, Feedback, FeedbackResponse } from "../../generated/schema"

const ZERO_BD = BigDecimal.zero()

/**
 * Convert a signed int128 value with given decimals into a BigDecimal.
 * Example: value = 9977, valueDecimals = 2  →  99.77
 */
function normalizeValue(value: BigInt, valueDecimals: i32): BigDecimal {
  if (valueDecimals == 0) {
    return value.toBigDecimal()
  }
  let divisor = BigInt.fromI32(10).pow(valueDecimals as u8).toBigDecimal()
  return value.toBigDecimal().div(divisor)
}

function recomputeAverage(agent: Agent): void {
  if (agent.activeFeedbackCount == 0) {
    agent.averageRating = ZERO_BD
  } else {
    agent.averageRating = agent.feedbackValueSum.div(
      BigDecimal.fromString(agent.activeFeedbackCount.toString()),
    )
  }
}

function feedbackId(
  agentId: BigInt,
  clientAddress: Bytes,
  feedbackIndex: BigInt,
): string {
  return agentId.toString()
    .concat("-")
    .concat(clientAddress.toHexString())
    .concat("-")
    .concat(feedbackIndex.toString())
}

export function handleNewFeedback(event: NewFeedback): void {
  let agentIdStr = event.params.agentId.toString()
  let agent = Agent.load(agentIdStr)
  // Agent must already exist (registered in IdentityRegistry).
  // If not yet indexed (race between data sources), skip.
  if (agent == null) return

  let id = feedbackId(
    event.params.agentId,
    event.params.clientAddress,
    BigInt.fromI64(event.params.feedbackIndex),
  )

  let fb = new Feedback(id)
  fb.agent = agentIdStr
  fb.clientAddress = event.params.clientAddress
  fb.feedbackIndex = BigInt.fromI64(event.params.feedbackIndex)
  fb.value = BigInt.fromI64(event.params.value as i64)
  fb.valueDecimals = event.params.valueDecimals
  fb.normalizedValue = normalizeValue(fb.value, fb.valueDecimals)
  fb.tag1 = event.params.tag1
  fb.tag2 = event.params.tag2
  fb.endpoint = event.params.endpoint
  fb.feedbackURI = event.params.feedbackURI
  fb.feedbackHash = event.params.feedbackHash
  fb.isRevoked = false
  fb.createdAt = event.block.timestamp
  fb.createdBlock = event.block.number
  fb.save()

  // Update agent aggregates
  agent.totalFeedbackCount += 1
  agent.activeFeedbackCount += 1
  agent.feedbackValueSum = agent.feedbackValueSum.plus(fb.normalizedValue)
  recomputeAverage(agent)
  agent.updatedAt = event.block.timestamp
  agent.save()
}

export function handleFeedbackRevoked(event: FeedbackRevoked): void {
  let id = feedbackId(
    event.params.agentId,
    event.params.clientAddress,
    BigInt.fromI64(event.params.feedbackIndex),
  )

  let fb = Feedback.load(id)
  if (fb == null) return
  if (fb.isRevoked) return // already revoked

  fb.isRevoked = true
  fb.save()

  let agent = Agent.load(event.params.agentId.toString())
  if (agent == null) return

  agent.activeFeedbackCount -= 1
  agent.feedbackValueSum = agent.feedbackValueSum.minus(fb.normalizedValue)
  recomputeAverage(agent)
  agent.updatedAt = event.block.timestamp
  agent.save()
}

export function handleResponseAppended(event: ResponseAppended): void {
  let agentIdStr = event.params.agentId.toString()
  let agent = Agent.load(agentIdStr)
  if (agent == null) return

  let fbId = feedbackId(
    event.params.agentId,
    event.params.clientAddress,
    BigInt.fromI64(event.params.feedbackIndex),
  )

  let fb = Feedback.load(fbId)
  if (fb == null) return

  // Count existing responses to build a unique ID
  // Use a deterministic index: hash of (fbId + responseURI + responseHash)
  let responseId = fbId
    .concat("-resp-")
    .concat(event.transaction.hash.toHexString())
    .concat("-")
    .concat(event.logIndex.toString())

  let response = new FeedbackResponse(responseId)
  response.feedback = fbId
  response.responseURI = event.params.responseURI
  response.responseHash = event.params.responseHash
  response.createdAt = event.block.timestamp
  response.createdBlock = event.block.number
  response.save()

  // Touch the agent's updatedAt
  agent.updatedAt = event.block.timestamp
  agent.save()
}
