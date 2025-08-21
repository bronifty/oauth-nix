# Request State Analysis

## Current Server Memory State (should move to cookies)

### From client.js:
- `state` (line 36) - OAuth state parameter for CSRF protection
- `access_token` (line 38) - Current access token  
- `scope` (line 39) - Current token scope

### From server.js:
- `codes` (line 37) - Authorization codes mapping
- `requests` (line 39) - Pending authorization requests

## Recommended Cookie Storage Strategy:

### 1. Client-side cookies (client.js):
```javascript
// Instead of global variables, use secure HTTP-only cookies:
res.cookie('oauth_state', state, { 
  httpOnly: true, 
  secure: true, 
  sameSite: 'strict',
  maxAge: 600000 // 10 minutes
});

res.cookie('access_token', access_token, { 
  httpOnly: true, 
  secure: true, 
  sameSite: 'strict',
  maxAge: 3600000 // 1 hour  
});

res.cookie('token_scope', scope, { 
  httpOnly: true, 
  secure: true, 
  sameSite: 'strict',
  maxAge: 3600000 // 1 hour
});
```

### 2. Server-side session management (server.js):
```javascript
// For authorization codes and requests, use signed cookies or sessions:
res.cookie('auth_request', reqid, { 
  signed: true,
  httpOnly: true,
  secure: true,
  maxAge: 600000 // 10 minutes
});

// Store full request data in session store instead of memory
req.session.authRequest = req.query;
```

## Benefits:
- **Stateless servers**: No memory-based state means better scalability
- **Security**: HTTP-only cookies prevent XSS attacks
- **Persistence**: User state survives server restarts
- **Multi-instance**: Works with load balancers and multiple server instances

## Implementation Requirements:
- Add cookie-parser middleware
- Add express-session for server-side sessions
- Configure secure cookie settings for production
- Add CSRF protection for form submissions
