# Multi-Agent Incident Decision Assistant

An AI-powered application that uses multiple specialized agents to make informed deployment and reliability decisions. The system orchestrates a debate between Reliability, Cost, and UX agents to provide comprehensive recommendations with full decision history tracking.

## Project Overview

This application demonstrates a multi-agent AI system built on Cloudflare's platform that helps engineering teams make better decisions about deployments, rollbacks, and infrastructure changes. When a user asks a decision question (e.g., "Should I roll back the latest deploy?"), the system:

1. **Coordinates** multiple specialized agents to gather different perspectives
2. **Debates** tradeoffs between reliability, cost, and user experience
3. **Synthesizes** a final recommendation based on all perspectives
4. **Tracks** all decisions in a searchable incident history

## Assignment Requirements

This project fulfills all required components:

### 1. **LLM** 
- Uses **Llama 3.1-8b-instruct** via Cloudflare Workers AI
- All agents (Reliability, Cost, UX, and Coordinator) use Workers AI for inference
- Configured in `wrangler.jsonc` with `ai` binding

### 2. **Workflow / Coordination** 
- Uses **Durable Objects** (Cloudflare Agents) for coordination
- `DebateCoordinator` orchestrates multi-agent workflows
- Each specialized agent (`ReliabilityAgent`, `CostAgent`, `UXAgent`) runs as a separate Durable Object
- Agents communicate via `getAgentByName()` RPC calls

### 3. **User Input via Chat** 
- Interactive **chat interface** built with React
- Real-time streaming responses using Server-Sent Events (SSE)
- Deployed via Cloudflare Pages
- Users can ask decision questions and view incident history

### 4. **Memory or State** 
- Persistent **incident tracking** stored in Durable Object state
- Each incident includes:
  - Question/context
  - Agent perspectives (Reliability, Cost, UX)
  - Final decision and reasoning
  - Metrics snapshots (error rates, latency, etc.)
  - Timestamps and status (open/resolved/monitoring)
- State automatically syncs across all connected clients
- Searchable incident history with filtering

## Architecture


## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Cloudflare account (free tier works)
- Git

### Local Development

1. **Clone the repository** (ensure it's prefixed with `cf_ai_`):
   ```bash
   git clone <your-repo-url>
   cd cf_ai_<your-project-name>
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run locally**:
   ```bash
   npm start
   ```

   This starts the Vite dev server with Cloudflare Workers AI support. The application will be available at `http://localhost:5173`.

4. **Try it out**:
   - Open `http://localhost:5173` in your browser
   - Ask a decision question like: *"Should I roll back the latest deploy? Error rate is 6% (SLO 0.5%) starting 15 minutes after release, mostly on checkout."*
   - View the incident history by clicking the clock icon in the header
   - Search and delete incidents from the history

### Deploy to Cloudflare

1. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Deploy**:
   ```bash
   npm run deploy
   ```

   This builds the application and deploys both the Worker and Pages assets.

3. **Access your deployed app**:
   - The deployment URL will be shown in the terminal
   - Or find it in the Cloudflare dashboard under Pages

## Usage Examples

### Example 1: Rollback Decision

**User asks:**
> "Should I roll back the latest deploy? Error rate is 6% (SLO 0.5%) starting 15 minutes after release, mostly on checkout."

**System response:**
- **Reliability Agent**: "Roll back immediately. Exceeding SLO by 12x indicates critical failure."
- **Cost Agent**: "Rollback is low-cost compared to extended downtime and customer churn."
- **UX Agent**: "User trust erodes with each failed checkout. Rollback protects brand."

**Final Recommendation**: Roll back the deploy to minimize user impact and prevent potential data loss.

### Example 2: Feature Launch Decision

**User asks:**
> "Should we launch the new payment feature? It's been tested in staging but adds 200ms latency."

**System response:**
- Each agent provides their perspective
- Coordinator synthesizes a recommendation
- Decision is stored in incident history for future reference

## Project Structure

```
├── src/
│   ├── app.tsx              # React UI with chat interface and incident history
│   ├── server.ts             # Agent implementations (Coordinator + specialized agents)
│   ├── tools.ts              # Tool definitions for agents
│   ├── utils.ts              # Helper functions for message processing
│   ├── client.tsx            # React app entry point
│   └── components/           # Reusable UI components
├── public/                   # Static assets
├── tests/                    # Test files
├── wrangler.jsonc            # Cloudflare Workers configuration
├── package.json              # Dependencies and scripts
├── README.md                 # This file
└── PROMPTS.md                # AI prompts used in development
```

## 🔧 Key Components Explained

### DebateCoordinator (`src/server.ts`)

The main orchestrator agent that:
- Detects decision questions using keyword matching
- Calls specialized agents to gather perspectives
- Synthesizes final recommendations
- Manages incident state and history
- Provides HTTP endpoints for UI actions (delete incidents)

### Specialized Agents

Each agent has a specific bias and expertise:

- **ReliabilityAgent**: Prioritizes uptime, SLO compliance, and stability
- **CostAgent**: Focuses on infrastructure costs and engineering effort
- **UXAgent**: Advocates for user experience and customer trust

### State Management

Incidents are stored in Durable Object state with the following structure:

```typescript
interface IncidentMemory {
  id: string;
  question: string;
  timestamp: string;
  status: "open" | "resolved" | "monitoring";
  metricsSnapshot?: {
    errorRate?: number;
    latency?: number;
    throughput?: number;
  };
  hypotheses: {
    reliability: string;
    cost: string;
    ux: string;
  };
  decision: string;
  reasoning: string[];
  summary?: string;
}
```

## Testing

Run tests with:
```bash
npm test
```

## AI-Assisted Development

This project was developed with AI assistance. All prompts used during development are documented in [`PROMPTS.md`](./PROMPTS.md).

## Features

- Multi-agent coordination via Durable Objects
- Real-time chat interface with streaming responses
- Searchable incident history
- Delete incidents functionality
- Dark/light theme support
- Persistent state across sessions
- Error handling and validation
- Responsive UI design

## Documentation

- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Workers AI Documentation](https://developers.cloudflare.com/workers-ai/)
- [Durable Objects Documentation](https://developers.cloudflare.com/durable-objects/)
- [Cloudflare Pages Documentation](https://developers.cloudflare.com/pages/)

