# ERC-8004 Subgraph

Subgraph for indexing [ERC-8004 (Trustless Agents)](https://eips.ethereum.org/EIPS/eip-8004) on-chain data — agent identities from the **IdentityRegistry** and reputation from the **ReputationRegistry**. Feeds the "Agents" category on [Chain.Love](https://chain.love).

## Contracts indexed

Both contracts use deterministic CREATE2 addresses, identical across all EVM chains:

| Contract | Address |
|---|---|
| IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

## Networks

| Network | Graph network name | Start block |
|---|---|---|
| Arbitrum One | `arbitrum-one` | 428 895 000 |
| Ethereum | `mainnet` | 24 339 924 |
| Base | `base` | 41 663 799 |
| Polygon | `matic` | 82 458 528 |

Start blocks and per-network overrides live in `networks.json`.

## Entities

### Agent

One entity per registered ERC-8004 token. Stores owner, URI, wallet, and aggregated reputation stats (`averageRating`, `activeFeedbackCount`, `feedbackValueSum`).

### Feedback

Individual feedback entry. Linked to an Agent. Stores the normalised value, tags, endpoint, URI, hash, and revocation status. Running aggregates on the parent Agent are recomputed on every create/revoke.

### FeedbackResponse

Immutable record of an agent's response to a piece of feedback (`ResponseAppended` event).

## Events handled

| Source | Event | Handler |
|---|---|---|
| IdentityRegistry | `Registered` | Creates Agent, sets URI + owner |
| IdentityRegistry | `URIUpdated` | Updates URI + classifies type |
| IdentityRegistry | `Transfer` | Updates owner, clears wallet |
| IdentityRegistry | `MetadataSet` | Parses `agentWallet` from ABI-encoded or raw bytes |
| ReputationRegistry | `NewFeedback` | Creates Feedback, updates Agent aggregates |
| ReputationRegistry | `FeedbackRevoked` | Marks Feedback revoked, subtracts from aggregates |
| ReputationRegistry | `ResponseAppended` | Creates FeedbackResponse |

## Local development

Prerequisites: Node.js ≥ 20, a running Graph Node (Docker or hosted).

```bash
# Install dependencies
npm install

# Generate AssemblyScript types from schema + ABIs
npm run codegen

# Compile the subgraph
npm run build

# Deploy to a local Graph Node
npm run create:local
npm run deploy:local
```

## Deploying to The Graph Studio

Authenticate once, then deploy per network:

```bash
npx graph auth --studio <DEPLOY_KEY>

# Arbitrum (MVP)
npm run deploy:arbitrum

# Other networks — swap the network in subgraph.yaml
# and update startBlock from networks.json, then:
npm run deploy:ethereum
npm run deploy:base
npm run deploy:polygon
```

After deployment, grab the Subgraph ID from Studio and paste it into `tools/fetch_agents.py` → `SUBGRAPH_IDS` dict so the refresh workflow can query it.

## How it fits into Chain.Love

```
  ┌──────────────┐         ┌──────────────────┐        ┌──────────────┐
  │  On-chain     │  index  │  This subgraph   │ query  │ fetch_agents │
  │  ERC-8004     │ ──────► │  (The Graph)     │ ◄───── │  .py (cron)  │
  │  contracts    │         │                  │        │              │
  └──────────────┘         └──────────────────┘        └──────┬───────┘
                                                              │ write
                                                              ▼
                                                     json/<chain>/agents.json
                                                              │
                                                              ▼
                                                        chain.love UI
```

The GitHub Actions workflow `agents-refresh.yaml` runs `fetch_agents.py` every 30 minutes, queries the subgraph, and commits updated JSON to the `json` branch — same pattern as the existing `verified-refresh` workflow.

## Further reading

- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [The Graph documentation](https://thegraph.com/docs)
- [agent0lab/subgraph](https://github.com/agent0lab/subgraph) — community reference implementation
