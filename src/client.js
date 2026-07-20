/*
@jnode/dns/client.js

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// dependencies
const dgram = require('node:dgram');
const net = require('node:net');
const crypto = require('node:crypto');
const DnsPacket = require('./packet.js');

// dns client
class DnsClient {
    static SERVERS = {
        CLOUDFLARE: ['1.1.1.1', '1.0.0.1'],
        CLOUDFLARE_BLOCK_MALWARE: ['1.1.1.2', '1.0.0.2'],
        CLOUDFLARE_BLOCK_MALWARE_AND_ADULT_CONTENT: ['1.1.1.3', '1.0.0.3'],
        GOOGLE: ['8.8.8.8', '8.8.4.4'],
        QUAD9: ['9.9.9.9', '149.112.112.112'],
        QUAD9_SECURED: ['9.9.9.11', '149.112.112.11'],
        QUAD9_UNSECURED: ['9.9.9.10', '149.112.112.10'],
        ADGUARD: ['94.140.14.14', '94.140.15.15'],
        ADGUARD_NO_FILTERING: ['94.140.14.140', '94.140.14.141'],
        ADGUARD_FAMILY_PROTECTION: ['94.140.14.15', '94.140.15.16']
    };

    constructor(server, options = {}) {
        if (Array.isArray(server)) this.servers = server.length > 0 ? server : DnsClient.SERVERS.CLOUDFLARE;
        else if (typeof server === 'string') this.servers = [server];
        else this.servers = DnsClient.SERVERS.CLOUDFLARE;

        // options
        this.timeout = options.timeout || 2500;
        this.tries = options.tries || 3;
        this.alwaysTcp = options.alwaysTcp ?? false;
        this.maxQueries = options.maxQueries || 128;
        this.autoTcp = options.autoTcp ?? true;

        // set up queries map
        // key format: '<ID> <SERVER_IP>'
        this.queries = new Map();

        // create udp client
        this.udpClient = dgram.createSocket('udp4');
        this.udpClient.on('message', (msg, rinfo) => {
            // basic check
            if (rinfo.port !== 53) return;
            if (!this.servers.includes(rinfo.address)) return;

            // parse packet
            let packet;
            try { packet = DnsPacket.from(msg); } catch (e) { return; }

            // ignore weird packets
            if (packet.qr !== 1) return;

            // get key
            const key = `${packet.id} ${rinfo.address}`;

            // check if key is registed
            if (!this.queries.has(key)) return;

            // run handle function
            this.queries.get(key)(packet);
        });
    }

    async query(packet, options = {}) {
        let e;
        for (let server of this.servers) {
            for (let i = 0; i < this.tries; i++) {
                try {
                    if (this.alwaysTcp || options.forceTcp) {
                        return await this._tcpQuery(server, packet);
                    } else {
                        let p = await this._udpQuery(server, packet);

                        // switch to tcp
                        if (p.tc && this.autoTcp) {
                            return await this._tcpQuery(server, packet);
                        }

                        return p;
                    }
                } catch (err) { e = err; }
            }
        }
        throw e;
    }

    _udpQuery(server, packet) {
        return new Promise((resolve, reject) => {
            // map too large check
            if (this.queries.size >= this.maxQueries) throw new Error('Too many queries in this client');

            // remember and reroll packet id if needed
            const packetId = packet.id;
            while (this.queries.has(`${packet.id} ${server}`)) {
                packet.id = crypto.randomBytes(2).readUInt16BE();
            }

            // set key
            const key = `${packet.id} ${server}`;

            // declare timer
            let timer;

            // handler
            const handler = (packet) => {
                // remove from registery
                this.queries.delete(key);

                // clear timeout
                clearTimeout(timer);

                // no packet provided means timeout or force clear
                if (!packet) {
                    reject(new Error('Query timeout or force cleared'));
                    return;
                }

                // set the id back
                packet.id = packetId;

                // resolve
                resolve(packet);
            };

            // add to registery
            this.queries.set(key, handler);

            // send packet
            this.udpClient.send(packet.toBuffer(), 53, server);

            // set timer
            timer = setTimeout(handler, this.timeout);
        });
    }

    _tcpQuery(server, packet) {
        return new Promise((resolve, reject) => {
            let resolved = false;
            const socket = net.createConnection(53, server);

            // declare timer
            let timer;

            socket.on('ready', () => {
                const buf = packet.toBuffer();
                const len = Buffer.allocUnsafe(2);
                len.writeUInt16BE(buf.length);
                socket.write(len);
                socket.end(buf);
                timer = setTimeout(() => {
                    // end socket with error
                    resolved = true;
                    socket.destroy(new Error('DNS over TCP timeout'));
                }, this.timeout);
            });

            let len = null;
            socket.on('readable', () => {
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
                        let pack;
                        try { pack = DnsPacket.from(data); } catch (e) { return; }

                        // ignore weird packets
                        if (pack.qr !== 1) continue;

                        // ignore wrong id
                        if (pack.id !== packet.id) continue;

                        // end socket and resolve
                        socket.destroy();
                        resolved = true;
                        resolve(pack);

                        continue;
                    }

                    break;
                }
            });

            socket.once('close', () => {
                if (resolved) return;
                reject(new Error('TCP socket closed before received response'));
            });

            socket.on('error', (err) => {
                reject(err);
            });
        });
    }
}

// export
module.exports = DnsClient;

// -------- example --------
// const client = new DnsClient();
// const p = new DnsPacket({ rd: 1, questions: [{ qname: 'google.com', qtype: DnsPacket.TYPE.A, qclass: DnsPacket.CLASS.IN }] });
// console.log('query', p);
// client.query(p).then((packet) => {
//     console.log('response', packet);
// }, console.error);