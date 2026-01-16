import { writable } from "svelte/store";

// Global play state for the game UI
export const isPlaying = writable(false);
export const isShaking = writable(false);
