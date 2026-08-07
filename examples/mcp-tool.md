# Exposing x402-tablebook as an MCP tool for Claude

Model Context Protocol (MCP) lets Claude call this reservation server as a
native tool. The pattern: an MCP server wraps the paid endpoints with
`x402-fetch`, so every tool call pays automatically from the agent's wallet.

## Minimal MCP server (`mcp-server.ts`)

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";

const BASE_URL = process.env.TABLEBOOK_URL ?? "http://localhost:4021";
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const payFetch = wrapFetchWithPayment(fetch, account);

const server = new McpServer({ name: "tablebook", version: "0.1.0" });

server.tool(
  "check_availability",
  "Find open restaurant reservation slots (costs $0.001 USDC via x402)",
  { date: z.string().optional(), party: z.number().optional() },
  async ({ date, party }) => {
    const qs = new URLSearchParams();
    if (date) qs.set("date", date);
    if (party) qs.set("party", String(party));
    const res = await payFetch(`${BASE_URL}/availability?${qs}`);
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

server.tool(
  "book_table",
  "Book a table with a $0.01 refundable x402 hold. Returns confirmation, cancelToken, and an ICS invite.",
  { date: z.string(), time: z.string(), party: z.number(), name: z.string(), notes: z.string().optional() },
  async (args) => {
    const res = await payFetch(`${BASE_URL}/book`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

server.tool(
  "cancel_reservation",
  "Cancel a reservation for free using the cancelToken from booking",
  { reservationId: z.string(), cancelToken: z.string() },
  async ({ reservationId, cancelToken }) => {
    const res = await fetch(`${BASE_URL}/cancel/${reservationId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelToken }),
    });
    return { content: [{ type: "text", text: await res.text() }] };
  },
);

await server.connect(new StdioServerTransport());
```

Dependencies: `npm i @modelcontextprotocol/sdk x402-fetch viem zod`

## claude_desktop_config.json

```json
{
  "mcpServers": {
    "tablebook": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-server.ts"],
      "env": {
        "TABLEBOOK_URL": "http://localhost:4021",
        "PRIVATE_KEY": "0x...funded base-sepolia key"
      }
    }
  }
}
```

Claude can then be asked: *"Find us a table for 4 on Saturday around 7pm and
book it"* — it will pay for availability, choose a slot, pay the refundable
hold, and hand back the confirmation with the calendar invite.

## Spending safety

Give the MCP wallet a small, dedicated balance. `wrapFetchWithPayment`
accepts a `maxValue` (base units) to hard-cap what a single call may spend;
combine with per-session budgets in your agent framework.
