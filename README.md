# `@jnode/dns`

Simple DNS packet, client, and UDP server utilities for Node.js.

`@jnode/dns` provides a small low-level toolkit for reading and writing DNS
packets, routing DNS questions, responding from custom handlers, and forwarding
queries to upstream DNS resolvers.

> README.md is written by Codex, not sure if it understands my code.

## Features

- Parse DNS packets from `Buffer` objects.
- Build DNS query and response packets.
- Run a UDP DNS server with composable routers and handlers.
- Route requests by label, question type, or custom logic.
- Proxy requests through an upstream DNS client.
- Use either CommonJS `require()` or ESM `import`.
- No runtime dependencies outside Node.js built-in modules.

## Installation

```sh
npm install @jnode/dns
```

## Requirements

- Node.js with support for `node:` built-in module specifiers.
- Permission to bind the port you choose for the DNS server.

DNS commonly uses port `53`. On many operating systems, binding to port `53`
requires administrator or root privileges. During development, use a high port
such as `5353`.

## Quick Start

### Create a UDP DNS Server

```js
const {
    createServer,
    DnsPacket,
    DnsClient,
    routerConstructors: r,
    handlerConstructors: h
} = require('@jnode/dns');

const cloudflare = new DnsClient(DnsClient.SERVERS.CLOUDFLARE);

const registery = {
    localNode: (ctx) => {
        const question = ctx.packet.questions[0];

        ctx.respond({
            answers: [{
                aname: `${question.qname}.`,
                atype: DnsPacket.TYPE.A,
                aclass: question.qclass,
                ttl: 60,
                rdata: Buffer.from([127, 0, 0, 1])
            }]
        });
    },
    default: h.DnsClient(cloudflare),
    error: h.Error(DnsPacket.RCODE.SERVER_FAILURE)
};

const router = r.Label('default', {
    '@ A .node.j': 'localNode',
    '*': 'default'
});

const server = createServer(router, { registery });

server.on('error', console.error);
server.on('warn', console.warn);

server.listen(
    () => console.log('UDP DNS server listening on port 5353'),
    undefined,
    5353
);
```

Query it with:

```sh
dig @127.0.0.1 -p 5353 node.j A
dig @127.0.0.1 -p 5353 example.com A
```

`node.j` is answered locally with `127.0.0.1`. Other queries fall through to the
default handler, which forwards them to Cloudflare.

### Send a DNS Query

```js
const { DnsClient, DnsPacket } = require('@jnode/dns');

const client = new DnsClient(DnsClient.SERVERS.CLOUDFLARE);

const packet = new DnsPacket({
    rd: true,
    questions: [{
        qname: 'example.com',
        qtype: DnsPacket.TYPE.A,
        qclass: DnsPacket.CLASS.IN
    }]
});

client.query(packet).then((response) => {
    console.log(response.answers);
}, console.error);
```

## Importing

### CommonJS

```js
const {
    DnsPacket,
    DnsClient,
    createServer,
    DnsServer,
    LabelRouter,
    TypeRouter,
    FunctionRouter,
    LabelArgRouter,
    SetRegisteryRouter,
    ErrorHandler,
    PacketHandler,
    RecordHandler,
    DnsClientHandler
} = require('@jnode/dns');
```

### ESM

```js
import {
    DnsPacket,
    DnsClient,
    createServer,
    DnsServer,
    LabelRouter,
    TypeRouter,
    FunctionRouter,
    LabelArgRouter,
    SetRegisteryRouter,
    ErrorHandler,
    PacketHandler,
    RecordHandler,
    DnsClientHandler
} from '@jnode/dns';
```

## API Reference

### `DnsPacket`

`DnsPacket` represents a DNS message.

```js
const packet = new DnsPacket({
    id: 1234,
    qr: DnsPacket.QR.QUERY,
    opcode: DnsPacket.OPCODE.QUERY,
    aa: false,
    tc: false,
    rd: true,
    ra: false,
    rcode: DnsPacket.RCODE.NO_ERROR_CONDITION,
    questions: [],
    answers: [],
    authorities: [],
    additionals: []
});
```

### Static Constants

#### `DnsPacket.QR`

```js
DnsPacket.QR.QUERY
DnsPacket.QR.RESPONSE
```

#### `DnsPacket.OPCODE`

```js
DnsPacket.OPCODE.QUERY
DnsPacket.OPCODE.IQUERY
DnsPacket.OPCODE.STATUS
```

