var express = require("express");
var url = require("url");
var bodyParser = require("body-parser");
var randomstring = require("randomstring");
var cons = require("consolidate");
var config = require("./config/server-config.json");
var nosql = require("nosql").load(config.database.path);
var querystring = require("querystring");
var __ = require("underscore");
__.string = require("underscore.string");

var app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); // support form-encoded bodies (for the token endpoint)

app.engine("html", cons.underscore);
app.set("view engine", "html");
app.set("views", config.servers.server.viewPath);
app.set("json spaces", 4);

/*** global state ***/
// All configuration now comes directly from config file

var codes = {};

var requests = {};
/*** end global state ***/

var getClient = function (clientId) {
  let foundClient = null;
  config.clients.forEach(function (client) {
    if (client.client_id == clientId) {
      foundClient = client;
    }
  });
  return foundClient;
};

app.get("/", function (req, res) {
  res.render("index", { 
    clients: config.clients, 
    authServer: {
      authorizationEndpoint: config.servers.server.endpoints.authorization,
      tokenEndpoint: config.servers.server.endpoints.token
    }
  });
});

app.get("/authorize", function (req, res) {
  var client = getClient(req.query.client_id);

  if (!client) {
    console.log("Unknown client %s", req.query.client_id);
    res.render("error", { error: "Unknown client" });
    return;
  } else if (!client.redirect_uris.includes(req.query.redirect_uri)) {
    console.log(
      "Mismatched redirect URI, expected %s got %s",
      client.redirect_uris,
      req.query.redirect_uri
    );
    res.render("error", { error: "Invalid redirect URI" });
    return;
  } else {
    var rscope = req.query.scope ? req.query.scope.split(" ") : undefined;
    var cscope = client.scope ? client.scope.split(" ") : undefined;
    if (
      rscope &&
      cscope &&
      rscope.filter((scope) => !cscope.includes(scope)).length > 0 // if the length of the set of request scopes not included in the client scope is greater than 0
    ) {
      // client asked for a scope it couldn't have
      var urlParsed = new URL(req.query.redirect_uri);
      urlParsed.searchParams.set("error", "invalid_scope");
      res.redirect(urlParsed.toString());
      return;
    }

    var reqid = randomstring.generate(8);

    requests[reqid] = req.query;

    res.render("approve", { client: client.client_id, reqid, scope: rscope });
    return;
  }
});

app.post("/approve", function (req, res) {
  var reqid = req.body.reqid;
  var query = requests[reqid];
  delete requests[reqid];

  if (!query) {
    // there was no matching saved request, this is an error
    res.render("error", { error: "No matching authorization request" });
    return;
  }

  if (req.body.approve) {
    if (query.response_type == "code") {
      // user approved access
      var code = randomstring.generate(8);

      var user = req.body.user;

      var scope = Object.keys(req.body)
        .filter((s) => s.startsWith("scope_"))
        .map((s) => s.slice("scope_".length));
      console.log("in server /approve logging scope", scope);
      var client = getClient(query.client_id);
      var cscope = client.scope ? client.scope.split(" ") : undefined;
      if (scope.filter((scope) => !cscope.includes(scope)).length > 0) {
        // client asked for a scope it couldn't have
        var urlParsed = new URL(query.redirect_uri);
        urlParsed.searchParams.set("error", "invalid_scope");
        res.redirect(urlParsed.toString());
        return;
      }

      // save the code and request for later
      codes[code] = {
        authorizationEndpointRequest: query,
        scope: scope,
        user: user,
      };

      var urlParsed = new URL(query.redirect_uri);
      urlParsed.searchParams.set("code", code);
      urlParsed.searchParams.set("state", query.state);
      res.redirect(urlParsed.toString());
      console.log(
        "in POST /approve; urlParsed.toString()!!!! ",
        urlParsed.toString()
      );
      return;
    } else {
      // we got a response type we don't understand
      var urlParsed = new URL(query.redirect_uri);
      urlParsed.searchParams.set("error", "unsupported_response_type");
      res.redirect(urlParsed.toString());
      return;
    }
  } else {
    // user denied access
    var urlParsed = new URL(query.redirect_uri);
    urlParsed.searchParams.set("error", "access_denied");
    res.redirect(urlParsed.toString());
    return;
  }
});

app.post("/token", function (req, res) {
  var auth = req.headers["authorization"];
  if (auth) {
    // check the auth header
    var clientCredentials = Buffer.from(auth.slice("basic ".length), "base64")
      .toString("utf8")
      .split(":");
    var clientId = querystring.unescape(clientCredentials[0]);
    var clientSecret = querystring.unescape(clientCredentials[1]);
  }

  // otherwise, check the post body
  if (req.body.client_id) {
    if (clientId) {
      // if we've already seen the client's credentials in the authorization header, this is an error
      console.log("Client attempted to authenticate with multiple methods");
      res.status(401).json({ error: "invalid_client" });
      return;
    }

    var clientId = req.body.client_id;
    var clientSecret = req.body.client_secret;
  }

  var client = getClient(clientId);
  if (!client) {
    console.log("Unknown client %s", clientId);
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (client.client_secret != clientSecret) {
    console.log(
      "Mismatched client secret, expected %s got %s",
      client.client_secret,
      clientSecret
    );
    res.status(401).json({ error: "invalid_client" });
    return;
  }

  if (req.body.grant_type == "authorization_code") {
    var code = codes[req.body.code];

    if (code) {
      delete codes[req.body.code]; // burn our code, it's been used
      if (code.authorizationEndpointRequest.client_id == clientId) {
        var access_token = randomstring.generate();

        var cscope = null;
        if (code.scope) {
          cscope = code.scope.join(" ");
        }

        nosql.insert({
          access_token: access_token,
          client_id: clientId,
          scope: cscope,
        });

        console.log("Issuing access token %s", access_token);
        console.log("with scope %s", cscope);

        var token_response = {
          access_token: access_token,
          token_type: "Bearer",
          scope: cscope,
        };

        res.status(200).json(token_response);
        console.log("Issued tokens for code %s", req.body.code);

        return;
      } else {
        console.log(
          "Client mismatch, expected %s got %s",
          code.authorizationEndpointRequest.client_id,
          clientId
        );
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
    } else {
      console.log("Unknown code, %s", req.body.code);
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
  } else {
    console.log("Unknown grant type %s", req.body.grant_type);
    res.status(400).json({ error: "unsupported_grant_type" });
  }
});

app.use("/", express.static(config.servers.server.viewPath));

// clear the database on startup
nosql.clear();

var server = app.listen(config.servers.server.port, config.servers.server.host, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log(
    "OAuth Authorization Server is listening at http://%s:%s",
    host,
    port
  );
});
