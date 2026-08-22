/**
 * What is on screen — and nothing else.
 *
 * The design has five screens across three routes, because two of them have to
 * be reachable from inside a lobby: tapping your own row opens Config again, and
 * the QR button shows the round's code without leaving the match. Making those
 * routes instead of components would be a bug, not a style choice — the socket
 * reducer navigates on `STATE_SYNC` (`connection.svelte.ts`), so a reconnect
 * while you sat on `/` looking at a QR code would throw you back into the lobby.
 *
 * Strict rule: presentation only. No game rules, no server truth, nothing that
 * belongs to `conn`. If a field here could disagree with the server about what
 * is true, it is in the wrong file.
 */

import { CHARACTER_COUNT } from './identity';

export type Overlay = 'menu' | 'rules' | 'confirm' | 'scan' | 'settings' | null;
export type Confirm = 'new-round' | 'play-again' | 'inject' | null;
/** Which of the two pre-match screens is showing, before a lobby exists. */
export type Stage = 'config' | 'qr';
/** Which screen the lobby route is showing. */
export type LobbyView = 'lobby' | 'config' | 'qr';
export type GameView = 'map' | 'brain';

export const ui = $state({
	overlay: null as Overlay,
	confirm: null as Confirm,

	/* ---- pre-match ---- */
	stage: 'config' as Stage,

	/* ---- lobby ---- */
	/**
	 * Which of the three pre-match screens is showing.
	 *
	 * Starts on the QR, as the design does: you arrive holding a code to show
	 * people. The forward arrow then goes to config, or straight past it to the
	 * lobby once you have settled on a figure — which is the prototype's own
	 * `qrForward` rule.
	 */
	lobbyView: 'qr' as LobbyView,
	/** True once "Fertig" has been pressed at least once this session. */
	configured: false,

	/* ---- in match ---- */
	view: 'map' as GameView,
	/** Whose brain is being read. Empty means "mine". */
	selectedId: '',
	/** Whose token the map camera is on. Empty means "mine". */
	focusId: '',
	/** Set while the feed is scrolled away from the newest entry. */
	feedStuck: false,

	/* ---- config draft, before it is sent ---- */
	character: 0,
	nameDraft: '',
	editingName: false,

	/**
	 * The rival memory line an injection would overwrite, by line id.
	 *
	 * An id rather than an index, because an index is only true for as long as
	 * nobody else touches that memory, and the whole point of this screen is that
	 * people are touching it.
	 */
	injectLineId: null as string | null,
	/** What was typed, held between the send tap and the confirmation. */
	pendingInject: '' as string
});

export function closeOverlay(): void {
	ui.overlay = null;
	ui.confirm = null;
}

export function ask(confirm: Exclude<Confirm, null>): void {
	ui.confirm = confirm;
	ui.overlay = 'confirm';
}

export function nextCharacter(step: number): void {
	ui.character = (ui.character + step + CHARACTER_COUNT) % CHARACTER_COUNT;
}