#### `DnsPacket.RCODE`

```js
DnsPacket.RCODE.NO_ERROR_CONDITION
DnsPacket.RCODE.FORMAT_ERROR
DnsPacket.RCODE.SERVER_FAILURE
DnsPacket.RCODE.NAME_ERROR
DnsPacket.RCODE.NOT_IMPLEMENTED
DnsPacket.RCODE.REFUSED
```

#### `DnsPacket.TYPE`

Includes common DNS type codes:

```js
DnsPacket.TYPE.A
DnsPacket.TYPE.NS
DnsPacket.TYPE.CNAME
DnsPacket.TYPE.SOA
DnsPacket.TYPE.PTR
DnsPacket.TYPE.MX
DnsPacket.TYPE.TXT
DnsPacket.TYPE.OPT
DnsPacket.TYPE['*']
```

The full exported type map also includes legacy and experimental values such as
`MD`, `MF`, `MB`, `MG`, `MR`, `NULL`, `WKS`, `HINFO`, `MINFO`, `AXFR`, `MAILB`,
and `MAILA`.

#### `DnsPacket.CLASS`

```js
DnsPacket.CLASS.IN
DnsPacket.CLASS.CS
DnsPacket.CLASS.CH
DnsPacket.CLASS.HS
DnsPacket.CLASS['*']
```

### `DnsPacket.from(buffer)`

Parses a DNS packet from a `Buffer`.

```js
const packet = DnsPacket.from(buffer);
```

Throws when the packet is shorter than a DNS header or when name compression
pointers recurse too deeply.

### `new DnsPacket(packet)`

Creates a packet. Missing fields receive defaults.

Default values:

| Field | Default |
| --- | --- |
| `id` | Random 16-bit identifier |
| `qr` | `DnsPacket.QR.QUERY` |
| `opcode` | `DnsPacket.OPCODE.QUERY` |
| `aa` | `false` |
| `tc` | `false` |
| `rd` | `true` |
| `ra` | `false` |
| `z` | `0` |
| `rcode` | `DnsPacket.RCODE.NO_ERROR_CONDITION` |
| `questions` | `[]` |
| `answers` | `[]` |
| `authorities` | `[]` |
| `additionals` | `[]` |

### `packet.toBuffer()`

Serializes a packet to a DNS wire-format `Buffer`.

```js
const buffer = packet.toBuffer();
```

The serializer currently emits the DNS header, question section, and answer
section.

### Question Shape

Questions use this object shape:

```js
{
    qname: 'example.com',
    qtype: DnsPacket.TYPE.A,
    qclass: DnsPacket.CLASS.IN
}
```

### Record Shape

Parsed answer, authority, and additional records use this object shape:

```js
{
    aname: 'example.com',
    atype: DnsPacket.TYPE.A,
    aclass: DnsPacket.CLASS.IN,
    ttl: 60,
    rdata: Buffer.from([127, 0, 0, 1])
}
```

`rdata` is raw DNS record data. This package does not decode or encode
type-specific record payloads for you.

For an `A` record, `rdata` is four bytes:

```js
Buffer.from([192, 0, 2, 1])
```

For many other record types, including `CNAME`, `MX`, and `TXT`, you must encode
the record data in DNS wire format yourself.

### Server API

### `createServer(router, options)`

Creates a `DnsServer`.

```js
const server = createServer(router, options);
```

This is equivalent to:

```js
const server = new DnsServer(router, options);
```

### `new DnsServer(router, options)`

Creates a DNS server.

```js
const server = new DnsServer(router, {
    maxRoutingSteps: 50,
    registery: {
        default: (ctx) => ctx.respond({ rcode: DnsPacket.RCODE.NOT_IMPLEMENTED }),
        error: (ctx) => ctx.respond({ rcode: DnsPacket.RCODE.SERVER_FAILURE })
    }
});
```

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `maxRoutingSteps` | `number` | `50` | Maximum number of router transitions before routing stops. |
| `registery` | `object` | `{}` | Named handler registry used when a router returns a string. |

The option name is spelled `registery` in the current API.

### `server.listen(udpCallback, tcpCallback, port)`

Starts the UDP socket and TCP listener on `port`.

```js
server.listen(
    () => console.log('UDP listening'),
    () => console.log('TCP listening'),
    5353
);
```

If `port` is omitted, the server uses port `53`.

### `server.close(udpCallback, tcpCallback)`

