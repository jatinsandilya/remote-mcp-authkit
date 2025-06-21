import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AuthkitHandler } from "./authkit-handler";
import type { Props } from "./props";

export class MyMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: "MCP server demo using AuthKit",
    version: "1.0.0",
  });

  async init() {
    this.server.tool(
      "get-memory",
      "Get the user's memory given a query by the user",
      { query: z.string() },
      async ({ query }) => {
        // TODO(@jatin): Implement this
        return {
          content: [{ type: "text", text: `User memory for query: ${query}` }],
        };
      }
    );

    this.server.tool(
      "store-memory",
      "Store the user's memory given a query & context",
      {
        query: z.string().describe("The query to store the memory for"),
        context: z
          .string()
          .describe(
            "The context of the memory. usually the assistant's response to the user's query"
          ),
      },
      async ({ query, context }) => {
        try {
          // Get the backend URL from environment
          const env = this.env as Env;
          const backendUrl = env.BACKEND_URL || "http://localhost:8000";

          // https://developers.cloudflare.com/agents/model-context-protocol/authorization/#using-authentication-context-in-your-mcp-server
          // Get user ID from WorkOS user in props
          const userId = this.props.claims.sub;

          if (!userId) {
            throw new Error("User ID not available");
          }

          // Make API call to backend
          const response = await fetch(
            `${backendUrl}/users/${userId}/memories`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: query,
                assistant_response: context,
              }),
            }
          );

          if (!response.ok) {
            const error = (await response
              .json()
              .catch(() => ({ detail: response.statusText }))) as {
              detail: string;
            };
            throw new Error(
              `Backend API error: ${error.detail || response.statusText}`
            );
          }

          const result = (await response.json()) as { message?: string };

          return {
            content: [
              {
                type: "text",
                text:
                  result.message ||
                  `Memory saved successfully for query: ${query}`,
              },
            ],
          };
        } catch (error) {
          console.error("Error storing memory:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error storing memory: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Dynamically add tools based on the user's permissions. They must have the
    // `image_generation` permission to use this tool.
    if (this.props.permissions.includes("image_generation")) {
      this.server.tool(
        "generateImage",
        "Generate an image using the `flux-1-schnell` model. Works best with 8 steps.",
        {
          prompt: z
            .string()
            .describe("A text description of the image you want to generate."),
          steps: z
            .number()
            .min(4)
            .max(8)
            .default(4)
            .describe(
              "The number of diffusion steps; higher values can improve quality but take longer. Must be between 4 and 8, inclusive."
            ),
        },
        async ({ prompt, steps }) => {
          // TODO: Update the `McpAgent` type to pass its `Env` generic parameter
          // down to the `DurableObject` type it extends to avoid this cast.
          const env = this.env as Env;

          const response = await env.AI.run(
            "@cf/black-forest-labs/flux-1-schnell",
            {
              prompt,
              steps,
            }
          );

          return {
            content: [
              {
                type: "image",
                data: response.image!,
                mimeType: "image/jpeg",
              },
            ],
          };
        }
      );
    }
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse") as any, // Use 'any' for maximum flexibility
  defaultHandler: AuthkitHandler as any, // Use 'any' for maximum flexibility
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
