/**
 * CAD Agent plugin for cad-viewer.
 *
 * @packageDocumentation
 */

import './ui/agent-panel.css'

export { default as AgentChatPanel } from './ui/AgentChatPanel.vue'
// Re-exported so the lazy loader in `./register` can reach the factory through
// the package entry. A relative dynamic import from that subpath entry builds
// into a chunk reference that is `undefined` at runtime, which silently kept
// this plugin from ever loading.
export { createAgentPlugin } from './createAgentPlugin'
export { currentDrawingId, setDrawingIdProvider } from './agent/drawingIdentity'
