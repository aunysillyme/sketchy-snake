'use strict';

const { isDirection } = require('./duel');

// Room and game fields are small scalars. Reject invalid values before a room
// allocates state, coerces a value, or broadcasts it to another client.
const MAX_PAYLOAD_BYTES = 8192;
const optionalName = value => value == null ||
  (typeof value === 'string' && value.length <= 64);
const optionalToken = value => value == null ||
  (typeof value === 'string' && /^[a-f0-9]{24}$/.test(value));

function validMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) ||
      typeof msg.t !== 'string' || msg.t.length === 0 || msg.t.length > 32) return false;

  switch (msg.t) {
    case 'create':
    case 'quick':
      return optionalName(msg.name);
    case 'join':
      return typeof msg.room === 'string' && /^[a-z2-9]{4}$/i.test(msg.room) &&
        optionalName(msg.name) && optionalToken(msg.token);
    case 'dir':
      return isDirection(msg.d);
    default:
      // Unknown types are handled by the existing 'unknown' protocol response.
      // Ping's arbitrary JSON echo stays inside send's serialization guard;
      // it is never stored in room state. Other extra fields are ignored.
      return true;
  }
}

module.exports = { validMessage, MAX_PAYLOAD_BYTES };
