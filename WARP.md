# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository purpose
- OAuth 2.0 Authorization Code flow demo with three Express servers run via Bun, plus an optional Nix-based reverse proxy for clean hostnames (client, server, api) on port 80.

Prerequisites
- Bun (runtime + package manager)
  - Install on macOS: brew tap oven-sh/bun && brew install bun
  - Install deps: bun install
- Optional: Nix (for the reverse proxy and convenience targets)
  - If you don’t use Nix, you can run the servers directly without the proxy.

Quick start
- First time (with Nix):
  - make setup  # adds /etc/hosts entries and a sudoers rule for nginx (idempotent)
  - make start  # starts nginx reverse proxy in background and then the three servers in foreground
- Access:
  - http://client  -> OAuth Client (port 9000)
  - http://server  -> Authorization Server (port 9001)
  - http://api     -> Resource Server (port 9002)

Common commands
- Install deps: bun install
- Run all three servers (watch mode) without Nix:
  - bun run run-all
  - Or (named/colorized, DEBUG enabled): bun run debug
  - Or manually: DEBUG=express:* bunx concurrently "bun --watch server.js" "bun --watch client.js" "bun --watch api.js"
- Run a single server (watch mode):
  - Authorization Server: DEBUG=express:* bun --watch server.js
  - Client:                bun --watch client.js
  - Resource API:         bun --watch api.js
  - Package scripts: bun run run-server | bun run run-client | bun run run-api
- Makefile targets (wrap Nix + servers):
  - make setup            # one-time environment prep (hosts, sudoers)
  - make background-start # start nginx proxy in background (port 80)
  - make foreground-start # run OAuth servers in foreground
  - make start            # background-start then foreground-start
  - make status           # shows proxy status and whether servers are running; prints port usage
  - make stop             # stops servers and proxy
  - make clean            # stops everything and runs nix-collect-garbage -d (destructive for Nix store)
- Nix proxy (direct use without Make):
  - nix run . -- start            # sets up hosts (via dev-proxy) and starts nginx
  - nix run . -- start --no-hosts # start nginx but only check hosts (no modifications)
  - nix run . -- status           # proxy status and current /etc/hosts entries
  - nix run . -- stop             # stop nginx
  - nix run . -- clean            # stop nginx and restore hosts

Notes on tests and linting
- There is no test suite or linter configured in this repository. Do not invent commands for them.

High-level architecture
- Three servers, each a minimal Express app:
  - Authorization Server (server.js)
    - User-facing approve UI (files/authorizationServer)
    - /authorize issues an approval UX and generates authorization codes
    - /token validates client credentials and exchanges codes for access tokens
    - Uses nosql as a simple token store; database path from config
    - Clears the database on startup (nosql.clear())
  - OAuth Client (client.js)
    - / starts with a simple UI (files/client)
    - /authorize initiates the Authorization Code flow against the Authorization Server
    - /callback exchanges the code for an access token via POST to /token
    - /fetch_resource calls the Resource server with the Bearer token
  - Resource Server (api.js)
    - /resource (POST) checks Authorization: Bearer <token> or access_token in body/query
    - Valid tokens return a protected JSON payload; otherwise 401
- Shared configuration (config/server-config.json)
  - servers: client, server, api
    - host, port, baseUrl, viewPath, endpoints
  - clients: OAuth client(s) with id, secret, redirect_uris, scope
  - resources: protected resources and their scopes
  - security: code/token/state length settings
  - database: path used by nosql
- Nix-based reverse proxy (nginx) and scripts
  - Flake outputs a dev-proxy command wrapping scripts in nix/modules and nix/scripts
  - The proxy maps hostnames client, server, api -> localhost:9000/9001/9002
  - Scripts manage /etc/hosts entries and start/stop nginx

Development workflow
- With Nix and the proxy
  1) make setup (once), then make start
  2) Navigate to http://client and click “Get OAuth Token” to perform the Authorization Code flow
  3) From the client UI, use “Get Protected Resource” to call the API with the token
- Without Nix
  1) bun install; DEBUG=express:* bunx concurrently "bun --watch server.js" "bun --watch client.js" "bun --watch api.js"
  2) Use http://localhost:9000, http://localhost:9001, http://localhost:9002 directly

Configuration-driven design
- All server addresses, ports, endpoints, client credentials, and resource URLs come from config/server-config.json.
- Both server.js and client.js read from this file; adjust it to change ports, URIs, and scopes.

State and storage
- Authorization Server stores authorization codes and pending requests in memory; access tokens are persisted via nosql to database.nosql.
- Client keeps transient state (state, access_token, scope) in-process.
- request-state-analysis.md proposes migrating these to cookies/sessions for better scalability and security; consult it before refactoring state handling.

Troubleshooting
- Ports busy or servers not detected:
  - make status to see nginx and ports 80/9000/9001/9002
  - If needed, pkill -f "server.js|client.js|api.js" and restart via make start or bun scripts
- Hosts entries missing (for Nix proxy):
  - nix run . -- check will print a copy-pastable snippet to add to /etc/hosts

Important references in repo
- nix/README.md explains the structure and usage of the Nix-based proxy scripts and modules
- config/request-state-analysis.md documents current in-memory state and a cookie/session approach for hardening

