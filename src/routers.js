/*
@jnode/dns/routers.js

Simple DNS server package for Nodejs.

by JNode Dev Team / JustApple
*/

// dependencies
const DnsPacket = require('./packet.js');

// label router: routes the request by label (domain)
class LabelRouter {
    constructor(end = 'default', map = {}) {
        this.end = end;

        // parse map
        this.map = {};
        for (let [key, value] of Object.entries(map)) {
            // any path segment
            if (key === '*') {
                this.map['*'] = value;
                continue;
            }

            key = key.trimStart();

            const firstDotIndex = key.indexOf('.');
            if (firstDotIndex === -1) continue;

            // key format: '[@ (domain end check)][TYPE (type check)].label.segments'
            // example: '@ A .com.example', '@ .com.example', '.localhost'
            const routeEnd = key.startsWith('@');
            const routeType = DnsPacket.TYPE[key.substring(routeEnd ? 1 : 0, firstDotIndex).trim()];
            const routeLabel = key.substring(firstDotIndex).split('.').slice(1)

            // expand map
            let current = this.map;
            let args = [];
            for (let segment of routeLabel) {
                if (segment.startsWith('%:')) {
                    args.push(segment.substring(2));
                    if (!current[':']) current[':'] = {};
                    current = current[':'];
                    continue;
                }

                segment = '/' + decodeURIComponent(segment);
                if (!current[segment]) current[segment] = {};
                current = current[segment];
            }

            // '*' for non-end check, '@' for end check
            // '*' for any type, 'TYPE' for specific type
            if (!current[routeEnd ? '@' : '*']) current[routeEnd ? '@' : '*'] = {};
            current[routeEnd ? '@' : '*'][routeType || '*'] = value;
            if (args.length > 0) current[routeEnd ? '@' : '*']['::' + (routeType || '*')] = args;
        }
    }

    route(env, ctx) {
        if (env.labelPointer >= env.label.length) return this.end;

        let result = this.map['*'];
        let resultPointer = env.labelPointer;
        let current = this.map;
        let currentArgs = [];
        let resultArgNames;
        while (env.labelPointer < env.label.length) {
            let segment = '/' + env.label[env.labelPointer];
            if (!current[segment] && !current[':']) break;
            if (!current[segment]) {
                segment = ':';
                currentArgs.push(env.label[env.labelPointer]);
            }

            // prepare fallback
            if (current[segment]['*']?.['*'] || current[segment]['*']?.[ctx.type]) {
                result = current[segment]['*'][ctx.type] ?? current[segment]['*']['*'];
                resultPointer = env.labelPointer + 1;
                resultArgNames = current[segment]['*']['::' + ctx.type] ?? current[segment]['*']['::*'];
            }

            current = current[segment];
            env.labelPointer++;

            // ends
            if (env.labelPointer >= env.label.length && (current['@']?.['*'] || current['@']?.[ctx.type])) {
                result = current['@'][ctx.type] ?? current['@']['*'];
                resultPointer = env.labelPointer;
                resultArgNames = current['@']['::' + ctx.type] ?? current['@']['::*'];
            }
        }

        env.labelPointer = resultPointer;
        if (resultArgNames) {
            const len = resultArgNames.length;
            for (let i = 0; i < len; i++) {
                ctx.params[resultArgNames[i]] = currentArgs[i];
            }
        }
        return result;
    }
}

// type router: routes the request by qtype
class TypeRouter {
    constructor(typeMap = {}) {
        this.typeMap = typeMap;
    }

    route(env, ctx) {
        return this.typeMap[ctx.type] || this.typeMap['*'] || 'default';
    }
}

// function router: a simple router that allows you to make custom routing logic
class FunctionRouter {
    constructor(fn, ext) {
        this.fn = fn;
        this.ext = ext;
    }

    route(env, ctx) {
        return this.fn(env, ctx, this.ext);
    }
}

// label argument router: collects a host segment and save to `ctx.params`
class LabelArgRouter {
    constructor(paramName, next) {
        this.paramName = paramName;
        this.next = next;
    }

    route(env, ctx) {
        ctx.params[this.paramName] = env.label[env.labelPointer];
        env.labelPointer++;

        return this.next;
    }
}

// set registery router: set the string registery handler
class SetRegisteryRouter {
    constructor(registery, next) {
        this.registery = registery;
        this.next = next;
    }

    route(env, ctx) {
        env.registery = Object.assign({}, env.registery, this.registery);
        return this.next;
    }
}

// export
module.exports = {
    LabelRouter, TypeRouter, FunctionRouter, LabelArgRouter, SetRegisteryRouter,
    routerConstructors: {
        Label: (end, map) => new LabelRouter(end, map),
        Type: (typeMap) => new TypeRouter(typeMap),
        Function: (fn, ext) => new FunctionRouter(fn, ext),
        LabelArg: (paramName, next) => new LabelArgRouter(paramName, next),
        SetRegistery: (registery, next) => new SetRegisteryRouter(registery, next)
    }
};
