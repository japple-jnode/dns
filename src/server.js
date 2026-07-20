/*
@jnode/dns/server.js

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// dependencies
const dgram = require('node:dgram');
const net = require('node:net');
const EventEmitter = require('node:events');
const DnsPacket = require('./packet.js');

// default handler
function defaultHandler(ctx, env) {
    return ctx.respond({ rcode: DnsPacket.RCODE.NOT_IMPLEMENTED });
}

// error handler
function errorHandler(ctx, env) {
    return ctx.respond({ rcode: DnsPacket.RCODE.SERVER_FAILURE });
}


// create DNS server
function createServer(map, options = {}) {
    return new DnsServer(map, options);
}

// DNS server
class DnsServer extends EventEmitter {
    constructor(router, options = {}) {
        super();

        this.router = router;
        this.options = options;

        this.udpServer = dgram.createSocket('udp4');
        this.tcpServer = net.createServer();

        // UDP server setup
        this.udpServer.on('error', (err) => this.emit('error', err));
        this.udpServer.on('listening', () => this.emit('udpListening'));
        this.udpServer.on('message', async (msg, rinfo) => {
            // parse packet
            let packet;
            try { packet = DnsPacket.from(msg); } catch { return; }

            // ignore weird packets
            if (packet.qr !== 0) return;

            // send dns packet function
            const respond = (pack = {}) => {
                if (!(pack instanceof DnsPacket)) pack = new DnsPacket(pack);
                pack.id = packet.id;
                pack.qr = DnsPacket.QR.RESPONSE;
                pack.opcode = packet.opcode;
                pack.rd = packet.rd;
                pack.questions = packet.questions;
                this.udpServer.send(pack.toBuffer(), rinfo.port, rinfo.address);
            };

            // verify packet format
            if (packet.questions > 1) return await respond({ rcode: DnsPacket.RCODE.FORMAT_ERROR });

            // ctx object
            const ctx = {
                packet, respond, server: this, params: {}, source: 'udp',
                name: packet.questions[0]?.qname,
                type: packet.questions[0]?.qtype,
                class: packet.questions[0]?.qclass,
                remote: {
                    address: rinfo.address,
                    port: rinfo.port
                }
            };

            // env object
            const env = {
                label: packet.questions[0]?.qname ? packet.questions[0].qname.split('.').filter(Boolean).reverse() : [],
                labelPointer: 0
            };

            let handler;
            try {
                handler = await DnsServer.route(this.router, env, ctx, this.options);
                handler ??= 'default';
            } catch (err) { // error while routing
                env.error = e;
                this.emit('error', err, env, ctx);
                handler = 'error';
            }

            await DnsServer.handle(handler, env, ctx, this.options);
        });

        // tcp server setup
        this.tcpServer.on('error', (err) => this.emit('error', err));
        this.tcpServer.on('listening', () => this.emit('tcpListening'));
        this.tcpServer.on('connection', (socket) => {
            let len = null;
            socket.on('readable', async () => {
                while (true) {
                    if (len === null) {
                        const lenBuf = socket.read(2);
                        if (!lenBuf) break;
                        len = lenBuf.readUInt16BE();
                        continue;
                    } else {
                        const data = socket.read(len);
                        if (!data) break;

                        len = null;

                        // parse packet
                        let packet;
                        try { packet = DnsPacket.from(data); } catch (e) { console.error(e); return; }

                        // ignore weird packets
                        if (packet.qr !== 0) return;

                        // send dns packet function
                        const respond = (pack = {}) => {
                            if (!(pack instanceof DnsPacket)) pack = new DnsPacket(pack);
                            pack.id = packet.id;
                            pack.qr = DnsPacket.QR.RESPONSE;
                            pack.opcode = packet.opcode;
                            pack.rd = packet.rd;
                            pack.questions = packet.questions;

                            const buf = pack.toBuffer();
                            const len = Buffer.allocUnsafe(2);
                            len.writeUInt16BE(buf.length);
                            socket.write(len);
                            socket.end(buf);
                        };

                        // verify packet format
                        if (packet.questions > 1) return await respond({ rcode: DnsPacket.RCODE.FORMAT_ERROR });

                        // ctx object
                        const ctx = {
                            packet, respond, server: this, params: {}, source: 'tcp',
                            name: packet.questions[0]?.qname,
                            type: packet.questions[0]?.qtype,
                            class: packet.questions[0]?.qclass,
                            remote: {
                                address: socket.remoteAddress,
                                port: socket.remotePort
                            }
                        };

                        // env object
                        const env = {
                            label: packet.questions[0]?.qname ? packet.questions[0].qname.split('.').filter(Boolean).reverse() : [],
                            labelPointer: 0
                        };

                        let handler;
                        try {
                            handler = await DnsServer.route(this.router, env, ctx, this.options);
                            handler ??= 'default';
                        } catch (err) { // error while routing
                            env.error = e;
                            this.emit('error', err, env, ctx);
                            handler = 'error';
                        }

                        await DnsServer.handle(handler, env, ctx, this.options);
                        socket.destroySoon();

                        return;
                    }

                    break;
                }
            });

            socket.on('error', (err) => {
                socket.destroy();
            });
        });
    }

    // route
    static async route(router, env = {}, ctx = {}, options = {}) {
        let r = router;
        env.i ??= 0;

        while (typeof r?.route === 'function') {
            env.i++;
            if (env.i > (options.maxRoutingSteps || 50)) return 2;
            r = await r.route(env, ctx);
        }

        return r;
    }

    // handle
    static async handle(handler, env = {}, ctx = {}, options = {}) {
        env.registery ??= options.registery ?? {};
        env.registery.default ??= options.registery?.default ?? defaultHandler;
        env.registery.error ??= options.registery?.error ?? defaultHandler;

        try {
            if (typeof handler?.handle === 'function') { // classical handler
                await handler.handle(ctx, env);
            } else if (typeof handler === 'function') { // direct function handler
                await handler(ctx, env);
            } else if (typeof handler === 'string') { // registery handler
                const code = handler;
                handler = env.registery[code] ?? env.registery.default;

                if (typeof handler?.handle === 'function') { // classical handler
                    await handler.handle(ctx, env);
                } else if (typeof handler === 'function') { // direct function handler
                    await handler(ctx, env);
                } else {
                    await defaultHandler(ctx, env);
                }
            } else {
                throw new Error('Invalid handler returned from router.');
            }
        } catch (err) {
            ctx.server.emit('error', err, env, ctx);

            env.error = err;
            handler = env.registery.error;

            try {
                if (typeof handler?.handle === 'function') { // classical handler
                    await handler.handle(ctx, env);
                } else if (typeof handler === 'function') { // direct function handler
                    await handler(ctx, env);
                } else {
                    await errorHandler(ctx, env);
                }
            } catch (err) {
                ctx.server.emit('warn', err, env, ctx);
                try { await errorHandler(ctx, env); } catch { }
            }
        }
    }

    listen(udpCb, tcpCb, port = 53) {
        this.udpServer.bind(port, udpCb);
        this.tcpServer.listen(port, tcpCb);
    }

    close(udpCb, tcpCb) {
        this.udpServer.close(udpCb);
    }
}

// export
module.exports = {
    defaultHandler, errorHandler, createServer, DnsServer
};

// -------- example --------
// const server = createServer({
//     route: (env, ctx) => {
//         console.log(ctx.packet);
//         return 'default';
//     }
// });
// server.on('error', console.error);
// server.on('warn', console.warn);
// server.listen(() => console.log('UDP server started.'), () => console.log('TCP server started.'));