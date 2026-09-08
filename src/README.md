# Spoke source map

The [architecture guide](../docs/architecture.md) describes the current runtime,
feature ownership and message flow, with diagrams and links to the code.

Start with [app/App.tsx](app/App.tsx) for routes and providers, then
[app/runtime.ts](app/runtime.ts) for dependency wiring. Follow the route into its
feature folder to find the page, gateway, model and colocated tests.

The [ADRs](../docs/adr/) record earlier domain decisions. They explain the
reasoning behind append records and projection merging; they are not a current
inventory of every feature's implementation.
