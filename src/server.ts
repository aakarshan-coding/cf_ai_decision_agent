import { routeAgentRequest, type Schedule, getAgentByName } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import {createWorkersAI} from "workers-ai-provider";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

/**
 * Structured memory for incident tracking and decision history
 */
interface IncidentMemory {
  id: string;
  question: string;
  timestamp: string;
  status: "open" | "resolved" | "monitoring";
  metricsSnapshot?: {
    errorRate?: number;
    latency?: number;
    throughput?: number;
    [key: string]: unknown;
  };
  hypotheses: {
    reliability: string;
    cost: string;
    ux: string;
  };
  decision: string;
  reasoning: string[];
  outcome?: {
    result: string;
    resolvedAt?: string;
    notes?: string;
  };
  summary?: string;
}

interface DebateCoordinatorState {
  incidents: IncidentMemory[];
  lastUpdated: string;
}

// Cloudflare AI Gateway
// const openai = createOpenAI({
//   apiKey: env.OPENAI_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {


  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    const workersai = createWorkersAI({binding: this.env.AI});

    const model = workersai('@cf/meta/llama-3.1-8b-instruct' as any, {
      // additional settings
      safePrompt: true,
    });
    // Collect all tools, including MCP tools
    const allTools = {
      ...tools
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful assistant that can do various tasks... 

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Reliability Agent - Optimizes for uptime, safety, SLO compliance
 * Bias: Conservative, prefers rollback over risky fixes
 */
export class ReliabilityAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({binding: this.env.AI});
    const model = workersai('@cf/meta/llama-3.1-8b-instruct' as any, {
      safePrompt: true,
    });

    const allTools = {
      ...tools
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a Reliability Agent focused on system stability, uptime, and safety.

Your priorities (in order):
1. **Uptime & Availability**: Minimize downtime and service interruptions
2. **SLO Compliance**: Ensure service level objectives are met
3. **Risk Mitigation**: Prefer conservative, proven solutions over experimental approaches
4. **Rollback Readiness**: When incidents occur, prioritize quick rollback over complex hotfixes

Your decision-making approach:
- **Bias toward rollback** when error rates exceed SLO thresholds
- **Prefer stability** over feature velocity when risks are unclear
- **Advocate for conservative choices** that protect user experience
- **Flag risks** even if they seem minor - prevention is better than cure

When evaluating decisions (rollback vs hotfix, feature launch, infrastructure changes):
- Assess impact on current error rates and SLO metrics
- Consider historical patterns and similar incidents
- Prioritize user-visible stability over internal optimizations
- Recommend rollback if symptoms match previous regressions

Be direct, data-driven, and prioritize system reliability above all else.`,
          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Get agent's perspective on a decision question
   * Called by DebateCoordinator to collect opinions
   */
  async getPerspective(question: string): Promise<string> {
    const workersai = createWorkersAI({binding: this.env.AI});
    const model = workersai('@cf/meta/llama-3.1-8b-instruct' as any, {
      safePrompt: true,
    });

    const result = await streamText({
      model,
      system: `You are a Reliability Agent focused on stability, uptime, and safety.

Hard rules:
- Reply in <= 40 words.
- One paragraph, no headings, no lists.
- State a clear stance (e.g. rollback/hotfix/hold) and the single biggest reliability reason.`,
      messages: [
        {
          role: "user",
          content: question
        }
      ]
    });

    return result.text;
  }
}

/**
 * Cost Agent - Optimizes for infra cost and engineering effort
 * Bias: Avoid overreaction and unnecessary expensive changes
 */
export class CostAgent extends AIChatAgent<Env> {
  async getPerspective(question: string): Promise<string> {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai("@cf/meta/llama-3.1-8b-instruct" as any, {
      safePrompt: true
    });

    const result = await streamText({
      model,
      system: `You are a Cost/Effort Agent optimizing infra spend and engineering effort.

Hard rules:
- Reply in <= 40 words.
- One paragraph, no headings, no lists.
- Give a clear stance and the single biggest cost/effort consideration (including hidden costs).`,
      messages: [
        {
          role: "user",
          content: question
        }
      ]
    });

    return result.text;
  }
}

/**
 * UX / User Impact Agent - Focuses on customer pain, trust, and perception
 * Bias: Protect user experience and long-term trust
 */
export class UXAgent extends AIChatAgent<Env> {
  async getPerspective(question: string): Promise<string> {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai("@cf/meta/llama-3.1-8b-instruct" as any, {
      safePrompt: true
    });

    const result = await streamText({
      model,
      system: `You are a UX/User Impact Agent focused on customer pain, trust, and perception.

Hard rules:
- Reply in <= 40 words.
- One paragraph, no headings, no lists.
- Give a clear stance and the single biggest user impact/trust consideration.`,
      messages: [
        {
          role: "user",
          content: question
        }
      ]
    });

    return result.text;
  }
}

/**
 * Debate Coordinator - Orchestrates multi-agent debates and synthesizes recommendations
 */
export class DebateCoordinator extends AIChatAgent<Env, DebateCoordinatorState> {
  initialState: DebateCoordinatorState = {
    incidents: [],
    lastUpdated: new Date().toISOString()
  };

  /**
   * Durable Object fetch entrypoint.
   * Some runtimes route HTTP requests here; keep this to ensure UI actions work reliably.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.searchParams.get("action") === "delete-incident") {
      try {
        const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
        const id = typeof body?.id === "string" ? body.id : null;
        if (!id) return Response.json({ success: false, error: "Missing incident id" }, { status: 400 });
        const result = await this.deleteIncident(id);
        return Response.json(result);
      } catch (err) {
        console.error("delete-incident request failed:", err);
        return Response.json({ success: false, error: "Internal error" }, { status: 500 });
      }
    }

    return super.fetch(request);
  }

  /**
   * Handle HTTP requests sent directly to this Agent (via agentFetch).
   * This is separate from chat streaming, and is useful for UI actions like deletes.
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /agents/debate-coordinator/:name?action=delete-incident
    // Body: { "id": "<incidentId>" }
    if (request.method === "POST" && url.searchParams.get("action") === "delete-incident") {
      try {
        const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
        const id = typeof body?.id === "string" ? body.id : null;
        if (!id) return Response.json({ success: false, error: "Missing incident id" }, { status: 400 });

        const result = await this.deleteIncident(id);
        return Response.json(result);
      } catch (err) {
        console.error("delete-incident request failed:", err);
        return Response.json({ success: false, error: "Internal error" }, { status: 500 });
      }
    }

    // Delegate all other HTTP routes back to AIChatAgent (e.g. /chat, /get-messages, etc.)
    return (await super.onRequest(request)) || new Response("Not found", { status: 404 });
  }

  /**
   * Get incident history with optional search
   */
  async getIncidents(searchQuery?: string): Promise<IncidentMemory[]> {
    const currentState = (this.state || this.initialState) as DebateCoordinatorState;
    let incidents = currentState.incidents;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      incidents = incidents.filter((incident) =>
        incident.question.toLowerCase().includes(query) ||
        incident.decision.toLowerCase().includes(query) ||
        incident.hypotheses.reliability.toLowerCase().includes(query) ||
        incident.hypotheses.cost.toLowerCase().includes(query) ||
        incident.hypotheses.ux.toLowerCase().includes(query) ||
        incident.reasoning.some((r) => r.toLowerCase().includes(query)) ||
        (incident.summary && incident.summary.toLowerCase().includes(query))
      );
    }

    return incidents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Delete a single incident by id
   */
  async deleteIncident(id: string): Promise<{ success: boolean; deletedId: string }> {
    const currentState = (this.state || this.initialState) as DebateCoordinatorState;
    const nextIncidents = currentState.incidents.filter((i) => i.id !== id);

    this.setState({
      ...currentState,
      incidents: nextIncidents,
      lastUpdated: new Date().toISOString()
    });

    return { success: true, deletedId: id };
  }

  /**
   * Generate a concise summary of an incident decision
   */
  private async generateSummary(incident: IncidentMemory): Promise<string> {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const summaryModel = workersai("@cf/meta/llama-3.1-8b-instruct" as any, {
      safePrompt: true
    });

    const result = await streamText({
      model: summaryModel,
      system: `You are a summarization agent. Create a concise 2-3 sentence summary of this incident decision.

Focus on:
- What was decided
- Key factors that influenced the decision
- Expected outcome

Keep it under 50 words.`,
      messages: [
        {
          role: "user",
          content: `Question: ${incident.question}

Perspectives:
- Reliability: ${incident.hypotheses.reliability}
- Cost/Effort: ${incident.hypotheses.cost}
- UX/User Impact: ${incident.hypotheses.ux}

Decision: ${incident.decision}
Reasoning: ${incident.reasoning.join("; ")}`
        }
      ]
    });

    return result.text;
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    const workersai = createWorkersAI({binding: this.env.AI});
    const model = workersai('@cf/meta/llama-3.1-8b-instruct' as any, {
      safePrompt: true,
    });

    const allTools = {
      ...tools
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        // Last user message
        const lastMessage = processedMessages[processedMessages.length - 1];
        const userQuestion =
          lastMessage?.parts?.find((p) => p.type === "text")?.text || "";

        // Detect decision questions (rollback, deploy, feature launch, etc.)
        const decisionKeywords = [
          "rollback",
          "deploy",
          "hotfix",
          "launch",
          "release",
          "should we",
          "decision"
        ];
        const isDecisionQuestion = decisionKeywords.some((keyword) =>
          userQuestion.toLowerCase().includes(keyword)
        );

        if (isDecisionQuestion) {
          // Orchestrate debate - collect perspectives from specialized agents
          let reliabilityPerspective = "";
          let costPerspective = "";
          let uxPerspective = "";

          try {
            const reliabilityAgent = await getAgentByName<Env, ReliabilityAgent>(
              this.env.ReliabilityAgent,
              `reliability-${this.name}`
            );
            reliabilityPerspective = await reliabilityAgent.getPerspective(
              userQuestion
            );
          } catch (error) {
            console.error("Error getting reliability agent perspective:", error);
            reliabilityPerspective = "Reliability Agent unavailable.";
          }

          try {
            const costAgent = await getAgentByName<Env, CostAgent>(
              this.env.CostAgent,
              `cost-${this.name}`
            );
            costPerspective = await costAgent.getPerspective(userQuestion);
          } catch (error) {
            console.error("Error getting cost agent perspective:", error);
            costPerspective = "Cost Agent unavailable.";
          }

          try {
            const uxAgent = await getAgentByName<Env, UXAgent>(
              this.env.UXAgent,
              `ux-${this.name}`
            );
            uxPerspective = await uxAgent.getPerspective(userQuestion);
          } catch (error) {
            console.error("Error getting UX agent perspective:", error);
            uxPerspective = "UX / User Impact Agent unavailable.";
          }

          // Synthesize final recommendation with all perspectives
          const synthesis = streamText({
            model,
            system: `You are a Debate Coordinator that synthesizes perspectives from multiple specialized agents.

Be extremely concise. Hard limits:
- Total response <= 90 words.
- No section may exceed 3 bullet points.
- Always include **Final Recommendation** (even if uncertain).

Format exactly:
**Perspectives (1 bullet each):**
- Reliability: <one sentence>
- Cost/Effort: <one sentence>
- UX/User Impact: <one sentence>

**Final Recommendation:**
<one sentence decision>

**Why (max 3 bullets):**
- <bullet>
- <bullet>
- <bullet>`,
            messages: [
              {
                role: "user",
                content: `Question: ${userQuestion}

Reliability Agent Perspective:
${reliabilityPerspective}

Cost Agent Perspective:
${costPerspective}

UX / User Impact Agent Perspective:
${uxPerspective}

Synthesize a final recommendation that considers all perspectives.`
              }
            ]
          });

          // Stream to client
          writer.merge(synthesis.toUIMessageStream());

          // Store incident in memory after stream completes (non-blocking)
          (async () => {
            try {
              const text = await synthesis.text;
              // Extract decision and reasoning from the synthesis text
              const decisionMatch = text.match(
                /\*\*Final Recommendation:\*\*\s*(.+?)(?:\n|$)/i
              );
              const reasoningMatches = text.match(
                /\*\*Why.*?\*\*([\s\S]*?)(?:\*\*|$)/i
              );

              const decision = decisionMatch
                ? decisionMatch[1].trim()
                : "No clear decision reached";
              const reasoning = reasoningMatches
                ? reasoningMatches[1]
                    .split(/-/)
                    .filter((r) => r.trim())
                    .map((r) => r.trim())
                    .slice(0, 3)
                : ["Decision made based on agent perspectives"];

              // Extract metrics from question if present
              const metricsSnapshot: IncidentMemory["metricsSnapshot"] = {};
              const errorRateMatch = userQuestion.match(
                /error rate[:\s]+([\d.]+%?)/i
              );
              const latencyMatch = userQuestion.match(
                /(?:latency|p95)[:\s]+([\d.]+ms?)/i
              );

              if (errorRateMatch) {
                metricsSnapshot.errorRate = parseFloat(errorRateMatch[1]);
              }
              if (latencyMatch) {
                metricsSnapshot.latency = parseFloat(latencyMatch[1]);
              }

              const incident: IncidentMemory = {
                id: generateId(),
                question: userQuestion,
                timestamp: new Date().toISOString(),
                status: "open",
                metricsSnapshot:
                  Object.keys(metricsSnapshot).length > 0
                    ? metricsSnapshot
                    : undefined,
                hypotheses: {
                  reliability: reliabilityPerspective,
                  cost: costPerspective,
                  ux: uxPerspective
                },
                decision,
                reasoning
              };

              // Generate summary
              incident.summary = await this.generateSummary(incident);

              // Update state
              const currentState = (this.state ||
                this.initialState) as DebateCoordinatorState;
              this.setState({
                ...currentState,
                incidents: [...currentState.incidents, incident],
                lastUpdated: new Date().toISOString()
              });
            } catch (error) {
              console.error("Error storing incident memory:", error);
            }
          })();

          return;
        }

        // Regular chat flow
        const result = streamText({
          system: `You are a Debate Coordinator that orchestrates multi-agent decision-making.

When users ask decision questions (rollback, deploy, feature launch, etc.), you coordinate specialized agents:
- **Reliability Agent**: Focuses on uptime, SLO, stability, rollback readiness
- **Cost Agent**: Analyzes financial impact and resource costs
- **UX Agent**: Prioritizes user experience and trust

For regular questions, provide helpful responses. For decision questions, coordinate a debate between agents and synthesize a final recommendation.`,
          messages: await convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10),
          abortSignal: options?.abortSignal
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      // Check if AI binding is available (for Workers AI)
      const hasAIBinding = !!env.AI;
      return Response.json({
        success: hasAIBinding
      });
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
