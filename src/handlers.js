/*
@jnode/dns/handlers.js

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// dependencies
const DnsPacket = require('./packet.js');
const DnsClient = require('./client.js');

// error handler: respond with rcode
class ErrorHandler {
    constructor(rcode = DnsPacket.RCODE.SERVER_FAILURE) {
        this.packet = new DnsPacket({ rcode });
    }

    handle(ctx, env) {
        return ctx.respond(this.packet);
    }
}

// packet handler: send specific packet
class PacketHandler {
    constructor(packet) {
        if (!(packet instanceof DnsPacket)) packet = new DnsPacket(packet);
        this.packet = packet;
    }

    handle(ctx, env) {
        return ctx.respond(this.packet);
    }
}

// record handler: send a record's rdata
class RecordHandler {
    constructor(rdata = '') {
        if (typeof rdata === 'string') rdata = Buffer.from(rdata);
        this.packet = new DnsPacket({
            answers: [{ rdata }]
        });
    }

    handle(ctx, env) {
        if (!ctx.class) return ctx.respond({ rcode: DnsPacket.RCODE.NOT_IMPLEMENTED });
        this.packet.answers[0].type = ctx.type;
        this.packet.answers[0].class = ctx.class;
        return ctx.respond(this.packet);
    }
}

// dns client handler: use a dns client to handle the request
class DnsClientHandler {
    static defaultClient = new DnsClient(DnsClient.SERVERS.CLOUDFLARE, { autoTcp: false });

    constructor(client = DnsClientHandler.defaultClient) {
        client.autoTcp = false;
        this.client = client;
    }

    async handle(ctx, env) {
        return ctx.respond(await this.client.query(ctx.packet, { forceTcp: ctx.source === 'tcp' }));
    }
}

// export
module.exports = {
    ErrorHandler, PacketHandler, RecordHandler, DnsClientHandler,
    handlerConstructors: {
        Error: (rcode) => new ErrorHandler(rcode),
        Packet: (packet) => new PacketHandler(packet),
        Record: (rdata) => new RecordHandler(rdata),
        DnsClient: (client) => new DnsClientHandler(client)
    }
};