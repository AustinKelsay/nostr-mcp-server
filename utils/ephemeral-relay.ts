import { z } from 'zod'
import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha256'
import EventEmitter from 'events'
import { WebSocket, WebSocketServer } from 'ws'
import { KINDS } from './constants.js'

/* ================ [ Configuration ] ================ */

const HOST    = 'ws://localhost'
const DEBUG   = process.env['DEBUG']   === 'true'
const VERBOSE = process.env['VERBOSE'] === 'true' || DEBUG

// Only log output mode in non-test environments
if (process.env.NODE_ENV !== 'test') {
  console.error('output mode:', DEBUG ? 'debug' : VERBOSE ? 'verbose' : 'silent')
}

/* ================ [ Interfaces ] ================ */

interface EventFilter {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  [key: string]: any | undefined
}

interface SignedEvent {
  content: string
  created_at: number
  id: string
  kind: number
  pubkey: string
  sig: string
  tags: string[][]
}

interface Subscription {
  filters: EventFilter[]
  instance: ClientSession,
  sub_id: string
}

/* ================ [ Schema ] ================ */

const num = z.number().max(Number.MAX_SAFE_INTEGER),
  str = z.string(),
  stamp = num.min(500_000_000),
  hex = str.regex(/^[0-9a-fA-F]*$/).refine(e => e.length % 2 === 0),
  hash = hex.refine((e) => e.length === 64),
  sig = hex.refine((e) => e.length === 128),
  tags = str.array()

const event_schema = z.object({
  content: str,
  created_at: stamp,
  id: hash,
  kind: num,
  pubkey: hash,
  sig: sig,
  tags: tags.array()
})

const filter_schema = z.object({
  ids: hash.array().optional(),
  authors: hash.array().optional(),
  kinds: num.array().optional(),
  since: stamp.optional(),
  until: stamp.optional(),
  limit: num.optional(),
}).catchall(tags)

const sub_schema = z.tuple([str]).rest(filter_schema)

/* ================ [ Server Class ] ================ */

export class NostrRelay {
  private readonly _emitter: EventEmitter
  private _port: number
  private readonly _purge: number | null
  private readonly _subs: Map<string, Subscription>
  private readonly _requireAuth: boolean

  private _wss: WebSocketServer | null
  private _cache: SignedEvent[]
  private _isClosing: boolean = false

  public conn: number

  constructor(port: number, purge_ival?: number, requireAuth?: boolean) {
    this._cache = []
    this._emitter = new EventEmitter()
    this._port = port
    this._purge = purge_ival ?? null
    this._subs = new Map()
    this._wss = null
    this.conn = 0
    this._requireAuth = requireAuth ?? false
  }

  get cache() {
    return this._cache
  }

  get subs() {
    return this._subs
  }

  get port() {
    return this._port
  }

  get requireAuth() {
    return this._requireAuth
  }

  get url() {
    return `${HOST}:${this._port}`
  }

  get wss() {
    if (this._wss === null) {
      throw new Error('websocket server not initialized')
    }
    return this._wss
  }

  async start() {
    this._isClosing = false

    // Bun's http server (used by ws) does not reliably support binding to port 0.
    // If callers pass 0, we pick a random high port and retry on EADDRINUSE.
    const randomHighPort = () => {
      // IANA ephemeral range, avoids privileged ports and typical local dev defaults.
      const min = 49152
      const max = 65535
      return Math.floor(min + Math.random() * (max - min + 1))
    }

    const maxAttempts = this._port === 0 ? 25 : 1

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const port = this._port === 0 ? randomHighPort() : this._port

      // Create a fresh server each attempt.
      this._wss = new WebSocketServer({ port })

      DEBUG && console.log('[ relay ] running on port:', port)

      this.wss.on('connection', socket => {
        const instance = new ClientSession(this, socket)

        socket.on('message', msg => instance._handler(msg.toString()))
        socket.on('error', err => instance._onerr(err))
        socket.on('close', code => instance._cleanup(code))

        this.conn += 1
      })

      try {
        await new Promise<void>((resolve, reject) => {
          this.wss.once('error', reject)
          this.wss.once('listening', () => resolve())
        })

        this._port = port

        if (this._purge !== null) {
          DEBUG && console.log(`[ relay ] purging events every ${this._purge} seconds`)
          setInterval(() => {
            this._cache = []
          }, this._purge * 1000)
        }

        this._emitter.emit('connected')
        return this
      } catch (err: any) {
        const isAddrInUse = err?.code === 'EADDRINUSE'

        // Best-effort cleanup before retrying.
        try {
          this._wss?.close()
        } catch {
          // ignore
        } finally {
          this._wss = null
        }

        if (this._port === 0 && isAddrInUse) {
          continue
        }

        throw err
      }
    }