Closes the UDP socket.

```js
server.close(() => console.log('UDP closed'));
```

### Server Events

`DnsServer` extends `EventEmitter`.

| Event | Description |
| --- | --- |
| `udpListening` | Emitted when the UDP socket starts listening. |
| `error` | Emitted for UDP socket errors or handler failures. |
| `warn` | Emitted when the error handler itself fails. |

### Request Context

Handlers receive `ctx` and `env`.

```js
function handler(ctx, env) {
    ctx.respond({ rcode: DnsPacket.RCODE.NO_ERROR_CONDITION });
}
```

`ctx` contains:

| Property | Description |
| --- | --- |
| `packet` | The parsed incoming `DnsPacket`. |
| `respond(packetLike)` | Sends a DNS response. Accepts a `DnsPacket` or packet-like object. |
| `server` | The `DnsServer` instance. |
| `params` | Route parameters collected by routers. |
| `source` | Request source. UDP requests use `'udp'`. |
| `type` | First question `qtype`. |
| `class` | First question `qclass`. |

`env` contains routing state:

| Property | Description |
| --- | --- |
| `label` | Reversed query labels. `api.example.com` becomes `['com', 'example', 'api']`. |
| `labelPointer` | Current label index used by label routers. |
| `i` | Number of routing steps already performed. |
| `registery` | Named handler registry. |
| `error` | Error captured during error handling, when present. |

### Response Behavior

`ctx.respond()` automatically copies these fields from the incoming request:

- `id`
- `opcode`
- `rd`
- `questions`

It also sets `qr` to `DnsPacket.QR.RESPONSE`.

### Routers

Routers choose which handler runs for a request. A router can return:

- A function handler.
- An object with a `.handle(ctx, env)` method.
- A string key that resolves through `env.registery`.
- Another router object with a `.route(env, ctx)` method.
- `null` or `undefined`, which falls back to the default handler.

### `FunctionRouter`

Runs custom routing logic.

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.Function((env, ctx, ext) => {
    if (ctx.type === DnsPacket.TYPE.A) return 'a-record';
    return 'default';
}, { some: 'extra data' });
```

Constructor:

```js
new FunctionRouter(fn, ext)
```

The route function receives `(env, ctx, ext)`.

### `TypeRouter`

Routes by DNS question type.

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.Type({
    [DnsPacket.TYPE.A]: 'a-record',
    [DnsPacket.TYPE.TXT]: 'txt-record',
    '*': 'default'
});
```

Constructor:

```js
new TypeRouter(typeMap)
```

### `LabelRouter`

Routes by query labels. The server stores labels in reverse DNS order, so
`api.example.com` is matched as `com`, then `example`, then `api`.

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.Label('default', {
    '@ A .api.example.com': 'api-a-record',
    '@ .example.com': 'example-zone',
    '*': 'default'
});
```

Constructor:

```js
new LabelRouter(end, map)
```

Arguments:

| Argument | Description |
| --- | --- |
| `end` | Handler returned when no more labels are available. |
| `map` | Route map. |

Route key format:

```text
[@][TYPE] .domain.name
```

Parts:

| Part | Description |
| --- | --- |
| `@` | Match only when the full query name has been consumed. |
| `TYPE` | Optional DNS type name from `DnsPacket.TYPE`, such as `A` or `TXT`. |
| `.domain.name` | Domain name to match, prefixed with `.`. For example, `node.j` is written as `.node.j`. |

Examples:

| Key | Meaning |
| --- | --- |
| `'@ A .node.j'` | Match exactly `node.j` for `A` queries. |
| `'@ .node.j'` | Match exactly `node.j` for any query type. |
| `'A .node.j'` | Match `node.j` and subdomains for `A` queries. |
| `'*'` | Fallback route. |

Dynamic label parameters use `%:name`:

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.Label('default', {
    '@ A .%:host.example.com': (ctx) => {
        console.log(ctx.params.host);
        ctx.respond({ rcode: DnsPacket.RCODE.NO_ERROR_CONDITION });
    }
});
```

### `LabelArgRouter`

Reads the current label into `ctx.params` and returns the next route.

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.LabelArg('host', 'next-handler');
```

Constructor:

```js
new LabelArgRouter(paramName, next)
```

### `SetRegisteryRouter`

Merges named handlers into `env.registery` and returns the next route.

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.SetRegistery({
    found: (ctx) => ctx.respond({ rcode: DnsPacket.RCODE.NO_ERROR_CONDITION })
}, 'found');
```

