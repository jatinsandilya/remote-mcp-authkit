import type { User } from "@workos-inc/node";

export interface Props {
	user: User;
	accessToken: string;
	refreshToken: string;
	permissions: string[];
	organizationId?: string;
	claims: {
		sub: string;
		email: string;
		given_name: string;
		family_name: string;
		picture: string;
	};
	// Props must have an index signature to satsify the `McpAgent`
	// generic `Props` which extends `Record<string, unknown>`.
	[key: string]: unknown;
}
