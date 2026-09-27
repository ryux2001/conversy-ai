# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People learning English who want a low-friction place to practise writing in English and improve their responses with contextual feedback.

## Product Purpose

Conversy helps a learner hold a text conversation with an AI in English while a tutor proactively reviews each learner message, sends a natural correction when useful, and explains it.

## Positioning

The conversation partner and the tutor are separate roles: the partner keeps the main exchange flowing while proactive tutor corrections arrive in the tutor dialog. When the dialog is closed, a short preview notification invites the learner to open it; the tutor can also answer follow-up questions using the active conversation as context.

## Operating Context

- Phase 1 is a temporary, text-only conversation available without signing in.
- The interface has English and Spanish locales. The conversation partner replies in English. Tutor explanations are always in Spanish, regardless of the interface locale; English is reserved for short learning examples or phrases being translated.
- The tutor is a separate, beginner-friendly teaching agent. It proactively adds corrections, explains or translates Conversy's replies, and helps the learner compose a response without speaking as Conversy or inventing personal preferences for the learner.
- The tutor keeps the practice chat and its own dialogue as distinct sources. References such as "your reply" resolve to the relevant Conversy message; if the target is unclear, the tutor asks which message the learner means.
- The tutor is available in a dialog opened from a floating launcher. It proactively adds corrections there, and a preview notification appears while the dialog is closed.

## Capabilities and Constraints

- Phase 1 contains one chat type: temporary chat. Messages and tutor feedback live in browser memory and are cleared when a new chat starts or the page reloads.
- The web client uses Next.js and the API uses NestJS.
- Local model testing uses llama.cpp at `http://127.0.0.1:8080/v1`. The loaded GGUF filename is `LFM2.5-2.6B-Q4_0.gguf`; the server currently advertises the API model ID `LFM2.5-350M-ToMoE`.
- OpenRouter is the planned configurable hosted provider. Its credentials must stay on the backend.
- Audio and WebGPU are later-phase work.
- Product name and logo remain open.

## Brand Commitments

- The user requests a modern, minimal, pleasant interface, with a dark palette and a very small blue accent.
- Interface controls and supporting text must be available in Spanish and English.

## Evidence on Hand

- Phase 1 scope and the interface wireframe are in `Conversy-ai/Fases/Fase-1/`.
- The technology choices are recorded in `Conversy-ai/Tecnologías.md`.
- No approved logo or product imagery was provided.

## Product Principles

- Make it easy to start writing in English.
- Keep correction supportive and contextual; surface it proactively in the tutor dialog without interrupting the main conversation.
- Preserve the temporary nature of phase 1 and do not imply that chat history is saved.