Constructor:

```js
new SetRegisteryRouter(registery, next)
```

### `routerConstructors`

Factory helpers for all router classes:

```js
const {
    DnsPacket,
    routerConstructors: r
} = require('@jnode/dns');

const router = r.Type({
    [DnsPacket.TYPE.A]: 'a-record',
    '*': 'default'
});
```

Available factories:

```js
r.Label(end, map)
r.Type(typeMap)
r.Function(fn, ext)
r.LabelArg(paramName, next)
r.SetRegistery(registery, next)
```

### Handlers

Handlers produce DNS responses. A handler can be a plain function:

```js
function handler(ctx, env) {
    ctx.respond({ rcode: DnsPacket.RCODE.NO_ERROR_CONDITION });
}
```

Or an object with a `handle()` method:

```js
const handler = {
    handle(ctx, env) {
        ctx.respond({ rcode: DnsPacket.RCODE.NO_ERROR_CONDITION });
    }
};
```

### `ErrorHandler`

Responds with a DNS response code.

```js
const {
    DnsPacket,
    handlerConstructors: h
} = require('@jnode/dns');

const handler = h.Error(DnsPacket.RCODE.REFUSED);
```

Constructor:

```js
new ErrorHandler(rcode)
```

Default `rcode` is `DnsPacket.RCODE.SERVER_FAILURE`.

### `PacketHandler`

Responds with a specific packet.

```js
const {
    DnsPacket,
    handlerConstructors: h
} = require('@jnode/dns');

const handler = h.Packet({
    rcode: DnsPacket.RCODE.REFUSED
});
```

Constructor:

```js
new PacketHandler(packet)
```

`packet` may be a `DnsPacket` instance or a packet-like object.

### `RecordHandler`

Creates a handler from raw record data.

```js
const { handlerConstructors: h } = require('@jnode/dns');

const handler = h.Record(Buffer.from([127, 0, 0, 1]));
```

Constructor:

```js
new RecordHandler(rdata)
```

If `rdata` is a string, it is converted with `Buffer.from(rdata)`.

### `DnsClientHandler`

Forwards the incoming request to an upstream `DnsClient` and responds with the
upstream response.

```js
const {
    DnsClient,
    handlerConstructors: h
} = require('@jnode/dns');

const client = new DnsClient(DnsClient.SERVERS.GOOGLE);
const handler = h.DnsClient(client);
```

Constructor:

```js
new DnsClientHandler(client)
```

If no client is provided, a shared Cloudflare client is used.

Because forwarded responses are parsed and then serialized again, this handler
is subject to the packet serializer limitations listed below.

### `handlerConstructors`

Factory helpers for all handler classes:

```js
const {
    DnsPacket,
    handlerConstructors: h
} = require('@jnode/dns');

const handler = h.Error(DnsPacket.RCODE.REFUSED);
```

Available factories:

```js
h.Error(rcode)
h.Packet(packet)
h.Record(rdata)
h.DnsClient(client)
```

### DNS Client API

### `new DnsClient(server, options)`

Creates a DNS client.

```js
const client = new DnsClient(DnsClient.SERVERS.CLOUDFLARE, {
    timeout: 2500,
    tries: 3,
    alwaysTcp: false,
    autoTcp: true,
    maxQueries: 128
});
```

`server` can be:

- A DNS server IP string, such as `'1.1.1.1'`.
- An array of DNS server IP strings.
- Omitted, which uses Cloudflare.

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `timeout` | `number` | `2500` | Query timeout in milliseconds. |
| `tries` | `number` | `3` | Number of attempts per upstream server. |
| `alwaysTcp` | `boolean` | `false` | Use TCP for every query. |
| `autoTcp` | `boolean` | `true` | Retry with TCP when a UDP response is truncated. |
| `maxQueries` | `number` | `128` | Maximum number of pending UDP queries. |

### `client.query(packet, options)`

Sends a DNS query and resolves with a `DnsPacket` response.

```js
const response = await client.query(packet);
```

Options:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `forceTcp` | `boolean` | `false` | Use TCP for this query. |

The client tries each configured upstream server. For each server, it retries up
to `tries` times before moving on to the next server. If all attempts fail, the
last error is thrown.

### Built-in DNS Servers

