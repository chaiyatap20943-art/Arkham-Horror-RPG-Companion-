/* Shared synchronous authentication service for Apps Script and the Node adapter. */
var Arkham = typeof Arkham !== 'undefined' ? Arkham : {};

(function (namespace) {
  'use strict';

  var AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  var TOKEN_URL = 'https://oauth2.googleapis.com/token';
  var USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
  var LOGIN_TTL_MS = 10 * 60 * 1000;
  var SESSION_TTL_MS = 8 * 60 * 60 * 1000;
  var MAX_PENDING_LOGINS = 100;

  function fail(code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  }

  function formEncode(fields) {
    return Object.keys(fields).map(function (key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(String(fields[key]));
    }).join('&');
  }

  // Apps Script has no Buffer; encode the SHA-256 hex output without runtime globals.
  function hexToBase64url(hex) {
    if (typeof hex !== 'string' || !/^[a-f0-9]{64}$/i.test(hex)) {
      fail('AUTH_INTERNAL', 'The authentication digest is unavailable.');
    }
    var bytes = [];
    var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    var output = '';
    for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
    for (var j = 0; j < bytes.length; j += 3) {
      var bits = (bytes[j] << 16) | ((bytes[j + 1] || 0) << 8) | (bytes[j + 2] || 0);
      output += alphabet[(bits >>> 18) & 63] + alphabet[(bits >>> 12) & 63];
      if (j + 1 < bytes.length) output += alphabet[(bits >>> 6) & 63];
      if (j + 2 < bytes.length) output += alphabet[bits & 63];
    }
    return output;
  }

  function constantTimeEqual(left, right) {
    var mismatch = left.length ^ right.length;
    var length = Math.max(left.length, right.length);
    for (var i = 0; i < length; i += 1) {
      mismatch |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
    }
    return mismatch === 0;
  }

  namespace.createAuth = function (options) {
    var config = options.config || {};
    var vault = options.vault;
    var nowMs = options.nowMs;
    var id = options.id;
    var digest = options.digest;
    var http = options.http;
    var service = options.service;

    function publicConfig() {
      var missing = [];
      if (!config.clientId) missing.push('GOOGLE_CLIENT_ID');
      if (!config.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
      if (!config.redirectUri) missing.push('APP_URL');
      return {
        configured: missing.length === 0,
        missingSettings: missing,
        mode: config.mode || 'production'
      };
    }

    function requireConfiguration() {
      if (!publicConfig().configured) {
        fail('AUTH_NOT_CONFIGURED', 'Google sign-in needs the settings listed in the deployment guide.');
      }
      // HTTPS is mandatory outside an explicitly configured local development instance.
      var https = /^https:\/\/[^\s/?#]+(?:[/?][^\s#]*)?$/.test(config.redirectUri);
      var loopback = config.mode === 'development' &&
        /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s#]*)?$/.test(config.redirectUri);
      if (!https && !loopback) {
        fail('AUTH_BAD_CONFIGURATION', 'The OAuth redirect must use HTTPS or local development loopback.');
      }
    }

    function randomSecret() {
      var secret = String(id()) + String(id());
      if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
        fail('AUTH_INTERNAL', 'The authentication random source is unavailable.');
      }
      return secret;
    }

    function sessionKey(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) {
        fail('UNAUTHENTICATED', 'Sign in to continue.');
      }
      var hash = digest(token);
      if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) {
        fail('AUTH_INTERNAL', 'The authentication digest is unavailable.');
      }
      return 'auth:session:' + hash.toLowerCase();
    }

    function prune(prefix, now) {
      var entries = vault.entries(prefix);
      entries.forEach(function (entry) {
        if (!entry.value || !(entry.value.expiresAt > now)) vault.delete(entry.key);
      });
      return entries.filter(function (entry) {
        return entry.value && entry.value.expiresAt > now;
      });
    }

    function beginLogin(request) {
      requireConfiguration();
      request = request || {};
      if (typeof request.browserChallenge !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(request.browserChallenge)) {
        fail('AUTH_BAD_CHALLENGE', 'Sign in must begin in a browser with PKCE enabled.');
      }
      var state = randomSecret();
      vault.locked(function () {
        var now = nowMs();
        var pending = prune('oauth:', now).filter(function (entry) {
          return entry.key.indexOf('oauth:ready:') !== 0;
        });
        prune('auth:session:', now);
        if (pending.length >= MAX_PENDING_LOGINS) {
          fail('AUTH_BUSY', 'Too many sign-in attempts are pending. Try again in ten minutes.');
        }
        if (vault.get('oauth:state:' + state)) fail('AUTH_INTERNAL', 'Please restart sign-in.');
        vault.set('oauth:state:' + state, {
          challenge: request.browserChallenge,
          expiresAt: now + LOGIN_TTL_MS
        });
      });
      return {
        state: state,
        authorizationUrl: AUTHORIZATION_URL + '?' + formEncode({
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          response_type: 'code',
          scope: 'openid email profile',
          access_type: 'online',
          prompt: 'select_account',
          state: state,
          code_challenge: request.browserChallenge,
          code_challenge_method: 'S256'
        })
      };
    }

    function callback(request) {
      requireConfiguration();
      request = request || {};
      if (typeof request.state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(request.state)) {
        fail('AUTH_INVALID_STATE', 'The sign-in request is invalid or expired. Start again.');
      }
      return vault.locked(function () {
        var key = 'oauth:state:' + request.state;
        var pending = vault.get(key);
        vault.delete(key); // Every returned state is consumed, including a denied request.
        if (!pending || !(pending.expiresAt > nowMs())) {
          fail('AUTH_INVALID_STATE', 'The sign-in request is invalid or expired. Start again.');
        }
        if (request.error) fail('AUTH_CANCELLED', 'Google sign-in was cancelled or denied.');
        if (typeof request.code !== 'string' || !request.code || request.code.length > 8192) {
          fail('AUTH_BAD_CALLBACK', 'Google did not return a usable sign-in code.');
        }
        var ticket = randomSecret();
        if (vault.get('oauth:ticket:' + ticket)) fail('AUTH_INTERNAL', 'Please restart sign-in.');
        vault.set('oauth:ticket:' + ticket, {
          code: request.code,
          challenge: pending.challenge,
          state: request.state,
          expiresAt: pending.expiresAt
        });
        vault.set('oauth:ready:' + request.state, {
          ticket: ticket,
          challenge: pending.challenge,
          expiresAt: pending.expiresAt
        });
        // Neither the authorization code nor any session token crosses the callback window.
        return { ticket: ticket, state: request.state };
      });
    }

    function trustedResponse(url, request) {
      var response;
      try {
        response = http(url, request);
      } catch (error) {
        fail('AUTH_PROVIDER_UNAVAILABLE', 'Google sign-in is temporarily unavailable. Start again.');
      }
      if (!response || response.status !== 200 || !response.json ||
          typeof response.json !== 'object' || response.json.error) {
        fail('AUTH_PROVIDER_REJECTED', 'Google could not verify this sign-in. Start again.');
      }
      return response.json;
    }

    function finishLogin(request) {
      requireConfiguration();
      request = request || {};
      if (typeof request.ticket !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(request.ticket) ||
          typeof request.browserVerifier !== 'string' ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(request.browserVerifier)) {
        fail('AUTH_INVALID_TICKET', 'Return to the browser tab that began sign-in.');
      }
      var actualChallenge = hexToBase64url(digest(request.browserVerifier));
      var pending = vault.locked(function () {
        var key = 'oauth:ticket:' + request.ticket;
        var value = vault.get(key);
        if (!value || !(value.expiresAt > nowMs())) {
          vault.delete(key);
          fail('AUTH_INVALID_TICKET', 'The sign-in result is invalid or expired. Start again.');
        }
        if (!constantTimeEqual(actualChallenge, value.challenge)) {
          // An observer of the ticket cannot destroy the original tab's pending login.
          fail('AUTH_VERIFIER_MISMATCH', 'Return to the browser tab that began sign-in.');
        }
        vault.delete(key); // Consume before external requests; concurrent completion cannot replay.
        vault.delete('oauth:ready:' + value.state);
        return value;
      });
      var token = trustedResponse(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formEncode({
          code: pending.code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: request.browserVerifier
        })
      });
      if (typeof token.access_token !== 'string' || !token.access_token ||
          token.access_token.length > 16384 || typeof token.token_type !== 'string' ||
          token.token_type.toLowerCase() !== 'bearer' ||
          typeof token.expires_in !== 'number' || !isFinite(token.expires_in) || token.expires_in <= 0 ||
          typeof token.scope !== 'string' || token.scope.split(/\s+/).indexOf('openid') === -1) {
        fail('AUTH_PROVIDER_REJECTED', 'Google did not return a usable identity grant. Start again.');
      }
      // The code is exchanged by this client over TLS. Query Google's identity endpoint;
      // never accept browser claims or use an unverified decoded ID token as identity.
      var profile = trustedResponse(USERINFO_URL, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token.access_token }
      });
      if (typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(profile.sub) ||
          profile.email_verified !== true ||
          typeof profile.email !== 'string' || profile.email.length > 254 ||
          !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(profile.email)) {
        fail('AUTH_UNVERIFIED_IDENTITY', 'Google did not provide a verified email and identity.');
      }
      var displayName = typeof profile.name === 'string'
        ? profile.name.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim().slice(0, 120)
        : '';
      var user = service.upsertUser({
        sub: profile.sub,
        email: profile.email.trim().toLowerCase(),
        emailVerified: true,
        name: displayName || profile.email.slice(0, 120)
      });
      if (!user || typeof user.id !== 'string' || !user.id) {
        fail('AUTH_INTERNAL', 'The verified account could not be saved.');
      }
      var sessionToken = randomSecret();
      var key = sessionKey(sessionToken);
      var expiresAt = nowMs() + SESSION_TTL_MS;
      vault.locked(function () {
        if (vault.get(key)) fail('AUTH_INTERNAL', 'Please restart sign-in.');
        vault.set(key, { userId: user.id, expiresAt: expiresAt });
      });
      return { sessionToken: sessionToken, user: user, expiresAt: expiresAt };
    }

    function pollLogin(request) {
      requireConfiguration();
      request = request || {};
      if (typeof request.state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(request.state) ||
          typeof request.browserVerifier !== 'string' ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(request.browserVerifier)) {
        fail('AUTH_INVALID_STATE', 'The sign-in request is invalid or expired. Start again.');
      }
      var actualChallenge = hexToBase64url(digest(request.browserVerifier));
      var ready = vault.locked(function () {
        var key = 'oauth:ready:' + request.state;
        var value = vault.get(key);
        var pending = value || vault.get('oauth:state:' + request.state);
        if (!pending || !(pending.expiresAt > nowMs())) {
          if (value && value.ticket) vault.delete('oauth:ticket:' + value.ticket);
          vault.delete(key);
          vault.delete('oauth:state:' + request.state);
          fail('AUTH_INVALID_STATE', 'The sign-in request is invalid or expired. Start again.');
        }
        if (!constantTimeEqual(actualChallenge, pending.challenge)) {
          fail('AUTH_VERIFIER_MISMATCH', 'Return to the browser tab that began sign-in.');
        }
        return value;
      });
      if (!ready) return { pending: true };
      // Release the private-vault lock before finishLogin locks and persists the user.
      var result = finishLogin({ ticket: ready.ticket, browserVerifier: request.browserVerifier });
      result.pending = false;
      return result;
    }

    function authorize(token) {
      var key = sessionKey(token);
      return vault.locked(function () {
        var session = vault.get(key);
        if (!session || !(session.expiresAt > nowMs()) || typeof session.userId !== 'string' || !session.userId) {
          vault.delete(key);
          fail('UNAUTHENTICATED', 'Your session has expired. Sign in to continue.');
        }
        // Domain services must re-check current user and campaign membership on every request.
        return session.userId;
      });
    }

    function logout(token) {
      var key = sessionKey(token);
      vault.locked(function () { vault.delete(key); });
      return { loggedOut: true };
    }

    return {
      publicConfig: publicConfig,
      beginLogin: beginLogin,
      callback: callback,
      finishLogin: finishLogin,
      pollLogin: pollLogin,
      authorize: authorize,
      logout: logout
    };
  };
})(Arkham);

if (typeof module !== 'undefined' && module.exports) module.exports = Arkham;
