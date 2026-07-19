/*
@jnode/dns/udp-dns-packet.js

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// dependencies
const crypto = require('node:crypto');

// DNS packet
class DnsPacket {
    static QR = {
        QUERY: 0,
        RESPONSE: 1
    };

    static OPCODE = {
        QUERY: 0,
        IQUERY: 1,
        STATUS: 2
    };

    static RCODE = {
        NO_ERROR_CONDITION: 0,
        FORMAT_ERROR: 1,
        SERVER_FAILURE: 2,
        NAME_ERROR: 3,
        NOT_IMPLEMENTED: 4,
        REFUSED: 5
    };

    static TYPE = {
        A: 1, // a host address
        NS: 2, // an authoritative name server
        MD: 3, // a mail destination (Obsolete - use MX)
        MF: 4, // a mail forwarder (Obsolete - use MX)
        CNAME: 5, // the canonical name for an alias
        SOA: 6, // marks the start of a zone of authority
        MB: 7, // a mailbox domain name (EXPERIMENTAL)
        MG: 8, // a mail group member (EXPERIMENTAL)
        MR: 9, // a mail rename domain name (EXPERIMENTAL)
        NULL: 10, // a null RR (EXPERIMENTAL)
        WKS: 11, // a well known service description
        PTR: 12, // a domain name pointer
        HINFO: 13, // host information
        MINFO: 14, // mailbox or mail list information
        MX: 15, // mail exchange
        TXT: 16, // text strings

        // OPT
        OPT: 41, // OPT pseudo-RR

        // QCLASS only
        AXFR: 252, // a request for a transfer of an entire zone
        MAILB: 253, // a request for mailbox-related records (MB, MG or MR)
        MAILA: 254, // a request for mail agent RRs (Obsolete - see MX)
        '*': 255 // any type
    };

    static CLASS = {
        IN: 1, // the Internet
        CS: 2, // the CSNET class (Obsolete - used only for examples in some obsolete RFCs)
        CH: 3, // the CHAOS class
        HS: 4, // Hesiod [Dyer 87]

        // QCLASS only
        '*': 255 // any class
    };

    static from(buf) {
        const packet = {};

        // verify length
        if (buf.length < 12) throw new Error('Invalid DNS packet length');

        // offset
        let offset = 12;

        // header
        packet.id = buf.readUInt16BE(0);
        packet.qr = (buf[2] & 0x80) >> 7;
        packet.opcode = (buf[2] & 0x78) >> 3;
        packet.aa = (buf[2] & 0x04) >> 2;
        packet.tc = (buf[2] & 0x02) >> 1;
        packet.rd = buf[2] & 0x01;
        packet.ra = (buf[3] & 0x80) >> 7;
        packet.z = (buf[3] & 0x70) >> 4;
        packet.rcode = buf[3] & 0x0F;

        // question section
        const qdcount = buf.readUInt16BE(4);
        packet.questions = [];
        for (let i = 0; i < qdcount; i++) {
            let qname = [];
            let pointer = offset;
            let jumps = 0;
            while (true) {
                const len = buf[pointer++];

                if (len === 0) {
                    if (!jumps) offset = pointer;
                    break;
                }

                if (len >> 6 === 0b11) {
                    if (!jumps) offset = pointer + 1;
                    if (jumps > 5) throw new Error('Too many jumps in DNS packet');
                    pointer = ((len & 0b111111) << 8) + buf[pointer++];
                    jumps++;
                    continue;
                }

                qname.push(buf.toString('ascii', pointer, pointer += len));
            }

            const qtype = buf.readUInt16BE(offset);
            offset += 2;

            const qclass = buf.readUInt16BE(offset);
            offset += 2;

            packet.questions.push({ qname: qname.join('.'), qtype, qclass });
        }

        // anser, authority records, and additional records section
        packet.answers = [];
        packet.authorities = [];
        packet.additionals = [];
        for (let i = 0; i < 3; i++) {
            let count;
            switch (i) {
                case 0: count = buf.readUInt16BE(6); break;
                case 1: count = buf.readUInt16BE(8); break;
                case 2: count = buf.readUInt16BE(10); break;
            }

            let target;
            switch (i) {
                case 0: target = packet.answers; break;
                case 1: target = packet.authorities; break;
                case 2: target = packet.additionals; break;
            }

            for (let i = 0; i < count; i++) {
                let aname = [];
                let pointer = offset;
                let jumps = 0;
                while (true) {
                    const len = buf[pointer++];

                    if (len === 0) {
                        if (!jumps) offset = pointer;
                        break;
                    }

                    if (len >> 6 === 0b11) {
                        if (!jumps) offset = pointer + 1;
                        if (jumps > 5) throw new Error('Too many jumps in DNS packet');
                        pointer = ((len & 0b111111) << 8) + buf[pointer++];
                        jumps++;
                        continue;
                    }

                    aname.push(buf.toString('ascii', pointer, pointer += len));
                }

                const atype = buf.readUInt16BE(offset);
                offset += 2;

                const aclass = buf.readUInt16BE(offset);
                offset += 2;

                const ttl = buf.readUInt32BE(offset);
                offset += 4;

                const rdlength = buf.readUInt16BE(offset);
                offset += 2;

                const rdata = buf.slice(offset, offset + rdlength);
                offset += rdlength;

                target.push({ aname: aname.join('.'), atype, aclass, ttl, rdata });
            }
        }

        return new DnsPacket(packet);
    }

    constructor(packet = {}) {
        // header
        this.id = packet.id ?? crypto.randomBytes(2).readUInt16BE(0); // identifier
        this.qr = packet.qr ?? DnsPacket.QR.QUERY; // query or response
        this.opcode = packet.opcode ?? DnsPacket.OPCODE.QUERY; // opcode
        this.aa = packet.aa ?? false; // authoritative answer
        this.tc = packet.tc ?? false; // truncation
        this.rd = packet.rd ?? true; // recursion desired
        this.ra = packet.ra ?? false; // recursion available
        this.z = 0; // reserved
        this.rcode = packet.rcode ?? DnsPacket.RCODE.NO_ERROR_CONDITION; // response code

        // question section
        this.questions = packet.questions ?? [];

        // anser section
        this.answers = packet.answers ?? [];

        // authority records section
        this.authorities = packet.authorities ?? [];

        // additional records section
        this.additionals = packet.additionals ?? [];
    }

    // generate buffer from packet data
    toBuffer() {
        const buf = Buffer.alloc(512); // pre allocate max DNS packet size
        let offset = 12; // header size

        // header
        buf.writeUInt16BE(this.id, 0);
        buf[2] = (this.qr << 7) | (this.opcode << 3) | (this.aa << 2) | (this.tc << 1) | this.rd;
        buf[3] = (this.ra << 7) | (this.z << 4) | this.rcode;
        buf.writeUInt16BE(this.questions.length, 4);
        buf.writeUInt16BE(this.answers.length, 6);
        buf.writeUInt16BE(this.authorities.length, 8);
        buf.writeUInt16BE(this.additionals.length, 10);

        // registery of label parts
        const labelRegistry = new Map();

        // question section
        for (const question of this.questions) {
            const qnameParts = question.qname.split('.');
            for (let i = 0; i < qnameParts.length; i++) {
                const lastParts = qnameParts.slice(i).join('.');

                if (labelRegistry.has(lastParts)) {
                    const len = (0b11000000 << 8) | labelRegistry.get(lastParts);
                    buf.writeUInt16BE(len, offset);
                    offset++;
                    break;
                }

                labelRegistry.set(lastParts, offset);

                buf[offset++] = qnameParts[i].length;
                buf.write(qnameParts[i], offset, 'ascii');
                offset += qnameParts[i].length;
            }
            if (buf[offset] === 0) offset++; // end

            buf.writeUInt16BE(question.qtype, offset);
            offset += 2;

            buf.writeUInt16BE(question.qclass, offset);
            offset += 2;
        }

        // answer section
        for (const answer of this.answers) {
            const anameParts = answer.aname.split('.');
            for (let i = 0; i < anameParts.length; i++) {
                const lastParts = anameParts.slice(i).join('.');

                if (labelRegistry.has(lastParts)) {
                    const len = (0b11000000 << 8) | labelRegistry.get(lastParts);
                    buf.writeUInt16BE(len, offset);
                    offset++;
                    break;
                }

                labelRegistry.set(lastParts, offset);

                buf[offset++] = anameParts[i].length;
                buf.write(anameParts[i], offset, 'ascii');
                offset += anameParts[i].length;
            }
            if (buf[offset] === 0) offset++; // end

            buf.writeUInt16BE(answer.atype, offset);
            offset += 2;

            buf.writeUInt16BE(answer.aclass, offset);
            offset += 2;

            buf.writeUInt32BE(answer.ttl, offset);
            offset += 4;

            buf.writeUInt16BE(answer.rdata.length, offset);
            offset += 2;

            answer.rdata.copy(buf, offset);
            offset += answer.rdata.length;
        }

        return buf.slice(0, offset); // clean up and return
    }
}

// export
module.exports = DnsPacket;