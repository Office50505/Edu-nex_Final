// Load with NODE_OPTIONS=--require=./tests/helpers/deny-network.cjs for offline validation.
// Injected provider fixtures still work; accidental real HTTP/fetch/socket calls fail immediately.
const deny = () => { throw new Error('OFFLINE_VALIDATION: external network disabled'); };
globalThis.fetch = deny;
for (const name of ['node:http', 'node:https']) {
  const protocol = require(name);
  protocol.request = deny;
  protocol.get = deny;
}
const net = require('node:net');
net.connect = deny;
net.createConnection = deny;
net.Socket.prototype.connect = deny;