    throw new Error('Failed to start relay after multiple attempts to reserve a port')
  }

  onconnect(cb: () => void) {
    this._emitter.on('connected', cb)
  }

  close() {
    return new Promise<void>(resolve => {
      if (this._isClosing) {
        DEBUG && console.log('[ relay ] already closing, skipping duplicate close call')
        resolve()
        return
      }

      this._isClosing = true
      
      if (this._wss) {
        // Clean up clients first
        if (this._wss.clients && this._wss.clients.size > 0) {
          this._wss.clients.forEach(client => {
            try {
              client.close(1000, 'Server shutting down')
            } catch (e) {
              // Ignore errors
            }
          })
        }
        
        // Clear state
        this._subs.clear()
        this._cache = []
        
        // Close server with timeout
        const timeout = setTimeout(() => {
          DEBUG && console.log('[ relay ] server close timed out, forcing cleanup')
          this._wss = null
          resolve()
        }, 500)
        
        const wss = this._wss
        this._wss = null
        
        wss.close(() => {
          clearTimeout(timeout)
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  store(event: SignedEvent) {
    this._cache = this._cache.concat(event).sort((a, b) => a > b ? -1 : 1)
  }
}

/* ================ [ Instance Class ] ================ */

class ClientSession {

  private readonly _sid: string
  private readonly _relay: NostrRelay
  private readonly _socket: WebSocket
  private readonly _subs: Set<string>
  private _authed: boolean
  private _authChallenge: string

  constructor(
    relay: NostrRelay,
    socket: WebSocket
  ) {
    this._relay = relay
    this._sid = Math.random().toString().slice(2, 8)
    this._socket = socket
    this._subs = new Set()
    this._authed = !relay.requireAuth
    this._authChallenge = `challenge-${Math.random().toString(16).slice(2)}`

    this.log.client('client connected')
  }

  get sid() {
    return this._sid
  }

  get relay() {
    return this._relay
  }

  get socket() {
    return this._socket
  }

  _cleanup(code: number) {
    try {
      // First remove all subscriptions associated with this client
      for (const subId of this._subs) {
        this.remSub(subId)
      }
      this._subs.clear()
      
      // Close the socket if it's still open
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.close()
      }
      
      this.relay.conn -= 1
      this.log.client(`[ ${this._sid} ]`, 'client disconnected with code:', code)
    } catch (e) {
      DEBUG && console.error(`[ client ][ ${this._sid} ]`, 'error during cleanup:', e)
    }
  }

  _handler(message: string) {
    let verb: string, payload: any
    
    try {
      // Try to parse as JSON
      const parsed = JSON.parse(message);
      
      // Handle NIP-46 messages (which might not follow standard Nostr format)
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        // Check if it's a standard Nostr message
        if (['EVENT', 'REQ', 'CLOSE', 'AUTH'].includes(parsed[0])) {
          // Handle standard Nostr messages
          [verb, ...payload] = parsed;
          
          switch (verb) {
            case 'EVENT':
              if (parsed.length !== 2) {
                DEBUG && console.log(`[ ${this._sid} ]`, 'EVENT message missing params:', parsed)
                return this.send(['NOTICE', 'invalid: EVENT message missing params'])
              }
              return this._onevent(parsed[1]);
              
            case 'REQ':
              if (parsed.length < 2) {
                DEBUG && console.log(`[ ${this._sid} ]`, 'REQ message missing params:', parsed)
                return this.send(['NOTICE', 'invalid: REQ message missing params'])
              }
              const sub_id = parsed[1];
              const filters = parsed.slice(2);
              return this._onreq(sub_id, filters);
              
            case 'CLOSE':
              if (parsed.length !== 2) {
                DEBUG && console.log(`[ ${this._sid} ]`, 'CLOSE message missing params:', parsed)
                return this.send(['NOTICE', 'invalid: CLOSE message missing params'])
              }
              return this._onclose(parsed[1]);

            case 'AUTH':
              if (parsed.length !== 2) {
                DEBUG && console.log(`[ ${this._sid} ]`, 'AUTH message missing params:', parsed)
                return this.send(['NOTICE', 'invalid: AUTH message missing params'])
              }
              return this._onauth(parsed[1]);
          }
        }
        else {
          // This could be a direct NIP-46 message, broadcast it to other clients
          try {
            this.relay.wss.clients.forEach(client => {
              if (client !== this.socket && client.readyState === WebSocket.OPEN) {
                client.send(message);
              }
            });
            return;
          } catch (e) {
            DEBUG && console.error('Error broadcasting message:', e);
            return;
          }
        }
      }
      
      this.log.debug('unhandled message format:', message);
      return this.send(['NOTICE', '', 'Unable to handle message']);
    } catch (e) {
      this.log.debug('failed to parse message:\n\n', message);
      return this.send(['NOTICE', '', 'Unable to parse message']);
    }
  }

  _onclose(sub_id: string) {
    this.log.info('closed subscription:', sub_id)
    this.remSub(sub_id)
  }

  _onerr(err: Error) {
    this.log.info('socket encountered an error:\n\n', err)
  }

  _onevent(event: SignedEvent) {
    try {
      if (this.relay.requireAuth && !this._authed) {
        this.send(['AUTH', this._authChallenge])
        return
      }

      // Special handling for NIP-46 events (kind 24133)
      if (event.kind === 24133) {
        this.relay.store(event);
        
        // Find subscriptions that match this event
        for (const [uid, sub] of this.relay.subs.entries()) {
          for (const filter of sub.filters) {
            if (filter.kinds?.includes(24133)) {
              // Check for #p tag filter
              const pTags = event.tags.filter(tag => tag[0] === 'p').map(tag => tag[1]);
              const pFilters = Object.entries(filter)
                .filter(([key]) => key === '#p')
                .map(([_, value]) => value as string[])
                .flat();
              
              // If there's a #p filter, make sure the event matches it
              if (pFilters.length > 0 && !pTags.some(tag => pFilters.includes(tag))) {
                continue;
              }
              
              // Send to matching subscription
              const [clientId, subId] = uid.split('/');
              sub.instance.send(['EVENT', subId, event]);
              break;
            }
          }
        }
        
        // Send OK message
        this.send(['OK', event.id, true, '']);
        return;
      }
      
      // Standard event processing
      this.log.client('received event id:', event.id)
      this.log.debug('event:', event)

      if (!verify_event(event)) {
        this.log.debug('event failed validation:', event)
        this.send(['OK', event.id, false, 'event failed validation'])
        return
      }

      this.send(['OK', event.id, true, ''])
      this.relay.store(event)

      for (const { filters, instance, sub_id } of this.relay.subs.values()) {
        for (const filter of filters) {
          if (match_filter(event, filter)) {
            instance.log.client(`event matched subscription: ${sub_id}`)
            instance.send(['EVENT', sub_id, event])
          }
        }
      }
    } catch (e) {
      DEBUG && console.error('Error processing event:', e)
    }
  }

  _onreq(
    sub_id: string,
    filters: EventFilter[]
  ): void {
    if (this.relay.requireAuth && !this._authed) {
      this.send(['AUTH', this._authChallenge])
      return
    }

    if (filters.length === 0) {
      this.log.client('request has no filters')
      return
    }

    this.log.client('received subscription request:', sub_id)
    this.log.debug('filters:', filters)
    
    // Add subscription
    this.addSub(sub_id, ...filters)
    
    // Check for NIP-46 subscription
    const hasNip46Filter = filters.some(f => f.kinds?.includes(24133));
    
    // For each filter
    let count = 0
    for (const filter of filters) {
      // Set the limit count, if any
      let limitCount = filter.limit
      
      for (const event of this.relay.cache) {
        // If limit is reached, stop sending events
        if (limitCount !== undefined && limitCount <= 0) break
        
        // Check if event matches filter
        if (match_filter(event, filter)) {
          this.send(['EVENT', sub_id, event])
          count++
          this.log.client(`event matched in cache: ${event.id}`)
          this.log.client(`event matched subscription: ${sub_id}`)
          
          // Update limit counter
          if (limitCount !== undefined) limitCount--
        }
      }
    }
    
    DEBUG && this.log.debug(`sent ${count} matching events from cache`)
    
    // Send EOSE
    this.send(['EOSE', sub_id])
  }

  _onauth(event: SignedEvent) {
    try {
      // NIP-42 AUTH: kind 22242 with "challenge" tag matching relay-provided challenge.
      if (event.kind !== KINDS.AUTH) {
        this.send(['OK', event.id, false, 'invalid: wrong auth kind'])
        return
      }

      if (!verify_event(event)) {
        this.send(['OK', event.id, false, 'invalid: auth failed validation'])
        return
      }

      const challengeTag = event.tags.find(t => Array.isArray(t) && t[0] === 'challenge' && t.length > 1)
      if (!challengeTag || challengeTag[1] !== this._authChallenge) {
        this.send(['OK', event.id, false, 'invalid: auth challenge mismatch'])
        return
      }

      this._authed = true
      this.send(['OK', event.id, true, ''])
    } catch (e) {
      DEBUG && console.error(`[ client ][ ${this._sid} ]`, 'error handling AUTH:', e)
    }
  }

  get log() {
    return {
      client: (...msg: any[]) => VERBOSE && console.log(`[ client ][ ${this._sid} ]`, ...msg),
      debug: (...msg: any[]) => DEBUG && console.log(`[ debug  ][ ${this._sid} ]`, ...msg),
      info: (...msg: any[]) => VERBOSE && console.log(`[ info   ][ ${this._sid} ]`, ...msg),
    }
  }

  addSub(
    sub_id: string,
    ...filters: EventFilter[]
  ) {
    const uid = `${this.sid}/${sub_id}`
    this.relay.subs.set(uid, { filters, instance: this, sub_id })
    this._subs.add(sub_id)
  }

  remSub(subId: string) {
    try {
      const uid = `${this.sid}/${subId}`
      this.relay.subs.delete(uid)
      this._subs.delete(subId)
    } catch (e) {
      // Ignore errors
    }
  }

  send(message: any[]) {
    try {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(message))
      }
    } catch (e) {
      DEBUG && console.error(`Failed to send message to client ${this._sid}:`, e)
    }
  }
}

/* ================ [ Methods ] ================ */

function assert(value: unknown): asserts value {
  if (value === false) throw new Error('assertion failed!')
}

function match_filter(
  event: SignedEvent,
  filter: EventFilter = {}
): boolean {
  const { authors, ids, kinds, since, until, limit, ...rest } = filter

  const tag_filters: string[][] = Object.entries(rest)
    .filter(e => e[0].startsWith('#'))
    .map(e => [e[0].slice(1, 2), ...e[1]])

  if (ids !== undefined && !ids.includes(event.id)) {
    return false
  } else if (since !== undefined && event.created_at < since) {
    return false
  } else if (until !== undefined && event.created_at > until) {
    return false
  } else if (authors !== undefined && !authors.includes(event.pubkey)) {
    return false
  } else if (kinds !== undefined && !kinds.includes(event.kind)) {
    return false
  } else if (tag_filters.length > 0) {
    return match_tags(tag_filters, event.tags)
  } else {
    return true
  }
}

function match_tags(
  filters: string[][],
  tags: string[][]
): boolean {
  // For each filter, we need to find at least one match in event tags
  for (const [key, ...terms] of filters) {
    let filterMatched = false;
    
    // Skip empty filter terms
    if (terms.length === 0) {
      filterMatched = true;
      continue;
    }
    
    // For each tag that matches the filter key
    for (const [tag, ...params] of tags) {
      if (tag !== key) continue;
      
      // For each term in the filter
      for (const term of terms) {
        // If any term matches any parameter, this filter condition is satisfied
        if (params.includes(term)) {
          filterMatched = true;
          break;
        }
      }
      
      // If we found a match for this filter, we can stop checking tags
      if (filterMatched) break;
    }
    
    // If no match was found for this filter condition, event doesn't match
    if (!filterMatched) return false;
  }
  
  // All filter conditions were satisfied
  return true;
}

function verify_event(event: SignedEvent) {
  const { content, created_at, id, kind, pubkey, sig, tags } = event
  const pimg = JSON.stringify([0, pubkey, created_at, kind, tags, content])
  const dig = Buffer.from(sha256(pimg)).toString('hex')
  if (dig !== id) return false
  return schnorr.verify(sig, id, pubkey)
} 
