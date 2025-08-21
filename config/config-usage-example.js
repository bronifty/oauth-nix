// Example: How to use the server-config.json in your OAuth servers

const config = require('./server-config.json');

// =============================================================================
// CLIENT.JS EXAMPLE
// =============================================================================

// Replace hardcoded values with config:
// OLD:
// var authServer = {
//   authorizationEndpoint: "http://localhost:9001/authorize",
//   tokenEndpoint: "http://localhost:9001/token",
// };
// var protectedResource = "http://localhost:9002/resource";
// var client = {
//   client_id: "oauth-client-1",
//   client_secret: "oauth-client-secret-1",
//   redirect_uris: ["http://localhost:9000/callback"],
// };

// NEW:
const authServer = {
  authorizationEndpoint: config.servers.server.endpoints.authorization,
  tokenEndpoint: config.servers.server.endpoints.token,
};

const protectedResource = config.servers.api.endpoints.resource;

const client = config.clients[0]; // or find by client_id

// Server startup with config:
const serverConfig = config.servers.client;
app.listen(serverConfig.port, serverConfig.host, function () {
  console.log('OAuth Client is listening at %s', serverConfig.baseUrl);
});

// =============================================================================
// SERVER.JS EXAMPLE  
// =============================================================================

// Replace hardcoded values:
// OLD:
// var authServer = {
//   authorizationEndpoint: "http://localhost:9001/authorize", 
//   tokenEndpoint: "http://localhost:9001/token",
// };
// var clients = [
//   {
//     client_id: "oauth-client-1",
//     client_secret: "oauth-client-secret-1",
//     redirect_uris: ["http://localhost:9000/callback"],
//     scope: "foo bar",
//   },
// ];

// NEW:
const authServer = {
  authorizationEndpoint: config.servers.server.endpoints.authorization,
  tokenEndpoint: config.servers.server.endpoints.token,
};

const clients = config.clients;

// Use security config for token generation:
const randomstring = require("randomstring");
const codeLength = config.security.codeLength;
const tokenLength = config.security.tokenLength;

// Generate tokens with configured length:
const code = randomstring.generate(codeLength);
const access_token = randomstring.generate(tokenLength);

// Set view path from config:
app.set("views", config.servers.server.viewPath);

// Database path from config:
const nosql = require("nosql").load(config.database.path);

// Server startup:
const serverConfig = config.servers.server;
app.listen(serverConfig.port, serverConfig.host, function () {
  console.log('OAuth Authorization Server is listening at %s', serverConfig.baseUrl);
});

// =============================================================================
// API.JS EXAMPLE
// =============================================================================

// Replace hardcoded resource:
// OLD:
// var resource = {
//   "name": "Protected Resource",
//   "description": "This data has been protected by OAuth 2.0"
// };

// NEW:
const resource = config.resources[0];

// Set view path from config:
app.set("views", config.servers.api.viewPath);

// Database from config:
const nosql = require("nosql").load(config.database.path);

// Server startup:
const serverConfig = config.servers.api;
app.listen(serverConfig.port, serverConfig.host, function () {
  console.log('OAuth Resource Server is listening at %s', serverConfig.baseUrl);
});

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Helper function to get client by ID:
function getClient(clientId) {
  return config.clients.find(client => client.client_id === clientId);
}

// Helper function to validate redirect URI:
function isValidRedirectUri(clientId, redirectUri) {
  const client = getClient(clientId);
  return client && client.redirect_uris.includes(redirectUri);
}

// Helper function to validate scope:
function isValidScope(clientId, requestedScope) {
  const client = getClient(clientId);
  if (!client || !client.scope) return false;
  
  const clientScopes = client.scope.split(' ');
  const requestedScopes = requestedScope ? requestedScope.split(' ') : [];
  
  return requestedScopes.every(scope => clientScopes.includes(scope));
}

module.exports = {
  config,
  authServer,
  protectedResource,
  clients,
  getClient,
  isValidRedirectUri,
  isValidScope
};
