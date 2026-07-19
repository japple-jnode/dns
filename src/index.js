/*
@jnode/dns

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// export
module.exports = {
    DnsPacket: require('./packet.js'),
    ...require('./server.js'),
    DnsClient: require('./client.js'),
    ...require('./routers.js'),
    ...require('./handlers.js')
};