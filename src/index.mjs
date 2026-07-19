/*
@jnode/dns
esm export

Simple DNS server package for Nodejs.

by Codex (ESM exporting)
*/

import DnsPacket from './packet.js';
import server from './server.js';
import DnsClient from './client.js';
import routers from './routers.js';
import handlers from './handlers.js';

const {
    defaultHandler,
    errorHandler,
    createServer,
    DnsServer
} = server;

const {
    LabelRouter,
    TypeRouter,
    FunctionRouter,
    LabelArgRouter,
    SetRegisteryRouter,
    routerConstructors
} = routers;

const {
    ErrorHandler,
    PacketHandler,
    RecordHandler,
    DnsClientHandler,
    handlerConstructors
} = handlers;

export {
    DnsPacket,
    defaultHandler,
    errorHandler,
    createServer,
    DnsServer,
    DnsClient,
    LabelRouter,
    TypeRouter,
    FunctionRouter,
    LabelArgRouter,
    SetRegisteryRouter,
    routerConstructors,
    ErrorHandler,
    PacketHandler,
    RecordHandler,
    DnsClientHandler,
    handlerConstructors
};

export default {
    DnsPacket,
    defaultHandler,
    errorHandler,
    createServer,
    DnsServer,
    DnsClient,
    LabelRouter,
    TypeRouter,
    FunctionRouter,
    LabelArgRouter,
    SetRegisteryRouter,
    routerConstructors,
    ErrorHandler,
    PacketHandler,
    RecordHandler,
    DnsClientHandler,
    handlerConstructors
};
