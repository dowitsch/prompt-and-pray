import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Whether the designer is reachable.
 *
 * This needs saying plainly: **the designer shows the answers.** It is an
 * authoring tool, so it necessarily displays which road out of each place leads
 * home — the one thing the whole game is built on hiding. There is no login in
 * HOMEWARD by design, so there is nothing to stop a player who is losing from
 * opening `/design` and reading the map they are meant to be discovering.
 *
 * So it is on in development, where you are the author, and off in production
 * unless whoever deployed it says otherwise with `DESIGNER=on`. That is a real
 * limitation of having no accounts, not a setting anyone should flip without
 * meaning to: turn it on for a private instance you author on, and leave it off
 * for one people play on.
 */
export function designerEnabled(): boolean {
	const setting = env.DESIGNER?.trim().toLowerCase();
	if (setting) return /^(1|true|yes|on)$/.test(setting);
	return dev;
}

/** Refuse the request unless the designer is open. */
export function requireDesigner(): void {
	if (!designerEnabled()) {
		error(
			404,
			'The story designer is not open on this server. It reveals every answer, so it stays off unless DESIGNER=on.'
		);
	}
}