```js
DnsClient.SERVERS.CLOUDFLARE
DnsClient.SERVERS.CLOUDFLARE_BLOCK_MALWARE
DnsClient.SERVERS.CLOUDFLARE_BLOCK_MALWARE_AND_ADULT_CONTENT
DnsClient.SERVERS.GOOGLE
DnsClient.SERVERS.QUAD9
DnsClient.SERVERS.QUAD9_SECURED
DnsClient.SERVERS.QUAD9_UNSECURED
DnsClient.SERVERS.ADGUARD
DnsClient.SERVERS.ADGUARD_NO_FILTERING
DnsClient.SERVERS.ADGUARD_FAMILY_PROTECTION
```

Each value is an array of resolver IP addresses.

## Complete Examples

### Custom Domain with Cloudflare Fallback

This server resolves `node.j` `A` queries to `127.0.0.1`. Every other query
falls through to the default handler and is forwarded to Cloudflare.

```js
const {
    createServer,
    DnsPacket,
    DnsClient,
    routerConstructors: r,
    handlerConstructors: h
} = require('@jnode/dns');

const cloudflare = new DnsClient(DnsClient.SERVERS.CLOUDFLARE);

const registery = {
    node: (ctx) => {
        const question = ctx.packet.questions[0];

        ctx.respond({
            answers: [{
                aname: `${question.qname}.`,
                atype: DnsPacket.TYPE.A,
                aclass: question.qclass,
                ttl: 60,
                rdata: Buffer.from([127, 0, 0, 1])
            }]
        });
    },
    default: h.DnsClient(cloudflare),
    error: h.Error(DnsPacket.RCODE.SERVER_FAILURE)
};

const router = r.Label('default', {
    '@ A .node.j': 'node',
    '*': 'default'
});

const server = createServer(router, { registery });

server.on('error', console.error);
server.listen(() => {
    console.log('DNS server listening on UDP port 5353');
}, undefined, 5353);
```

### Type-based Server

```js
const {
    createServer,
    DnsPacket,
    routerConstructors: r,
    handlerConstructors: h
} = require('@jnode/dns');

const registery = {
    a: (ctx) => {
        ctx.respond({ rcode: DnsPacket.RCODE.REFUSED });
    },
    default: (ctx) => {
        ctx.respond({ rcode: DnsPacket.RCODE.NOT_IMPLEMENTED });
    },
    error: h.Error(DnsPacket.RCODE.SERVER_FAILURE)
};

const router = r.Type({
    [DnsPacket.TYPE.A]: 'a',
    '*': 'default'
});

const server = createServer(router, { registery });
server.listen(() => console.log('Listening on UDP port 5353'), undefined, 5353);
```

### Label-based Server

```js
const {
    createServer,
    DnsPacket,
    routerConstructors: r,
    handlerConstructors: h
} = require('@jnode/dns');

const router = r.Label('default', {
    '@ A .node.j': 'node',
    '*': 'default'
});

const server = createServer(router, {
    registery: {
        node: (ctx) => {
            const question = ctx.packet.questions[0];

            ctx.respond({
                answers: [{
                    aname: `${question.qname}.`,
                    atype: DnsPacket.TYPE.A,
                    aclass: question.qclass,
                    ttl: 60,
                    rdata: Buffer.from([127, 0, 0, 1])
                }]
            });
        },
        default: (ctx) => {
            ctx.respond({ rcode: DnsPacket.RCODE.NAME_ERROR });
        },
        error: h.Error(DnsPacket.RCODE.SERVER_FAILURE)
    }
});

server.listen(() => console.log('Listening on UDP port 5353'), undefined, 5353);
```

## Implementation Notes and Limitations

- UDP server requests are handled. The server creates a TCP listener, but TCP DNS
  request handling is not currently implemented.
- `server.close()` currently closes the UDP socket.
- DNS `rdata` is treated as raw bytes. Type-specific record helpers are not
  included.
- `DnsPacket.toBuffer()` serializes questions and answers. Authority and
  additional record serialization is not currently implemented.
- `DnsPacket.toBuffer()` currently has a name-compression serialization bug when
  an answer name reuses a previously serialized label suffix, such as the same
  name used in the question.
- The code uses the public spelling `registery`; use that spelling in options
  and routers.
- DNS name compression is parsed. Serialization is intended for straightforward
  packets and may not compress names.

## Development

Clone the repository and run:

```sh
npm install
npm test
```

The current test script prints a package smoke-test message.

## License

MIT License. See [LICENSE](./LICENSE).
