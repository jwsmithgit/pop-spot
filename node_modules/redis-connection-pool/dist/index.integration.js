"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const index_1 = __importDefault(require("./index"));
const channel = 'redis-connection-pool-tests:';
const uid = 'redisPoolTest1';
describe('Redis Pool', () => {
    let pool;
    beforeEach(() => __awaiter(void 0, void 0, void 0, function* () {
        pool = yield (0, index_1.default)(uid, {
            redis: {
                url: 'redis://localhost:6379'
            }
        });
    }));
    afterEach(() => __awaiter(void 0, void 0, void 0, function* () {
        const keys = yield pool.keys(`${channel}*`);
        for (const key of keys) {
            yield pool.del(`${key}`);
        }
    }));
    it('can connect to database', () => {
        (0, chai_1.expect)(typeof pool).to.eql('object');
        (0, chai_1.expect)(pool.redis.url).to.eql('redis://localhost:6379');
    });
    it('basic store and fetch', () => __awaiter(void 0, void 0, void 0, function* () {
        (0, chai_1.expect)(yield pool.set(channel, 'a value')).to.eql('OK');
        (0, chai_1.expect)(yield pool.get(channel)).to.equal('a value');
    }));
    it('hset and hget', () => __awaiter(void 0, void 0, void 0, function* () {
        (0, chai_1.expect)(yield pool.hset(channel, 'a name', 'a value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hget(channel, 'a name')).to.equal('a value');
    }));
    it('hgetall', () => __awaiter(void 0, void 0, void 0, function* () {
        (0, chai_1.expect)(yield pool.hset(channel, 'a name', 'a value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hset(channel, 'b name', 'b value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hset(channel, 'c name', 'c value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hset(channel, 'd name', 'd value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hset(channel, 'e name', 'e value')).to.eql(1);
        (0, chai_1.expect)(yield pool.hgetall(channel)).to.eql({
            'a name': 'a value',
            'b name': 'b value',
            'c name': 'c value',
            'd name': 'd value',
            'e name': 'e value'
        });
    }));
    it('push and pop ', () => __awaiter(void 0, void 0, void 0, function* () {
        (0, chai_1.expect)(yield pool.rpush(channel, 'foo1')).to.eql(1);
        (0, chai_1.expect)(yield pool.rpush(channel, 'foo2')).to.eql(2);
        (0, chai_1.expect)(yield pool.rpush(channel, 'foo3')).to.eql(3);
        (0, chai_1.expect)(yield pool.lpush(channel, 'foo4')).to.eql(4);
        (0, chai_1.expect)(yield pool.lpush(channel, 'foo5')).to.eql(5);
        (0, chai_1.expect)(yield pool.brpop(channel)).to.eql({
            key: channel,
            element: 'foo3'
        });
        (0, chai_1.expect)(yield pool.blpop(channel)).to.eql({
            key: channel,
            element: 'foo5'
        });
    }));
    it('incr', () => __awaiter(void 0, void 0, void 0, function* () {
        (0, chai_1.expect)(yield pool.set(channel, 1)).to.eql('OK');
        (0, chai_1.expect)(yield pool.incr(channel)).to.eql(2);
        (0, chai_1.expect)(yield pool.incr(channel)).to.eql(3);
        (0, chai_1.expect)(yield pool.get(channel)).to.eql('3');
    }));
});
describe("Shutdown", () => {
    it('', () => __awaiter(void 0, void 0, void 0, function* () {
        const pool = yield (0, index_1.default)(uid);
        yield pool.shutdown();
    }));
});
//# sourceMappingURL=/index.integration.js.map